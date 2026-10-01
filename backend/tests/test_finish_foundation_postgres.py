"""FINISH foundations on a disposable local PostgreSQL database."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from threading import Event
from uuid import uuid4
import time
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from app.main import app
from app.models.fulfillment import FulfillmentCommand, OrderSettlement, ShipmentConfirmedProof
from app.models.order import Order, Escrow, Payment, Receipt
from app.models.shipment import Shipment, ShipmentDeliveryProof
from app.models.user import UserRole
from app.services.order_pricing import utcnow
from app.services.transaction_clock import database_now
from app.services.order_expiry import expire_orders_in_transaction
from tests.order_helpers import VALID_ADDRESS, create_product, create_user, order_body
from tests.test_orders_postgres import PG_URL, Session, db, pg_engine, world, insert_order, pay, post_order
pytestmark = pytest.mark.skipif(not PG_URL, reason='isolated PostgreSQL required')

@pytest.fixture(autouse=True)
def foundation_environment(Session, monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("FULFILLMENT_SIMULATION_ENABLED", "true")

@pytest.fixture
def paid(db, world):
    response=post_order(world['a'],order_body(world['product_id']))
    assert response.status_code==201,response.text
    ident=response.json()['id']; result=pay(ident,world['a'])
    assert result.status_code==200,result.text
    db.expire_all();return db.get(Order,ident)

def save(order_id,headers,value=None,key='return-address-0001'):
    with TestClient(app) as client:
        return client.put(f'/orders/{order_id}/return-address',json=value or VALID_ADDRESS,headers={**headers,'Idempotency-Key':key})
def ship(order_id,headers,key='ship-foundation-001'):
    with TestClient(app) as client:
        return client.post(f'/orders/{order_id}/ship-to-center',json={'carrier':'Local','tracking_number':'TRACK-A'},headers={**headers,'Idempotency-Key':key})
def refund(db,order,**overrides):
    escrow=db.scalar(select(Escrow).where(Escrow.order_id==order.id))
    cmd=FulfillmentCommand(actor_scope='SYSTEM:foundation-test',action='TEST_SETTLEMENT',resource_type='ORDER',resource_id=order.id,idempotency_key=f'test-key-{uuid4()}',request_hash='0'*64,response_status=200,result={'order_id':order.id})
    db.add(cmd);db.flush()
    values=dict(order_id=order.id,escrow_id=escrow.id,payment_id=escrow.payment_id,seller_id=order.seller_id,buyer_id=order.buyer_id,command_id=cmd.id,kind='REFUND',source='SELLER_NO_SHIP',reason='SELLER_NO_SHIP',currency=order.currency,held_amount=order.total_amount,seller_payout=0,buyer_refund=order.total_amount,commission_amount=0,inspection_amount=0,shipping_amount=0,settled_at=database_now(db))
    values.update(overrides);return OrderSettlement(**values)

def test_private_strict_return_address_replay_freeze(db,world,paid):
    assert ship(paid.id,world['seller_h']).json()['detail']['code']=='fulfillment_destination_missing'
    first=save(paid.id,world['seller_h']);assert first.status_code==200,first.text
    assert first.headers['cache-control']=='no-store'
    same=save(paid.id,world['seller_h']);assert same.json()==first.json() and same.headers['Idempotent-Replayed']=='true'
    other={**VALID_ADDRESS,'recipient_name':'Different Seller'}
    assert save(paid.id,world['seller_h'],other).status_code==409
    assert save(paid.id,world['seller_h'],other,'return-address-0002').status_code==200
    assert save(paid.id,world['a']).status_code==403
    assert save(paid.id,world['b']).status_code==404
    assert save(paid.id,world['seller_h'],{**VALID_ADDRESS,'order_id':paid.id},'extra-fields-0001').status_code==422
    assert ship(paid.id,world['seller_h']).status_code==200
    assert save(paid.id,world['seller_h'],key='after-shipping-001').json()['detail']['code']=='return_address_locked'
    assert save(paid.id,world['seller_h'],other,'return-address-0002').status_code==200
    with TestClient(app) as client:
        assert client.get(f'/orders/{paid.id}/return-address',headers=world['seller_h']).json()['frozen']
        assert client.get(f'/orders/{paid.id}/return-address',headers=world['a']).status_code==403
    db.expire_all()
    with pytest.raises(IntegrityError),db.begin_nested():
        db.delete(db.scalar(select(Shipment).where(Shipment.order_id==paid.id)));db.flush()
    with pytest.raises(IntegrityError),db.begin_nested():
        db.get(Order,paid.id).return_address=VALID_ADDRESS;db.flush()

@pytest.mark.parametrize('bad',[{'buyer_id':99999},{'seller_id':99999},{'currency':'USD'},{'held_amount':Decimal('1300'),'buyer_refund':Decimal('1300')},{'buyer_refund':1},{'shipping_amount':-1},{'source':'BUYER_RECEIPT'},{'reason':'RECEIPT_CONFIRMED'}])
def test_invalid_money_party_tuple_or_allocation(db,paid,bad):
    with pytest.raises(IntegrityError),db.begin_nested():
        db.add(refund(db,paid,**bad));db.flush()
    assert db.get(Order,paid.id).status=='WAITING_SELLER_SHIP'

def test_cross_order_payment_escrow_rejected(db,world,paid):
    product=create_product(db,world['seller']);response=post_order(world['a'],order_body(product));ident=response.json()['id']
    assert pay(ident,world['a']).status_code==200
    other=db.scalar(select(Escrow).where(Escrow.order_id==ident))
    with pytest.raises(IntegrityError),db.begin_nested():
        db.add(refund(db,paid,escrow_id=other.id,payment_id=other.payment_id));db.flush()
    with pytest.raises(IntegrityError),db.begin_nested():
        db.execute(update(Escrow).where(Escrow.order_id==paid.id).values(payment_id=other.payment_id))

def test_atomic_terminal_unique_and_immutable_original_records(db,paid):
    row=refund(db,paid);db.add(row)
    escrow=db.scalar(select(Escrow).where(Escrow.order_id==paid.id))
    escrow.status='REFUNDED';escrow.settled_at=row.settled_at;paid.status='REFUNDED';db.commit()
    for model,values in [(OrderSettlement,{'reason':'INSPECTION_FAKE'}),(Payment,{'method':'CHANGED'}),(Receipt,{'product_name':'CHANGED'})]:
        with pytest.raises(IntegrityError),db.begin_nested(): db.execute(update(model).values(**values))
    with pytest.raises(IntegrityError),db.begin_nested(): db.add(refund(db,paid));db.flush()
    assert db.scalar(select(Receipt.total_amount).where(Receipt.order_id==paid.id))==paid.total_amount

def test_partial_terminal_commit_rolls_back(db,paid):
    ident=paid.id;paid.status='REFUNDED'
    with pytest.raises(IntegrityError):db.commit()
    db.rollback();assert db.get(Order,ident).status=='WAITING_SELLER_SHIP'
    assert db.scalar(select(Escrow.status).where(Escrow.order_id==ident))=='HELD'

def test_proof_bound_to_assignment_then_frozen(db,world,paid):
    assert save(paid.id,world['seller_h']).status_code==200
    assert ship(paid.id,world['seller_h']).status_code==200
    courier,_=create_user(db,UserRole.COURIER)
    shipment=db.scalar(select(Shipment).where(Shipment.order_id==paid.id));shipment.courier_id=courier;db.commit()
    proof=ShipmentDeliveryProof(shipment_id=shipment.id,sort_order=0,object_key='test/private/proof.jpg',mime_type='image/jpeg',size_bytes=100,sha256='a'*64,uploaded_by=courier)
    db.add(proof);db.commit();shipment.courier_delivered_at=database_now(db);db.flush()
    db.add(ShipmentConfirmedProof(proof_id=proof.id,shipment_id=shipment.id,courier_id=courier,confirmed_at=shipment.courier_delivered_at));db.commit()
    with pytest.raises(IntegrityError),db.begin_nested(): proof.object_key='replacement.jpg';db.flush()
    with pytest.raises(IntegrityError),db.begin_nested(): db.delete(proof);db.flush()
    with pytest.raises(IntegrityError),db.begin_nested(): shipment.courier_delivered_at=utcnow()+timedelta(seconds=1);db.flush()

def test_expiry_clock_sampled_after_lock_wait(Session,db,world):
    order=insert_order(db,world);order.expires_at=utcnow()+timedelta(seconds=1);db.commit();ident=order.id;started=Event()
    with Session() as blocker:
        blocker.execute(select(Order.id).where(Order.id==ident).with_for_update())
        def expire():
            with Session() as contender:
                started.set();n=expire_orders_in_transaction(contender,Order.id==ident);contender.commit();return n
        with ThreadPoolExecutor() as pool:
            future=pool.submit(expire);assert started.wait(2);time.sleep(1.2);blocker.rollback();assert future.result(timeout=10)==1
    db.expire_all();assert db.get(Order,ident).cancel_reason=='EXPIRED'

def test_opposing_release_refund_unique_race(Session,db,paid):
    ident=paid.id;written=Event();started=Event()
    def settle(kind):
        with Session() as contender:
            try:
                if kind=='RELEASE': started.set();assert written.wait(3)
                order=contender.get(Order,ident);row=refund(contender,order)
                if kind=='RELEASE':
                    row.kind='RELEASE';row.source='AUTO_RECEIPT';row.reason='RECEIPT_TIMEOUT';row.seller_payout=order.seller_payout;row.buyer_refund=0
                    row.commission_amount=order.commission_fee;row.inspection_amount=order.inspection_fee;row.shipping_amount=order.shipping_fee
                contender.add(row);contender.flush()
                if kind=='REFUND': written.set();assert started.wait(3)
                if kind=='RELEASE':
                    order.receipt_deadline_at=row.settled_at-timedelta(seconds=1)
                    order.receipt_confirmed_at=row.settled_at;order.receipt_confirmation_source='AUTO'
                escrow=contender.scalar(select(Escrow).where(Escrow.order_id==ident));order.status='REFUNDED' if kind=='REFUND' else 'COMPLETED'
                escrow.status='REFUNDED' if kind=='REFUND' else 'RELEASED';escrow.settled_at=row.settled_at
                contender.commit();return kind
            except IntegrityError: contender.rollback();return 'conflict'
    with ThreadPoolExecutor() as pool:
        a=pool.submit(settle,'REFUND');b=pool.submit(settle,'RELEASE');assert sorted([a.result(timeout=10),b.result(timeout=10)])==['REFUND','conflict']
    db.expire_all();assert db.get(Order,ident).status=='REFUNDED'
    assert db.scalar(select(func.count()).select_from(OrderSettlement).where(OrderSettlement.order_id==ident))==1


def test_save_vs_ship_serializes_at_order_lock(Session,db,world,paid):
    assert save(paid.id,world['seller_h']).status_code==200
    ident=paid.id;started=Event()
    with Session() as owner:
        row=owner.scalar(select(Order).where(Order.id==ident).with_for_update())
        row.return_address={**row.return_address,'recipient_name':'Updated Seller'}
        row.return_address_saved_at=database_now(owner);owner.flush()
        def send():started.set();return ship(ident,world['seller_h'])
        with ThreadPoolExecutor() as pool:
            future=pool.submit(send);assert started.wait(2);time.sleep(.15);owner.commit()
            assert future.result(timeout=10).status_code==200
    db.expire_all();assert db.get(Order,ident).return_address['recipient_name']=='Updated Seller'
    assert save(ident,world['seller_h'],key='late-change-0001').status_code==409


def test_shipping_boundary_wait_samples_post_lock_clock(Session,db,world,monkeypatch):
    from app.api import orders as order_api
    # Persist an internally consistent historical payment before the immutable
    # trigger sees it; the API still creates the actual Payment/Receipt/Escrow.
    response=post_order(world['a'],order_body(world['product_id']));ident=response.json()['id']
    original=order_api.database_now
    paid_at=utcnow()-timedelta(hours=72)+timedelta(seconds=1.5)
    monkeypatch.setattr(order_api,'database_now',lambda *a,**k:paid_at)
    assert pay(ident,world['a']).status_code==200
    monkeypatch.setattr(order_api,'database_now',original)
    assert save(ident,world['seller_h']).status_code==200
    started=Event()
    with Session() as owner:
        owner.execute(select(Order.id).where(Order.id==ident).with_for_update())
        def send():started.set();return ship(ident,world['seller_h'])
        with ThreadPoolExecutor() as pool:
            future=pool.submit(send);assert started.wait(2);time.sleep(1.6);owner.rollback()
            result=future.result(timeout=10)
            assert result.status_code==409 and result.json()['detail']['code']=='seller_shipping_deadline_passed'
    assert db.scalar(select(func.count()).select_from(Shipment).where(Shipment.order_id==ident))==0
    assert db.scalar(select(Escrow.status).where(Escrow.order_id==ident))=='HELD'


def test_shipping_same_key_replay_survives_deadline(db,world,paid,monkeypatch):
    from app.api import inspections as inspection_api
    assert save(paid.id,world['seller_h']).status_code==200
    first=ship(paid.id,world['seller_h']);assert first.status_code==200
    monkeypatch.setattr(inspection_api,'database_now',lambda *_:utcnow()+timedelta(days=4))
    repeated=ship(paid.id,world['seller_h'])
    assert repeated.status_code==200 and repeated.headers['Idempotent-Replayed']=='true'
    assert repeated.json()==first.json()


@pytest.mark.parametrize('environment,enabled',[('production','true'),('prod','true'),('unknown','true'),('','true'),('demo','false')])
def test_new_fulfillment_mutation_denied_outside_opted_in_prototype(world,paid,monkeypatch,environment,enabled):
    monkeypatch.setenv('APP_ENV',environment);monkeypatch.setenv('FULFILLMENT_SIMULATION_ENABLED',enabled)
    assert save(paid.id,world['seller_h']).json()['detail']['code']=='fulfillment_simulation_disabled'


def test_receipt_and_report_pairs_reject_partial_fields(db,paid):
    for values in [{'receipt_confirmation_source':'BUYER'},{'receipt_confirmed_at':utcnow()},
                   {'missing_reported_at':utcnow()},{'missing_report_reason':'A valid report reason'},
                   {'return_address_saved_at':utcnow()}]:
        with pytest.raises(IntegrityError),db.begin_nested():
            db.execute(update(Order).where(Order.id==paid.id).values(**values))


def test_one_outbound_leg_and_selected_set_cannot_expand_later(db,world,paid):
    courier,_=create_user(db,UserRole.COURIER)
    buyer_address={name:getattr(paid,f'ship_{name}') for name in VALID_ADDRESS}
    outgoing=Shipment(order_id=paid.id,leg='TO_BUYER',status='IN_TRANSIT',carrier='Test',tracking_number='A-1',courier_id=courier,destination_address=buyer_address)
    db.add(outgoing);db.commit()
    with pytest.raises(IntegrityError),db.begin_nested():
        paid.return_address=VALID_ADDRESS;paid.return_address_saved_at=database_now(db);db.flush()
    with pytest.raises(IntegrityError),db.begin_nested():
        db.add(Shipment(order_id=paid.id,leg='TO_SELLER',status='IN_TRANSIT',carrier='Test',tracking_number='A-2',destination_address=VALID_ADDRESS));db.flush()
    photos=[ShipmentDeliveryProof(shipment_id=outgoing.id,sort_order=i,object_key=f'local-private/{i}.jpg',mime_type='image/jpeg',size_bytes=100,sha256='a'*64,uploaded_by=courier) for i in range(2)]
    db.add_all(photos);db.commit();outgoing.status='DELIVERED';outgoing.courier_delivered_at=database_now(db);db.flush()
    db.add(ShipmentConfirmedProof(proof_id=photos[0].id,shipment_id=outgoing.id,courier_id=courier,confirmed_at=outgoing.courier_delivered_at));db.commit()
    with pytest.raises(IntegrityError),db.begin_nested():
        db.add(ShipmentConfirmedProof(proof_id=photos[1].id,shipment_id=outgoing.id,courier_id=courier,confirmed_at=outgoing.courier_delivered_at));db.flush()


@pytest.mark.parametrize('shifted',[False,True])
def test_release_allocations_match_original_snapshots_at_commit(db,paid,shifted):
    # A synthetic ledger transaction verifies the foundation schema only;
    # proof-dependent service eligibility is downstream package B work.
    row=refund(db,paid,kind='RELEASE',source='AUTO_RECEIPT',reason='RECEIPT_TIMEOUT',seller_payout=paid.seller_payout,buyer_refund=0,commission_amount=paid.commission_fee,inspection_amount=paid.inspection_fee,shipping_amount=paid.shipping_fee)
    if shifted:row.inspection_amount-=1;row.shipping_amount+=1
    escrow=db.scalar(select(Escrow).where(Escrow.order_id==paid.id))
    paid.receipt_deadline_at=row.settled_at-timedelta(seconds=1)
    paid.receipt_confirmed_at=row.settled_at;paid.receipt_confirmation_source='AUTO';paid.status='COMPLETED'
    escrow.status='RELEASED';escrow.settled_at=row.settled_at;db.add(row)
    if shifted:
        ident=paid.id
        with pytest.raises(IntegrityError,match='original allocations'):db.commit()
        db.rollback();assert db.get(Order,ident).status=='WAITING_SELLER_SHIP'
    else:
        db.commit();assert db.scalar(select(OrderSettlement.kind).where(OrderSettlement.order_id==paid.id))=='RELEASE'
