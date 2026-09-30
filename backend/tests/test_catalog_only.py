"""Tests for the isolated public catalog application."""

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.engine import make_url

from app.catalog_database import create_catalog_session_factory, get_catalog_db
from app.catalog_main import app as catalog_app
from app.database import Base


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def get_test_db():
        with test_sessions() as db:
            yield db

    catalog_app.dependency_overrides[get_catalog_db] = get_test_db
    try:
        with TestClient(catalog_app) as test_client:
            yield test_client
    finally:
        catalog_app.dependency_overrides.pop(get_catalog_db, None)
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_catalog_application_exposes_only_public_get_routes(client, monkeypatch):
    import app.api.product_reads as product_reads

    def no_expiry_sweeps(*_args, **_kwargs):
        raise AssertionError("catalog browsing must not run order expiry")

    monkeypatch.setattr(product_reads, "release_expired_reservations", no_expiry_sweeps)

    paths = client.get("/openapi.json").json()["paths"]
    assert set(paths) == {"/health", "/products", "/products/{product_id}", "/categories", "/brands"}
    assert all(set(operation) == {"get"} for operation in paths.values())

    products = client.get("/products")
    assert products.status_code == 200
    assert products.headers["cache-control"] == "no-store"
    assert products.json()["meta"]["total"] == 0
    assert client.get("/categories").json() == {"data": []}
    assert client.get("/brands").json() == {"data": []}
    assert client.get("/products/1").status_code == 404

    assert client.get("/auth/me").status_code == 404
    assert client.get("/orders").status_code == 404
    assert client.post("/products").status_code == 405
    assert client.post("/products/images/upload").status_code == 404


@pytest.mark.skipif(
    not os.getenv("TASK01_CATALOG_TEST_DATABASE_URL"),
    reason="set TASK01_CATALOG_TEST_DATABASE_URL to an isolated local PostgreSQL test database",
)
def test_postgres_catalog_sessions_deny_writes_after_rollback():
    database_url = os.environ["TASK01_CATALOG_TEST_DATABASE_URL"]
    url = make_url(database_url)
    assert url.host in {"localhost", "127.0.0.1", "::1"}, "write-denial proof must use local PostgreSQL"
    assert "test" in (url.database or "").lower(), "write-denial proof requires a test database name"

    engine, sessions = create_catalog_session_factory(database_url)
    try:
        with sessions() as db:
            assert db.execute(text("SHOW transaction_read_only")).scalar_one() == "on"
            with pytest.raises(DBAPIError):
                db.execute(text("CREATE TEMP TABLE task01_catalog_write_probe (id integer)"))

            db.rollback()
            assert db.execute(text("SHOW transaction_read_only")).scalar_one() == "on"
            with pytest.raises(DBAPIError):
                db.execute(text("CREATE TEMP TABLE task01_catalog_write_probe (id integer)"))
            db.rollback()
    finally:
        engine.dispose()
