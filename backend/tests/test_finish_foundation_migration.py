"""Real predecessor upgrade, preservation and actionable refusal in disposable PG."""
import os
from pathlib import Path
import subprocess
import sys
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

URL=os.getenv('FINISH_MIGRATION_TEST_DATABASE_URL')
HEAD='a02f20261002'
BASE=Path(__file__).resolve().parents[1]
LEGACY_SOURCE=os.getenv('FINISH_LEGACY_SOURCE')
pytestmark=pytest.mark.skipif(not URL or not LEGACY_SOURCE,reason='disposable PostgreSQL and legacy seed source required')
TABLES=('orders','payment_attempts','payments','escrows','receipts','shipments','shipment_delivery_proofs','inspections','inspection_evidence','inspection_result_evidence','certificates','buyer_inspection_decisions')

def migrate(revision,monkeypatch):
    monkeypatch.setenv('DATABASE_URL',URL)
    config=Config();config.set_main_option('script_location',str(BASE/'migrations'))
    command.upgrade(config,revision)

def fresh_engine():
    target=make_url(URL)
    assert target.host in {'localhost','127.0.0.1','::1'} and 'test' in target.database and target.get_backend_name()=='postgresql'
    engine=create_engine(URL)
    with engine.begin() as conn:
        conn.execute(text('DROP SCHEMA IF EXISTS public CASCADE'));conn.execute(text('CREATE SCHEMA public'))
    return engine

def seed_legacy(monkeypatch):
    # Source code only: no legacy environment files are read or copied.
    env={**os.environ,'DATABASE_URL':'sqlite:///:memory:','PUBLIC_CERTIFICATE_BASE_URL':'https://cert.example.test'}
    result=subprocess.run([sys.executable,'-m','scripts.seed_inspections','--database-url',URL,'--namespace','foundation-legacy','--apply'],cwd=LEGACY_SOURCE,env=env,capture_output=True,text=True)
    assert result.returncode==0,result.stderr

def snapshot(engine):
    with engine.connect() as conn:
        present=set(inspect(conn).get_table_names())
        return {table:conn.execute(text(f'SELECT to_jsonb(t) FROM {table} t ORDER BY id')).scalars().all() if table not in {'inspection_result_evidence'} else conn.execute(text(f'SELECT to_jsonb(t) FROM {table} t ORDER BY inspection_id,evidence_id')).scalars().all() for table in TABLES if table in present}

@pytest.mark.parametrize('predecessor',['714f11c84d53','e8b2c490a713','d8b7c4e2910a'])
def test_supported_legacy_orders_proofs_certificates_preserved(predecessor,monkeypatch):
    engine=fresh_engine()
    try:
        migrate(predecessor,monkeypatch);seed_legacy(monkeypatch)
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO certificates(order_id,inspection_id,result,certificate_no,public_token) SELECT order_id,id,result,'CERT-A-LEGACY','foundation-token-legacy' FROM inspections WHERE result='PASS'"))
            if 'buyer_inspection_decisions' in inspect(conn).get_table_names():
                conn.execute(text("INSERT INTO buyer_inspection_decisions(order_id,inspection_id,buyer_id,decision) SELECT i.order_id,i.id,o.buyer_id,'CONFIRM' FROM inspections i JOIN orders o ON o.id=i.order_id WHERE i.result='PASS'"))
            # Keep an unpaid Order alongside the legacy paid/proof/certificate rows.
            ident=conn.execute(text("SELECT id FROM orders WHERE status='WAITING_SELLER_SHIP'")).scalar_one()
            for table in ('receipts','escrows','payments','payment_attempts'):
                conn.execute(text(f'DELETE FROM {table} WHERE order_id=:id'),{'id':ident})
            conn.execute(text("UPDATE orders SET status='WAITING_PAYMENT',paid_at=NULL WHERE id=:id"),{'id':ident})
        before=snapshot(engine);migrate(HEAD,monkeypatch);after=snapshot(engine)
        for table,rows in before.items():
            assert len(after[table])==len(rows)
            for old,new in zip(rows,after[table]):assert all(new[k]==v for k,v in old.items()),table
        with engine.connect() as conn:
            assert conn.execute(text('SELECT version_num FROM alembic_version')).scalar_one()==HEAD
            assert conn.execute(text('SELECT count(*) FROM shipment_confirmed_proofs')).scalar_one()>0
            assert conn.execute(text('SELECT count(*) FROM orders WHERE return_address IS NOT NULL')).scalar_one()==0
            assert conn.execute(text("SELECT count(*) FROM pg_class WHERE relname IN ('order_settlements','fulfillment_commands','delivery_resolutions','shipment_confirmed_proofs','order_status_history','delivery_evidence_access') AND relrowsecurity")).scalar_one()==6
        config=Config();config.set_main_option('script_location',str(BASE/'migrations'))
        with pytest.raises(RuntimeError,match='downgrade refused'):command.downgrade(config,predecessor)
        assert snapshot(engine)==after
    finally:engine.dispose()

def test_unsafe_cross_order_legacy_data_refuses_upgrade_without_loss(monkeypatch):
    engine=fresh_engine()
    try:
        migrate('714f11c84d53',monkeypatch);seed_legacy(monkeypatch)
        with engine.begin() as conn:
            conn.execute(text('DELETE FROM escrows WHERE id=2'))
            conn.execute(text('UPDATE escrows SET payment_id = 2 WHERE id=1'))
        before=snapshot(engine)
        with pytest.raises(Exception,match='FINISH preflight: cross-order'):migrate(HEAD,monkeypatch)
        assert snapshot(engine)==before
        with engine.connect() as conn:assert conn.execute(text('SELECT version_num FROM alembic_version')).scalar_one()=='714f11c84d53'
    finally:engine.dispose()


def test_private_tables_default_deny_even_with_accidental_direct_grants(monkeypatch):
    from sqlalchemy.exc import DBAPIError
    engine=fresh_engine()
    try:
        with engine.begin() as conn:
            conn.execute(text("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$"))
        migrate(HEAD,monkeypatch)
        with engine.begin() as conn:
            for role in ('anon','authenticated'):
                assert conn.execute(text("SELECT has_table_privilege(:role,'fulfillment_commands','SELECT')"),{'role':role}).scalar_one() is False
                conn.execute(text(f'GRANT USAGE ON SCHEMA public TO {role}'))
                conn.execute(text(f'GRANT SELECT,INSERT ON fulfillment_commands TO {role}'))
                conn.execute(text(f'SET ROLE {role}'))
                assert conn.execute(text('SELECT count(*) FROM fulfillment_commands')).scalar_one()==0
                with pytest.raises(DBAPIError,match='row-level security'),conn.begin_nested():
                    conn.execute(text("INSERT INTO fulfillment_commands(id,actor_scope,action,resource_type,resource_id,idempotency_key,request_hash,response_status,result) VALUES(999,'SYSTEM:test','TEST','ORDER',1,'direct-write-0001',repeat('0',64),200,'{}')"))
                conn.execute(text('RESET ROLE'))
    finally:engine.dispose()
