"""ORDER-02 / ORDER-03 / ORDER-07: พฤติกรรม API บน SQLite ในหน่วยความจำ

กรณีแข่งกันจริง (row lock) และ constraint ระดับฐานข้อมูลอยู่ใน test_orders_postgres.py
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.api.admin_orders as admin_orders_module
import app.api.orders as orders_module
from app.database import Base, get_db
from app.main import app
from app.models.order import Escrow, Order, Payment, PaymentAttempt, Receipt
from app.models.product import Product
from app.models.user import UserRole, UserStatus
from app.schemas.order import PaymentStatus
from app.services.order_pricing import calculate_amounts, payment_deadline, utcnow
from tests.order_helpers import (
    VALID_ADDRESS,
    create_product,
    create_user,
    new_key,
    order_body,
    patch_auth,
)

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(engine, "connect")
def _enable_sqlite_fk(dbapi_connection, _record):
    dbapi_connection.execute("PRAGMA foreign_keys=ON")


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    patch_auth(monkeypatch)
    monkeypatch.setenv("PAYMENT_SIMULATION_ENABLED", "true")
    monkeypatch.delenv("APP_ENV", raising=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def world(db):
    """Buyer A/B, ผู้ขายเจ้าของสินค้า, ผู้ขายอื่น และสินค้าพร้อมขาย"""
    buyer_a, buyer_a_h = create_user(db, UserRole.BUYER, name="Buyer A")
    buyer_b, buyer_b_h = create_user(db, UserRole.BUYER, name="Buyer B")
    seller, seller_h = create_user(db, UserRole.SELLER, name="Seller Owner")
    other_seller, other_seller_h = create_user(db, UserRole.SELLER, name="Seller Other")
    product_id = create_product(db, seller)
    return {
        "buyer_a": buyer_a,
        "a": buyer_a_h,
        "buyer_b": buyer_b,
        "b": buyer_b_h,
        "seller": seller,
        "seller_h": seller_h,
        "other_seller_h": other_seller_h,
        "product_id": product_id,
    }


def post_order(headers, body, key=None):
    return client.post("/orders", json=body, headers={**headers, "Idempotency-Key": key or new_key()})


def pay(order_id, headers, outcome="SUCCESS", key=None):
    return client.post(
        f"/orders/{order_id}/payments/simulate",
        json={"outcome": outcome},
        headers={**headers, "Idempotency-Key": key or new_key()},
    )


def count(db, model, **filters):
    db.expire_all()
    query = select(func.count()).select_from(model)
    for column, value in filters.items():
        query = query.where(getattr(model, column) == value)
    return db.scalar(query)


def product_status(db, product_id):
    db.expire_all()
    return db.get(Product, product_id).status


def create_paid_order(world):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    response = pay(order["id"], world["a"])
    assert response.status_code == 200
    return order["id"]


def cancel(order_id, headers):
    return client.post(f"/orders/{order_id}/cancel", headers=headers)


def age_order(db, order_id, minutes_past=1):
    """ย้ายเส้นตายของ Order ไปในอดีต แทนการรอเวลาจริงใน test"""
    db.expire_all()
    order = db.get(Order, order_id)
    order.expires_at = utcnow() - timedelta(minutes=minutes_past)
    db.commit()


# ------------------------------------------------------------------ pricing


def test_amounts_use_decimal_and_round_half_up():
    amounts = calculate_amounts(Decimal("10.10"))
    assert amounts.commission_fee == Decimal("0.51")  # 0.505 ปัดขึ้น
    assert amounts.total_amount == Decimal("160.10")
    assert amounts.seller_payout == Decimal("9.59")

    amounts = calculate_amounts(Decimal("999.99"))
    assert amounts.commission_fee == Decimal("50.00")
    assert amounts.total_amount == Decimal("1149.99")


def test_amounts_reject_float():
    with pytest.raises(TypeError):
        calculate_amounts(999.99)


# ------------------------------------------------------------------ quote


def test_checkout_quote_is_calculated_by_server(world):
    response = client.get(f"/orders/checkout-quote?product_id={world['product_id']}", headers=world["a"])
    assert response.status_code == 200
    data = response.json()
    assert data["item_price"] == "1200.00"
    assert data["shipping_fee"] == "50.00"
    assert data["inspection_fee"] == "100.00"
    assert data["total_amount"] == "1350.00"
    assert data["currency"] == "THB"
    assert data["product"]["name"] == "เสื้อแจ็กเก็ตมือสอง"


def test_checkout_quote_requires_buyer(world):
    assert client.get(f"/orders/checkout-quote?product_id={world['product_id']}").status_code in (401, 403)
    response = client.get(
        f"/orders/checkout-quote?product_id={world['product_id']}", headers=world["seller_h"]
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "buyer_role_required"


# ------------------------------------------------------------------ create (ORDER-02)


def test_create_requires_login(world):
    response = client.post(
        "/orders", json=order_body(world["product_id"]), headers={"Idempotency-Key": new_key()}
    )
    assert response.status_code in (401, 403)
    response = client.post(
        "/orders",
        json=order_body(world["product_id"]),
        headers={"Authorization": "Bearer not-a-token", "Idempotency-Key": new_key()},
    )
    assert response.status_code == 401


def test_create_reserves_product_and_snapshots_amounts(world, db):
    response = post_order(world["a"], order_body(world["product_id"]))
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["status"] == "WAITING_PAYMENT"
    assert data["payment_status"] == "UNPAID"
    assert data["viewer_role"] == "buyer"
    assert data["can_pay"] is True
    assert data["amounts"] == {
        "currency": "THB",
        "item_price": "1200.00",
        "shipping_fee": "50.00",
        "inspection_fee": "100.00",
        "total_amount": "1350.00",
        "commission_fee": None,
        "seller_payout": None,
    }
    # เบอร์โทรถูก normalize แล้วเก็บเป็น snapshot
    assert data["shipping_address"]["phone"] == "0812345678"

    assert product_status(db, world["product_id"]) == "RESERVED"
    order = db.get(Order, data["id"])
    assert order.buyer_id == world["buyer_a"]
    assert order.seller_id == world["seller"]
    assert order.commission_fee == Decimal("60.00")
    assert order.seller_payout == Decimal("1140.00")


def test_create_ignores_nothing_from_client_and_rejects_money_or_identity_fields(world, db):
    for extra in ({"buyer_id": world["buyer_b"]}, {"seller_id": 1}, {"total_amount": "1.00"}):
        body = {**order_body(world["product_id"]), **extra}
        response = post_order(world["a"], body)
        assert response.status_code == 422, extra
    assert count(db, Order) == 0
    assert product_status(db, world["product_id"]) == "AVAILABLE"


def test_create_requires_valid_idempotency_key(world):
    response = client.post("/orders", json=order_body(world["product_id"]), headers=world["a"])
    assert response.status_code == 422
    assert "Idempotency-Key" in response.json()["detail"]["fields"]
    response = post_order(world["a"], order_body(world["product_id"]), key="short")
    assert response.status_code == 422


def test_create_validates_address_fields(world, db):
    response = post_order(
        world["a"],
        order_body(world["product_id"], recipient_name=" ", phone="12345", postal_code="1011"),
    )
    assert response.status_code == 422
    fields = response.json()["detail"]["fields"]
    assert set(fields) == {"recipient_name", "phone", "postal_code"}

    response = post_order(world["a"], {"product_id": world["product_id"]})
    assert response.status_code == 422
    assert set(response.json()["detail"]["fields"]) == set(VALID_ADDRESS)

    response = post_order(world["a"], {"shipping_address": VALID_ADDRESS})
    assert response.status_code == 422
    assert "product_id" in response.json()["detail"]["fields"]
    assert count(db, Order) == 0


@pytest.mark.parametrize(
    "role,status_",
    [
        (UserRole.SELLER, UserStatus.ACTIVE),
        (UserRole.ADMIN, UserStatus.ACTIVE),
        (UserRole.INSPECTOR, UserStatus.ACTIVE),
        (None, UserStatus.ACTIVE),
        (UserRole.BUYER, UserStatus.SUSPENDED),
    ],
)
def test_only_active_buyers_can_create(world, db, role, status_):
    _, headers = create_user(db, role, status_)
    response = post_order(headers, order_body(world["product_id"]))
    assert response.status_code == 403
    assert count(db, Order) == 0


def test_cannot_buy_own_product(world, db):
    own_product = create_product(db, world["buyer_a"], name="ของตัวเอง")
    response = post_order(world["a"], order_body(own_product))
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "self_purchase"
    assert product_status(db, own_product) == "AVAILABLE"


def test_only_fixed_price_products_can_be_ordered(world, db, monkeypatch):
    """สินค้าประมูลต้องถูกปฏิเสธก่อนคิดราคา (D-20)

    ตาราง products มี CHECK ที่ยอมให้มีแต่ `FIXED_PRICE` อยู่แล้ว จึงสร้างแถวประมูลมาทดสอบไม่ได้
    ที่นี่จึงสลับค่าที่ระบบยอมรับแทน เพื่อพิสูจน์ว่าด่านนี้ทำงานจริงถ้าวันหนึ่งมีค่าอื่นเข้ามา
    """
    monkeypatch.setattr(orders_module, "SALE_TYPE_FIXED_PRICE", "AUCTION")

    response = post_order(world["a"], order_body(world["product_id"]))
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "sale_type_unsupported"
    assert product_status(db, world["product_id"]) == "AVAILABLE"
    assert count(db, Order) == 0

    quote = client.get(f"/orders/checkout-quote?product_id={world['product_id']}", headers=world["a"])
    assert quote.status_code == 409
    assert quote.json()["detail"]["code"] == "sale_type_unsupported"


def test_missing_or_soft_deleted_product_is_not_found(world, db):
    deleted = create_product(db, world["seller"], deleted=True)
    for product_id in (deleted, 999999):
        response = post_order(world["a"], order_body(product_id))
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "product_not_found"


@pytest.mark.parametrize("status_", ["RESERVED", "SOLD", "CANCELLED"])
def test_unavailable_product_is_rejected(world, db, status_):
    product_id = create_product(db, world["seller"], status=status_)
    response = post_order(world["a"], order_body(product_id))
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "product_unavailable"


def test_second_buyer_loses_reserved_product(world, db):
    assert post_order(world["a"], order_body(world["product_id"])).status_code == 201
    response = post_order(world["b"], order_body(world["product_id"]))
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "product_unavailable"
    assert count(db, Order) == 1


def test_same_key_same_payload_replays_without_new_order(world, db):
    key = new_key()
    first = post_order(world["a"], order_body(world["product_id"]), key=key)
    second = post_order(world["a"], order_body(world["product_id"]), key=key)
    assert first.status_code == second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert second.headers.get("Idempotent-Replayed") == "true"
    assert count(db, Order) == 1


def test_same_key_different_payload_is_conflict(world, db):
    key = new_key()
    assert post_order(world["a"], order_body(world["product_id"]), key=key).status_code == 201
    response = post_order(world["a"], order_body(world["product_id"], province="เชียงใหม่"), key=key)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "idempotency_key_reused"
    assert count(db, Order) == 1


def test_idempotency_key_is_scoped_per_buyer(world, db):
    key = new_key()
    other_product = create_product(db, world["seller"], name="สินค้าอีกชิ้น")
    assert post_order(world["a"], order_body(world["product_id"]), key=key).status_code == 201
    response = post_order(world["b"], order_body(other_product), key=key)
    assert response.status_code == 201
    assert count(db, Order) == 2


def test_new_key_for_already_reserved_product_points_to_existing_order(world, db):
    first = post_order(world["a"], order_body(world["product_id"])).json()
    response = post_order(world["a"], order_body(world["product_id"]))
    assert response.status_code == 409
    assert response.json()["detail"] == {
        "code": "already_ordered",
        "message": "คุณสั่งซื้อสินค้านี้ไว้แล้ว",
        "order_id": first["id"],
    }
    assert count(db, Order) == 1


def test_create_rolls_back_reservation_when_order_insert_fails(world, db, monkeypatch):
    def broken(_price):
        raise RuntimeError("simulated failure after reservation")

    monkeypatch.setattr(orders_module, "calculate_amounts", broken)
    failing_client = TestClient(app, raise_server_exceptions=False)
    response = failing_client.post(
        "/orders",
        json=order_body(world["product_id"]),
        headers={**world["a"], "Idempotency-Key": new_key()},
    )
    assert response.status_code == 500
    assert product_status(db, world["product_id"]) == "AVAILABLE"
    assert count(db, Order) == 0


def test_create_rolls_back_reservation_on_database_constraint(world, db):
    # สร้างสภาพที่ unique index ของ orders ต้องกันไว้ (มี order ค้างแต่สินค้ายัง AVAILABLE)
    stale = Order(
        buyer_id=world["buyer_b"],
        seller_id=world["seller"],
        product_id=world["product_id"],
        status="WAITING_PAYMENT",
        product_name="x",
        product_condition="x",
        product_size="x",
        currency="THB",
        item_price=Decimal("1200.00"),
        shipping_fee=Decimal("50.00"),
        inspection_fee=Decimal("100.00"),
        commission_fee=Decimal("60.00"),
        total_amount=Decimal("1350.00"),
        seller_payout=Decimal("1140.00"),
        expires_at=payment_deadline(utcnow()),
        **{f"ship_{k}": v for k, v in {**VALID_ADDRESS, "phone": "0812345678"}.items()},
        idempotency_key="stale-order-key",
        request_hash="0" * 64,
    )
    db.add(stale)
    db.commit()

    response = post_order(world["a"], order_body(world["product_id"]))
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "product_unavailable"
    assert product_status(db, world["product_id"]) == "AVAILABLE"
    assert count(db, Order) == 1


# ------------------------------------------------------------------ pay (ORDER-03)


def test_success_payment_creates_one_payment_escrow_receipt(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    response = pay(order["id"], world["a"])
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["attempt"]["outcome"] == "SUCCEEDED"
    assert data["attempt"]["amount"] == "1350.00"
    assert data["order"]["status"] == "WAITING_SELLER_SHIP"
    assert data["order"]["payment_status"] == "PAID"
    assert data["order"]["can_pay"] is False
    assert data["order"]["receipt_no"] == f"RC-{order['id']:06d}"

    assert count(db, Payment, order_id=order["id"]) == 1
    assert count(db, Escrow, order_id=order["id"]) == 1
    assert count(db, Receipt, order_id=order["id"]) == 1
    db.expire_all()
    escrow = db.scalars(select(Escrow)).one()
    payment = db.scalars(select(Payment)).one()
    stored = db.get(Order, order["id"])
    assert escrow.status == "HELD"
    assert escrow.amount == payment.amount == stored.total_amount == Decimal("1350.00")
    assert stored.paid_at is not None


def test_failed_payment_keeps_reservation_and_creates_no_money(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    response = pay(order["id"], world["a"], outcome="FAILED")
    assert response.status_code == 200
    data = response.json()
    assert data["attempt"]["outcome"] == "FAILED"
    assert data["order"]["status"] == "WAITING_PAYMENT"
    assert data["order"]["can_pay"] is True
    assert data["order"]["last_payment_attempt"]["outcome"] == "FAILED"

    assert count(db, PaymentAttempt, order_id=order["id"]) == 1
    assert count(db, Payment) == 0
    assert count(db, Escrow) == 0
    assert count(db, Receipt) == 0
    assert product_status(db, world["product_id"]) == "RESERVED"


def test_failed_then_retry_with_new_key_succeeds(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    failed_key = new_key()
    assert pay(order["id"], world["a"], "FAILED", key=failed_key).json()["attempt"]["outcome"] == "FAILED"

    # key เดิมได้ผล FAILED เดิม ไม่ใช่การลองใหม่
    replay = pay(order["id"], world["a"], "FAILED", key=failed_key)
    assert replay.json()["attempt"]["outcome"] == "FAILED"
    assert replay.headers.get("Idempotent-Replayed") == "true"
    assert count(db, PaymentAttempt) == 1

    success = pay(order["id"], world["a"], "SUCCESS")
    assert success.status_code == 200
    assert success.json()["order"]["status"] == "WAITING_SELLER_SHIP"
    assert count(db, PaymentAttempt) == 2
    assert count(db, Payment) == 1
    assert count(db, Escrow) == 1


def test_same_key_different_outcome_is_conflict(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    key = new_key()
    pay(order["id"], world["a"], "FAILED", key=key)
    response = pay(order["id"], world["a"], "SUCCESS", key=key)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "idempotency_key_reused"
    assert count(db, Payment) == 0


def test_retry_after_timeout_with_same_key_returns_same_success(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    key = new_key()
    first = pay(order["id"], world["a"], key=key)
    # Client ไม่ได้รับคำตอบแรก (timeout) แล้วส่งซ้ำด้วย key เดิม
    second = pay(order["id"], world["a"], key=key)
    assert second.status_code == 200
    assert second.json()["attempt"]["id"] == first.json()["attempt"]["id"]
    assert second.headers.get("Idempotent-Replayed") == "true"
    assert count(db, PaymentAttempt) == 1
    assert count(db, Payment) == 1
    assert count(db, Escrow) == 1
    assert count(db, Receipt) == 1


@pytest.mark.parametrize("outcome", ["SUCCESS", "FAILED"])
def test_new_key_after_paid_is_rejected_without_new_records(world, db, outcome):
    order_id = create_paid_order(world)
    response = pay(order_id, world["a"], outcome)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "order_already_paid"
    assert count(db, PaymentAttempt) == 1
    assert count(db, Payment) == 1
    db.expire_all()
    assert db.get(Order, order_id).status == "WAITING_SELLER_SHIP"


def test_only_order_buyer_can_pay(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    seller_attempt = pay(order["id"], world["seller_h"])
    assert seller_attempt.status_code == 403
    assert seller_attempt.json()["detail"]["code"] == "not_order_buyer"
    for stranger in (world["b"], world["other_seller_h"]):
        assert pay(order["id"], stranger).status_code == 404
    assert pay(999999, world["a"]).status_code == 404
    response = client.post(
        f"/orders/{order['id']}/payments/simulate",
        json={"outcome": "SUCCESS"},
        headers={"Idempotency-Key": new_key()},
    )
    assert response.status_code in (401, 403)
    assert count(db, PaymentAttempt) == 0


def test_suspended_buyer_cannot_pay(world, db):
    from app.models.user import User

    order = post_order(world["a"], order_body(world["product_id"])).json()
    user = db.get(User, world["buyer_a"])
    user.status = UserStatus.SUSPENDED
    db.commit()
    response = pay(order["id"], world["a"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "account_inactive"
    detail = client.get(f"/orders/{order['id']}", headers=world["a"]).json()
    assert detail["can_pay"] is False


def test_payment_request_validation(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    url = f"/orders/{order['id']}/payments/simulate"
    assert client.post(url, json={"outcome": "SUCCESS"}, headers=world["a"]).status_code == 422
    for body in ({"outcome": "MAYBE"}, {}, {"outcome": "SUCCESS", "amount": "1.00"}):
        response = client.post(url, json=body, headers={**world["a"], "Idempotency-Key": new_key()})
        assert response.status_code == 422, body
    assert count(db, PaymentAttempt) == 0


@pytest.mark.parametrize(
    "env",
    [
        {"PAYMENT_SIMULATION_ENABLED": ""},
        {"PAYMENT_SIMULATION_ENABLED": "false"},
        {"PAYMENT_SIMULATION_ENABLED": "true", "APP_ENV": "production"},
    ],
)
def test_simulation_endpoint_is_closed_outside_demo(world, db, monkeypatch, env):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    response = pay(order["id"], world["a"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "payment_simulation_disabled"
    assert count(db, PaymentAttempt) == 0


def test_payment_rolls_back_everything_when_a_step_fails(world, db, monkeypatch):
    order = post_order(world["a"], order_body(world["product_id"])).json()

    def broken(_order_id):
        raise RuntimeError("receipt numbering failed")

    monkeypatch.setattr(orders_module, "receipt_number", broken)
    failing_client = TestClient(app, raise_server_exceptions=False)
    response = failing_client.post(
        f"/orders/{order['id']}/payments/simulate",
        json={"outcome": "SUCCESS"},
        headers={**world["a"], "Idempotency-Key": new_key()},
    )
    assert response.status_code == 500
    assert count(db, PaymentAttempt) == 0
    assert count(db, Payment) == 0
    assert count(db, Escrow) == 0
    assert count(db, Receipt) == 0
    db.expire_all()
    assert db.get(Order, order["id"]).status == "WAITING_PAYMENT"


# ------------------------------------------------------------------ read (ORDER-07)


@pytest.mark.parametrize("status", [
    "SHIPPING_TO_CENTER", "RECEIVED_AT_CENTER", "INSPECTING", "RESULT_NOTIFIED",
])
def test_list_and_detail_read_inspect_statuses(world, db, status):
    order_id = create_paid_order(world)
    db.get(Order, order_id).status = status
    db.commit()

    for headers, role in ((world["a"], "buyer"), (world["seller_h"], "seller")):
        detail = client.get(f"/orders/{order_id}", headers=headers)
        assert detail.status_code == 200, detail.text
        assert detail.json()["status"] == status
        assert detail.json()["viewer_role"] == role

        listing = client.get("/orders", headers=headers)
        assert listing.status_code == 200, listing.text
        assert any(item["id"] == order_id and item["status"] == status for item in listing.json()["items"])


def test_detail_permissions_and_views(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()

    seller_view = client.get(f"/orders/{order['id']}", headers=world["seller_h"])
    assert seller_view.status_code == 200
    data = seller_view.json()
    assert data["viewer_role"] == "seller"
    assert data["shipping_address"] is None  # ยังไม่จ่าย ผู้ขายยังไม่ต้องเห็นที่อยู่
    assert data["amounts"]["total_amount"] is None
    assert data["amounts"]["seller_payout"] == "1140.00"
    assert data["amounts"]["commission_fee"] == "60.00"
    assert data["can_pay"] is False
    assert data["last_payment_attempt"] is None

    for stranger in (world["b"], world["other_seller_h"]):
        response = client.get(f"/orders/{order['id']}", headers=stranger)
        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "order_not_found"
    _, admin_h = create_user(db, UserRole.ADMIN)
    assert client.get(f"/orders/{order['id']}", headers=admin_h).status_code == 404
    assert client.get("/orders/999999", headers=world["a"]).status_code == 404
    assert client.get(f"/orders/{order['id']}").status_code in (401, 403)

    pay(order["id"], world["a"])
    paid_view = client.get(f"/orders/{order['id']}", headers=world["seller_h"]).json()
    assert paid_view["status"] == "WAITING_SELLER_SHIP"
    assert paid_view["shipping_address"]["postal_code"] == "10110"
    assert paid_view["receipt_no"] is None
    assert "email" not in str(paid_view)


def test_list_returns_only_callers_orders_with_stable_pagination(world, db):
    ids = []
    for index in range(3):
        product_id = create_product(db, world["seller"], name=f"สินค้า {index}")
        ids.append(post_order(world["a"], order_body(product_id)).json()["id"])
    other = create_product(db, world["seller"], name="ของ Buyer B")
    post_order(world["b"], order_body(other))

    first = client.get("/orders?limit=2&offset=0", headers=world["a"]).json()
    second = client.get("/orders?limit=2&offset=2", headers=world["a"]).json()
    assert first["total"] == second["total"] == 3
    listed = [item["id"] for item in first["items"] + second["items"]]
    assert listed == sorted(ids, reverse=True)
    assert all(item["viewer_role"] == "buyer" for item in first["items"])
    # หน้ารายการไม่มีที่อยู่
    assert all("shipping_address" not in item for item in first["items"])
    assert first["items"][0]["total_amount"] == "1350.00"
    assert first["items"][0]["seller_payout"] is None

    seller_list = client.get("/orders", headers=world["seller_h"]).json()
    assert seller_list["total"] == 4
    assert all(item["viewer_role"] == "seller" for item in seller_list["items"])
    assert all(item["total_amount"] is None for item in seller_list["items"])


def test_list_role_filter_cannot_reach_other_users_orders(world, db):
    post_order(world["a"], order_body(world["product_id"]))
    # สลับ role/filter แล้วต้องไม่ได้รายการของคนอื่น
    assert client.get("/orders?role=seller", headers=world["a"]).json()["total"] == 0
    assert client.get("/orders?role=buyer", headers=world["seller_h"]).json()["total"] == 0
    assert client.get("/orders", headers=world["b"]).json()["total"] == 0
    assert client.get("/orders", headers=world["other_seller_h"]).json()["total"] == 0
    _, admin_h = create_user(db, UserRole.ADMIN)
    assert client.get("/orders", headers=admin_h).json() == {"items": [], "total": 0, "limit": 20, "offset": 0}
    # query ที่พยายามส่ง buyer_id มาถูกละเลย ไม่มีผลต่อสิทธิ์
    response = client.get(f"/orders?buyer_id={world['buyer_a']}", headers=world["b"])
    assert response.json()["total"] == 0
    assert client.get("/orders?role=admin", headers=world["a"]).status_code == 422
    assert client.get("/orders?limit=0", headers=world["a"]).status_code == 422
    assert client.get("/orders?limit=101", headers=world["a"]).status_code == 422
    assert client.get("/orders").status_code in (401, 403)


def test_empty_list(world):
    assert client.get("/orders", headers=world["a"]).json() == {
        "items": [],
        "total": 0,
        "limit": 20,
        "offset": 0,
    }


def test_order_snapshot_does_not_follow_product_edits(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    product = db.get(Product, world["product_id"])
    product.price = Decimal("9999.00")
    product.product_name = "ชื่อใหม่"
    product.condition = "FAIR"
    db.commit()

    detail = client.get(f"/orders/{order['id']}", headers=world["a"]).json()
    assert detail["product"]["name"] == "เสื้อแจ็กเก็ตมือสอง"
    assert detail["product"]["condition"] == "GOOD"
    assert detail["amounts"]["item_price"] == "1200.00"
    assert detail["amounts"]["total_amount"] == "1350.00"

    paid = pay(order["id"], world["a"]).json()
    assert paid["attempt"]["amount"] == "1350.00"


# ------------------------------------------------------------------ receipt


def test_receipt_access(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    before = client.get(f"/orders/{order['id']}/receipt", headers=world["a"])
    assert before.status_code == 404
    assert before.json()["detail"]["code"] == "receipt_not_found"

    pay(order["id"], world["a"])
    response = client.get(f"/orders/{order['id']}/receipt", headers=world["a"])
    assert response.status_code == 200
    receipt = response.json()
    assert receipt == {
        "receipt_no": f"RC-{order['id']:06d}",
        "order_id": order["id"],
        "issued_at": receipt["issued_at"],
        "payment_method": "SIMULATED",
        "currency": "THB",
        "product_name": "เสื้อแจ็กเก็ตมือสอง",
        "item_price": "1200.00",
        "shipping_fee": "50.00",
        "inspection_fee": "100.00",
        "total_amount": "1350.00",
    }

    seller = client.get(f"/orders/{order['id']}/receipt", headers=world["seller_h"])
    assert seller.status_code == 403
    for stranger in (world["b"], world["other_seller_h"]):
        assert client.get(f"/orders/{order['id']}/receipt", headers=stranger).status_code == 404
    assert client.get(f"/orders/{order['id']}/receipt").status_code in (401, 403)


# ------------------------------------------------------------------ ยกเลิก Order (ORDER-08)


def test_buyer_cancel_releases_product_and_records_reason(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    assert order["can_cancel"] is True
    assert product_status(db, world["product_id"]) == "RESERVED"

    response = cancel(order["id"], world["a"])
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "CANCELLED"
    assert data["cancel_reason"] == "BUYER"
    assert data["cancelled_at"] is not None
    assert data["can_pay"] is False
    assert data["can_cancel"] is False
    assert data["payment_status"] == "UNPAID"
    # สินค้ากลับไปขายได้ และไม่มีเงินเกิดขึ้นเลย
    assert product_status(db, world["product_id"]) == "AVAILABLE"
    assert count(db, PaymentAttempt) == 0
    assert count(db, Payment) == 0
    assert count(db, Escrow) == 0
    assert count(db, Receipt) == 0


def test_cancel_twice_returns_same_result(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    first = cancel(order["id"], world["a"])
    second = cancel(order["id"], world["a"])
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["cancelled_at"] == second.json()["cancelled_at"]
    assert count(db, Order) == 1


def test_other_buyer_can_buy_after_cancel(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    assert cancel(order["id"], world["a"]).status_code == 200

    response = post_order(world["b"], order_body(world["product_id"]))
    assert response.status_code == 201
    assert product_status(db, world["product_id"]) == "RESERVED"
    assert count(db, Order) == 2


def test_same_buyer_can_order_again_after_cancel(world):
    first = post_order(world["a"], order_body(world["product_id"])).json()
    assert cancel(first["id"], world["a"]).status_code == 200

    # Order ที่ยกเลิกแล้วต้องไม่ทำให้ได้ already_ordered อีก
    response = post_order(world["a"], order_body(world["product_id"]))
    assert response.status_code == 201
    assert response.json()["id"] != first["id"]


def test_cannot_cancel_after_payment(world, db):
    order_id = create_paid_order(world)
    response = cancel(order_id, world["a"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "order_already_paid"

    db.expire_all()
    assert db.get(Order, order_id).status == "WAITING_SELLER_SHIP"
    assert product_status(db, world["product_id"]) == "RESERVED"


def test_cancelled_order_cannot_be_paid(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    assert cancel(order["id"], world["a"]).status_code == 200

    response = pay(order["id"], world["a"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "order_cancelled"
    assert count(db, PaymentAttempt) == 0


def test_only_buyer_of_order_can_cancel(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()

    seller_response = cancel(order["id"], world["seller_h"])
    assert seller_response.status_code == 403
    assert seller_response.json()["detail"]["code"] == "not_order_buyer"
    # คนนอกต้องไม่รู้ด้วยซ้ำว่ามี Order นี้อยู่
    assert cancel(order["id"], world["b"]).status_code == 404

    db.expire_all()
    assert db.get(Order, order["id"]).status == "WAITING_PAYMENT"


def test_suspended_buyer_cannot_cancel(world, db):
    from app.models.user import User

    order = post_order(world["a"], order_body(world["product_id"])).json()
    buyer = db.get(User, world["buyer_a"])
    buyer.status = UserStatus.SUSPENDED
    db.commit()

    response = cancel(order["id"], world["a"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "account_inactive"


# ------------------------------------------------------------------ หมดเวลาจ่ายเงิน (ORDER-08)


def test_detail_exposes_payment_deadline(world):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    assert order["expires_at"] is not None
    assert order["cancel_reason"] is None
    assert order["cancelled_at"] is None
    assert order["can_pay"] is True


def test_expired_order_is_rejected_at_payment(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    age_order(db, order["id"])

    response = pay(order["id"], world["a"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "order_expired"

    db.expire_all()
    row = db.get(Order, order["id"])
    assert row.status == "CANCELLED"
    assert row.cancel_reason == "EXPIRED"
    # ไม่มีการบันทึกความพยายามจ่ายเงิน และสินค้ากลับไปขายต่อได้
    assert count(db, PaymentAttempt) == 0
    assert product_status(db, world["product_id"]) == "AVAILABLE"


def test_expired_order_is_swept_when_detail_is_read(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    age_order(db, order["id"])

    response = client.get(f"/orders/{order['id']}", headers=world["a"])
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "CANCELLED"
    assert data["cancel_reason"] == "EXPIRED"
    assert data["can_pay"] is False
    assert data["can_cancel"] is False
    assert product_status(db, world["product_id"]) == "AVAILABLE"


def test_expired_order_is_swept_in_list(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    age_order(db, order["id"])

    response = client.get("/orders", headers=world["a"])
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["status"] == "CANCELLED"
    assert item["cancel_reason"] == "EXPIRED"
    assert item["expires_at"] is not None
    assert product_status(db, world["product_id"]) == "AVAILABLE"


def test_expired_hold_does_not_block_other_buyer(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    age_order(db, order["id"])

    # ผู้ซื้อรายอื่นเข้ามาโดยที่ยังไม่มีใครเปิดดู Order เดิมเลย
    quote = client.get(f"/orders/checkout-quote?product_id={world['product_id']}", headers=world["b"])
    assert quote.status_code == 200

    response = post_order(world["b"], order_body(world["product_id"]))
    assert response.status_code == 201

    db.expire_all()
    assert db.get(Order, order["id"]).status == "CANCELLED"
    assert product_status(db, world["product_id"]) == "RESERVED"


def test_paid_order_is_never_expired(world, db):
    order_id = create_paid_order(world)
    age_order(db, order_id)

    response = client.get(f"/orders/{order_id}", headers=world["a"])
    assert response.status_code == 200
    assert response.json()["status"] == "WAITING_SELLER_SHIP"
    assert product_status(db, world["product_id"]) == "RESERVED"


def test_cancel_after_deadline_records_expired_reason(world, db):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    age_order(db, order["id"])

    response = cancel(order["id"], world["a"])
    assert response.status_code == 200
    assert response.json()["cancel_reason"] == "EXPIRED"


# ------------------------------------------------------- สถานะที่จะเพิ่มในรอบถัดไป (ORDER-00)


def future_order(**overrides):
    """Order ในหน่วยความจำที่มีสถานะของรอบถัดไป ไม่บันทึกลงฐานข้อมูลเพราะ CHECK ยังไม่รับค่านี้"""
    fields = {
        "status": "SHIPPING_TO_INSPECTION",
        "paid_at": utcnow(),
        "expires_at": utcnow() - timedelta(minutes=5),
        "cancel_reason": None,
        "cancelled_at": None,
    }
    fields.update(overrides)
    return Order(**fields)


def test_paid_is_decided_by_paid_at_not_by_the_status_name():
    """สถานะหลังการจัดส่งต้องยังนับว่าจ่ายแล้ว ไม่งั้นใบเสร็จหายและผู้ขายจะไม่เห็นที่อยู่"""
    moved_on = future_order()
    assert orders_module.is_paid(moved_on) is True
    assert admin_orders_module.payment_status_of(moved_on) == PaymentStatus.PAID

    waiting = Order(status="WAITING_PAYMENT", paid_at=None, expires_at=utcnow())
    assert orders_module.is_paid(waiting) is False
    assert admin_orders_module.payment_status_of(waiting) == PaymentStatus.UNPAID


def test_actions_are_closed_for_statuses_that_are_not_in_the_allowed_set():
    """เงื่อนไขต้องเป็น "สถานะอยู่ในชุดที่ทำได้ไหม" ไม่ใช่ "ยังไม่จ่ายและยังไม่ยกเลิกไหม" """
    moved_on = future_order()
    assert orders_module.is_payable(moved_on) is False
    assert orders_module.is_cancellable(moved_on) is False
    # เลยเส้นตายไปแล้วก็ต้องไม่ถูกกวาด เพราะไม่ได้อยู่ในสถานะรอชำระเงินแล้ว
    assert orders_module.payment_window_passed(moved_on, utcnow()) is False


def test_payment_is_refused_when_the_status_is_not_payable(world, db, monkeypatch):
    """จำลองสถานะของรอบถัดไปด้วยการเปลี่ยนชุดสถานะที่จ่ายได้ ไม่มีทางหลุดไปสร้าง attempt"""
    order = post_order(world["a"], order_body(world["product_id"])).json()
    monkeypatch.setattr(orders_module, "PAYABLE_ORDER_STATUSES", frozenset())

    response = pay(order["id"], world["a"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "order_not_payable"
    assert count(db, PaymentAttempt) == 0
    assert count(db, Payment) == 0
    db.expire_all()
    assert db.get(Order, order["id"]).status == "WAITING_PAYMENT"


def test_cancel_is_refused_when_the_status_is_not_cancellable(world, db, monkeypatch):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    monkeypatch.setattr(orders_module, "CANCELLABLE_ORDER_STATUSES", frozenset())

    response = cancel(order["id"], world["a"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "order_not_cancellable"
    db.expire_all()
    row = db.get(Order, order["id"])
    assert (row.status, row.cancelled_at) == ("WAITING_PAYMENT", None)
    assert product_status(db, world["product_id"]) == "RESERVED"


def test_buttons_close_when_the_status_leaves_the_payable_set(world, monkeypatch):
    order = post_order(world["a"], order_body(world["product_id"])).json()
    assert (order["can_pay"], order["can_cancel"]) == (True, True)

    monkeypatch.setattr(orders_module, "PAYABLE_ORDER_STATUSES", frozenset())
    detail = client.get(f"/orders/{order['id']}", headers=world["a"]).json()
    # ยังอยู่ในชุดที่ยกเลิกได้ ปุ่มยกเลิกต้องไม่ปิดตามปุ่มจ่าย
    assert (detail["can_pay"], detail["can_cancel"]) == (False, True)


def test_cancel_button_follows_the_cancellable_set_not_the_payable_set(world, db, monkeypatch):
    """สถานะที่จ่ายได้แต่ยกเลิกไม่ได้ หน้าจอต้องไม่เปิดปุ่มยกเลิกที่กดแล้วได้ 409"""
    order = post_order(world["a"], order_body(world["product_id"])).json()
    monkeypatch.setattr(orders_module, "CANCELLABLE_ORDER_STATUSES", frozenset())
    assert "WAITING_PAYMENT" in orders_module.PAYABLE_ORDER_STATUSES

    detail = client.get(f"/orders/{order['id']}", headers=world["a"])
    assert detail.status_code == 200
    assert (detail.json()["can_pay"], detail.json()["can_cancel"]) == (True, False)

    response = cancel(order["id"], world["a"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "order_not_cancellable"
    db.expire_all()
    row = db.get(Order, order["id"])
    assert (row.status, row.cancelled_at, row.cancel_reason) == ("WAITING_PAYMENT", None, None)
    assert product_status(db, world["product_id"]) == "RESERVED"


def test_reserved_statuses_are_documented_and_fit_the_column():
    """ชื่อสถานะของรอบถัดไปต้องยาวไม่เกินคอลัมน์ และต้องไม่ทับค่าที่ใช้อยู่แล้ว"""
    from app.models.order import ORDER_STATUSES
    from app.services.order_pricing import ORDER_STATUSES_RESERVED

    assert set(ORDER_STATUSES_RESERVED).isdisjoint(ORDER_STATUSES)
    assert max(len(value) for value in ORDER_STATUSES_RESERVED) <= 32


def test_replaying_a_failed_attempt_after_the_deadline_applies_the_expiry(world, db):
    """ส่งซ้ำด้วย key เดิมหลังหมดเวลา ต้องไม่ตอบว่ายังรอชำระเงินและต้องปล่อยสินค้าคืน

    เดิม replay ตอบกลับก่อนที่จะตรวจเส้นตาย ผู้ซื้อจึงเห็น WAITING_PAYMENT ต่อไป
    และสินค้าค้างถูกจองจนกว่าจะมีคำขออื่นมากวาด (พบจากการรีวิว PR #92)
    """
    order = post_order(world["a"], order_body(world["product_id"])).json()
    key = new_key()
    first = pay(order["id"], world["a"], outcome="FAILED", key=key)
    assert first.status_code == 200
    assert first.json()["order"]["status"] == "WAITING_PAYMENT"

    age_order(db, order["id"])
    replay = pay(order["id"], world["a"], outcome="FAILED", key=key)

    assert replay.status_code == 200
    assert replay.headers.get("Idempotent-Replayed") == "true"
    # attempt เดิมต้องเป็นตัวเดิมจริง ๆ และต้องไม่มี attempt ใหม่เกิดขึ้น
    assert replay.json()["attempt"]["id"] == first.json()["attempt"]["id"]
    assert count(db, PaymentAttempt, order_id=order["id"]) == 1
    # แต่สถานะ Order ที่แนบกลับต้องเป็นของจริงหลังหมดเวลา
    assert replay.json()["order"]["status"] == "CANCELLED"
    assert replay.json()["order"]["cancel_reason"] == "EXPIRED"
    assert replay.json()["order"]["can_pay"] is False

    db.expire_all()
    row = db.get(Order, order["id"])
    assert (row.status, row.cancel_reason) == ("CANCELLED", "EXPIRED")
    assert product_status(db, world["product_id"]) == "AVAILABLE"
    assert count(db, Payment, order_id=order["id"]) == 0


def test_replaying_a_paid_attempt_is_untouched_by_a_deadline_in_the_past(world, db):
    """Order ที่จ่ายแล้วต้องไม่ถูกกวาด แม้เส้นตายจะอยู่ในอดีต"""
    order = post_order(world["a"], order_body(world["product_id"])).json()
    key = new_key()
    paid = pay(order["id"], world["a"], key=key)
    assert paid.json()["order"]["status"] == "WAITING_SELLER_SHIP"

    db.expire_all()
    row = db.get(Order, order["id"])
    row.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()

    replay = pay(order["id"], world["a"], key=key)
    assert replay.status_code == 200
    assert replay.json()["order"]["status"] == "WAITING_SELLER_SHIP"
    assert replay.json()["order"]["payment_status"] == "PAID"
    assert product_status(db, world["product_id"]) == "RESERVED"


def test_a_new_key_after_the_deadline_still_reports_order_expired(world, db):
    """code เดิมต้องไม่เปลี่ยนไปเป็น order_cancelled หลังจัดลำดับการตรวจใหม่"""
    order = post_order(world["a"], order_body(world["product_id"])).json()
    age_order(db, order["id"])

    response = pay(order["id"], world["a"])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "order_expired"
    assert count(db, PaymentAttempt, order_id=order["id"]) == 0
