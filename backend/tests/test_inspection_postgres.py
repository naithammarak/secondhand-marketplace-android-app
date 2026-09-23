"""INSPECT-01 integration checks; dedicated empty local PostgreSQL only."""

import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from threading import Event

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from app.models.inspection import Inspection, InspectionEvidence, InspectionIdempotency, InspectionResultEvidence
from app.models.order import Order
from app.models.user import UserRole
from app.models.shipment import Shipment
from scripts.seed_inspections import SCENARIOS, seed
from tests.order_helpers import VALID_ADDRESS, create_product, create_user


PG_URL = os.getenv("INSPECT_TEST_DATABASE_URL")
BACKEND = Path(__file__).resolve().parents[1]
PRE_INSPECT = "9446ec1a2c5d"
INSPECT_HEAD = "f3c1a09d8b56"
CERT_HEAD = "c7e4b21a9d08"
NEW_TABLES = {"shipments", "inspections", "inspection_evidence", "inspection_result_evidence", "inspection_idempotency"}
pytestmark = pytest.mark.skipif(not PG_URL, reason="INSPECT_TEST_DATABASE_URL is not set")


def _config():
    # Use the real migrations with in-memory Alembic config. Loading the INI
    # invokes fileConfig in env.py and replaces pytest's caplog handlers.
    config = Config()
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    return config


def _migrate(action, target):
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = PG_URL
    try:
        getattr(command, action)(_config(), target)
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous


@pytest.fixture(scope="module")
def pg_engine():
    parsed = make_url(PG_URL)
    if parsed.get_backend_name() != "postgresql" or parsed.host not in {"localhost", "127.0.0.1", "::1"} or "test" not in (parsed.database or "").lower():
        pytest.fail("INSPECT_TEST_DATABASE_URL must point to a dedicated local PostgreSQL test database")
    if PG_URL == os.getenv("DATABASE_URL"):
        pytest.fail("INSPECT_TEST_DATABASE_URL must differ from DATABASE_URL")
    engine = create_engine(PG_URL)
    try:
        with engine.connect() as connection:
            if inspect(connection).get_table_names(schema="public"):
                pytest.fail("INSPECT_TEST_DATABASE_URL must point to an empty database")
        _migrate("upgrade", PRE_INSPECT)
        with engine.connect() as connection:
            old_tables = set(inspect(connection).get_table_names(schema="public"))
            assert "orders" in old_tables and not NEW_TABLES & old_tables
        with Session(engine) as session:
            buyer_id, _ = create_user(session, UserRole.BUYER)
            seller_id, _ = create_user(session, UserRole.SELLER)
            product_id = create_product(session, seller_id)
            old_order = Order(
                buyer_id=buyer_id, seller_id=seller_id, product_id=product_id,
                status="WAITING_PAYMENT", product_name="Pre-inspect item",
                product_condition="GOOD", product_size="M", currency="THB",
                item_price=Decimal("1200.00"), shipping_fee=Decimal("50.00"),
                inspection_fee=Decimal("100.00"), commission_fee=Decimal("60.00"),
                total_amount=Decimal("1350.00"), seller_payout=Decimal("1140.00"),
                ship_recipient_name=VALID_ADDRESS["recipient_name"],
                ship_phone=VALID_ADDRESS["phone"],
                ship_address_line=VALID_ADDRESS["address_line"],
                ship_subdistrict=VALID_ADDRESS["subdistrict"],
                ship_district=VALID_ADDRESS["district"],
                ship_province=VALID_ADDRESS["province"],
                ship_postal_code=VALID_ADDRESS["postal_code"],
                idempotency_key="preinspect_order_001", request_hash="0" * 64,
            )
            session.add(old_order)
            session.commit()
            old_order_id = old_order.id
        _migrate("upgrade", INSPECT_HEAD)
        with Session(engine) as session:
            assert session.get(Order, old_order_id).status == "WAITING_PAYMENT"
        _migrate("downgrade", PRE_INSPECT)
        with Session(engine) as session:
            assert session.get(Order, old_order_id).status == "WAITING_PAYMENT"
        _migrate("upgrade", INSPECT_HEAD)
        yield engine
    finally:
        engine.dispose()


def test_migration_graph_and_schema(pg_engine):
    script = ScriptDirectory.from_config(_config())
    assert script.get_heads() == [CERT_HEAD]
    assert script.get_revision(CERT_HEAD).down_revision == INSPECT_HEAD
    assert script.get_revision(INSPECT_HEAD).down_revision == PRE_INSPECT
    with pg_engine.connect() as connection:
        assert NEW_TABLES <= set(inspect(connection).get_table_names(schema="public"))
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == INSPECT_HEAD
        rows = connection.execute(text("SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(:tables) AND relkind = 'r'"), {"tables": list(NEW_TABLES)}).all()
        assert dict(rows) == {name: True for name in NEW_TABLES}
        policies = connection.execute(text("SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY(:tables)"), {"tables": list(NEW_TABLES)}).scalar_one()
        assert policies == 0
        assert {"ix_orders_inspection_queue", "ix_inspections_inspector_created", "ix_inspection_evidence_inspection_id"} <= {
            index["name"] for table in ("orders", "inspections", "inspection_evidence")
            for index in inspect(connection).get_indexes(table)
        }


def test_data_api_roles_cannot_read_or_write_directly(pg_engine, seeded):
    with Session(pg_engine) as session:
        actor_id = session.scalar(select(Inspection.inspector_id).where(Inspection.order_id == seeded[4][1]))
    with pg_engine.connect() as connection:
        roles = set(connection.execute(text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")).scalars())
        if roles != {"anon", "authenticated"}:
            pytest.skip("isolated PostgreSQL needs anon/authenticated roles for direct-access RLS check")
        connection.rollback()
        for role in sorted(roles):
            transaction = connection.begin()
            try:
                connection.execute(text(f"SET LOCAL ROLE {role}"))
                assert connection.execute(text("SELECT count(*) FROM public.inspections")).scalar_one() == 0
                with pytest.raises(DBAPIError):
                    connection.execute(
                        text("INSERT INTO public.inspection_idempotency (order_id, actor_id, operation, idempotency_key, request_hash, response_status, response_body) VALUES (:order_id, :actor_id, 'probe', 'probe_key_123', :hash, 200, '{}')"),
                        {"order_id": seeded[4][1], "actor_id": actor_id, "hash": "a" * 64},
                    )
            except DBAPIError:
                # No membership or grants is also a direct-access denial.
                pass
            finally:
                transaction.rollback()


@pytest.fixture(scope="module")
def seeded(pg_engine):
    with Session(pg_engine) as session:
        first = seed(session, "inspect01-pgtest")
        session.commit()
    yield first


def test_seed_is_repeatable_and_keeps_order_data(pg_engine, seeded):
    assert len(seeded) == len(SCENARIOS) == 8
    with Session(pg_engine) as session:
        again = seed(session, "inspect01-pgtest")
        session.commit()
        assert [row[1] for row in again] == [row[1] for row in seeded]
        assert {row[2] for row in again} == {"already-present"}
        assert session.scalar(select(Order).where(Order.id == seeded[0][1])).status == "WAITING_SELLER_SHIP"
        assert session.scalar(select(Inspection).where(Inspection.order_id == seeded[-1][1])).result == "FAKE"
        assert session.query(InspectionResultEvidence).count() == 4


def test_constraints_and_cross_inspection_evidence(pg_engine, seeded):
    order_a, order_b = seeded[4][1], seeded[5][1]
    with Session(pg_engine) as session:
        def rejects(row):
            savepoint = session.begin_nested()
            session.add(row)
            with pytest.raises(IntegrityError):
                session.flush()
            savepoint.rollback()

        inspection_a = session.scalar(select(Inspection).where(Inspection.order_id == order_a))
        pending_a = session.scalar(select(Inspection).where(Inspection.order_id == seeded[2][1]))
        pending_b = session.scalar(select(Inspection).where(Inspection.order_id == seeded[3][1]))
        evidence_b = InspectionEvidence(
            inspection_id=pending_b.id, object_key=f"fixtures/inspect01/cross-{pending_b.id}.jpg",
            mime_type="image/jpeg", size_bytes=1, sha256="b" * 64,
            uploaded_by=pending_b.inspector_id,
        )
        session.add(evidence_b)
        session.flush()
        rejects(InspectionResultEvidence(inspection_id=pending_a.id, evidence_id=evidence_b.id))
        rejects(Inspection(order_id=order_a))
        rejects(Inspection(order_id=seeded[1][1], result="INVALID"))
        rejects(Shipment(order_id=order_a, leg="TO_CENTER", status="IN_TRANSIT", carrier="X", tracking_number="X"))
        rejects(InspectionEvidence(inspection_id=pending_b.id, object_key="invalid", mime_type="image/gif", size_bytes=0, sha256="x", uploaded_by=pending_b.inspector_id))
        rejects(InspectionIdempotency(order_id=order_a, actor_id=inspection_a.inspector_id, operation="result", idempotency_key="bad key", request_hash="x", response_status=200, response_body={}))

        first = InspectionIdempotency(
            order_id=order_a, actor_id=inspection_a.inspector_id,
            operation="result", idempotency_key="same_key_123",
            request_hash="a" * 64, response_status=200, response_body={"ok": True},
        )
        session.add(first)
        session.flush()
        rejects(InspectionIdempotency(
            order_id=order_a, actor_id=inspection_a.inspector_id,
            operation="result", idempotency_key="same_key_123",
            request_hash="a" * 64, response_status=200, response_body={"ok": True},
        ))
        session.add(InspectionIdempotency(
            order_id=order_a, actor_id=inspection_a.inspector_id,
            operation="receive", idempotency_key="same_key_123",
            request_hash="a" * 64, response_status=200, response_body={"ok": True},
        ))
        session.flush()
        session.rollback()


def test_order_status_and_final_result_are_guarded(pg_engine, seeded):
    with Session(pg_engine) as session:
        old_order = session.scalar(select(Order).where(Order.id == seeded[0][1]))
        for status in ("WAITING_PAYMENT", "WAITING_SELLER_SHIP", "SHIPPING_TO_CENTER", "RECEIVED_AT_CENTER", "INSPECTING", "RESULT_NOTIFIED"):
            old_order.status = status
            session.flush()
        session.rollback()

    with pg_engine.begin() as connection:
        savepoint = connection.begin_nested()
        with pytest.raises(IntegrityError):
            connection.execute(text("UPDATE orders SET status = 'INVALID' WHERE id = :id"), {"id": seeded[0][1]})
        savepoint.rollback()

    with Session(pg_engine) as session:
        inspection = session.scalar(select(Inspection).where(Inspection.order_id == seeded[4][1]))
        savepoint = session.begin_nested()
        with pytest.raises(DBAPIError):
            inspection.result = "FAKE"
            session.flush()
        savepoint.rollback()


def test_final_result_freezes_evidence_links_and_selected_metadata(pg_engine, seeded):
    with Session(pg_engine) as session:
        inspection = session.scalar(select(Inspection).where(Inspection.order_id == seeded[4][1]))
        selected = session.scalar(select(InspectionEvidence).where(InspectionEvidence.inspection_id == inspection.id))
        pending = session.scalar(select(Inspection).where(Inspection.order_id == seeded[3][1]))
        unselected = InspectionEvidence(
            inspection_id=pending.id, object_key=f"fixtures/inspect01/extra-{pending.id}.jpg",
            mime_type="image/jpeg", size_bytes=1, sha256="d" * 64,
            uploaded_by=pending.inspector_id,
        )
        session.add(unselected)
        session.flush()
        pending.result = "PASS"
        pending.summary = "Synthetic final result for evidence immutability test."
        pending.inspected_at = datetime.now(timezone.utc)
        session.flush()

        def rejects(statement):
            savepoint = session.begin_nested()
            with pytest.raises(DBAPIError):
                session.execute(statement)
            savepoint.rollback()

        rejects(text("INSERT INTO inspection_result_evidence (inspection_id, evidence_id) VALUES (:i, :e)").bindparams(i=pending.id, e=unselected.id))
        rejects(text("UPDATE inspection_evidence SET sha256 = :hash WHERE id = :e").bindparams(hash="b" * 64, e=selected.id))
        rejects(text("DELETE FROM inspection_evidence WHERE id = :e").bindparams(e=selected.id))
        rejects(text("INSERT INTO inspection_evidence (inspection_id, object_key, mime_type, size_bytes, sha256, uploaded_by) VALUES (:i, :key, 'image/jpeg', 1, :hash, :u)").bindparams(i=inspection.id, key=f"fixtures/inspect01/rejected-{selected.id}.jpg", hash="c" * 64, u=selected.uploaded_by))
        session.rollback()


def test_evidence_move_into_final_inspection_is_rejected(pg_engine, seeded):
    source_order, final_order = seeded[3][1], seeded[4][1]
    with Session(pg_engine) as session:
        source = session.scalar(select(Inspection).where(Inspection.order_id == source_order))
        destination = session.scalar(select(Inspection).where(Inspection.order_id == final_order))
        evidence = InspectionEvidence(
            inspection_id=source.id, object_key=f"fixtures/inspect01/move-{source.id}.jpg",
            mime_type="image/jpeg", size_bytes=1, sha256="e" * 64,
            uploaded_by=source.inspector_id,
        )
        session.add(evidence)
        session.flush()
        evidence_id = evidence.id
        savepoint = session.begin_nested()
        with pytest.raises(DBAPIError, match="final inspection evidence is immutable"):
            session.execute(
                update(InspectionEvidence).where(InspectionEvidence.id == evidence_id)
                .values(inspection_id=destination.id)
            )
        savepoint.rollback()
        assert session.get(InspectionEvidence, evidence_id).inspection_id == source.id
        session.rollback()


def test_evidence_move_waits_for_racing_finalization(pg_engine, seeded):
    source_order, destination_order = seeded[3][1], seeded[2][1]
    with Session(pg_engine) as session:
        source = session.scalar(select(Inspection).where(Inspection.order_id == source_order))
        destination = session.scalar(select(Inspection).where(Inspection.order_id == destination_order))
        evidence = InspectionEvidence(
            inspection_id=source.id, object_key=f"fixtures/inspect01/race-move-{source.id}.jpg",
            mime_type="image/jpeg", size_bytes=1, sha256="f" * 64,
            uploaded_by=source.inspector_id,
        )
        session.add(evidence)
        session.commit()
        evidence_id, source_id, destination_id = evidence.id, source.id, destination.id
        inspector_id = source.inspector_id

    started = Event()

    def move():
        with Session(pg_engine) as session:
            started.set()
            try:
                session.execute(
                    update(InspectionEvidence).where(InspectionEvidence.id == evidence_id)
                    .values(inspection_id=destination_id)
                )
                session.commit()
                return "moved"
            except DBAPIError:
                session.rollback()
                return "rejected"

    try:
        with Session(pg_engine) as finalizer:
            finalizer.execute(
                update(Inspection).where(Inspection.id == destination_id).values(
                    inspector_id=inspector_id,
                    started_at=datetime.now(timezone.utc),
                    result="PASS", summary="Synthetic final result during evidence move race.",
                    inspected_at=datetime.now(timezone.utc),
                )
            )
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(move)
                assert started.wait(5)
                with pytest.raises(TimeoutError):
                    future.result(timeout=0.2)
                finalizer.commit()
                assert future.result(timeout=5) == "rejected"
        with Session(pg_engine) as session:
            assert session.get(InspectionEvidence, evidence_id).inspection_id == source_id
    finally:
        with Session(pg_engine) as session:
            session.execute(text("DELETE FROM inspection_evidence WHERE id = :id"), {"id": evidence_id})
            session.commit()


def test_racing_final_result_has_one_winner(pg_engine, seeded):
    order_id = seeded[3][1]  # INSPECTING, final result still empty

    def submit(result):
        with Session(pg_engine) as session:
            try:
                session.execute(
                    update(Inspection)
                    .where(Inspection.order_id == order_id)
                    .values(result=result, summary=f"Synthetic final result is {result} for test.", inspected_at=text("now()"))
                )
                session.commit()
                return "created"
            except DBAPIError:
                session.rollback()
                return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(submit, ("PASS", "FAKE")))
    assert sorted(outcomes) == ["conflict", "created"]


def test_racing_same_order_has_one_winner(pg_engine, seeded):
    order_id = seeded[0][1]
    # One existing shipment is absent on this paid Order. Two transactions race
    # to insert the same logical inbound leg; UNIQUE admits exactly one.
    def insert(key):
        with Session(pg_engine) as session:
            session.add(Shipment(order_id=order_id, leg="TO_CENTER", status="IN_TRANSIT", carrier="Demo", tracking_number=key))
            try:
                session.commit()
                return "created"
            except IntegrityError:
                session.rollback()
                return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(insert, ("one", "two")))
    assert sorted(outcomes) == ["conflict", "created"]
    with Session(pg_engine) as session:
        assert session.query(Shipment).filter_by(order_id=order_id).count() == 1


def test_downgrade_refuses_new_data(pg_engine, seeded):
    with pytest.raises(RuntimeError, match="downgrade refused"):
        _migrate("downgrade", PRE_INSPECT)
    with pg_engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == INSPECT_HEAD
