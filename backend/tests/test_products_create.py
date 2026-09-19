"""PRODUCT-03 create endpoint: contract, permission and rollback coverage."""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
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
from app.models.user import UserRole
from app.models.verification import Verification
from tests.order_helpers import create_user, patch_auth


engine = create_engine(
    "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
)


@event.listens_for(engine, "connect")
def _enable_sqlite_fk(dbapi_connection, _record):
    dbapi_connection.execute("PRAGMA foreign_keys=ON")


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
client = TestClient(app)


def _session_dependency():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    patch_auth(monkeypatch)
    Base.metadata.create_all(bind=engine)

    async def sign(path):
        return f"https://storage.example.invalid/signed/{path}?token=test"

    app.dependency_overrides[get_db] = _session_dependency
    monkeypatch.setattr(products_module, "sign_private_object", sign)
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


def approve(db, user_id, status="APPROVED"):
    db.add(
        Verification(
            user_id=user_id,
            id_card_image_url="private/evidence.jpg",
            bank_account_name="ผู้ขาย ทดสอบ",
            bank_account_number="1111111111",
            bank_name="ธนาคารทดสอบ",
            verification_status=status,
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()


def catalog(db):
    category = Category(category_name="เสื้อผ้า")
    brand = Brand(brand_name="ไม่ระบุแบรนด์")
    db.add_all([category, brand])
    db.commit()
    return category.id, brand.id


def pending_upload(db, user_id, *, state="PENDING", hours=24):
    now = datetime.now(timezone.utc)
    uploaded_at = now if hours > 0 else now + timedelta(hours=hours - 1)
    upload = ProductUpload(
        user_id=user_id,
        object_key=f"pending/{user_id}-{now.timestamp()}.png",
        mime_type="image/png",
        file_size=256,
        uploaded_at=uploaded_at,
        expires_at=now + timedelta(hours=hours),
        state=state,
    )
    db.add(upload)
    db.commit()
    return upload.id


def valid_body(category_id, brand_id, upload_ids):
    return {
        "product_name": "  เสื้อเชิ้ตสีฟ้า  ",
        "description": "  เสื้อเชิ้ตมือสองสภาพดี  ",
        "price": "1290",
        "category_id": category_id,
        "brand_id": brand_id,
        "size": " M ",
        "condition": "GOOD",
        "sale_type": "FIXED_PRICE",
        "images": [{"upload_id": upload_id} for upload_id in upload_ids],
    }


def count(db, model):
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model))


def test_openapi_documents_product_create_errors():
    responses = app.openapi()["paths"]["/products"]["post"]["responses"]
    assert {"201", "401", "403", "409", "422", "500", "503"} <= set(responses)


def test_approved_seller_creates_product_and_consumes_images(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    uploads = [pending_upload(db, seller_id), pending_upload(db, seller_id)]

    response = client.post("/products", headers=headers, json=valid_body(category_id, brand_id, uploads))

    assert response.status_code == 201
    assert response.headers["location"].startswith("/products/")
    data = response.json()["data"]
    assert data["product_name"] == "เสื้อเชิ้ตสีฟ้า"
    assert data["description"] == "เสื้อเชิ้ตมือสองสภาพดี"
    assert data["size"] == "M"
    assert data["price"] == "1290.00"
    assert data["status"] == "AVAILABLE"
    assert data["sale_type"] == "FIXED_PRICE"
    assert [image["image_id"] for image in data["images"]] == uploads
    assert [image["sort_order"] for image in data["images"]] == [0, 1]
    assert [image["photo_type"] for image in data["images"]] == ["MAIN", "GALLERY"]

    db.expire_all()
    product = db.get(Product, data["id"])
    assert product.user_id == seller_id
    records = db.scalars(select(ProductUpload).order_by(ProductUpload.id)).all()
    assert [record.state for record in records] == ["ATTACHED", "ATTACHED"]
    assert all(record.attached_product_id == product.id for record in records)


def test_ten_images_are_accepted_in_request_order(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    uploads = [pending_upload(db, seller_id) for _ in range(10)]

    response = client.post("/products", headers=headers, json=valid_body(category_id, brand_id, uploads))

    assert response.status_code == 201
    images = response.json()["data"]["images"]
    assert [image["image_id"] for image in images] == uploads
    assert [image["sort_order"] for image in images] == list(range(10))
    assert images[0]["photo_type"] == "MAIN"
    assert all(image["photo_type"] == "GALLERY" for image in images[1:])


def test_owner_and_status_from_client_are_rejected_without_writes(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    upload_id = pending_upload(db, seller_id)
    body = valid_body(category_id, brand_id, [upload_id]) | {"user_id": 999, "status": "SOLD"}

    response = client.post("/products", headers=headers, json=body)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "FIELD_NOT_ALLOWED"
    assert count(db, Product) == 0


@pytest.mark.parametrize("price", ["0", "-1", "1.001", "1e2", "1,000", 100])
def test_invalid_price_does_not_create_product(db, price):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    upload_id = pending_upload(db, seller_id)
    body = valid_body(category_id, brand_id, [upload_id])
    body["price"] = price

    response = client.post("/products", headers=headers, json=body)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert count(db, Product) == 0


@pytest.mark.parametrize("value", [True, "1", 1.0])
@pytest.mark.parametrize(
    "field,expected_code",
    [
        ("category_id", "VALIDATION_ERROR"),
        ("brand_id", "VALIDATION_ERROR"),
        ("upload_id", "INVALID_IMAGE_REFERENCE"),
    ],
)
def test_ids_require_strict_positive_integers(db, field, expected_code, value):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    upload_id = pending_upload(db, seller_id)
    body = valid_body(category_id, brand_id, [upload_id])
    if field == "upload_id":
        body["images"][0]["upload_id"] = value
    else:
        body[field] = value

    response = client.post("/products", headers=headers, json=body)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == expected_code
    assert count(db, Product) == 0


def test_missing_category_and_brand_return_field_errors(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    upload_id = pending_upload(db, seller_id)

    response = client.post("/products", headers=headers, json=valid_body(999, 998, [upload_id]))

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "INVALID_REFERENCE"
    assert set(error["fields"]) == {"category_id", "brand_id"}
    assert count(db, Product) == 0


@pytest.mark.parametrize("approval", [None, "PENDING", "REJECTED"])
def test_unapproved_seller_cannot_create(db, approval):
    seller_id, headers = create_user(db, UserRole.SELLER)
    if approval:
        approve(db, seller_id, approval)
    category_id, brand_id = catalog(db)
    upload_id = pending_upload(db, seller_id)

    response = client.post("/products", headers=headers, json=valid_body(category_id, brand_id, [upload_id]))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "SELLER_NOT_APPROVED"
    assert count(db, Product) == 0


def test_buyer_and_missing_token_are_rejected(db):
    buyer_id, headers = create_user(db, UserRole.BUYER)
    category_id, brand_id = catalog(db)
    upload_id = pending_upload(db, buyer_id)
    body = valid_body(category_id, brand_id, [upload_id])

    buyer_response = client.post("/products", headers=headers, json=body)
    anonymous_response = client.post("/products", json=body)

    assert buyer_response.status_code == 403
    assert buyer_response.json()["error"]["code"] == "SELLER_ONLY"
    assert anonymous_response.status_code == 401
    assert anonymous_response.json()["error"]["code"] == "AUTH_REQUIRED"
    assert count(db, Product) == 0


def test_other_sellers_upload_rolls_back_product(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    other_id, _ = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    upload_id = pending_upload(db, other_id)

    response = client.post("/products", headers=headers, json=valid_body(category_id, brand_id, [upload_id]))

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_IMAGE_REFERENCE"
    assert count(db, Product) == 0
    assert count(db, ProductImage) == 0


@pytest.mark.parametrize(
    "images,expected_code",
    [
        ([], "INVALID_IMAGE_COUNT"),
        ([{"upload_id": number} for number in range(1, 12)], "INVALID_IMAGE_COUNT"),
        ([{"upload_id": 1}, {"upload_id": 1}], "INVALID_IMAGE_REFERENCE"),
        ([{"upload_id": 0}], "INVALID_IMAGE_REFERENCE"),
    ],
)
def test_image_list_validation_uses_contract_codes(db, images, expected_code):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    body = valid_body(category_id, brand_id, [])
    body["images"] = images

    response = client.post("/products", headers=headers, json=body)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == expected_code
    assert count(db, Product) == 0


def test_expired_or_attached_upload_cannot_create_duplicate_product(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    expired = pending_upload(db, seller_id, hours=-1)

    expired_response = client.post(
        "/products", headers=headers, json=valid_body(category_id, brand_id, [expired])
    )
    assert expired_response.status_code == 409
    assert expired_response.json()["error"]["code"] == "UPLOAD_EXPIRED"
    assert count(db, Product) == 0


def test_signing_failure_rolls_back_product_and_leaves_upload_retryable(db, monkeypatch):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    upload_id = pending_upload(db, seller_id)

    async def fail_sign(_path):
        raise HTTPException(status_code=503, detail={"code": "STORAGE_UNAVAILABLE"})

    monkeypatch.setattr(products_module, "sign_private_object", fail_sign)
    response = client.post("/products", headers=headers, json=valid_body(category_id, brand_id, [upload_id]))

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "STORAGE_UNAVAILABLE"
    assert count(db, Product) == 0
    assert count(db, ProductImage) == 0
    db.expire_all()
    upload = db.get(ProductUpload, upload_id)
    assert upload.state == "PENDING"
    assert upload.attached_product_id is None


def test_each_signed_url_expiry_is_measured_before_signing(db, monkeypatch):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    uploads = [pending_upload(db, seller_id), pending_upload(db, seller_id)]
    signing_started = []

    async def slow_sign(path):
        signing_started.append(datetime.now(timezone.utc))
        await asyncio.sleep(0.02)
        return f"https://storage.example.invalid/signed/{path}?token=test"

    monkeypatch.setattr(products_module, "sign_private_object", slow_sign)
    response = client.post(
        "/products", headers=headers, json=valid_body(category_id, brand_id, uploads)
    )

    assert response.status_code == 201
    expiries = [
        datetime.fromisoformat(image["url_expires_at"])
        for image in response.json()["data"]["images"]
    ]
    assert expiries[0] < expiries[1]
    assert all(
        expiry <= started + timedelta(seconds=products_module.SIGNED_URL_SECONDS)
        for expiry, started in zip(expiries, signing_started, strict=True)
    )


def test_database_commit_failure_rolls_back_product_and_bindings(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    upload_id = pending_upload(db, seller_id)
    failing_session = SessionLocal()

    def fail_commit():
        raise RuntimeError("simulated commit failure")

    failing_session.commit = fail_commit

    def failing_get_db():
        try:
            yield failing_session
        finally:
            failing_session.close()

    app.dependency_overrides[get_db] = failing_get_db
    try:
        response = client.post(
            "/products", headers=headers, json=valid_body(category_id, brand_id, [upload_id])
        )
    finally:
        app.dependency_overrides[get_db] = _session_dependency

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "PRODUCT_SAVE_FAILED"
    assert count(db, Product) == 0
    assert count(db, ProductImage) == 0
    db.expire_all()
    upload = db.get(ProductUpload, upload_id)
    assert upload.state == "PENDING"
    assert upload.attached_product_id is None


def test_commit_success_with_lost_acknowledgement_returns_created_product(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    upload_id = pending_upload(db, seller_id)
    uncertain_session = SessionLocal()
    real_commit = uncertain_session.commit

    def commit_then_lose_acknowledgement():
        real_commit()
        raise RuntimeError("simulated lost commit acknowledgement")

    uncertain_session.commit = commit_then_lose_acknowledgement

    def uncertain_get_db():
        try:
            yield uncertain_session
        finally:
            uncertain_session.close()

    app.dependency_overrides[get_db] = uncertain_get_db
    try:
        response = client.post(
            "/products", headers=headers, json=valid_body(category_id, brand_id, [upload_id])
        )
    finally:
        app.dependency_overrides[get_db] = _session_dependency

    assert response.status_code == 201
    product_id = response.json()["data"]["id"]
    assert response.headers["location"] == f"/products/{product_id}"
    assert count(db, Product) == 1
    assert count(db, ProductImage) == 1
    db.expire_all()
    upload = db.get(ProductUpload, upload_id)
    assert upload.state == "ATTACHED"
    assert upload.attached_product_id == product_id
