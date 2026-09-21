"""PRODUCT-05 public and owner catalog contract."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
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
from tests.order_helpers import create_user, patch_auth


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
    assert len(statements) == 3  # count, one page, all page images in a batch
