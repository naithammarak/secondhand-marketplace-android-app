"""New-policy normal API journeys on owned PG, no Courier account or photos."""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from threading import Event
import time
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from app.database import get_db
from app.main import app
from app.models.order import Order, Escrow, Receipt
from app.models.fulfillment import FulfillmentCommand, OrderSettlement, ShippingEvent
from app.models.shipment import Shipment, ShipmentDeliveryProof
from app.models.buyer_inspection_decision import BuyerInspectionDecision
from app.models.certificate import Certificate
from app.models.user import UserRole, UserStatus, User
from app.services.transaction_clock import database_now
from app.services.lifecycle_worker import run_once
from app.services.order_settlement import settlement_service
from tests.order_helpers import create_user, create_product, order_body, new_key, patch_auth, VALID_ADDRESS
from tests.test_finish_flow_postgres import pg_engine, isolate_rows
from tests.test_inspection_flow_postgres import image_bytes
from tests.test_reviews_postgres import approve
pytestmark = pytest.mark.skipif(not os.getenv('FINISH_TEST_DATABASE_URL'), reason='owned FINISH PG required')

@pytest.fixture
def context(pg_engine, monkeypatch, tmp_path):
    patch_auth(monkeypatch)
    for key,value in {'APP_ENV':'test','PAYMENT_SIMULATION_ENABLED':'true','FULFILLMENT_SIMULATION_ENABLED':'true','EXTERNAL_SHIPPING_DEMO_ENABLED':'true','PUBLIC_CERTIFICATE_BASE_URL':'https://cert.example.test','INSPECT_PRIVATE_STORAGE_DIR':str(tmp_path/'private')}.items():
        monkeypatch.setenv(key,value)
    factory=sessionmaker(pg_engine,autoflush=False)
    def dependency():
        with factory() as db: yield db
    app.dependency_overrides[get_db]=dependency
    data={'engine':pg_engine,'factory':factory,'monkeypatch':monkeypatch}
    with factory() as db:
        for role in ('buyer','seller','inspector','admin','other_buyer','other_seller','other_inspector'):
            ident,headers=create_user(db,UserRole(role.removeprefix('other_').upper()))
            data[role],data[role+'_id']=headers,ident
        approve(db,data['seller_id']);data['product']=create_product(db,data['seller_id'])
    with TestClient(app) as client:
        data['client']=client;yield data
    app.dependency_overrides.pop(get_db,None)

def post(c,path,actor,body=None,key=None):
    return c['client'].post(path,json={} if body is None else body,headers={**c[actor],'Idempotency-Key':key or new_key()})

def work(c,result='PASS'):
    created=post(c,'/orders','buyer',order_body(c['product']));assert created.status_code==201,created.text
    ident=created.json()['id']
    assert post(c,f'/orders/{ident}/payments/simulate','buyer',{'outcome':'SUCCESS'}).status_code==200
    assert c['client'].put(f'/orders/{ident}/return-address',json=VALID_ADDRESS,headers={**c['seller'],'Idempotency-Key':new_key()}).status_code==200
    shipped=post(c,f'/orders/{ident}/ship-to-center','seller',{'carrier':'External demo','tracking_number':'INBOUND-01'});assert shipped.status_code==200,shipped.text
    with c['factory']() as db:
        from app.models.inspection import Inspection
        work_id=db.scalar(select(Inspection.id).where(Inspection.order_id==ident))
    received=post(c,f'/inspections/{work_id}/receive','inspector',{'note':'Physical center receipt'});assert received.status_code==200,received.text
    started=post(c,f'/inspections/{work_id}/start','inspector');assert started.status_code==200,started.text
    image=c['client'].post(f'/inspections/{work_id}/evidence',files={'file':('photo.png',image_bytes(),'image/png')},headers={**c['inspector'],'Idempotency-Key':new_key()});assert image.status_code==201,image.text
    final=post(c,f'/inspections/{work_id}/result','inspector',{'result':result,'summary':'Expert final result published atomically with its certificate.','evidence_ids':[image.json()['evidence']['id']]});assert final.status_code==200,final.text
    return ident,work_id

def dispatch(c,ident,decision='CONFIRM'):
    if decision is not None:
        answer=post(c,f'/orders/{ident}/inspection/decision','buyer',{'decision':decision});assert answer.status_code==200,answer.text
    sent=post(c,f'/orders/{ident}/fulfillment','inspector',{'carrier':'External demo','tracking_number':'OUTBOUND-01'});assert sent.status_code==201,sent.text
    return sent.json()['shipment']['id']

def advance(c,at):
    # Server-only deterministic time seam; no HTTP clock field or DB history edit.
    import app.api.inspections as inspections
    import app.api.fulfillment as fulfillment
    import app.api.external_shipping as external
    import app.api.finish as finish
    import app.services.order_settlement as settlement
    for module in (inspections,fulfillment,external,finish,settlement):
        c['monkeypatch'].setattr(module,'database_now',lambda db:at)

def terminal(c,ident,kind,refund=None):
    with c['factory']() as db:
        row=db.scalar(select(OrderSettlement).where(OrderSettlement.order_id==ident));assert row.kind==kind
        assert db.scalar(select(func.count()).select_from(OrderSettlement).where(OrderSettlement.order_id==ident))==1
        assert row.fulfillment_policy=='EXTERNAL_V2'
        if kind=='RELEASE':
            assert (row.seller_payout,row.commission_amount,row.inspection_amount,row.shipping_amount,row.buyer_refund)==tuple(map(Decimal,[1140,60,100,50,0]))
        else:
            assert (row.seller_payout,row.commission_amount,row.buyer_refund,row.inspection_amount,row.shipping_amount)==tuple(map(Decimal,[0,0,refund,100 if refund==1200 else 0,50 if refund==1200 else 0]))

@pytest.mark.parametrize('result',['PASS','MINOR_ISSUE'])
def test_external_sale_receipt_before_event_review_and_revoke(context,result):
    c=context;ident,_=work(c,result);shipment_id=dispatch(c,ident)
    original=c['client'].get(f'/orders/{ident}/receipt',headers=c['buyer']).json()
    view=c['client'].get(f'/orders/{ident}/delivery',headers=c['buyer']).json();assert view['receipt_deadline_at'] is None and view['can_confirm_receipt']
    assert run_once(c['factory'],apply=True).jobs['receipt_release'].applied==0
    received=post(c,f'/orders/{ident}/confirm-receipt','buyer');assert received.status_code==200,received.text
    terminal(c,ident,'RELEASE');assert c['client'].get(f'/orders/{ident}/receipt',headers=c['buyer']).json()==original
    review=post(c,f'/orders/{ident}/review','buyer',{'rating':5,'comment':'Normal API physical receipt'});assert review.status_code==201,review.text
    with c['factory']() as db:
        cert=db.scalar(select(Certificate).where(Certificate.order_id==ident));cert_id,token=cert.id,cert.public_token
        assert db.scalar(select(func.count()).select_from(ShipmentDeliveryProof))==0
        assert db.scalar(select(func.count()).select_from(User).where(User.role==UserRole.COURIER))==0
        shipment=db.get(Shipment,shipment_id);assert shipment.received_by==c['buyer_id'] and shipment.recipient_source=='BUYER'
    assert post(c,f'/admin/certificates/{cert_id}/revoke','admin',{'reason':'Private Admin revocation after completed sale'}).status_code==200
    assert c['client'].get(f'/certificates/{token}/json').json()['status']=='REVOKED'
    assert c['client'].get(f"/sellers/{c['seller_id']}/reviews").json()['summary']['count']==1

@pytest.mark.parametrize('result,decision,refund',[('PASS','REJECT',1200),('MINOR_ISSUE','REJECT',1200),('FAKE',None,1350),('NOT_AS_DESCRIBED',None,1350)])
def test_actual_return_needs_seller_receipt_money_and_no_review(context,result,decision,refund):
    c=context;ident,_=work(c,result);shipment_id=dispatch(c,ident,decision)
    original=c['client'].get(f'/orders/{ident}/receipt',headers=c['buyer']).json()
    event=post(c,f'/admin/shipments/{shipment_id}/shipping-events','admin',{'leg':'TO_SELLER','event':'DELIVERED','event_id':'return-event-001'});assert event.status_code==200,event.text
    assert run_once(c['factory'],apply=True).jobs['return_refund'].applied==0
    with c['factory']() as db:
        assert db.get(Order,ident).status=='RESULT_NOTIFIED'
        assert db.scalar(select(OrderSettlement.id).where(OrderSettlement.order_id==ident)) is None
    key=new_key();received=post(c,f'/orders/{ident}/confirm-return','seller',key=key);assert received.status_code==200,received.text
    replay=post(c,f'/orders/{ident}/confirm-return','seller',key=key);assert replay.status_code==200 and replay.json()==received.json() and replay.headers['Idempotent-Replayed']=='true'
    terminal(c,ident,'REFUND',refund);assert c['client'].get(f'/orders/{ident}/receipt',headers=c['buyer']).json()==original
    assert post(c,f'/orders/{ident}/review','buyer',{'rating':5}).status_code==409
    assert c['client'].get(f'/orders/{ident}/review',headers=c['buyer']).json()['can_review'] is False

def test_silence_no_http_timeout_only_authorizes_return_then_actual_item_refund(context):
    c=context;ident,_=work(c)
    with c['factory']() as db: deadline=db.get(Order,ident).result_decision_deadline_at
    assert run_once(c['factory'],apply=True,clock=lambda:deadline).jobs['result_timeout'].applied==1
    assert run_once(c['factory'],apply=True,clock=lambda:deadline).jobs['result_timeout'].applied==0
    with c['factory']() as db:
        assert db.get(Order,ident).status=='RESULT_NOTIFIED'
        assert db.scalar(select(BuyerInspectionDecision.id).where(BuyerInspectionDecision.order_id==ident)) is None
        assert db.scalar(select(OrderSettlement.id).where(OrderSettlement.order_id==ident)) is None
        assert db.scalar(select(Shipment.id).where(Shipment.order_id==ident,Shipment.leg!='TO_CENTER')) is None
    advance(c,deadline+timedelta(seconds=1))
    assert post(c,f'/orders/{ident}/inspection/decision','buyer',{'decision':'CONFIRM'}).status_code==409
    dispatch(c,ident,None)
    assert post(c,f'/orders/{ident}/confirm-return','seller').status_code==200
    terminal(c,ident,'REFUND',1200)

@pytest.mark.parametrize('actor',['buyer','seller','inspector','other_buyer','other_seller'])
def test_untrusted_events_and_wrong_return_recipients_denied(context,actor):
    c=context;ident,_=work(c);ship=dispatch(c,ident,'REJECT')
    event=post(c,f'/admin/shipments/{ship}/shipping-events',actor,{'leg':'TO_SELLER','event':'DELIVERED','event_id':'forged-event-001'})
    assert event.status_code==403,event.text
    received=post(c,f'/orders/{ident}/confirm-return',actor)
    assert received.status_code==(200 if actor=='seller' else 403 if actor in {'buyer','inspector','other_buyer'} else 404),received.text
    if actor!='seller':
        with c['factory']() as db: assert db.scalar(select(OrderSettlement.id).where(OrderSettlement.order_id==ident)) is None


def event(c,ship,leg='TO_BUYER',ident='trusted-event-001',key=None):
    return post(c,f'/admin/shipments/{ship}/shipping-events','admin',{'leg':leg,'event':'DELIVERED','event_id':ident},key)


def test_event_dedup_wrong_leg_extra_fields_config_terminal_and_privacy(context):
    c=context;ident,_=work(c);ship=dispatch(c,ident)
    assert event(c,ship,'TO_SELLER').status_code==409
    c['monkeypatch'].setenv('EXTERNAL_SHIPPING_DEMO_ENABLED','false');assert event(c,ship).status_code==403
    c['monkeypatch'].setenv('EXTERNAL_SHIPPING_DEMO_ENABLED','true')
    assert post(c,f'/admin/shipments/{ship}/shipping-events','admin',{'leg':'TO_BUYER','event':'DELIVERED','event_id':'trusted-event-001','confirmed_at':'2000-01-01'}).status_code==422
    key=new_key();first=event(c,ship,key=key);assert first.status_code==200,first.text
    same=event(c,ship,key=key);assert same.status_code==200 and same.json()==first.json() and same.headers['Idempotent-Replayed']=='true'
    dedup=event(c,ship,key=new_key());assert dedup.status_code==200 and dedup.json()==first.json()
    assert event(c,ship,ident='different-event-001',key=key).status_code==409
    assert event(c,ship,ident='different-event-001').status_code==409
    with c['factory']() as db:
        original_deadline=db.get(Order,ident).receipt_deadline_at
        assert db.scalar(select(func.count()).select_from(ShippingEvent))==1
    view=c['client'].get(f'/orders/{ident}/delivery',headers=c['seller'])
    assert view.headers['Cache-Control']=='no-store'
    assert view.json()['charged_amount'] is None and view.json()['refund_quote'] is None
    assert 'destination_address' not in view.text and 'received_by' not in view.text
    assert post(c,f'/orders/{ident}/confirm-receipt','buyer').status_code==200
    assert event(c,ship,ident='late-fresh-event').status_code==409
    assert event(c,ship,key=key).status_code==200
    with c['factory']() as db: assert db.get(Order,ident).receipt_deadline_at==original_deadline


def test_report_before_event_blocks_auto_and_scoped_admin_full_refund(context):
    c=context;ident,_=work(c);ship=dispatch(c,ident)
    report=post(c,f'/orders/{ident}/report-not-received','buyer',{'reason':'Buyer reports missing while the transport status is late'})
    assert report.status_code==200,report.text
    assert event(c,ship).status_code==200
    with c['factory']() as db: deadline=db.get(Order,ident).receipt_deadline_at
    assert run_once(c['factory'],apply=True,clock=lambda:deadline).jobs['receipt_release'].applied==0
    assert post(c,f'/orders/{ident}/confirm-receipt','buyer').status_code==409
    review=post(c,f'/admin/orders/{ident}/delivery-review','admin',{'reason':'Admin verified the actual missing delivery case'})
    assert review.status_code==200,review.text
    refs=[review.json()['audit_reference'],review.json()['report']['reference']]
    resolved=post(c,f'/admin/orders/{ident}/resolve-delivery','admin',{'resolution':'REFUND','reason':'Admin confirms non-receipt with scoped case evidence','evidence_refs':refs})
    assert resolved.status_code==200,resolved.text
    terminal(c,ident,'REFUND',1350)


def test_trusted_buyer_event_auto_uses_72h_and_not_tracking(context):
    c=context;ident,_=work(c);ship=dispatch(c,ident)
    assert run_once(c['factory'],apply=True,clock=lambda:database_now_from(c)+timedelta(days=10)).jobs['receipt_release'].applied==0
    arrived=event(c,ship);assert arrived.status_code==200,arrived.text
    with c['factory']() as db: deadline=db.get(Order,ident).receipt_deadline_at
    assert run_once(c['factory'],apply=True,clock=lambda:deadline-timedelta(microseconds=1)).jobs['receipt_release'].applied==0
    assert run_once(c['factory'],apply=True,clock=lambda:deadline).jobs['receipt_release'].applied==1
    terminal(c,ident,'RELEASE')
    assert run_once(c['factory'],apply=True,clock=lambda:deadline).jobs['receipt_release'].applied==0


def database_now_from(c):
    with c['factory']() as db: return database_now(db)


@pytest.mark.parametrize('at_boundary',[False,True])
def test_receipt_report_strict_existing_deadline(context,at_boundary):
    c=context;ident,_=work(c);ship=dispatch(c,ident);assert event(c,ship).status_code==200
    with c['factory']() as db: deadline=db.get(Order,ident).receipt_deadline_at
    advance(c,deadline if at_boundary else deadline-timedelta(microseconds=1))
    response=post(c,f'/orders/{ident}/report-not-received','buyer',{'reason':'A valid physical non-receipt report at the boundary'})
    assert response.status_code==(409 if at_boundary else 200),response.text


def test_return_durable_failure_retry_and_scoped_admin_exception(context):
    c=context;ident,_=work(c);dispatch(c,ident,'REJECT')
    reviewed=post(c,f'/admin/orders/{ident}/return-review','admin',{'reason':'Admin reviews this exact unconfirmed physical return'})
    assert reviewed.status_code==200,reviewed.text
    body={'reason':'Actual return verified by Admin with same-case evidence','evidence_refs':reviewed.json()['evidence_refs']}
    assert post(c,f'/admin/orders/{ident}/confirm-return','buyer',body).status_code==403
    assert post(c,f'/admin/orders/{ident}/confirm-return','admin',{**body,'evidence_refs':['delivery-audit:9999','return-shipment:9999']}).status_code==422
    original=settlement_service.settle
    def outage(*a,**k): raise RuntimeError('Synthetic first settlement outage')
    c['monkeypatch'].setattr(settlement_service,'settle',outage)
    key=new_key();confirmed=post(c,f'/admin/orders/{ident}/confirm-return','admin',body,key);assert confirmed.status_code==200,confirmed.text
    with c['factory']() as db:
        assert db.get(Order,ident).status=='RETURNED_TO_SELLER'
        assert db.scalar(select(OrderSettlement.id).where(OrderSettlement.order_id==ident)) is None
        s=db.scalar(select(Shipment).where(Shipment.order_id==ident,Shipment.leg=='TO_SELLER'));assert s.recipient_source=='ADMIN' and s.received_at is not None
    assert c['client'].get(f'/orders/{ident}/delivery',headers=c['buyer']).json()['pending_processing']
    c['monkeypatch'].setattr(settlement_service,'settle',original)
    assert run_once(c['factory'],apply=True).jobs['return_refund'].applied==1
    terminal(c,ident,'REFUND',1200)
    assert run_once(c['factory'],apply=True).jobs['return_refund'].applied==0
    assert post(c,f'/admin/orders/{ident}/confirm-return','admin',body,key).json()==confirmed.json()


@pytest.mark.parametrize('decision',['CONFIRM','REJECT'])
def test_result_decision_replay_after_deadline_and_opposing_timeout(context,decision):
    c=context;ident,_=work(c)
    answer=post(c,f'/orders/{ident}/inspection/decision','buyer',{'decision':decision});assert answer.status_code==200
    with c['factory']() as db: deadline=db.get(Order,ident).result_decision_deadline_at
    advance(c,deadline)
    assert post(c,f'/orders/{ident}/inspection/decision','buyer',{'decision':decision}).json()==answer.json()
    assert run_once(c['factory'],apply=True,clock=lambda:deadline).jobs['result_timeout'].applied==0
    assert post(c,f'/orders/{ident}/inspection/decision','buyer',{'decision':'REJECT' if decision=='CONFIRM' else 'CONFIRM'}).status_code==409


def test_two_no_http_runners_timeout_dry_run_restart_and_cursor_fairness(context):
    c=context;orders=[]
    for index in range(3):
        if index:
            with c['factory']() as db:c['product']=create_product(db,c['seller_id'])
        orders.append(work(c)[0])
    with c['factory']() as db:
        due=max(db.get(Order,i).result_decision_deadline_at for i in orders)
        before=db.scalar(select(func.count()).select_from(FulfillmentCommand))
    dry=run_once(c['factory'],apply=False,clock=lambda:due,batch_size=1,max_batches=1)
    assert dry.jobs['result_timeout'].eligible==1
    with c['factory']() as db:assert db.scalar(select(func.count()).select_from(FulfillmentCommand))==before
    import app.services.result_timeout as timeouts
    original=timeouts.record_result_timeout
    def failed_first(db,ident,**options):
        if ident==orders[0]:raise RuntimeError('Synthetic first-order failure')
        return original(db,ident,**options)
    c['monkeypatch'].setattr(timeouts,'record_result_timeout',failed_first)
    first=run_once(c['factory'],apply=True,clock=lambda:due,batch_size=1,max_batches=1)
    assert first.jobs['result_timeout'].failed==1
    second=run_once(c['factory'],apply=True,clock=lambda:due,batch_size=1,max_batches=1)
    assert second.jobs['result_timeout'].applied==1
    c['monkeypatch'].setattr(timeouts,'record_result_timeout',original)
    with ThreadPoolExecutor() as pool:
        results=list(pool.map(lambda _:run_once(c['factory'],apply=True,clock=lambda:due,batch_size=1,max_batches=4),range(2)))
    with c['factory']() as db:
        assert all(db.get(Order,i).result_timed_out_at is not None for i in orders)
        assert db.scalar(select(func.count()).select_from(FulfillmentCommand).where(FulfillmentCommand.action=='RESULT_DECISION_TIMEOUT'))==3
        assert db.scalar(select(func.count()).select_from(BuyerInspectionDecision))==0
        assert db.scalar(select(func.count()).select_from(OrderSettlement))==0


@pytest.mark.parametrize('decision', ['CONFIRM', 'REJECT'])
@pytest.mark.parametrize('delta', [-1, 0, 1])
def test_fresh_result_decision_before_at_after_cutoff(context, decision, delta):
    c = context
    ident, _ = work(c)
    with c['factory']() as db:
        order = db.get(Order, ident)
        deadline = order.result_decision_deadline_at
        assert deadline == order.result_available_at + timedelta(hours=72)
    advance(c, deadline + timedelta(microseconds=delta))
    response = post(c, f'/orders/{ident}/inspection/decision', 'buyer', {'decision': decision})
    assert response.status_code == (200 if delta < 0 else 409), response.text
    timed = run_once(c['factory'], apply=True, clock=lambda: deadline)
    assert timed.jobs['result_timeout'].applied == (0 if delta < 0 else 1)
    with c['factory']() as db:
        actual = db.scalar(select(BuyerInspectionDecision).where(BuyerInspectionDecision.order_id == ident))
        assert (actual.decision if actual else None) == (decision if delta < 0 else None)
        assert (db.get(Order, ident).result_timed_out_at is not None) == (delta >= 0)
        assert db.scalar(select(OrderSettlement.id).where(OrderSettlement.order_id == ident)) is None


@pytest.mark.parametrize('action', ['confirm-receipt', 'report-not-received'])
@pytest.mark.parametrize('delta', [-1, 0, 1])
def test_actual_buyer_receipt_and_report_before_at_after_cutoff(context, action, delta):
    c = context
    ident, _ = work(c)
    ship = dispatch(c, ident)
    assert event(c, ship).status_code == 200
    with c['factory']() as db:
        deadline = db.get(Order, ident).receipt_deadline_at
    advance(c, deadline + timedelta(microseconds=delta))
    payload = {} if action == 'confirm-receipt' else {'reason': 'Actual missing parcel reported at the receipt boundary'}
    response = post(c, f'/orders/{ident}/{action}', 'buyer', payload)
    assert response.status_code == (200 if delta < 0 else 409), response.text
    with c['factory']() as db:
        order = db.get(Order, ident)
        assert (order.receipt_confirmed_at is not None) == (delta < 0 and action == 'confirm-receipt')
        assert (order.missing_reported_at is not None) == (delta < 0 and action == 'report-not-received')


def wait_for_order_lock(c):
    from sqlalchemy import text
    limit = time.monotonic() + 5
    while time.monotonic() < limit:
        with c['engine'].connect() as db:
            count = db.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()"))
        if count:
            return
        time.sleep(0.01)
    pytest.fail('Independent request did not reach the held PostgreSQL row lock')


@pytest.mark.parametrize('action', ['decision', 'confirm-receipt', 'report-not-received'])
def test_clock_timestamp_resampled_after_real_order_lock_wait(context, action):
    import app.api.inspections as inspections
    import app.api.finish as finish
    import app.services.order_settlement as settlement
    c = context
    ident, _ = work(c)
    if action != 'decision':
        ship = dispatch(c, ident)
        assert event(c, ship).status_code == 200
    with c['factory']() as db:
        order = db.get(Order, ident)
        deadline = order.result_decision_deadline_at if action == 'decision' else order.receipt_deadline_at
        # Compress the test's observation clock, never the persisted 72h window.
        offset = deadline - database_now(db) - timedelta(seconds=2)
    sampled = []
    def fresh_clock(db):
        value = database_now(db) + offset
        sampled.append(value)
        return value
    module = inspections if action == 'decision' else settlement if action == 'confirm-receipt' else finish
    c['monkeypatch'].setattr(module, 'database_now', fresh_clock)
    path = f'/orders/{ident}/inspection/decision' if action == 'decision' else f'/orders/{ident}/{action}'
    payload = {'decision': 'CONFIRM'} if action == 'decision' else {} if action == 'confirm-receipt' else {'reason': 'Request arrives before cutoff but waits for a real row lock'}
    with c['factory']() as blocker, ThreadPoolExecutor(1) as pool:
        blocker.scalar(select(Order).where(Order.id == ident).with_for_update())
        assert database_now(blocker) + offset < deadline
        pending = pool.submit(post, c, path, 'buyer', payload)
        try:
            wait_for_order_lock(c)
            assert not sampled  # The mutation clock has not been sampled before its locks.
            while database_now(blocker) + offset < deadline:
                time.sleep(0.01)
            blocker.commit()
            late = pending.result(timeout=10)
        finally:
            blocker.rollback()  # A failing assertion must unblock the independent request too.
    assert late.status_code == 409, late.text
    assert late.json()['detail']['code'] == ('result_decision_deadline_passed' if action == 'decision' else 'receipt_deadline_passed')
    assert sampled and all(value >= deadline for value in sampled)
    with c['factory']() as db:
        order = db.get(Order, ident)
        assert order.receipt_confirmed_at is None and order.missing_reported_at is None
        if action == 'decision':
            assert db.scalar(select(BuyerInspectionDecision.id).where(BuyerInspectionDecision.order_id == ident)) is None


@pytest.mark.parametrize('winner', ['CONFIRM', 'TIMEOUT'])
def test_opposing_confirm_and_system_timeout_wait_on_independent_connections(context, winner):
    from fastapi import HTTPException
    from app.services.result_timeout import record_result_timeout
    import app.api.inspections as inspections
    c = context
    ident, _ = work(c)
    with c['factory']() as db:
        deadline = db.get(Order, ident).result_decision_deadline_at
    locked, release = Event(), Event()
    def held_clock(db=None):
        locked.set()
        assert release.wait(5)
        return deadline - timedelta(microseconds=1) if winner == 'CONFIRM' else deadline
    c['monkeypatch'].setattr(inspections, 'database_now', held_clock if winner == 'CONFIRM' else lambda db: deadline - timedelta(microseconds=1))
    def timeout():
        with c['factory']() as db:
            try:
                result, replayed = record_result_timeout(db, ident, clock=(held_clock if winner == 'TIMEOUT' else lambda: deadline))
                db.commit()
                return result, replayed
            except HTTPException as exc:
                db.rollback()
                return exc.status_code, exc.detail
    with ThreadPoolExecutor(2) as pool:
        first = pool.submit(post, c, f'/orders/{ident}/inspection/decision', 'buyer', {'decision': 'CONFIRM'}) if winner == 'CONFIRM' else pool.submit(timeout)
        assert locked.wait(5)
        second = pool.submit(timeout) if winner == 'CONFIRM' else pool.submit(post, c, f'/orders/{ident}/inspection/decision', 'buyer', {'decision': 'CONFIRM'})
        wait_for_order_lock(c)
        release.set()
        left, right = first.result(timeout=10), second.result(timeout=10)
    if winner == 'CONFIRM':
        assert (left.status_code, right[0]) == (200, 409)
    else:
        assert right.status_code == 409 and left[1] is False
    with c['factory']() as db:
        order = db.get(Order, ident)
        decisions = db.scalars(select(BuyerInspectionDecision).where(BuyerInspectionDecision.order_id == ident)).all()
        assert len(decisions) == (1 if winner == 'CONFIRM' else 0)
        assert (order.result_timed_out_at is not None) == (winner == 'TIMEOUT')
        assert db.scalar(select(OrderSettlement.id).where(OrderSettlement.order_id == ident)) is None
    advance(c, deadline + timedelta(seconds=1))
    ship = dispatch(c, ident, None)
    with c['factory']() as db:
        assert db.get(Shipment, ship).leg == ('TO_BUYER' if winner == 'CONFIRM' else 'TO_SELLER')
    assert post(c, f'/orders/{ident}/fulfillment', 'inspector', {'carrier': 'Demo', 'tracking_number': 'OPPOSING'}).status_code == 409


@pytest.mark.parametrize('competitors', ['receipt-report', 'receipt-auto', 'report-auto'])
def test_buyer_report_receipt_auto_races_have_one_durable_outcome(context, competitors):
    c = context
    ident, _ = work(c)
    ship = dispatch(c, ident)
    assert event(c, ship).status_code == 200
    with c['factory']() as db:
        deadline = db.get(Order, ident).receipt_deadline_at
    advance(c, deadline - timedelta(microseconds=1))
    start = Event()
    def http(action):
        assert start.wait(5)
        body = {} if action == 'confirm-receipt' else {'reason': 'Actual missing delivery reported during an opposing command'}
        return post(c, f'/orders/{ident}/{action}', 'buyer', body)
    def auto():
        assert start.wait(5)
        return run_once(c['factory'], apply=True, clock=lambda: deadline)
    with ThreadPoolExecutor(3) as pool:
        if competitors == 'receipt-report':
            futures = [pool.submit(http, 'confirm-receipt'), pool.submit(http, 'report-not-received')]
        else:
            futures = [pool.submit(http, 'confirm-receipt' if competitors == 'receipt-auto' else 'report-not-received'), pool.submit(auto), pool.submit(auto)]
        start.set()
        outcomes = [future.result(timeout=15) for future in futures]
    if competitors == 'receipt-report':
        assert sorted(response.status_code for response in outcomes) == [200, 409]
    else:
        assert outcomes[0].status_code in {200, 409}
        assert sum(run.jobs['receipt_release'].applied for run in outcomes[1:]) <= 1
        run_once(c['factory'], apply=True, clock=lambda: deadline)  # Catch-up after SKIP LOCKED.
    with c['factory']() as db:
        order = db.get(Order, ident)
        rows = db.scalars(select(OrderSettlement).where(OrderSettlement.order_id == ident)).all()
        if order.missing_reported_at is not None:
            assert order.status == 'DELIVERY_DISPUTED' and not rows
            assert db.scalar(select(Escrow.status).where(Escrow.order_id == ident)) == 'HELD'
        else:
            assert order.status == 'COMPLETED' and len(rows) == 1 and rows[0].kind == 'RELEASE'


@pytest.mark.parametrize('refund,inspection,shipping', [(1050, 200, 100), (1350, 0, 0), (1200, 99, 51)])
def test_database_rejects_wrong_item_refund_and_retry_keeps_original_charge(context, refund, inspection, shipping):
    from dataclasses import replace
    import app.services.order_settlement as settlement
    c = context
    ident, _ = work(c)
    dispatch(c, ident, 'REJECT')
    original_receipt = c['client'].get(f'/orders/{ident}/receipt', headers=c['buyer']).json()
    allocator = settlement.allocation
    def bad_allocation(*args, **kwargs):
        valid = allocator(*args, **kwargs)
        return replace(valid, buyer_refund=Decimal(refund), inspection=Decimal(inspection), shipping=Decimal(shipping))
    c['monkeypatch'].setattr(settlement, 'allocation', bad_allocation)
    # Actual receipt commits, but the deliberately invalid financial transaction must roll back.
    response = post(c, f'/orders/{ident}/confirm-return', 'seller')
    assert response.status_code == 200, response.text
    with c['factory']() as db:
        assert db.get(Order, ident).status == 'RETURNED_TO_SELLER'
        assert db.scalar(select(OrderSettlement.id).where(OrderSettlement.order_id == ident)) is None
        assert db.scalar(select(FulfillmentCommand.id).where(FulfillmentCommand.resource_id == ident, FulfillmentCommand.action == 'SETTLE_RETURN_DELIVERY')) is None
        assert db.scalar(select(Escrow.status).where(Escrow.order_id == ident)) == 'HELD'
    c['monkeypatch'].setattr(settlement, 'allocation', allocator)
    assert run_once(c['factory'], apply=True).jobs['return_refund'].applied == 1
    terminal(c, ident, 'REFUND', 1200)
    assert c['client'].get(f'/orders/{ident}/receipt', headers=c['buyer']).json() == original_receipt


def test_direct_policy_event_recipient_and_destination_guards(context):
    from sqlalchemy import text
    from app.services import finish_core as core
    c = context
    ident, _ = work(c)
    ship = dispatch(c, ident)
    with c['factory']() as db:
        attempts = [
            ("UPDATE orders SET fulfillment_policy='LEGACY_V1' WHERE id=:id", {'id': ident}),
            ("UPDATE orders SET result_decision_deadline_at=result_decision_deadline_at+interval '1 second' WHERE id=:id", {'id': ident}),
            ("UPDATE shipments SET fulfillment_policy='LEGACY_V1' WHERE id=:id", {'id': ship}),
            ("UPDATE shipments SET destination_address='{}' WHERE id=:id", {'id': ship}),
            ("UPDATE shipments SET status='DELIVERED' WHERE id=:id", {'id': ship}),
        ]
        for sql, params in attempts:
            with pytest.raises(IntegrityError), db.begin_nested():
                db.execute(text(sql), params)
                db.execute(text('SET CONSTRAINTS ALL IMMEDIATE'))
        with pytest.raises(IntegrityError, match='trusted shipment event'), db.begin_nested():
            at = database_now(db)
            cmd = core.command(db, ident, f"USER:{c['buyer_id']}", c['buyer_id'], 'SHIPPING_EVENT', new_key(), {}, {}, at)
            db.add(ShippingEvent(order_id=ident, shipment_id=ship, leg='TO_BUYER', source='ADMIN_DEMO', event='DELIVERED', event_id='forged-db-event', admin_id=c['buyer_id'], command_id=cmd.id, confirmed_at=at))
            db.flush()
        with pytest.raises(IntegrityError, match='recipient receipt'), db.begin_nested():
            at = database_now(db)
            cmd = core.command(db, ident, f"USER:{c['seller_id']}", c['seller_id'], 'SETTLE_BUYER_RECEIPT', new_key(), {}, {}, at)
            db.execute(text("UPDATE shipments SET status='DELIVERED',received_at=:at,received_by=:actor,recipient_source='BUYER',recipient_command_id=:cmd WHERE id=:ship"), {'at': at, 'actor': c['seller_id'], 'cmd': cmd.id, 'ship': ship})
    assert event(c, ship).status_code == 200
    with c['factory']() as db:
        with pytest.raises(IntegrityError, match='immutable'), db.begin_nested():
            db.execute(text("UPDATE shipping_events SET confirmed_at=confirmed_at+interval '1 second' WHERE shipment_id=:ship"), {'ship': ship})
    assert post(c, f'/orders/{ident}/confirm-receipt', 'buyer').status_code == 200
    with c['factory']() as db:
        with pytest.raises(IntegrityError, match='recipient confirmation immutable'), db.begin_nested():
            db.execute(text("UPDATE shipments SET received_note='rewritten' WHERE id=:ship"), {'ship': ship})
    terminal(c, ident, 'RELEASE')


def test_event_identity_cannot_move_to_another_order_or_leg(context):
    c = context
    first, _ = work(c)
    first_ship = dispatch(c, first)
    assert event(c, first_ship).status_code == 200
    with c['factory']() as db:
        c['product'] = create_product(db, c['seller_id'])
    second, _ = work(c)
    second_ship = dispatch(c, second, 'REJECT')
    reused = event(c, second_ship, 'TO_SELLER')
    assert reused.status_code == 409 and reused.json()['detail']['code'] == 'shipping_event_reused'
    with c['factory']() as db:
        assert db.scalar(select(func.count()).select_from(ShippingEvent)) == 1
        assert db.get(Order, second).receipt_deadline_at is None


def test_new_policy_no_ship_still_refunds_full_and_forbids_injected_fields(context):
    c = context
    body = order_body(c['product'])
    for field, value in [('fulfillment_policy', 'LEGACY_V1'), ('result_decision_deadline_at', '2000-01-01'), ('total_amount', 1), ('buyer_id', c['seller_id'])]:
        assert post(c, '/orders', 'buyer', {**body, field: value}).status_code == 422
    created = post(c, '/orders', 'buyer', body)
    assert created.status_code == 201
    ident = created.json()['id']
    assert post(c, f'/orders/{ident}/payments/simulate', 'buyer', {'outcome': 'SUCCESS'}).status_code == 200
    receipt = c['client'].get(f'/orders/{ident}/receipt', headers=c['buyer']).json()
    with c['factory']() as db:
        due = db.get(Order, ident).paid_at + timedelta(hours=72)
    assert run_once(c['factory'], apply=True, clock=lambda: due - timedelta(microseconds=1)).jobs['seller_no_ship'].applied == 0
    assert run_once(c['factory'], apply=True, clock=lambda: due).jobs['seller_no_ship'].applied == 1
    terminal(c, ident, 'REFUND', 1350)
    assert c['client'].get(f'/orders/{ident}/receipt', headers=c['buyer']).json() == receipt


def test_assigned_inspector_and_legacy_courier_routes_are_scoped(context):
    c = context
    ident, inspection = work(c)
    assert post(c, f'/orders/{ident}/fulfillment', 'other_inspector', {'carrier': 'Demo', 'tracking_number': 'WRONG'}).status_code == 409  # Decision is required first.
    assert post(c, f'/orders/{ident}/inspection/decision', 'buyer', {'decision': 'CONFIRM'}).status_code == 200
    assert post(c, f'/orders/{ident}/fulfillment', 'other_inspector', {'carrier': 'Demo', 'tracking_number': 'WRONG'}).status_code == 404
    assert post(c, f'/inspections/{inspection}/receive', 'other_inspector', {'note': 'Wrong center recipient'}).status_code == 404
    with c['factory']() as db:
        inbound = db.scalar(select(Shipment.id).where(Shipment.order_id == ident, Shipment.leg == 'TO_CENTER'))
    assigned = post(c, f'/admin/shipments/{inbound}/assign-courier', 'admin', {'courier_id': c['buyer_id']})
    assert assigned.status_code == 409 and assigned.json()['detail']['code'] == 'legacy_courier_only'
    ship = dispatch(c, ident, None)
    assert post(c, f'/orders/{ident}/confirm-return', 'seller').status_code == 409
    assert post(c, f'/orders/{ident}/confirm-receipt', 'buyer', {'refund_amount': 1}).status_code == 422
    with c['factory']() as db:
        assert db.get(Shipment, ship).leg == 'TO_BUYER'


def test_seller_as_buyer_new_sale_keeps_profile_policy_and_public_revocation_redaction(context):
    c = context
    c['buyer'], c['buyer_id'] = c['other_seller'], c['other_seller_id']
    with c['factory']() as db:
        approve(db, c['buyer_id'])
    profile = c['client'].patch('/profile', json={'full_name': 'ชื่อผู้ซื้อที่เป็นผู้ขาย'}, headers=c['buyer'])
    assert profile.status_code == 200
    policy = post(c, '/profile/policy-acknowledgement', 'buyer', {'policy_version': 'submission-2026-10-01'})
    assert policy.status_code == 200
    assert c['client'].get('/profile', headers=c['buyer']).json()['full_name'] == 'ชื่อผู้ซื้อที่เป็นผู้ขาย'
    ident, _ = work(c)
    dispatch(c, ident)
    assert post(c, f'/orders/{ident}/confirm-receipt', 'buyer').status_code == 200
    assert post(c, f'/orders/{ident}/review', 'buyer', {'rating': 5, 'comment': 'Verified new-policy sale'}).status_code == 201
    with c['factory']() as db:
        cert = db.scalar(select(Certificate).where(Certificate.order_id == ident))
        cert_id, token = cert.id, cert.public_token
    reason = 'Private revocation after an actual new-policy Seller-as-Buyer sale'
    assert post(c, f'/admin/certificates/{cert_id}/revoke', 'admin', {'reason': reason}).status_code == 200
    public = c['client'].get(f'/certificates/{token}/json')
    assert public.json()['status'] == 'REVOKED' and reason not in public.text
    reviews = c['client'].get(f"/sellers/{c['seller_id']}/reviews").json()
    assert reviews['summary']['count'] == 1
    assert not {'buyer_id', 'order_id', 'email', 'full_name'}.intersection(reviews['items'][0])
    terminal(c, ident, 'RELEASE')


def test_center_transport_event_is_not_actual_center_receipt(context):
    from app.models.inspection import Inspection
    c = context
    created = post(c, '/orders', 'buyer', order_body(c['product']))
    ident = created.json()['id']
    assert post(c, f'/orders/{ident}/payments/simulate', 'buyer', {'outcome': 'SUCCESS'}).status_code == 200
    assert c['client'].put(f'/orders/{ident}/return-address', json=VALID_ADDRESS, headers={**c['seller'], 'Idempotency-Key': new_key()}).status_code == 200
    assert post(c, f'/orders/{ident}/ship-to-center', 'seller', {'carrier': 'External demo', 'tracking_number': 'CENTER-ONLY'}).status_code == 200
    with c['factory']() as db:
        ship = db.scalar(select(Shipment.id).where(Shipment.order_id == ident))
        inspection = db.scalar(select(Inspection.id).where(Inspection.order_id == ident))
    assert event(c, ship, 'TO_CENTER').status_code == 200
    with c['factory']() as db:
        assert db.get(Order, ident).status == 'SHIPPING_TO_CENTER'
        assert db.get(Shipment, ship).received_at is None
    assert post(c, f'/inspections/{inspection}/start', 'inspector').status_code == 409
    assert post(c, f'/inspections/{inspection}/receive', 'inspector', {'note': 'Actual center recipient now receives'}).status_code == 200
    with c['factory']() as db:
        assert db.get(Shipment, ship).recipient_source == 'INSPECTOR'
        assert db.get(Order, ident).receipt_deadline_at is None


def test_actual_item_refund_downgrade_refuses_without_losing_settlement(context):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text
    c = context
    ident, _ = work(c)
    ship = dispatch(c, ident, 'REJECT')
    assert event(c, ship, 'TO_SELLER').status_code == 200
    assert post(c, f'/orders/{ident}/confirm-return', 'seller').status_code == 200
    terminal(c, ident, 'REFUND', 1200)
    tables = ['orders', 'shipments', 'shipping_events', 'order_settlements', 'payments', 'receipts', 'fulfillment_commands']
    def saved():
        with c['engine'].connect() as db:
            return {table: db.execute(text(f'SELECT to_jsonb(t) FROM {table} t ORDER BY id')).scalars().all() for table in tables}
    before = saved()
    config = Config()
    config.set_main_option('script_location', str(Path(__file__).resolve().parents[1] / 'migrations'))
    c['monkeypatch'].setenv('DATABASE_URL', os.environ['FINISH_TEST_DATABASE_URL'])
    with pytest.raises(RuntimeError, match='downgrade refused'):
        command.downgrade(config, 'c08f20261002')
    assert saved() == before
    with c['engine'].connect() as db:
        assert db.scalar(text('SELECT version_num FROM alembic_version')) == 'r01e20261002'


def test_admin_return_evidence_is_scoped_to_order_and_admin(context):
    c = context
    first, _ = work(c)
    dispatch(c, first, 'REJECT')
    reviewed = post(c, f'/admin/orders/{first}/return-review', 'admin', {'reason': 'Review actual physical return of the first Order'})
    assert reviewed.status_code == 200
    body = {'reason': 'Verify actual Seller receipt from same-case audited evidence', 'evidence_refs': reviewed.json()['evidence_refs']}
    with c['factory']() as db:
        c['product'] = create_product(db, c['seller_id'])
        _, c['other_admin'] = create_user(db, UserRole.ADMIN)
    second, _ = work(c)
    dispatch(c, second, 'REJECT')
    assert post(c, f'/admin/orders/{second}/confirm-return', 'admin', body).status_code == 422
    assert post(c, f'/admin/orders/{first}/confirm-return', 'other_admin', body).status_code == 422
    assert post(c, f'/admin/orders/{first}/confirm-return', 'admin', {**body, 'buyer_refund': 1}).status_code == 422
    with c['factory']() as db:
        assert db.scalar(select(func.count()).select_from(OrderSettlement)) == 0
    assert post(c, f'/admin/orders/{first}/confirm-return', 'admin', body).status_code == 200
    terminal(c, first, 'REFUND', 1200)


def test_actual_shipping_event_is_hidden_by_default_deny_rls_even_after_select_grant(context):
    from sqlalchemy import text
    c = context
    ident, _ = work(c)
    ship = dispatch(c, ident)
    assert event(c, ship).status_code == 200
    with c['engine'].begin() as db:
        assert db.scalar(text('SELECT count(*) FROM shipping_events')) == 1
        assert db.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid='shipping_events'::regclass")) is True
        for role in ('anon', 'authenticated'):
            db.execute(text(f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{role}') THEN CREATE ROLE {role} NOLOGIN; END IF; END $$"))
            db.execute(text(f'GRANT USAGE ON SCHEMA public TO {role}'))
            db.execute(text(f'GRANT SELECT ON shipping_events TO {role}'))
            db.execute(text(f'SET ROLE {role}'))
            try:
                assert db.scalar(text('SELECT count(*) FROM shipping_events')) == 0
            finally:
                db.execute(text('RESET ROLE'))
