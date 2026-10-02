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
