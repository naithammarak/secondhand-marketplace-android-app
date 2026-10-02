"""Upgrade actual PR129 API histories; safe downgrade and guarded refusal on owned PG."""
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient
from app.database import get_db
from app.main import app
from app.models.user import UserRole
from tests.order_helpers import create_user, create_product, order_body, new_key, patch_auth

URL=os.getenv('EXTERNAL_MIGRATION_TEST_DATABASE_URL')
SOURCE=os.getenv('EXTERNAL_LEGACY_SOURCE')
HEAD='r01e20261002';BASE='c08f20261002'
pytestmark=pytest.mark.skipif(not URL or not SOURCE,reason='owned migration DB and exact PR129 backend source required')

@pytest.fixture
def engine():
    parsed=make_url(URL)
    assert parsed.host in {'127.0.0.1','localhost','::1'} and 'test' in parsed.database and parsed.get_backend_name()=='postgresql'
    assert URL!=os.getenv('DATABASE_URL')
    engine=create_engine(URL)
    with engine.begin() as db:
        db.execute(text('DROP SCHEMA IF EXISTS public CASCADE'));db.execute(text('CREATE SCHEMA public'))
    yield engine
    engine.dispose()

def migrate(monkeypatch,action,revision):
    monkeypatch.setenv('DATABASE_URL',URL)
    config=Config();config.set_main_option('script_location',str(Path(__file__).resolve().parents[1]/'migrations'))
    getattr(command,action)(config,revision)

def snapshot(engine):
    with engine.connect() as conn:
        return {name:conn.execute(text(f'SELECT to_jsonb(t) FROM "{name}" t ORDER BY to_jsonb(t)::text')).scalars().all() for name in inspect(conn).get_table_names() if name!='alembic_version'}

LEGACY_TEST='''from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.order import Order
from app.models.certificate import Certificate
from tests.order_helpers import create_product,order_body
from tests.test_finish_flow_postgres import pg_engine,isolate_rows,world,delivered,post,paid_unshipped,assert_terminal
from tests.test_reviews_postgres import approve

def test_seed_actual_legacy_source_journeys(world):
    returned,_,_,_=delivered(world,"PASS","REJECT")
    assert_terminal(world,returned,"REFUND")
    with Session(world[1]) as db:
        seller=db.get(Order,returned).seller_id;approve(db,seller)
    def new_world():
        with Session(world[1]) as db:product=create_product(db,seller)
        return (*world[:6],product,*world[7:])
    sale_world=new_world();sale,_,_,_=delivered(sale_world)
    assert post(sale_world,f"/orders/{sale}/confirm-receipt",world[2],{}).status_code==200
    assert_terminal(world,sale,"RELEASE")
    assert post(world,f"/orders/{sale}/review",world[2],{"rating":5,"comment":"Actual legacy completed sale"}).status_code==201
    with Session(world[1]) as db:cert_id=db.scalar(select(Certificate.id).where(Certificate.order_id==sale))
    assert post(world,f"/admin/certificates/{cert_id}/revoke",world[9],{"reason":"Legacy actual audited revocation"}).status_code==200
    paid_unshipped(new_world())
    unpaid=new_world();assert post(unpaid,"/orders",world[2],order_body(unpaid[6])).status_code==201
'''

def test_actual_legacy_money_proofs_reviews_revoke_preserved_downgrade_reupgrade(engine,monkeypatch,tmp_path):
    legacy=Path(SOURCE)
    assert legacy.is_dir()
    assert not list(legacy.rglob('.env*')),'legacy extracted source must exclude every env template/private copy'
    script=tmp_path/'test_legacy_external_seed.py';script.write_text(LEGACY_TEST)
    env={'PATH':os.environ['PATH'],'PYTHONPATH':str(legacy),'DATABASE_URL':'sqlite:///:memory:',
         'FINISH_TEST_DATABASE_URL':URL,'PUBLIC_CERTIFICATE_BASE_URL':'https://cert.example.test'}
    run=subprocess.run([sys.executable,'-m','pytest','-q','--tb=short',str(script)],cwd=legacy,env=env,capture_output=True,text=True)
    assert run.returncode==0,run.stdout+'\n'+run.stderr
    before=snapshot(engine)
    assert len(before['order_settlements'])==2 and len(before['reviews'])==1
    migrate(monkeypatch,'upgrade',HEAD);after=snapshot(engine)
    for table,rows in before.items():
        assert len(after[table])==len(rows),table
        # New policy columns may change sorting; compare each historical id tuple.
        for old in rows:assert any(all(new[k]==v for k,v in old.items()) for new in after[table]),table
    with engine.connect() as db:
        assert db.scalar(text("SELECT count(*) FROM orders WHERE fulfillment_policy <> 'LEGACY_V1'"))==0
        assert db.scalar(text("SELECT buyer_refund FROM order_settlements WHERE kind='REFUND'"))==1350
        assert db.scalar(text("SELECT count(*) FROM shipping_events"))==0
    migrate(monkeypatch,'downgrade',BASE)
    assert snapshot(engine)==before
    migrate(monkeypatch,'upgrade',HEAD)
    assert snapshot(engine)==after


def test_new_policy_downgrade_refuses_without_data_loss(engine,monkeypatch):
    migrate(monkeypatch,'upgrade',HEAD)
    monkeypatch.setenv('PUBLIC_CERTIFICATE_BASE_URL','https://cert.example.test')
    patch_auth(monkeypatch)
    def dependency():
        with Session(engine) as db:yield db
    app.dependency_overrides[get_db]=dependency
    try:
        with Session(engine) as db:
            _,buyer=create_user(db,UserRole.BUYER);seller,_=create_user(db,UserRole.SELLER);product=create_product(db,seller)
        with TestClient(app) as client:
            response=client.post('/orders',json=order_body(product),headers={**buyer,'Idempotency-Key':new_key()})
            assert response.status_code==201,response.text
        before=snapshot(engine)
        with pytest.raises(RuntimeError,match='downgrade refused'):migrate(monkeypatch,'downgrade',BASE)
        assert snapshot(engine)==before
        with engine.connect() as db:assert db.scalar(text('SELECT version_num FROM alembic_version'))==HEAD
    finally:app.dependency_overrides.pop(get_db,None)


def test_new_event_rls_denies_direct_clients_even_after_grants(engine,monkeypatch):
    from sqlalchemy.exc import DBAPIError
    migrate(monkeypatch,'upgrade',HEAD)
    with engine.begin() as db:
        for role in ('anon','authenticated'):
            db.execute(text(f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{role}') THEN CREATE ROLE {role} NOLOGIN; END IF; END $$"))
            assert db.scalar(text(f"SELECT has_table_privilege('{role}','shipping_events','SELECT')")) is False
            db.execute(text(f'GRANT USAGE ON SCHEMA public TO {role}'));db.execute(text(f'GRANT SELECT,INSERT ON shipping_events TO {role}'))
            db.execute(text(f'SET ROLE {role}'));assert db.scalar(text('SELECT count(*) FROM shipping_events'))==0
            with pytest.raises(DBAPIError,match='row-level security|permission denied'),db.begin_nested():
                db.execute(text("INSERT INTO shipping_events(id,order_id,shipment_id,leg,source,event,event_id,admin_id,command_id,confirmed_at) VALUES(999,999,999,'TO_BUYER','ADMIN_DEMO','DELIVERED','forged-direct-001',999,999,clock_timestamp())"))
            db.execute(text('RESET ROLE'))
