"""L1 migration adoption from either already-applied branch, on disposable PostgreSQL."""

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from scripts.seed_inspections import seed


URL = os.getenv("L1_TEST_DATABASE_URL")
HEAD = "714f11c84d53"
PRESERVE = ("orders", "payment_attempts", "payments", "escrows", "receipts",
            "inspections", "inspection_evidence", "inspection_result_evidence")
pytestmark = pytest.mark.skipif(not URL, reason="L1_TEST_DATABASE_URL requires disposable PostgreSQL")


def _config():
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    return config


def _migrate(action, revision, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", URL)
    getattr(command, action)(_config(), revision)


def _snapshot(engine):
    with engine.connect() as connection:
        return {table: connection.execute(text(f"SELECT to_jsonb(row) FROM {table} row ORDER BY to_jsonb(row)::text")).scalars().all()
                for table in PRESERVE}


@pytest.mark.parametrize("applied_head", ["e8b2c490a713", "d8b7c4e2910a"])
def test_adopts_applied_branch_without_changing_order_or_payment_data(applied_head, monkeypatch):
    target = make_url(URL)
    assert (target.get_backend_name() == "postgresql" and target.host in {"localhost", "127.0.0.1", "::1"}
            and "test" in (target.database or "").lower() and URL != os.getenv("DATABASE_URL"))
    engine = create_engine(URL)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP SCHEMA public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
        _migrate("upgrade", applied_head, monkeypatch)
        with Session(engine) as session:
            rows = seed(session, f"l1_{applied_head[:4]}")
            order_id = next(order_id for key, order_id, _ in rows if key == "result-pass")
            session.execute(text("""
                INSERT INTO certificates(order_id, inspection_id, result, certificate_no, public_token)
                SELECT order_id, id, result, :number, :token FROM inspections WHERE order_id=:order_id
            """), {"order_id": order_id, "number": f"CERT-L1-{applied_head[:4]}",
                   "token": f"l1-legacy-{applied_head[:4]}"})
            session.commit()
        before = _snapshot(engine)
        with engine.connect() as connection:
            cert_before = connection.execute(text("SELECT to_jsonb(c) FROM certificates c")).scalar_one()
        _migrate("upgrade", HEAD, monkeypatch)
        assert _snapshot(engine) == before
        with engine.connect() as connection:
            assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == HEAD
            cert_after = connection.execute(text("SELECT to_jsonb(c) FROM certificates c")).scalar_one()
            assert all(cert_after[key] == value for key, value in cert_before.items())
            assert cert_after["status"] == "ISSUED"
            assert "buyer_inspection_decisions" in inspect(connection).get_table_names(schema="public")
            assert "shop_name" in {column["name"] for column in inspect(connection).get_columns("verifications")}
        _migrate("downgrade", applied_head, monkeypatch)
        assert _snapshot(engine) == before
        with engine.connect() as connection:
            assert set(connection.execute(text("SELECT version_num FROM alembic_version")).scalars()) == {
                "e8b2c490a713", "d8b7c4e2910a",
            }
            cert_restored = connection.execute(text("SELECT to_jsonb(c) FROM certificates c")).scalar_one()
            assert all(cert_restored[key] == value for key, value in cert_before.items())
    finally:
        engine.dispose()
