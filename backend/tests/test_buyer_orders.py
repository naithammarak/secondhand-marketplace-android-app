"""Buyer-only API integration. Writes only to an explicitly isolated local test DB."""
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.buyer_main import create_app
from app.catalog_database import get_catalog_db
from app.database import get_db
from app.models.order import Escrow, Order, Payment, PaymentAttempt, Receipt
from app.models.product import Product
from app.models.user import UserRole, UserStatus
from tests.order_helpers import auth_header, create_product, create_user, new_key, order_body, patch_auth


@pytest.fixture
def world(monkeypatch):
    url = os.getenv("BUYER_ORDERS_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set BUYER_ORDERS_TEST_DATABASE_URL to an isolated local task01 test database")
    parsed = make_url(url)
    assert parsed.get_backend_name() == "postgresql"
    assert parsed.host in {"127.0.0.1", "::1"} and not parsed.query
    assert "task01" in parsed.database and "test" in parsed.database
    patch_auth(monkeypatch)
    engine = create_engine(url)
    connection = engine.connect()
    # Validate the actual destination as well as the URL before any writes.
    info = connection.connection.driver_connection.info
    assert info.hostaddr in {"127.0.0.1", "::1"} and info.dbname == parsed.database
    assert info.port == parsed.port
    outer = connection.begin()
    sessions = sessionmaker(bind=connection, join_transaction_mode="create_savepoint", autoflush=False)
    app = create_app()
    def db_override():
        with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_catalog_db] = db_override
    with sessions() as db:
        buyer_id, buyer = create_user(db, UserRole.BUYER)
        _, other = create_user(db, UserRole.BUYER)
        seller_id, seller = create_user(db, UserRole.SELLER)
        product = create_product(db, seller_id)
    try:
        with TestClient(app) as client:
            yield client, sessions, buyer_id, buyer, other, seller, product
    finally:
        outer.rollback()
        connection.close()
        engine.dispose()


def test_route_allowlist_starts_without_certificate_origin(monkeypatch):
    monkeypatch.delenv("PUBLIC_CERTIFICATE_BASE_URL", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("PAYMENT_SIMULATION_ENABLED", "true")
    with TestClient(create_app()) as client:
        paths = client.get("/openapi.json").json()["paths"]
        assert set(paths) == {"/health", "/products", "/products/{product_id}",
            "/categories", "/brands", "/auth/google", "/auth/me", "/orders",
            "/orders/checkout-quote", "/orders/{order_id}",
            "/orders/{order_id}/cancel", "/orders/{order_id}/receipt"}
        assert client.post("/orders/1/payments/simulate", json={"outcome": "SUCCESS"}).status_code == 404
        assert client.get("/health").json()["capabilities"]["payments"] is False


def test_pending_order_replay_ownership_and_cancellation(world, monkeypatch):
    client, sessions, buyer_id, buyer, other, seller, product = world
    monkeypatch.setenv("PAYMENT_SIMULATION_ENABLED", "true")
    key = new_key()
    headers = {**buyer, "Idempotency-Key": key}
    assert client.get(f"/orders/checkout-quote?product_id={product}", headers=buyer).status_code == 200
    response = client.post("/orders", headers=headers, json=order_body(product))
    assert response.status_code == 201
    order = response.json()
    assert order["status"] == "WAITING_PAYMENT" and order["payment_status"] == "UNPAID"
    assert order["can_pay"] is False
    order_id = order["id"]
    assert client.post("/orders", headers=headers, json=order_body(product)).json()["id"] == order_id
    assert client.post("/orders", headers={**other, "Idempotency-Key": new_key()}, json=order_body(product)).status_code == 409
    assert client.get(f"/orders/{order_id}", headers=other).status_code == 404
    assert client.post(f"/orders/{order_id}/cancel", headers=other).status_code == 404
    assert client.get(f"/orders/{order_id}", headers=seller).status_code == 404
    assert client.post(f"/orders/{order_id}/cancel", headers=seller).status_code == 404
    assert client.get(f"/orders/{order_id}/receipt", headers=seller).status_code == 404
    assert client.get("/orders", headers=seller).json()["items"] == []
    assert client.get("/orders?role=seller", headers=seller).status_code == 403
    assert client.post(f"/orders/{order_id}/payments/simulate", headers=buyer, json={"outcome": "SUCCESS"}).status_code == 404
    assert client.get(f"/orders/{order_id}/receipt", headers=buyer).status_code == 404
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(Order).where(Order.buyer_id == buyer_id)) == 1
        assert db.get(Product, product).status == "RESERVED"
        for model in (PaymentAttempt, Payment, Escrow, Receipt):
            assert db.scalar(select(func.count()).select_from(model).where(model.order_id == order_id)) == 0
    cancel = client.post(f"/orders/{order_id}/cancel", headers=buyer)
    assert cancel.status_code == 200 and cancel.json()["status"] == "CANCELLED"
    with sessions() as db:
        assert db.get(Product, product).status == "AVAILABLE"


def test_registration_and_invalid_order_do_not_grant_seller(world):
    client, sessions, _, _, _, _, product = world
    headers = auth_header(uuid.uuid4())
    registered = client.post("/auth/google", headers=headers, json={"role": "SELLER"})
    assert registered.status_code == 200 and registered.json()["role"] == "BUYER"
    assert client.get("/auth/me", headers=headers).status_code == 200
    assert client.post("/orders", json=order_body(product)).status_code == 401
    assert client.post("/orders", headers={**headers, "Idempotency-Key": new_key()}, json=order_body(product, phone="bad")).status_code == 422
    with sessions() as db:
        assert db.get(Product, product).status == "AVAILABLE"


def test_active_seller_purchases_as_buyer_without_seller_order_access(world):
    client, sessions, _, _, other, owner, product = world
    with sessions() as db:
        seller_id, seller = create_user(db, UserRole.SELLER)
        own_product = create_product(db, seller_id)
    assert client.get(f"/orders/checkout-quote?product_id={own_product}", headers=seller).status_code == 409
    assert client.post("/orders", headers={**seller, "Idempotency-Key": new_key()}, json=order_body(own_product)).status_code == 409
    assert client.get(f"/orders/checkout-quote?product_id={product}", headers=seller).status_code == 200
    response = client.post("/orders", headers={**seller, "Idempotency-Key": new_key()}, json=order_body(product))
    assert response.status_code == 201
    order = response.json()
    assert order["viewer_role"] == "buyer"
    assert (order["status"], order["payment_status"], order["can_pay"]) == ("WAITING_PAYMENT", "UNPAID", False)
    order_id = order["id"]
    listing = client.get("/orders", headers=seller).json()
    assert listing["total"] == 1 and listing["items"][0]["viewer_role"] == "buyer"
    assert client.get("/orders?role=seller", headers=seller).status_code == 403
    assert client.get(f"/orders/{order_id}", headers=seller).json()["viewer_role"] == "buyer"
    for headers in (other, owner):
        assert client.get(f"/orders/{order_id}", headers=headers).status_code == 404
        assert client.post(f"/orders/{order_id}/cancel", headers=headers).status_code == 404
        assert client.get(f"/orders/{order_id}/receipt", headers=headers).status_code == 404
    assert client.get(f"/orders/{order_id}/receipt", headers=seller).status_code == 404
    assert client.post(f"/orders/{order_id}/cancel", headers=seller).json()["status"] == "CANCELLED"
    with sessions() as db:
        assert db.get(Product, product).status == "AVAILABLE"
        assert db.get(Product, own_product).status == "AVAILABLE"


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.COURIER, UserRole.INSPECTOR])
def test_staff_cannot_use_customer_order_surface(world, role):
    client, sessions, _, _, _, _, product = world
    with sessions() as db:
        _, headers = create_user(db, role)
    assert client.get("/orders", headers=headers).status_code == 403
    assert client.get(f"/orders/checkout-quote?product_id={product}", headers=headers).status_code == 403
    assert client.post("/orders", headers={**headers, "Idempotency-Key": new_key()}, json=order_body(product)).status_code == 403
    for path, method in (("/orders/1", "get"), ("/orders/1/cancel", "post"), ("/orders/1/receipt", "get")):
        assert getattr(client, method)(path, headers=headers).status_code == 403


@pytest.mark.parametrize("role", [UserRole.BUYER, UserRole.SELLER])
def test_inactive_customers_cannot_use_orders(world, role):
    client, sessions, _, _, _, _, product = world
    with sessions() as db:
        _, headers = create_user(db, role, status=UserStatus.SUSPENDED)
    assert client.get("/orders", headers=headers).status_code == 403
    assert client.get(f"/orders/checkout-quote?product_id={product}", headers=headers).status_code == 403
    assert client.post("/orders", headers={**headers, "Idempotency-Key": new_key()}, json=order_body(product)).status_code == 403
