"""PROFILE-01 on a disposable, migrated localhost PostgreSQL database."""
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.main import app
from app.models.user import User, UserStatus
from tests.test_orders_postgres import (PG_URL, pg_engine, Session, db, world, post_order, pay)
from tests.order_helpers import order_body

pytestmark = pytest.mark.skipif(not PG_URL, reason="isolated PostgreSQL required")
POLICY = {"policy_version": "submission-2026-10-01"}


def test_save_reload_relogin_preserves_other_users_and_order_snapshots(db, world):
    order = post_order(world['a'], order_body(world['product_id'])).json()['id']
    assert pay(order, world['a']).status_code == 200
    tables = ('orders', 'payments', 'receipts', 'escrows', 'verifications')
    def snapshots():
        return {table: db.execute(text(f'SELECT to_jsonb(t) FROM {table} t ORDER BY id')).scalars().all() for table in tables}
    before = snapshots()
    with TestClient(app) as client:
        original = client.get('/profile', headers=world['a']).json()
        assert original['privacy_acknowledged_at'] is None
        result = client.patch('/profile', headers=world['a'], json={'full_name': '  ชื่อใหม่ 👋  '})
        assert result.status_code == 200, result.text
        assert result.headers['cache-control'] == 'no-store'
        expected = {**original, 'full_name': 'ชื่อใหม่ 👋'}
        assert result.json() == expected
        assert client.post('/auth/google', headers=world['a'], json={}).json()['full_name'] == 'ชื่อใหม่ 👋'
        assert client.get('/profile', headers=world['a']).json() == expected
        assert client.get('/profile', headers=world['b']).json()['full_name'] == 'Buyer B'
        assert client.get(f'/profile/{world["buyer_b"]}', headers=world['a']).status_code == 404
    db.expire_all()
    assert snapshots() == before
    assert db.get(User, world['buyer_a']).full_name == 'ชื่อใหม่ 👋'


@pytest.mark.parametrize('value', ['', '  ', 'x'*101, 'x\ny', '\tx', 'x\x00', 'x\x7f', 'x\u202ey', 3, True, None])
def test_invalid_names(db, world, value):
    with TestClient(app) as client:
        result = client.patch('/profile', headers=world['a'], json={'full_name': value})
        assert result.status_code == 422
        assert result.json()['detail']['code'] == 'validation_error'


@pytest.mark.parametrize('field', ['role', 'status', 'email', 'id', 'user_id', 'supabase_user_id', 'phone', 'address'])
def test_field_injection(db, world, field):
    with TestClient(app) as client:
        assert client.patch('/profile', headers=world['a'], json={'full_name': 'Allowed', field: world['buyer_b']}).status_code == 422
        assert client.post('/profile/policy-acknowledgement', headers=world['a'], json={**POLICY, field: 'injected'}).status_code == 422
    db.expire_all()
    assert db.get(User, world['buyer_a']).full_name == 'Buyer A'


@pytest.mark.parametrize('status', [UserStatus.SUSPENDED, UserStatus.CLOSED])
def test_inactive_reads_but_cannot_write(db, world, status):
    db.get(User, world['buyer_a']).status = status
    db.commit()
    with TestClient(app) as client:
        assert client.get('/profile', headers=world['a']).json()['status'] == status.value
        for path, method, body in [('/profile', client.patch, {'full_name': 'No'}), ('/profile/policy-acknowledgement', client.post, POLICY)]:
            assert method(path, headers=world['a'], json=body).status_code == 403


def test_policy_parallel_retry_first_db_time_and_unsupported_version(db, world):
    def acknowledge():
        with TestClient(app) as client:
            return client.post('/profile/policy-acknowledgement', headers=world['a'], json=POLICY)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: acknowledge(), range(2)))
    assert all(r.status_code == 200 for r in results)
    assert results[0].json() == results[1].json() == acknowledge().json()
    saved = results[0].json()['privacy_acknowledged_at']
    assert saved is not None and (saved.endswith('+00:00') or saved.endswith('Z'))
    with TestClient(app) as client:
        assert client.post('/profile/policy-acknowledgement', headers=world['a'], json={'policy_version': 'fake'}).status_code == 422
        assert client.get('/profile', headers=world['b']).json()['privacy_policy_version'] is None
        assert client.get('/profile').status_code in (401, 403)
    db.expire_all()
    with pytest.raises(IntegrityError), db.begin_nested():
        db.get(User, world['buyer_b']).privacy_policy_version = 'fake'
        db.flush()


def test_unicode_boundary_and_prefix_private_errors(db, world):
    with TestClient(app, root_path='/api') as client:
        assert client.patch('/profile', headers=world['a'], json={'full_name': 'ก'*100}).status_code == 200
        response = client.patch('/profile', headers=world['a'], json=[])
        assert response.status_code == 422 and response.headers['cache-control'] == 'no-store'
