"""Composed B/C/D journeys; terminal states are produced only by normal APIs."""
import json
import os

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.certificate import Certificate
from app.models.order import Order
from app.models.review import Review
from app.models.user import User, UserRole
from tests.order_helpers import new_key
from tests.test_finish_flow_postgres import pg_engine, isolate_rows, world, post, delivered, assert_terminal
from tests.test_reviews_postgres import approve

pytestmark = pytest.mark.skipif(not os.getenv('FINISH_TEST_DATABASE_URL'), reason='owned local FINISH integration database required')


@pytest.mark.parametrize('seller_as_buyer', [False, True])
def test_normal_sale_receipt_release_persisted_review_and_revocation(world, seller_as_buyer):
    client, engine, buyer, seller, _, _, _, _, _, admin = world
    seller_id = client.get('/profile', headers=seller).json()['id']
    with Session(engine) as db:
        approve(db, seller_id)
    if seller_as_buyer:
        buyer_id = client.get('/profile', headers=buyer).json()['id']
        with Session(engine) as db:
            user = db.get(User, buyer_id)
            user.role = UserRole.SELLER
            approve(db, user.id)
    profile = client.patch('/profile', json={'full_name': 'ชื่อผู้ซื้อที่แก้จริง'}, headers=buyer)
    assert profile.status_code == 200, profile.text
    policy = post(world, '/profile/policy-acknowledgement', buyer, {'policy_version': 'submission-2026-10-01'})
    assert policy.status_code == 200, policy.text
    assert client.get('/profile', headers=buyer).json()['full_name'] == 'ชื่อผู้ซื้อที่แก้จริง'
    assert post(world, '/profile/policy-acknowledgement', buyer, {'policy_version': 'submission-2026-10-01'}).json()['privacy_acknowledged_at'] == policy.json()['privacy_acknowledged_at']

    order_id, _, _, _ = delivered(world)
    original_receipt = client.get(f'/orders/{order_id}/receipt', headers=buyer).json()
    before = client.get(f'/orders/{order_id}/review', headers=buyer)
    assert before.status_code == 200 and before.json()['can_review'] is False
    assert post(world, f'/orders/{order_id}/review', buyer, {'rating': 5}).status_code == 409
    assert post(world, f'/orders/{order_id}/confirm-receipt', buyer, {}).status_code == 200
    assert_terminal(world, order_id, 'RELEASE')
    assert client.get(f'/orders/{order_id}/review', headers=buyer).json()['can_review'] is True
    key = new_key()
    body = {'rating': 5, 'comment': '  ตรงปก ส่งจริง 👋  '}
    created = post(world, f'/orders/{order_id}/review', buyer, body, key)
    assert created.status_code == 201, created.text
    replay = post(world, f'/orders/{order_id}/review', buyer, {**body, 'comment': body['comment'].strip()}, key)
    assert replay.status_code == 201 and replay.json() == created.json()
    assert replay.headers['Idempotent-Replayed'] == 'true'
    private = client.get(f'/orders/{order_id}/review', headers=buyer)
    assert private.json()['review'] == created.json() and private.json()['can_review'] is False
    with Session(engine) as db:
        order = db.get(Order, order_id)
        cert = db.scalar(select(Certificate).where(Certificate.order_id == order_id))
        cert_id, token, seller_id, product_name = cert.id, cert.public_token, order.seller_id, order.product_name
        assert len(db.scalars(select(Review).where(Review.order_id == order_id)).all()) == 1
    public = client.get(f'/sellers/{seller_id}/reviews?limit=1')
    assert public.status_code == 200, public.text
    result = public.json()
    assert result['summary'] == {'count': 1, 'average_rating': 5.0, 'distribution': {'1': 0, '2': 0, '3': 0, '4': 0, '5': 1}}
    assert result['items'][0]['product_name'] == product_name
    assert result['items'][0]['reviewer_label'] == 'ผู้ซื้อที่ยืนยันการซื้อ'
    assert not {'buyer_id', 'order_id', 'email', 'full_name'}.intersection(result['items'][0])

    reason = 'Private synthetic Admin revocation after completed sale'
    revoked = post(world, f'/admin/certificates/{cert_id}/revoke', admin, {'reason': reason})
    assert revoked.status_code == 200 and revoked.json()['status'] == 'REVOKED'
    public_json = client.get(f'/certificates/{token}/json')
    public_html = client.get(f'/certificates/{token}')
    assert public_json.status_code == public_html.status_code == 200
    assert public_json.json()['status'] == 'REVOKED'
    assert reason not in public_json.text + public_html.text
    assert client.get(f'/sellers/{seller_id}/reviews?limit=1').json() == result
    assert_terminal(world, order_id, 'RELEASE')
    assert client.get(f'/orders/{order_id}/receipt', headers=buyer).json() == original_receipt
    for response in (profile, policy, created, replay, private, public, revoked, public_json, public_html):
        assert response.headers['Cache-Control'] == 'no-store'


def test_normal_physical_return_full_refund_rejects_review(world):
    order_id, _, _, _ = delivered(world, 'FAKE', None)
    assert_terminal(world, order_id, 'REFUND')
    before = world[0].get(f'/orders/{order_id}/receipt', headers=world[2]).json()
    read = world[0].get(f'/orders/{order_id}/review', headers=world[2])
    assert read.status_code == 200 and read.json() == {'order_id': order_id, 'can_review': False, 'review': None}
    response = post(world, f'/orders/{order_id}/review', world[2], {'rating': 5, 'comment': 'Cannot review refunded order'})
    assert response.status_code == 409 and response.json()['detail']['code'] == 'order_not_reviewable'
    with Session(world[1]) as db:
        assert not db.scalars(select(Review).where(Review.order_id == order_id)).all()
    assert world[0].get(f'/orders/{order_id}/receipt', headers=world[2]).json() == before
    assert read.headers['Cache-Control'] == response.headers['Cache-Control'] == 'no-store'


def test_composed_routes_preserve_error_cache_guards(world):
    for path in ('/profile', '/orders/999/review', '/orders/999/delivery', '/admin/certificates'):
        response = world[0].get(path)
        assert response.status_code == 401, (path, response.text)
        assert response.headers['Cache-Control'] == 'no-store'
    assert world[0].get('/admin/certificates', headers=world[2]).status_code == 403
    malformed = world[0].patch('/profile', content=json.dumps({'full_name': '\ud800'}),
        headers={**world[2], 'Content-Type': 'application/json'})
    assert malformed.status_code == 422 and malformed.headers['Cache-Control'] == 'no-store'
