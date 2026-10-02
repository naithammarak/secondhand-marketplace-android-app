"""C08 independent terminal fixtures; NOT acceptance of B/task04's journey."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select, text, update
from sqlalchemy.exc import DBAPIError, DataError, IntegrityError

from app.main import app
from app.models.fulfillment import FulfillmentCommand
from app.models.order import Escrow, Order, Receipt
from app.models.product import Product
from app.models.review import Review
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification
from tests.test_orders_postgres import PG_URL, pg_engine, Session, db, world, post_order, pay
from tests.order_helpers import create_product, order_body
from tests.test_finish_foundation_postgres import refund

pytestmark = pytest.mark.skipif(not PG_URL, reason='isolated PostgreSQL required')


def approve(db, user_id):
    db.add(Verification(user_id=user_id, verification_status='APPROVED', id_card_image_url='private/test',
        bank_account_name='Private owner', bank_account_number='00000000', bank_name='Test bank', shop_name='ร้านทดสอบ'))
    db.commit()


@pytest.fixture
def terminal(db, world):
    approve(db, world['seller'])
    def make(kind='RELEASE', actor='a'):
        product_id = create_product(db, world['seller'])
        response = post_order(world[actor], order_body(product_id))
        assert response.status_code == 201, response.text
        ident = response.json()['id']
        assert pay(ident, world[actor]).status_code == 200
        db.expire_all(); order = db.get(Order, ident)
        row = refund(db, order)
        escrow = db.scalar(select(Escrow).where(Escrow.order_id == ident))
        if kind == 'RELEASE':
            row.kind = 'RELEASE'; row.source = 'AUTO_RECEIPT'; row.reason = 'RECEIPT_TIMEOUT'
            row.seller_payout = order.seller_payout; row.buyer_refund = 0
            row.commission_amount = order.commission_fee; row.inspection_amount = order.inspection_fee; row.shipping_amount = order.shipping_fee
            order.receipt_deadline_at = row.settled_at - timedelta(seconds=1)
            order.receipt_confirmed_at = row.settled_at; order.receipt_confirmation_source = 'AUTO'
            order.status = 'COMPLETED'; escrow.status = 'RELEASED'
        else:
            order.status = 'REFUNDED'; escrow.status = 'REFUNDED'
        escrow.settled_at = row.settled_at
        db.add(row); db.commit()
        return ident
    return make


def submit(world, ident, body=None, key='review-key-00001', actor='a'):
    with TestClient(app) as client:
        return client.post(f'/orders/{ident}/review', json=body if body is not None else {'rating':5}, headers={**world[actor], 'Idempotency-Key':key})


def test_persisted_review_replay_key_conflict_and_original_receipt(db, world, terminal):
    ident = terminal()
    with TestClient(app) as client:
        receipt = client.get(f'/orders/{ident}/receipt', headers=world['a']).json()
        assert client.get(f'/orders/{ident}/review', headers=world['a']).json()['can_review']
    first = submit(world, ident, {'rating':5, 'comment':'  ดีมาก 👋 <script>alert(1)</script>  '})
    assert first.status_code == 201, first.text
    replay = submit(world, ident, {'rating':5,'comment':'ดีมาก 👋 <script>alert(1)</script>'})
    assert first.json() == replay.json() and replay.headers['Idempotent-Replayed'] == 'true'
    assert first.headers['cache-control'] == 'no-store'
    assert submit(world, ident, {'rating':4}).json()['detail']['code'] == 'idempotency_key_reused'
    assert submit(world, ident, key='another-review-key').json()['detail']['code'] == 'review_already_exists'
    with TestClient(app) as client:
        saved = client.get(f'/orders/{ident}/review', headers=world['a']).json()
        assert saved == {'order_id':ident, 'can_review':False, 'review':first.json()}
        assert client.get(f'/orders/{ident}/receipt', headers=world['a']).json() == receipt
    assert db.scalar(select(func.count()).select_from(Review)) == 1
    assert db.scalar(select(func.count()).select_from(FulfillmentCommand).where(FulfillmentCommand.action == 'CREATE_REVIEW')) == 1


@pytest.mark.parametrize('same_key', [False, True])
def test_parallel_one_review_and_one_replay_record(db, world, terminal, same_key):
    ident = terminal(); barrier = Barrier(2)
    def send(key):
        barrier.wait(timeout=5)
        return submit(world, ident, key=key)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(send, 'parallel-key-0001'), pool.submit(send, 'parallel-key-0001' if same_key else 'parallel-key-0002')]
        responses = [f.result(timeout=15) for f in futures]
    assert sorted(r.status_code for r in responses) == ([201,201] if same_key else [201,409])
    assert db.scalar(select(func.count()).select_from(Review)) == 1
    assert db.scalar(select(func.count()).select_from(FulfillmentCommand).where(FulfillmentCommand.action == 'CREATE_REVIEW')) == 1


@pytest.mark.parametrize('body', [{'rating':0}, {'rating':6}, {'rating':1.5}, {'rating':True}, {'rating':'5'}, {'rating':5,'comment':'a'*1001}, {'rating':5,'comment':None}, {'rating':5,'comment':'\x00'}, {'rating':5,'buyer_id':2}, {'rating':5,'seller_id':2}, {'rating':5,'product_id':2}, {'rating':5,'order_id':2}, {'rating':5,'status':'COMPLETED'}, {'rating':5,'productStars':5}, {'rating':5,'inspectionStars':5}, {'rating':5,'tags':[]}, {'rating':5,'photos':[]}])
def test_bounds_and_injection(db, world, terminal, body):
    ident = terminal()
    assert submit(world, ident, body).status_code == 422
    assert db.scalar(select(func.count()).select_from(Review)) == 0


def test_bounds_empty_canonical_and_approved_seller_can_buy(db, world, terminal):
    db.get(User, world['buyer_a']).role = UserRole.SELLER; db.commit(); approve(db, world['buyer_a'])
    assert submit(world, terminal(), {'rating':1,'comment':'ก'*1000}).status_code == 201
    ident = terminal()
    first = submit(world, ident, {'rating':5,'comment':'  \n\t'})
    assert first.status_code == 201 and first.json()['comment'] == ''
    assert submit(world, ident).headers['Idempotent-Replayed'] == 'true'


@pytest.mark.parametrize('state', ['WAITING_PAYMENT','WAITING_SELLER_SHIP','CANCELLED','DELIVERY_DISPUTED','RESULT_NOTIFIED','REFUNDED'])
def test_ineligible_states(db, world, terminal, state):
    if state == 'REFUNDED':
        ident = terminal('REFUND')
    else:
        ident = post_order(world['a'], order_body(world['product_id'])).json()['id']
        if state not in {'WAITING_PAYMENT','CANCELLED'}:
            assert pay(ident, world['a']).status_code == 200
            db.expire_all(); row=db.get(Order,ident); row.status=state; db.commit()
        elif state == 'CANCELLED':
            with TestClient(app) as client:
                assert client.post(f'/orders/{ident}/cancel', headers=world['a']).status_code == 200
    assert submit(world, ident).json()['detail']['code'] == 'order_not_reviewable'
    with TestClient(app) as client:
        assert client.get(f'/orders/{ident}/review', headers=world['a']).json()['can_review'] is False


def test_idor_inactive_and_changed_role(db, world, terminal):
    ident = terminal()
    with TestClient(app) as client:
        for actor in ('b','seller_h'):
            assert submit(world, ident, actor=actor).status_code == 404
            response=client.get(f'/orders/{ident}/review', headers=world[actor])
            assert response.status_code == 404 and 'review' not in response.json()['detail']
        assert submit(world, 999999).status_code == 404
    db.get(User, world['buyer_a']).status = UserStatus.SUSPENDED; db.commit()
    assert submit(world, ident).status_code == 403
    db.get(User, world['buyer_a']).status = UserStatus.ACTIVE; db.get(User, world['buyer_a']).role=UserRole.ADMIN; db.commit()
    assert submit(world, ident).status_code == 403
    db.get(User, world['buyer_a']).role=UserRole.SELLER; db.commit()
    assert submit(world, ident).status_code == 403


def test_public_summary_pagination_privacy_and_immutable_after_buyer_change(db, world, terminal):
    ids=[]
    for stars in (1, 5, 5):
        ident=terminal(); ids.append(ident)
        assert submit(world, ident, {'rating':stars, 'comment':'ข้อความทดสอบ'}).status_code == 201
    db.get(User, world['buyer_a']).status=UserStatus.CLOSED; db.get(User, world['buyer_a']).role=UserRole.ADMIN; db.commit()
    with TestClient(app) as client:
        response=client.get(f'/sellers/{world["seller"]}/reviews?limit=1&offset=1')
        assert response.status_code == 200, response.text
        value=response.json()
        assert value['summary']=={'count':3,'average_rating':3.7,'distribution':{'1':1,'2':0,'3':0,'4':0,'5':2}}
        assert value['total']==3 and len(value['items'])==1
        assert set(value['items'][0])=={'id','rating','comment','created_at','reviewer_label','product_name'}
        assert value['items'][0]['reviewer_label']=='ผู้ซื้อที่ยืนยันการซื้อ'
        assert value['items'][0]['product_name']==db.get(Order,ids[1]).product_name
        for secret in ('Buyer A','example.test','private/test','buyer_id','order_id','seller_id', 'bank_account'):
            assert secret not in str(value['items'])
        empty_page=client.get(f'/sellers/{world["seller"]}/reviews?offset=99').json()
        assert empty_page['items']==[] and empty_page['total']==3
        assert client.get('/sellers/99999/reviews').status_code==404
        for query in ('limit=0','limit=101','offset=-1'):
            assert client.get(f'/sellers/{world["seller"]}/reviews?{query}').status_code==422
    with pytest.raises(IntegrityError),db.begin_nested():
        db.execute(update(Review).values(rating=2))
    with pytest.raises(IntegrityError),db.begin_nested():
        db.delete(db.scalar(select(Review).limit(1)));db.flush()


def test_public_zero_and_atomic_query_snapshot(db, world, terminal, pg_engine):
    ident=terminal()
    fired=False
    def after_read(conn,cursor,statement,parameters,context,executemany):
        nonlocal fired
        if not fired and 'avg(reviews.rating)' in statement:
            fired=True
            assert submit(world,ident).status_code==201
    event.listen(pg_engine,'after_cursor_execute',after_read)
    try:
        with TestClient(app) as client:
            value=client.get(f'/sellers/{world["seller"]}/reviews').json()
        assert fired and value['items']==[] and value['summary']=={'count':0,'average_rating':None,'distribution':{str(n):0 for n in range(1,6)}}
    finally:
        event.remove(pg_engine,'after_cursor_execute',after_read)
    with TestClient(app) as client:
        assert client.get(f'/sellers/{world["seller"]}/reviews').json()['total']==1
        db.get(User,world['seller']).status=UserStatus.SUSPENDED;db.commit()
        assert client.get(f'/sellers/{world["seller"]}/reviews').status_code==404


def test_database_rejects_cross_product_recipient_rating_and_pending_rows(db, world, terminal):
    ident=terminal(); original=db.get(Order,ident)
    base=dict(order_id=ident,buyer_id=original.buyer_id,seller_id=original.seller_id,product_id=original.product_id,rating=5,comment='')
    for invalid in ({'product_id':world['product_id']},{'buyer_id':world['buyer_b']},{'seller_id':world['buyer_b']},{'rating':6},{'comment':'a'*1001}):
        with pytest.raises((IntegrityError, DataError)),db.begin_nested():
            db.add(Review(**{**base,**invalid}));db.flush()
    pending=post_order(world['a'],order_body(world['product_id'])).json()['id']
    with pytest.raises(IntegrityError),db.begin_nested():
        db.add(Review(**{**base,'order_id':pending,'product_id':world['product_id']}));db.flush()


def test_failed_replay_record_rolls_back_review(db, world, terminal, pg_engine):
    ident=terminal()
    def fail(conn,cursor,statement,parameters,context,executemany):
        if statement.startswith('INSERT INTO fulfillment_commands'):
            raise RuntimeError('injected audit failure')
    event.listen(pg_engine,'before_cursor_execute',fail)
    try:
        with pytest.raises(RuntimeError,match='injected audit failure'):
            submit(world,ident)
    finally:
        event.remove(pg_engine,'before_cursor_execute',fail)
    assert db.scalar(select(func.count()).select_from(Review))==0
    assert submit(world,ident).status_code==201


def test_replay_rechecks_active_account_and_key_format(db, world, terminal):
    ident=terminal()
    for key in ('', 'short', 'bad key 0001', 'a'*101):
        assert submit(world,ident,key=key).status_code==422
    assert submit(world,ident).status_code==201
    db.get(User,world['buyer_a']).status=UserStatus.SUSPENDED;db.commit()
    assert submit(world,ident).status_code==403
    with TestClient(app) as client:
        assert client.get(f'/orders/{ident}/review',headers=world['a']).json()['review']['rating']==5
    assert db.scalar(select(func.count()).select_from(Review))==1


def test_direct_client_roles_cannot_read_private_review_columns(db, world, terminal, pg_engine):
    ident=terminal();assert submit(world,ident).status_code==201
    db.rollback()
    with pg_engine.begin() as conn:
        for role in ('anon','authenticated'):
            conn.execute(text(f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{role}') THEN CREATE ROLE {role} NOLOGIN; END IF; END $$"))
            conn.execute(text(f'GRANT USAGE ON SCHEMA public TO {role}'))
            conn.execute(text(f'GRANT SELECT,INSERT ON reviews TO {role}'))
            conn.execute(text(f'SET LOCAL ROLE {role}'))
            assert conn.execute(text('SELECT count(*) FROM reviews')).scalar_one()==0
            with pytest.raises(DBAPIError),conn.begin_nested():
                conn.execute(text('INSERT INTO reviews(id,order_id,buyer_id,seller_id,product_id,rating,comment) VALUES(999,999,1,3,1,5,\'\')'))
            conn.execute(text('RESET ROLE'))
