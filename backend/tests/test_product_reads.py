"""PRODUCT-05 public and owner catalog contract."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.exc import OperationalError, TimeoutError as DatabaseTimeout
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.api.products as products_module
from app.database import Base, get_db
from app.main import app
from app.models.brand import Brand
from app.models.category import Category
from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.product_upload import ProductUpload
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification
from app.models.order import Order
from app.services.order_pricing import utcnow
from tests.order_helpers import (
    VALID_ADDRESS,
    create_user,
    new_key,
    patch_auth,
)


engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
client = TestClient(app)


@event.listens_for(engine, "connect")
def enable_fk(connection, _record):
    connection.execute("PRAGMA foreign_keys=ON")


def get_test_db():
    with SessionLocal() as session:
        yield session


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    patch_auth(monkeypatch)
    Base.metadata.create_all(engine)

    async def sign(path):
        return f"https://storage.example.invalid/signed/{path}?token=test"

    monkeypatch.setattr(products_module, "sign_private_object", sign)
    app.dependency_overrides[get_db] = get_test_db
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(engine)


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def approve(db, user_id, status="APPROVED", created_at=None):
    verification = Verification(
        user_id=user_id,
        id_card_image_url="private/evidence.jpg",
        bank_account_name="Test Seller",
        bank_account_number="1111111111",
        bank_name="Test Bank",
        verification_status=status,
        reject_reason="เหตุผลทดสอบการปฏิเสธ" if status == "REJECTED" else None,
        created_at=created_at or datetime.now(timezone.utc),
    )
    db.add(verification)
    db.commit()
    return verification.id


def catalog(db):
    parent = Category(category_name="เสื้อผ้า")
    child = Category(category_name="เสื้อยืด", parent_category_id=None)
    brand = Brand(brand_name="ไม่ระบุแบรนด์")
    db.add_all([parent, child, brand])
    db.commit()
    child.parent_category_id = parent.id
    db.commit()
    return parent.id, brand.id


def product(db, seller_id, category_id, brand_id, *, name="เสื้อ", status="AVAILABLE", deleted=False, created_at=None, image_count=1):
    now = datetime.now(timezone.utc)
    row = Product(
        user_id=seller_id,
        category_id=category_id,
        brand_id=brand_id,
        product_name=name,
        description="รายละเอียดสินค้า",
        size="M",
        condition="GOOD",
        price="250.00",
        sale_type="FIXED_PRICE",
        status=status,
        created_at=created_at or now,
        updated_at=now,
        deleted_at=now if deleted else None,
    )
    db.add(row)
    db.flush()
    for order in range(image_count):
        image_id = row.id * 100 + order
        object_key = f"pending/{row.id}-{order}.png"
        db.add(
            ProductUpload(
                id=image_id,
                user_id=seller_id,
                object_key=object_key,
                mime_type="image/png",
                file_size=123,
                uploaded_at=now,
                expires_at=now + timedelta(hours=24),
                state="ATTACHED",
                attached_product_id=row.id,
            )
        )
        db.flush()
        db.add(
            ProductImage(
                product_id=row.id,
                image_id=image_id,
                image_url=object_key,
                file_size=123,
                uploaded_at=now,
                photo_type="MAIN" if order == 0 else "GALLERY",
                sort_order=order,
                upload_id=image_id,
            )
        )
    db.commit()
    return row.id


def test_public_list_only_currently_approved_available_sellers(db):
    good_id, good_headers = create_user(db, UserRole.SELLER)
    approve(db, good_id)
    pending_id, _ = create_user(db, UserRole.SELLER)
    approve(db, pending_id, "PENDING")
    rejected_id, _ = create_user(db, UserRole.SELLER)
    old = datetime.now(timezone.utc) - timedelta(days=2)
    approve(db, rejected_id, created_at=old)
    approve(db, rejected_id, "REJECTED")
    inactive_id, _ = create_user(db, UserRole.SELLER, UserStatus.SUSPENDED)
    approve(db, inactive_id)
    buyer_id, _ = create_user(db, UserRole.BUYER)
    approve(db, buyer_id)
    category_id, brand_id = catalog(db)
    visible = product(db, good_id, category_id, brand_id)
    hidden = [
        product(db, good_id, category_id, brand_id, status="RESERVED"),
        product(db, good_id, category_id, brand_id, status="SOLD"),
        product(db, good_id, category_id, brand_id, status="CANCELLED"),
        product(db, good_id, category_id, brand_id, deleted=True),
        product(db, pending_id, category_id, brand_id),
        product(db, rejected_id, category_id, brand_id),
        product(db, inactive_id, category_id, brand_id),
        product(db, buyer_id, category_id, brand_id),
    ]

    response = client.get("/products", headers=good_headers)

    assert response.status_code == 200
    assert response.json()["meta"]["total"] == 1
    assert [item["id"] for item in response.json()["data"]] == [visible]
    assert set(response.json()["data"][0]) == {"id", "product_name", "price", "condition", "status", "main_image"}
    assert response.headers["cache-control"] == "no-store"
    for product_id in hidden:
        assert client.get(f"/products/{product_id}").status_code == 404


def test_category_filter_combines_search_pagination_and_visibility(db):
    seller_id, _ = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    other = Category(category_name="กระเป๋า")
    db.add(other)
    db.commit()
    expected = [product(db, seller_id, category_id, brand_id, name="Blue Shirt") for _ in range(3)]
    product(db, seller_id, other.id, brand_id, name="Blue Bag")
    product(db, seller_id, category_id, brand_id, name="Blue Hidden", status="SOLD")
    product(db, seller_id, category_id, brand_id, name="Red Shirt")
    first = client.get("/products", params={"category_id": category_id, "q": "Blue", "page_size": 2})
    assert first.status_code == 200
    assert first.json()["meta"]["total"] == 3
    assert first.json()["meta"]["has_next"] is True
    second = client.get("/products", params={"category_id": category_id, "q": "Blue", "page_size": 2, "page": 2})
    assert {row["id"] for row in first.json()["data"] + second.json()["data"]} == set(expected)
    assert second.json()["meta"]["has_next"] is False
    assert client.get("/products", params={"category_id": 999999}).json()["meta"]["total"] == 0


@pytest.mark.parametrize("query", ["category_id=0", "category_id=-1", "category_id=abc", "category_id=1&category_id=2"])
def test_category_filter_rejects_invalid_or_duplicate_ids(query):
    response = client.get(f"/products?{query}")
    assert response.status_code == 422


def test_search_literals_trim_and_case_insensitive(db):
    seller_id, _ = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    ids = {
        name: product(db, seller_id, category_id, brand_id, name=name)
        for name in ["Blue Shirt", "blue%", "blue_", "blue\\", "blue other"]
    }
    assert client.get("/products", params={"q": "  SHIRT  "}).json()["data"][0]["id"] == ids["Blue Shirt"]
    for character in ["%", "_", "\\"]:
        response = client.get("/products", params={"q": character})
        assert [item["id"] for item in response.json()["data"]] == [ids[f"blue{character}"]]
    assert client.get("/products", params={"q": "   "}).json()["meta"]["total"] == 5


def test_pagination_ordering_and_out_of_range(db):
    seller_id, _ = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    same_time = datetime.now(timezone.utc)
    ids = [product(db, seller_id, category_id, brand_id, created_at=same_time) for _ in range(3)]
    first = client.get("/products", params={"page_size": 2}).json()
    second = client.get("/products", params={"page": 2, "page_size": 2}).json()
    beyond = client.get("/products", params={"page": 3, "page_size": 2}).json()
    assert [item["id"] for item in first["data"] + second["data"]] == ids[::-1]
    assert first["meta"] == {"page": 1, "page_size": 2, "total": 3, "total_pages": 2, "has_next": True}
    assert second["meta"]["has_next"] is False
    assert beyond == {"data": [], "meta": {"page": 3, "page_size": 2, "total": 3, "total_pages": 2, "has_next": False}}


def test_detail_has_ordered_images_and_no_private_seller_data(db):
    seller_id, _ = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id = product(db, seller_id, category_id, brand_id, image_count=3)
    response = client.get(f"/products/{product_id}")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["price"] == "250.00"
    assert data["category"]["category_name"] == "เสื้อผ้า"
    assert data["brand"]["brand_name"] == "ไม่ระบุแบรนด์"
    assert [image["sort_order"] for image in data["images"]] == [0, 1, 2]
    assert [image["photo_type"] for image in data["images"]] == ["MAIN", "GALLERY", "GALLERY"]
    assert "email" not in str(data) and "object_key" not in str(data)


def test_owner_list_detail_include_cancelled_without_approval(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id, "REJECTED")
    other_id, other_headers = create_user(db, UserRole.SELLER)
    category_id, brand_id = catalog(db)
    own = product(db, seller_id, category_id, brand_id, status="CANCELLED")
    other = product(db, other_id, category_id, brand_id)
    response = client.get("/products/me", headers=headers, params={"status": "CANCELLED"})
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["data"]] == [own]
    assert client.get(f"/products/me/{own}", headers=headers).json()["data"]["status"] == "CANCELLED"
    assert client.get(f"/products/me/{other}", headers=headers).json()["error"]["code"] == "PRODUCT_NOT_FOUND"
    assert client.get("/products/me", headers=other_headers).json()["data"][0]["id"] == other
    assert client.get("/products/me").json()["error"]["code"] == "AUTH_REQUIRED"


def test_public_reads_follow_latest_verification_with_id_tiebreaker(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    category_id, brand_id = catalog(db)
    product_id = product(db, seller_id, category_id, brand_id)
    same_time = datetime.now(timezone.utc)
    approve(db, seller_id, "APPROVED", same_time)
    assert client.get(f"/products/{product_id}").status_code == 200
    approve(db, seller_id, "REJECTED", same_time)
    assert client.get("/products").json()["data"] == []
    assert client.get(f"/products/{product_id}").status_code == 404
    assert client.get(f"/products/me/{product_id}", headers=headers).status_code == 200


def test_signing_failure_is_safe_and_does_not_return_product(db, monkeypatch):
    seller_id, _ = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product(db, seller_id, category_id, brand_id)

    async def fail_sign(_path):
        raise RuntimeError("storage credential must not appear in response")

    monkeypatch.setattr(products_module, "sign_private_object", fail_sign)
    response = client.get("/products")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "STORAGE_UNAVAILABLE"
    assert "storage credential" not in response.text


def test_owner_permissions_and_validation(db):
    _, buyer_headers = create_user(db, UserRole.BUYER)
    _, suspended_headers = create_user(db, UserRole.SELLER, UserStatus.SUSPENDED)
    _, seller_headers = create_user(db, UserRole.SELLER)
    assert client.get("/products/me", headers=buyer_headers).json()["error"]["code"] == "SELLER_ONLY"
    assert client.get("/products/me", headers=suspended_headers).json()["error"]["code"] == "ACCOUNT_INACTIVE"
    for params, field in [({"page": 0}, "page"), ({"page_size": 51}, "page_size"), ({"q": "x" * 256}, "q"), ({"status": "BOGUS"}, "status")]:
        response = client.get("/products/me", headers=seller_headers, params=params)
        assert response.status_code == 422
        assert field in response.json()["error"]["fields"]
    assert client.get("/products", params={"status": "AVAILABLE"}).json()["error"]["code"] == "FIELD_NOT_ALLOWED"
    assert client.get("/products", params={"page": 1, "page_size": 0}).status_code == 422
    assert client.get("/products/abc").status_code == 422
    assert client.get("/products/0").status_code == 422
    assert client.get("/products/9999").json()["error"]["code"] == "PRODUCT_NOT_FOUND"


def test_options_are_public_sorted_and_keep_parent_ids(db):
    category_id, brand_id = catalog(db)
    categories = client.get("/categories")
    brands = client.get("/brands")
    assert categories.status_code == brands.status_code == 200
    assert categories.json()["data"] == [
        {"id": category_id, "category_name": "เสื้อผ้า", "parent_category_id": None},
        {"id": category_id + 1, "category_name": "เสื้อยืด", "parent_category_id": category_id},
    ]
    assert brands.json()["data"] == [{"id": brand_id, "brand_name": "ไม่ระบุแบรนด์"}]
    assert client.get("/brands", params={"page": 2}).status_code == 422


def test_list_query_count_does_not_grow_with_products(db):
    seller_id, _ = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    for _ in range(10):
        product(db, seller_id, category_id, brand_id)
    statements = []

    def track(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", track)
    try:
        response = client.get("/products")
    finally:
        event.remove(engine, "before_cursor_execute", track)
    assert response.status_code == 200
    assert response.json()["meta"]["total"] == 10
    # จำนวนคำสั่งต้องคงที่ไม่ว่าจะมีสินค้ากี่ชิ้น: ด่านตรวจ Order หมดเวลา (D-05), approval integrity,
    # count, page, batch images — ด่านตรวจหมดเวลาเป็นคำสั่งอ่าน LIMIT 1 และไม่เขียนอะไรเมื่อไม่มีของค้าง
    assert len(statements) == 5


def test_malformed_approval_returns_503_for_public_reads(db):
    seller_id, _ = create_user(db, UserRole.SELLER)
    # Simulate legacy data from a database without the new CHECK constraint.
    db.execute(text("PRAGMA ignore_check_constraints=ON"))
    approve(db, seller_id, "INVALID_STATE")
    db.execute(text("PRAGMA ignore_check_constraints=OFF"))
    category_id, brand_id = catalog(db)
    product_id = product(db, seller_id, category_id, brand_id)
    for path in ["/products", f"/products/{product_id}"]:
        response = client.get(path)
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "APPROVAL_STATE_UNAVAILABLE"


@pytest.mark.parametrize("table, path", [("categories", "/categories"), ("brands", "/brands")])
def test_options_missing_schema_returns_safe_json(db, table, path):
    db.execute(text(f"DROP TABLE {table}"))
    db.commit()
    response = client.get(path)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PRODUCT_READ_UNAVAILABLE"
    assert response.json()["error"]["request_id"]
    assert response.headers["cache-control"] == "no-store"
    assert set(response.json()["error"]) == {"code", "message", "fields", "request_id"}


def test_duplicate_pending_returns_503_for_list_and_detail(db):
    seller_id, _ = create_user(db, UserRole.SELLER)
    # Only this isolated SQLite fixture omits the index to model damaged legacy data.
    db.execute(text("DROP INDEX uq_verifications_user_pending"))
    approve(db, seller_id, "PENDING")
    approve(db, seller_id, "PENDING")
    category_id, brand_id = catalog(db)
    product_id = product(db, seller_id, category_id, brand_id)
    for path in ["/products", f"/products/{product_id}"]:
        response = client.get(path)
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "APPROVAL_STATE_UNAVAILABLE"
        assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("path", ["/categories", "/brands"])
@pytest.mark.parametrize("failure", [
    DatabaseTimeout("private connection details"),
    OperationalError("private query", {}, RuntimeError("private connection details")),
])
def test_options_connection_failure_returns_safe_error(db, monkeypatch, path, failure):
    def fail_read(*args, **kwargs):
        raise failure

    monkeypatch.setattr(db, "scalars", fail_read)
    app.dependency_overrides[get_db] = lambda: db
    response = client.get(path)
    assert response.status_code == 503
    error = response.json()["error"]
    assert set(error) == {"code", "message", "fields", "request_id"}
    assert error["code"] == "PRODUCT_READ_UNAVAILABLE"
    assert error["request_id"].startswith("req-")
    assert response.headers["cache-control"] == "no-store"
    assert "private" not in response.text


# ---------------------------------------------------------------- การจองที่หมดเวลา (D-05)


def reserve_product(db, buyer_headers, product_id):
    """สั่งซื้อจริงผ่าน API เพื่อให้สินค้าเปลี่ยนเป็น RESERVED ตามเส้นทางจริง"""
    response = client.post(
        "/orders",
        json={"product_id": product_id, "shipping_address": VALID_ADDRESS},
        headers={**buyer_headers, "Idempotency-Key": new_key()},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def move_deadline_into_the_past(db, order_id):
    db.expire_all()
    order = db.get(Order, order_id)
    order.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()


def status_of(db, product_id):
    db.expire_all()
    return db.get(Product, product_id).status


@pytest.fixture
def reserved_world(db):
    """ผู้ขายที่ผ่านการอนุมัติ สินค้าหนึ่งชิ้น และ Order ที่จองสินค้าชิ้นนั้นไว้"""
    seller_id, seller_headers = create_user(db, UserRole.SELLER, name="ผู้ขาย ทดสอบ")
    approve(db, seller_id)
    buyer_id, buyer_headers = create_user(db, UserRole.BUYER, name="ผู้ซื้อ ทดสอบ")
    category_id, brand_id = catalog(db)
    product_id = product(db, seller_id, category_id, brand_id, name="เสื้อแจ็กเก็ตมือสอง")
    order_id = reserve_product(db, buyer_headers, product_id)
    assert status_of(db, product_id) == "RESERVED"
    return {
        "seller_id": seller_id,
        "seller": seller_headers,
        "buyer": buyer_headers,
        "product_id": product_id,
        "order_id": order_id,
    }


def test_reserved_product_stays_hidden_while_the_deadline_has_not_passed(reserved_world, db):
    """ยังไม่หมดเวลา = ยังจองอยู่จริง ต้องไม่ถูกปล่อยเพราะแค่มีคนเปิดดูแคตตาล็อก"""
    listing = client.get("/products")
    assert [item["id"] for item in listing.json()["data"]] == []
    assert client.get(f"/products/{reserved_world['product_id']}").status_code == 404
    assert status_of(db, reserved_world["product_id"]) == "RESERVED"


def test_expired_reservation_reappears_in_the_public_list(reserved_world, db):
    """ผู้ซื้อที่เดินดูแคตตาล็อกตามปกติต้องเจอสินค้าที่การจองหมดเวลาแล้ว"""
    move_deadline_into_the_past(db, reserved_world["order_id"])

    listing = client.get("/products")
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["data"]] == [reserved_world["product_id"]]
    assert listing.json()["meta"]["total"] == 1

    assert status_of(db, reserved_world["product_id"]) == "AVAILABLE"
    db.expire_all()
    order = db.get(Order, reserved_world["order_id"])
    assert (order.status, order.cancel_reason) == ("CANCELLED", "EXPIRED")


def test_expired_reservation_reappears_in_the_public_detail(reserved_world, db):
    """เปิดจากลิงก์ตรงก็ต้องปล่อยสินค้าเหมือนกัน ไม่ต้องรอให้ใครเปิดหน้ารายการก่อน"""
    move_deadline_into_the_past(db, reserved_world["order_id"])

    response = client.get(f"/products/{reserved_world['product_id']}")
    assert response.status_code == 200
    assert response.json()["data"]["id"] == reserved_world["product_id"]
    assert status_of(db, reserved_world["product_id"]) == "AVAILABLE"


def test_category_filter_and_pagination_include_released_reservation(reserved_world, db):
    """Expiry and main's category filter must both run before counting/pagination."""
    reserved = db.get(Product, reserved_world["product_id"])
    category_id, brand_id = reserved.category_id, reserved.brand_id
    other_category = Category(category_name="รองเท้า")
    db.add(other_category)
    db.commit()
    product(db, reserved_world["seller_id"], other_category.id, brand_id)
    move_deadline_into_the_past(db, reserved_world["order_id"])

    response = client.get("/products", params={"category_id": category_id, "page_size": 1})
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["data"]] == [reserved_world["product_id"]]
    assert response.json()["meta"]["total"] == 1
    assert status_of(db, reserved_world["product_id"]) == "AVAILABLE"
    expired = db.get(Order, reserved_world["order_id"])
    assert (expired.status, expired.cancel_reason) == ("CANCELLED", "EXPIRED")


def test_expired_reservation_returns_to_the_seller_own_list(reserved_world, db):
    """ผู้ขายเปิดรายการสินค้าของตัวเองก็ต้องเห็นสถานะจริง ไม่ใช่ RESERVED ค้างจากการจองที่ตายแล้ว"""
    move_deadline_into_the_past(db, reserved_world["order_id"])

    response = client.get("/products/me", headers=reserved_world["seller"])
    assert response.status_code == 200
    statuses = {item["id"]: item["status"] for item in response.json()["data"]}
    assert statuses[reserved_world["product_id"]] == "AVAILABLE"
    assert status_of(db, reserved_world["product_id"]) == "AVAILABLE"


def test_paid_product_is_never_released_by_browsing(reserved_world, db, monkeypatch):
    """สินค้าที่จ่ายเงินแล้วต้องไม่กลับมาขายได้ ไม่ว่าจะมีใครเปิดแคตตาล็อกกี่ครั้ง"""
    monkeypatch.setenv("PAYMENT_SIMULATION_ENABLED", "true")
    monkeypatch.delenv("APP_ENV", raising=False)
    paid = client.post(
        f"/orders/{reserved_world['order_id']}/payments/simulate",
        json={"outcome": "SUCCESS"},
        headers={**reserved_world["buyer"], "Idempotency-Key": new_key()},
    )
    assert paid.status_code == 200
    move_deadline_into_the_past_for_paid_order(db, reserved_world["order_id"])

    assert client.get("/products").json()["data"] == []
    assert client.get(f"/products/{reserved_world['product_id']}").status_code == 404
    assert status_of(db, reserved_world["product_id"]) == "RESERVED"


def move_deadline_into_the_past_for_paid_order(db, order_id):
    """Order ที่จ่ายแล้วก็มี expires_at ในอดีตได้ แต่ห้ามถูกกวาด"""
    db.expire_all()
    order = db.get(Order, order_id)
    order.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()
