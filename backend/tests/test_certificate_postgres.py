"""CERT-01 acceptance against a new, empty local PostgreSQL database only."""

import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from pathlib import Path
from threading import Event

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, DataError, IntegrityError
from sqlalchemy.orm import Session

from app.models import BuyerInspectionDecision, Certificate, Inspection, Order
from scripts.seed_certificates import seed as seed_certificates
from scripts.seed_inspections import seed as seed_inspections

URL = os.getenv("CERT_TEST_DATABASE_URL")
PREVIOUS = "c7e4b21a9d08"
HEAD = "d8b7c4e2910a"
BACKEND = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(not URL, reason="CERT_TEST_DATABASE_URL is not set")


def config():
    cfg = Config()
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    return cfg


def migrate(action, revision):
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = URL
    try:
        getattr(command, action)(config(), revision)
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous


def snapshots(engine):
    # Real paid Order, PaymentAttempt, Payment, Escrow and Receipt snapshots.
    with engine.connect() as conn:
        return {table: conn.execute(text(f"SELECT to_jsonb(t) FROM {table} t ORDER BY id")).scalars().all()
                for table in ("orders", "payment_attempts", "payments", "escrows", "receipts", "inspections")}


@pytest.fixture(scope="module")
def engine():
    target = make_url(URL)
    if target.get_backend_name() != "postgresql" or target.host not in {"localhost", "127.0.0.1", "::1"} or "test" not in (target.database or "").lower() or URL == os.getenv("DATABASE_URL"):
        pytest.fail("CERT_TEST_DATABASE_URL must be a separate local PostgreSQL test database")
    db = create_engine(URL)
    try:
        with db.connect() as conn:
            if inspect(conn).get_table_names(schema="public"):
                pytest.fail("CERT_TEST_DATABASE_URL must point to an empty database")
        migrate("upgrade", PREVIOUS)
        with Session(db) as session:
            rows = seed_inspections(session, "cert-legacy")
            pass_id = next(row[1] for row in rows if row[0] == "result-pass")
            fake_id = next(row[1] for row in rows if row[0] == "result-fake")
            # Use old columns, proving an already-issued certificate survives.
            session.execute(text("""
                INSERT INTO certificates(order_id, inspection_id, result, certificate_no, public_token)
                SELECT order_id, id, result, 'CERT-LEGACY', 'synthetic-legacy-token'
                FROM inspections WHERE order_id=:id
            """), {"id": pass_id})
            session.commit()
        before = snapshots(db)
        with db.connect() as conn:
            certificate_before = conn.execute(text("SELECT to_jsonb(c) FROM certificates c")).scalar_one()
        migrate("upgrade", HEAD)
        assert snapshots(db) == before
        with db.connect() as conn:
            current = conn.execute(text("SELECT to_jsonb(c) FROM certificates c")).scalar_one()
            assert {key: current[key] for key in certificate_before} == certificate_before
            assert current["status"] == "ISSUED" and current["revoked_at"] is None
        migrate("downgrade", PREVIOUS)
        assert snapshots(db) == before
        with db.begin() as conn:
            assert conn.execute(text("SELECT to_jsonb(c) FROM certificates c")).scalar_one() == certificate_before
            # A legacy positive certificate on a negative final result must stop
            # migration, without rewriting the legacy row or partially upgrading.
            conn.execute(text("""
                INSERT INTO certificates(order_id, inspection_id, result, certificate_no, public_token)
                SELECT order_id, id, 'PASS', 'CERT-INVALID-LEGACY', 'synthetic-invalid-token'
                FROM inspections WHERE order_id=:id
            """), {"id": fake_id})
        with pytest.raises(IntegrityError):
            migrate("upgrade", HEAD)
        with db.begin() as conn:
            assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == PREVIOUS
            assert "status" not in {column["name"] for column in inspect(conn).get_columns("certificates")}
            assert conn.execute(text("SELECT result FROM certificates WHERE certificate_no='CERT-INVALID-LEGACY'")).scalar_one() == "PASS"
            conn.execute(text("DELETE FROM certificates WHERE certificate_no='CERT-INVALID-LEGACY'"))
        migrate("upgrade", HEAD)
        assert snapshots(db) == before
        yield db
    finally:
        db.dispose()


@pytest.fixture()
def session(engine):
    with Session(engine) as db:
        yield db
        db.rollback()


def work(session, key="result-pass"):
    return session.execute(select(Order, Inspection).join(Inspection, Inspection.order_id == Order.id)
                           .where(Order.idempotency_key == f"cert-legacy_{key}")).one()


def choice(session, *, key="result-pass", **changes):
    order, inspection = work(session, key)
    values = dict(order_id=order.id, inspection_id=inspection.id, buyer_id=order.buyer_id, decision="CONFIRM")
    values.update(changes)
    return BuyerInspectionDecision(**values)


def test_graph_and_model_constraints_match_database(engine):
    assert ScriptDirectory.from_config(config()).get_heads() == [HEAD]
    with engine.connect() as conn:
        inspector = inspect(conn)
        for model in (Certificate, BuyerInspectionDecision, Order, Inspection):
            table = model.__table__
            assert set(table.columns.keys()) == {c["name"] for c in inspector.get_columns(table.name)}
            assert {c.name for c in table.constraints if c.__class__.__name__ == "UniqueConstraint"} == {
                c["name"] for c in inspector.get_unique_constraints(table.name)}
            expected_fks = {(tuple(c.column_keys), tuple(e.target_fullname for e in c.elements)) for c in table.foreign_key_constraints}
            actual_fks = {(tuple(c["constrained_columns"]), tuple(f"{c['referred_table']}.{col}" for col in c["referred_columns"])) for c in inspector.get_foreign_keys(table.name)}
            assert expected_fks == actual_fks
            assert {c.name for c in table.constraints if c.__class__.__name__ == "CheckConstraint"} == {
                c["name"] for c in inspector.get_check_constraints(table.name)}


@pytest.mark.parametrize("changes", [
    {"order_id": 999999}, {"inspection_id": 999999}, {"buyer_id": 999999},
    {"decision": "MAYBE"}, {"decision": None}, {"reason": "not allowed on CONFIRM"},
    {"decision": "REJECT", "reason": ""}, {"decision": "REJECT", "reason": " padded "},
    {"decision": "REJECT", "reason": "x" * 501},
])
def test_invalid_decision_rejected(session, changes):
    with pytest.raises((IntegrityError, DataError)), session.begin_nested():
        session.add(choice(session, **changes))
        session.flush()


def test_cross_order_and_wrong_existing_buyer_rejected(session):
    order, other_work = work(session, "result-minor-issue")
    for changes in ({"inspection_id": other_work.id}, {"buyer_id": order.seller_id}):
        with pytest.raises(IntegrityError), session.begin_nested():
            session.add(choice(session, **changes))
            session.flush()


@pytest.mark.parametrize("key", ["result-not-as-described", "result-fake", "inspecting", "result-minor-issue"])
def test_decision_without_qualifying_certificate_rejected(session, key):
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(choice(session, key=key))
        session.flush()


@pytest.mark.parametrize("key,result", [("result-fake", "PASS"), ("inspecting", "PASS"), ("result-minor-issue", "PASS"), ("result-minor-issue", "FAKE")])
def test_certificate_must_match_positive_final_snapshot(session, key, result):
    order, inspection = work(session, key)
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(Certificate(order_id=order.id, inspection_id=inspection.id, result=result,
                                certificate_no="CERT-INVALID", public_token="invalid-test-token"))
        session.flush()


@pytest.mark.parametrize("decision,reason", [("CONFIRM", None), ("REJECT", None), ("REJECT", "x" * 500)])
def test_valid_decision_once_and_immutable(session, decision, reason):
    row = choice(session, decision=decision, reason=reason)
    session.add(row)
    session.flush()
    assert row.decided_at is not None
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(choice(session, decision=decision, reason=reason))
        session.flush()
    for statement in (
        "UPDATE buyer_inspection_decisions SET decision='REJECT', reason=NULL WHERE id=:id",
        "UPDATE buyer_inspection_decisions SET buyer_id=999999 WHERE id=:id",
        "DELETE FROM buyer_inspection_decisions WHERE id=:id",
    ):
        with pytest.raises(IntegrityError), session.begin_nested():
            session.execute(text(statement), {"id": row.id})
    assert session.scalar(select(Certificate.status).where(Certificate.order_id == row.order_id)) == "ISSUED"


@pytest.mark.parametrize("assignment", [
    "status='OTHER'", "status='REVOKED'", "revoked_at=now()",
    "status='REVOKED', revoked_at=issued_at - interval '1 second'",
    "status='REVOKED', revoked_at=now(), revocation_reason=' '",
])
def test_invalid_certificate_state(session, assignment):
    with pytest.raises(IntegrityError), session.begin_nested():
        session.execute(text(f"UPDATE certificates SET {assignment} WHERE certificate_no='CERT-LEGACY'"))


def test_certificate_unique_identifiers(session):
    order, inspection = work(session, "result-minor-issue")
    old = session.scalar(select(Certificate))
    for changes in ({"certificate_no": old.certificate_no}, {"public_token": old.public_token},
                    {"order_id": old.order_id, "inspection_id": old.inspection_id, "result": old.result}):
        data = dict(order_id=order.id, inspection_id=inspection.id, result=inspection.result,
                    certificate_no="CERT-UNIQUE", public_token="unique-test-token")
        data.update(changes)
        with pytest.raises(IntegrityError), session.begin_nested():
            session.add(Certificate(**data))
            session.flush()


def test_issued_snapshot_cannot_be_reassigned_or_rewritten(session):
    order, inspection = work(session, "result-minor-issue")
    for assignment, params in (
        ("order_id=:o, inspection_id=:i, result='MINOR_ISSUE'", {"o": order.id, "i": inspection.id}),
        ("public_token='replacement-token'", {}),
        ("certificate_no='replacement-number'", {}),
        ("issued_at=issued_at + interval '1 day'", {}),
    ):
        with pytest.raises(IntegrityError, match="snapshot is immutable"), session.begin_nested():
            session.execute(text(f"UPDATE certificates SET {assignment} WHERE certificate_no='CERT-LEGACY'"), params)


def test_rls_with_real_table_grants(session):
    row = choice(session)
    session.add(row)
    session.flush()
    roles = session.execute(text("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated')")).all()
    assert len(roles) == 2 and all(not r.rolsuper and not r.rolbypassrls for r in roles), "provision non-privileged anon/authenticated test roles"
    tables = ("certificates", "buyer_inspection_decisions")
    assert session.execute(text("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('certificates','buyer_inspection_decisions')")).scalar_one() == 0
    for role in ("anon", "authenticated"):
        session.execute(text(f"GRANT USAGE ON SCHEMA public TO {role}"))
        session.execute(text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON certificates, buyer_inspection_decisions TO {role}"))
        session.execute(text(f"SET LOCAL ROLE {role}"))
        for table in tables:
            assert session.execute(text(f"SELECT has_table_privilege(current_user, '{table}', 'INSERT')")).scalar_one()
            assert session.execute(text(f"SELECT count(*) FROM {table}")).scalar_one() == 0
            assert session.execute(text(f"DELETE FROM {table}")).rowcount == 0
        for sql, params in (
            ("INSERT INTO certificates(id,order_id,inspection_id,result,certificate_no,public_token) VALUES (999999,:o,:i,'PASS','RLS','rls-test')", {"o": row.order_id, "i": row.inspection_id}),
            ("INSERT INTO buyer_inspection_decisions(id,order_id,inspection_id,buyer_id,decision) VALUES (999999,:o,:i,:b,'CONFIRM')", {"o": row.order_id, "i": row.inspection_id, "b": row.buyer_id}),
        ):
            with pytest.raises(DBAPIError, match="row-level security"), session.begin_nested():
                session.execute(text(sql), params)
        session.execute(text("RESET ROLE"))


def test_downgrade_refuses_revocation_and_keeps_revision(engine):
    with engine.begin() as conn:
        conn.execute(text("UPDATE certificates SET status='REVOKED', revoked_at=now(), revocation_reason='Synthetic revocation' WHERE certificate_no='CERT-LEGACY'"))
    try:
        with pytest.raises(RuntimeError, match="revocation data"):
            migrate("downgrade", PREVIOUS)
        with engine.connect() as conn:
            assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == HEAD
            assert conn.execute(text("SELECT status FROM certificates WHERE certificate_no='CERT-LEGACY'")).scalar_one() == "REVOKED"
    finally:
        with engine.begin() as conn:
            conn.execute(text("UPDATE certificates SET status='ISSUED', revoked_at=NULL, revocation_reason=NULL WHERE certificate_no='CERT-LEGACY'"))


def test_seed_repeatable_preview_and_preserves_money(engine):
    with Session(engine) as session:
        before = session.scalar(select(Order.id).order_by(Order.id.desc()).limit(1))
        assert all(row[2] == "would-create" for row in seed_certificates(session, "cert-seed", apply=False))
        assert session.scalar(select(Order.id).order_by(Order.id.desc()).limit(1)) == before
        first = seed_certificates(session, "cert-seed")
        session.commit()
    before = snapshots(engine)
    with Session(engine) as session:
        second = seed_certificates(session, "cert-seed")
        session.commit()
        assert [row[:2] for row in first] == [row[:2] for row in second]
        assert all(row[2] == "already-present" for row in second)
        assert all(row[2] == "already-present" for row in seed_certificates(session, "cert-seed", apply=False))
    assert snapshots(engine) == before
    with pytest.raises(RuntimeError, match="buyer decisions exist"):
        migrate("downgrade", PREVIOUS)


def test_concurrent_decisions_only_one_wins(engine):
    ready = Event()
    release = Event()
    attempting = Event()

    def first():
        with Session(engine) as session:
            session.add(choice(session))
            session.flush()
            ready.set()
            assert release.wait(10)
            session.commit()

    def second():
        assert ready.wait(10)
        with Session(engine) as session:
            session.execute(text("SET LOCAL lock_timeout='5s'"))
            session.add(choice(session, decision="REJECT"))
            attempting.set()
            with pytest.raises(IntegrityError, match="uq_buyer_decisions_"):
                session.commit()

    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = pool.submit(first), pool.submit(second)
        try:
            assert attempting.wait(10)
            with pytest.raises(TimeoutError):
                b.result(timeout=0.2)  # The competing insert waits for the first commit.
        finally:
            release.set()
        a.result(timeout=15)
        b.result(timeout=15)
    with Session(engine) as session:
        order, _ = work(session)
        rows = session.scalars(select(BuyerInspectionDecision).where(BuyerInspectionDecision.order_id == order.id)).all()
        assert len(rows) == 1 and rows[0].decision == "CONFIRM"
