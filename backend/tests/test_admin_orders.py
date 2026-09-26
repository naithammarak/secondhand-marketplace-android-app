"""ORDER-09: มุมมอง Order ของผู้ดูแลระบบ บน SQLite ในหน่วยความจำ

สิ่งที่ชุดนี้ต้องพิสูจน์
- ค่าตั้งต้นของทุก Response ปิดบังอีเมลและที่อยู่ ไม่มีทางหลุดข้อมูลเต็มโดยไม่ตั้งใจ
- การเปิดดูข้อมูลเต็มต้องมีเหตุผลและถูกบันทึกลง Audit Log ก่อนเสมอ
- คนที่ไม่ใช่ผู้ดูแลเข้าไม่ได้ และผู้ขายยังไม่เห็นที่อยู่ตามกติกาเดิม
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.audit import AdminAccessLog
from app.models.order import Order
from app.models.product import Product
from app.models.user import User, UserRole, UserStatus
from app.services.order_pricing import utcnow
from app.services.pii_masking import mask_email, mask_phone
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

REASON = "ตรวจสอบข้อพิพาทการจัดส่งตามคำร้องของผู้ซื้อ"


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    patch_auth(monkeypatch)
    monkeypatch.setenv("PAYMENT_SIMULATION_ENABLED", "true")
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ADMIN_ORDER_CONTACT_REVEAL_ENABLED", raising=False)
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
    """ผู้ซื้อ ผู้ขาย ผู้ดูแล ผู้ตรวจสอบ และ Order หนึ่งรายการที่ยังไม่จ่ายเงิน"""
    buyer_id, buyer_h = create_user(db, UserRole.BUYER, name="Buyer A")
    seller_id, seller_h = create_user(db, UserRole.SELLER, name="Seller Owner")
    admin_id, admin_h = create_user(db, UserRole.ADMIN, name="Admin One")
    inspector_id, inspector_h = create_user(db, UserRole.INSPECTOR, name="Inspector One")
    product_id = create_product(db, seller_id)
    order = client.post(
        "/orders",
        json=order_body(product_id),
        headers={**buyer_h, "Idempotency-Key": new_key()},
    ).json()
    return {
        "buyer_id": buyer_id,
        "buyer": buyer_h,
        "seller_id": seller_id,
        "seller": seller_h,
        "admin_id": admin_id,
        "admin": admin_h,
        "inspector": inspector_h,
        "product_id": product_id,
        "order_id": order["id"],
    }


def reveal(order_id, headers, reason=REASON):
    body = {} if reason is None else {"reason": reason}
    return client.post(f"/admin/orders/{order_id}/contact", json=body, headers=headers)


def audit_rows(db):
    db.expire_all()
    return db.scalars(select(AdminAccessLog).order_by(AdminAccessLog.id)).all()


def buyer_email(db, world):
    db.expire_all()
    return db.get(User, world["buyer_id"]).email


# ------------------------------------------------------------------ การปิดบัง


def test_mask_email_keeps_only_the_first_character():
    assert mask_email("somebody@gmail.com") == "s***@gmail.com"
    assert mask_email("A@b.co") == "A***@b.co"


@pytest.mark.parametrize("value", [None, "", "   ", "no-at-sign", "@gmail.com", "user@"])
def test_mask_email_never_returns_raw_value(value):
    assert mask_email(value) == "***"


def test_mask_phone_keeps_last_four_digits_only():
    assert mask_phone("081-234-5678") == "***5678"
    assert mask_phone("0812345678") == "***5678"
    assert mask_phone("12") == "***"
    assert mask_phone(None) == "***"


# ------------------------------------------------------------------ รายการและรายละเอียด


def test_admin_list_masks_email_and_has_no_address(world, db):
    response = client.get("/admin/orders", headers=world["admin"])
    assert response.status_code == 200
    page = response.json()
    assert page["total"] == 1

    item = page["items"][0]
    assert item["id"] == world["order_id"]
    assert item["buyer"]["email_masked"] == mask_email(buyer_email(db, world))
    assert item["buyer"]["email_masked"].count("*") == 3
    assert item["seller"]["email_masked"].endswith("@example.test")
    assert item["total_amount"] == "1350.00"
    assert item["expires_at"] is not None

    # ที่อยู่ต้องไม่โผล่ในระดับรายการเลย ไม่ว่าจะเต็มหรือปิดบัง
    body = response.text
    assert "shipping" not in body
    assert VALID_ADDRESS["address_line"] not in body
    assert buyer_email(db, world) not in body


def test_admin_detail_masks_address_and_email(world, db):
    response = client.get(f"/admin/orders/{world['order_id']}", headers=world["admin"])
    assert response.status_code == 200
    detail = response.json()

    assert detail["shipping_address_masked"] == {
        "province": VALID_ADDRESS["province"],
        "postal_code": VALID_ADDRESS["postal_code"],
        "phone_masked": "***5678",
    }
    assert detail["buyer"]["email_masked"] == mask_email(buyer_email(db, world))
    assert detail["amounts"]["total_amount"] == "1350.00"
    assert detail["amounts"]["seller_payout"] == "1140.00"
    assert detail["contact_reveal_available"] is True
    assert detail["receipt_no"] is None

    body = response.text
    assert VALID_ADDRESS["address_line"] not in body
    assert VALID_ADDRESS["recipient_name"] not in body
    assert VALID_ADDRESS["district"] not in body
    assert buyer_email(db, world) not in body
    assert "0812345678" not in body


def test_admin_detail_returns_404_for_unknown_order(world):
    response = client.get("/admin/orders/9999", headers=world["admin"])
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "order_not_found"


def test_admin_list_filters_by_status_and_pages(world, db):
    seller_id, _ = create_user(db, UserRole.SELLER, name="Seller Two")
    buyer_id, buyer_h = create_user(db, UserRole.BUYER, name="Buyer B")
    second_product = create_product(db, seller_id)
    second = client.post(
        "/orders",
        json=order_body(second_product),
        headers={**buyer_h, "Idempotency-Key": new_key()},
    ).json()
    client.post(
        f"/orders/{second['id']}/payments/simulate",
        json={"outcome": "SUCCESS"},
        headers={**buyer_h, "Idempotency-Key": new_key()},
    )

    waiting = client.get("/admin/orders?status=WAITING_PAYMENT", headers=world["admin"]).json()
    assert [item["id"] for item in waiting["items"]] == [world["order_id"]]
    assert waiting["total"] == 1

    paid = client.get("/admin/orders?status=WAITING_SELLER_SHIP", headers=world["admin"]).json()
    assert [item["id"] for item in paid["items"]] == [second["id"]]
    assert paid["items"][0]["payment_status"] == "PAID"

    page = client.get("/admin/orders?limit=1&offset=1", headers=world["admin"]).json()
    assert page["total"] == 2
    assert len(page["items"]) == 1


def test_admin_list_cancels_orders_past_the_deadline(world, db):
    db.expire_all()
    order = db.get(Order, world["order_id"])
    order.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()

    page = client.get("/admin/orders", headers=world["admin"]).json()
    assert page["items"][0]["status"] == "CANCELLED"
    assert page["items"][0]["cancel_reason"] == "EXPIRED"

    db.expire_all()
    assert db.get(Product, world["product_id"]).status == "AVAILABLE"


# ------------------------------------------------------------------ การเปิดดูข้อมูลเต็ม


def test_reveal_returns_full_contact_and_writes_audit_log(world, db):
    response = reveal(world["order_id"], world["admin"])
    assert response.status_code == 200
    payload = response.json()

    assert payload["buyer_email"] == buyer_email(db, world)
    assert payload["shipping_address"]["address_line"] == VALID_ADDRESS["address_line"]
    assert payload["shipping_address"]["recipient_name"] == VALID_ADDRESS["recipient_name"]
    assert payload["shipping_address"]["phone"] == "0812345678"
    assert payload["reason"] == REASON

    rows = audit_rows(db)
    assert len(rows) == 1
    assert rows[0].id == payload["audit_log_id"]
    assert rows[0].admin_id == world["admin_id"]
    assert rows[0].action == "ORDER_CONTACT_REVEAL"
    assert rows[0].target_type == "ORDER"
    assert rows[0].target_id == world["order_id"]
    assert rows[0].reason == REASON
    assert rows[0].created_at is not None


def test_each_reveal_adds_one_more_audit_row(world, db):
    assert reveal(world["order_id"], world["admin"]).status_code == 200
    assert reveal(world["order_id"], world["admin"], "ตรวจซ้ำตามคำขอของหัวหน้างาน").status_code == 200

    rows = audit_rows(db)
    assert len(rows) == 2
    assert [row.reason for row in rows] == [REASON, "ตรวจซ้ำตามคำขอของหัวหน้างาน"]


@pytest.mark.parametrize("reason", [None, "", "   ", "สั้นไป"])
def test_reveal_requires_a_real_reason(world, db, reason):
    response = reveal(world["order_id"], world["admin"], reason)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "validation_error"
    assert "reason" in detail["fields"]
    assert audit_rows(db) == []


def test_reveal_rejects_a_reason_that_is_too_long(world, db):
    response = reveal(world["order_id"], world["admin"], "ก" * 501)
    assert response.status_code == 422
    assert audit_rows(db) == []


def test_reveal_returns_404_for_unknown_order_without_logging(world, db):
    response = reveal(9999, world["admin"])
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "order_not_found"
    assert audit_rows(db) == []


def test_reveal_can_be_switched_off_with_one_setting(world, db, monkeypatch):
    monkeypatch.setenv("ADMIN_ORDER_CONTACT_REVEAL_ENABLED", "false")

    response = reveal(world["order_id"], world["admin"])
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "admin_contact_reveal_disabled"
    assert audit_rows(db) == []

    detail = client.get(f"/admin/orders/{world['order_id']}", headers=world["admin"]).json()
    assert detail["contact_reveal_available"] is False
    # ปิดแค่ Endpoint เดียว มุมมองปิดบังยังใช้งานได้ตามเดิม
    assert detail["shipping_address_masked"]["province"] == VALID_ADDRESS["province"]


# ------------------------------------------------------------------ สิทธิ์


@pytest.mark.parametrize("who", ["buyer", "seller", "inspector"])
def test_non_admin_cannot_use_admin_order_endpoints(world, db, who):
    headers = world[who]
    assert client.get("/admin/orders", headers=headers).status_code == 403
    assert client.get(f"/admin/orders/{world['order_id']}", headers=headers).status_code == 403
    assert reveal(world["order_id"], headers).status_code == 403
    assert audit_rows(db) == []


def test_suspended_admin_is_locked_out(world, db):
    admin = db.get(User, world["admin_id"])
    admin.status = UserStatus.SUSPENDED
    db.commit()

    assert client.get("/admin/orders", headers=world["admin"]).status_code == 403
    assert reveal(world["order_id"], world["admin"]).status_code == 403
    assert audit_rows(db) == []


def test_admin_view_does_not_change_what_the_seller_sees(world, db):
    assert reveal(world["order_id"], world["admin"]).status_code == 200

    response = client.get(f"/orders/{world['order_id']}", headers=world["seller"])
    assert response.status_code == 200
    assert response.json()["shipping_address"] is None

    # ผู้ขายยังเข้ามุมมองผู้ดูแลไม่ได้เช่นกัน
    assert client.get("/admin/orders", headers=world["seller"]).status_code == 403


def test_admin_cannot_reach_the_buyer_endpoints(world, db):
    order_id = world["order_id"]
    assert client.get(f"/orders/{order_id}", headers=world["admin"]).status_code == 404
    assert client.post(f"/orders/{order_id}/cancel", headers=world["admin"]).status_code == 404
    assert client.get(f"/orders/{order_id}/receipt", headers=world["admin"]).status_code == 404
    assert db.scalar(select(func.count()).select_from(AdminAccessLog)) == 0
