"""PRODUCT-04 update/cancel ownership, state, image and transaction coverage."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select, update
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
from app.models.user import User, UserRole
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
    deleted = []

    async def sign(path):
        return f"https://storage.example.invalid/signed/{path}?token=test"

    async def delete(path):
        deleted.append(path)

    app.dependency_overrides[get_db] = _session_dependency
    monkeypatch.setattr(products_module, "sign_private_object", sign)
    monkeypatch.setattr(products_module, "compensate_upload", delete)
    yield deleted
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
            reject_reason="Test rejection reason" if status == "REJECTED" else None,
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


def pending_upload(db, user_id):
    now = datetime.now(timezone.utc)
    upload = ProductUpload(
        user_id=user_id,
        object_key=f"pending/{uuid4().hex}.png",
        mime_type="image/png",
        file_size=256,
        uploaded_at=now,
        expires_at=now + timedelta(hours=24),
        state="PENDING",
    )
    db.add(upload)
    db.commit()
    return upload.id


def make_product(db, user_id, category_id, brand_id, *, status="AVAILABLE", image_count=2):
    product = Product(
        user_id=user_id,
        category_id=category_id,
        brand_id=brand_id,
        product_name="สินค้าเดิม",
        description="รายละเอียดเดิม",
        size="M",
        condition="GOOD",
        price="100.00",
        sale_type="FIXED_PRICE",
        status=status,
    )
    db.add(product)
    db.flush()
    image_ids = []
    for order in range(image_count):
        upload_id = pending_upload(db, user_id)
        upload = db.get(ProductUpload, upload_id)
        upload.state = "ATTACHED"
        upload.attached_product_id = product.id
        db.add(
            ProductImage(
                product_id=product.id,
                image_id=upload.id,
                upload_id=upload.id,
                image_url=upload.object_key,
                file_size=upload.file_size,
                uploaded_at=upload.uploaded_at,
                photo_type="MAIN" if order == 0 else "GALLERY",
                sort_order=order,
            )
        )
        image_ids.append(upload.id)
    db.commit()
    return product.id, image_ids


def add_legacy_image(db, product_id, image_id=100, sort_order=0):
    legacy_url = "https://storage.example.invalid/storage/v1/object/public/product-images/old.jpg"
    db.add(
        ProductImage(
            product_id=product_id,
            image_id=image_id,
            upload_id=None,
            image_url=legacy_url,
            file_size=123,
            uploaded_at=datetime.now(timezone.utc),
            photo_type="MAIN" if sort_order == 0 else "GALLERY",
            sort_order=sort_order,
        )
    )
    db.commit()
    return legacy_url


def count(db, model):
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model))


def test_openapi_documents_update_and_cancel_errors():
    paths = app.openapi()["paths"]
    patch_operation = paths["/products/{product_id}"]["patch"]
    patch_responses = patch_operation["responses"]
    cancel_responses = paths["/products/{product_id}/cancel"]["post"]["responses"]
    assert {"200", "401", "403", "404", "409", "422", "500", "503"} <= set(
        patch_responses
    )
    assert {"200", "401", "403", "404", "409", "422", "500", "503"} <= set(
        cancel_responses
    )
    media = patch_operation["requestBody"]["content"]["application/json"]
    assert "images" in media["schema"]["properties"]
    assert {
        "fill_before_execute",
        "edit_fields",
        "reorder_images",
        "replace_image",
    } == set(media["examples"])
    assert media["examples"]["fill_before_execute"]["value"] == {}
    assert {"id", "user_id", "status"}.isdisjoint(media["schema"]["properties"])


def test_owner_updates_fields_and_receives_full_product(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, image_ids = make_product(db, seller_id, category_id, brand_id)

    response = client.patch(
        f"/products/{product_id}",
        headers=headers,
        json={"product_name": "  ชื่อใหม่  ", "price": "250.5", "condition": "LIKE_NEW"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["product_name"] == "ชื่อใหม่"
    assert data["price"] == "250.50"
    assert data["condition"] == "LIKE_NEW"
    assert data["status"] == "AVAILABLE"
    assert [image["image_id"] for image in data["images"]] == image_ids
    db.expire_all()
    assert db.get(Product, product_id).product_name == "ชื่อใหม่"


def test_scalar_update_preserves_legacy_image_without_private_signing(db, monkeypatch):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id, image_count=0)
    legacy_url = add_legacy_image(db, product_id)

    async def unexpected_sign(_path):
        raise AssertionError("legacy public URL must not be signed as a private key")

    monkeypatch.setattr(products_module, "sign_private_object", unexpected_sign)
    response = client.patch(
        f"/products/{product_id}", headers=headers, json={"price": "125.00"}
    )

    assert response.status_code == 200
    image = response.json()["data"]["images"][0]
    assert image["image_url"] == legacy_url
    assert image["url_expires_at"] is None
    db.expire_all()
    assert db.get(ProductImage, (product_id, 100)).image_url == legacy_url


def test_replace_legacy_image_keeps_old_storage_object(db, setup):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id, image_count=0)
    legacy_url = add_legacy_image(db, product_id)
    new_upload_id = pending_upload(db, seller_id)

    response = client.patch(
        f"/products/{product_id}",
        headers=headers,
        json={"images": [{"upload_id": new_upload_id}]},
    )

    assert response.status_code == 200
    assert [image["image_id"] for image in response.json()["data"]["images"]] == [
        new_upload_id
    ]
    db.expire_all()
    assert db.get(ProductImage, (product_id, 100)) is None
    assert db.get(ProductUpload, new_upload_id).state == "ATTACHED"
    assert legacy_url not in setup
    assert setup == []


def test_update_replaces_reorders_and_detaches_images_atomically(db, setup):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, old_ids = make_product(db, seller_id, category_id, brand_id)
    new_id = pending_upload(db, seller_id)
    removed_path = db.get(ProductUpload, old_ids[1]).object_key

    response = client.patch(
        f"/products/{product_id}",
        headers=headers,
        json={"images": [{"upload_id": new_id}, {"image_id": old_ids[0]}]},
    )

    assert response.status_code == 200
    images = response.json()["data"]["images"]
    assert [image["image_id"] for image in images] == [new_id, old_ids[0]]
    assert [image["sort_order"] for image in images] == [0, 1]
    assert [image["photo_type"] for image in images] == ["MAIN", "GALLERY"]
    db.expire_all()
    removed = db.get(ProductUpload, old_ids[1])
    assert removed.state == "DETACHED"
    assert removed.attached_product_id is None
    assert db.get(ProductUpload, new_id).state == "ATTACHED"
    assert setup == [removed_path]


def test_cleanup_failure_does_not_turn_committed_update_into_failure(db, monkeypatch):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, old_ids = make_product(db, seller_id, category_id, brand_id)

    async def fail_cleanup(_path):
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr(products_module, "compensate_upload", fail_cleanup)
    response = client.patch(
        f"/products/{product_id}",
        headers=headers,
        json={"images": [{"image_id": old_ids[0]}]},
    )

    assert response.status_code == 200
    db.expire_all()
    assert db.get(ProductUpload, old_ids[1]).state == "DETACHED"
    assert db.scalars(
        select(ProductImage.image_id).where(ProductImage.product_id == product_id)
    ).all() == [old_ids[0]]


@pytest.mark.parametrize("upload_state", ["ATTACHED", "DETACHED"])
def test_non_pending_new_upload_cannot_be_used_for_update(db, upload_state):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, old_ids = make_product(db, seller_id, category_id, brand_id)
    upload_id = pending_upload(db, seller_id)
    upload = db.get(ProductUpload, upload_id)
    upload.state = upload_state
    if upload_state == "ATTACHED":
        upload.attached_product_id = product_id
    db.commit()

    response = client.patch(
        f"/products/{product_id}",
        headers=headers,
        json={"images": [{"upload_id": upload_id}]},
    )

    assert response.status_code in {409, 422}
    expected = "IMAGE_ALREADY_ATTACHED" if upload_state == "ATTACHED" else "INVALID_IMAGE_REFERENCE"
    assert response.json()["error"]["code"] == expected
    db.expire_all()
    assert db.scalars(
        select(ProductImage.image_id)
        .where(ProductImage.product_id == product_id)
        .order_by(ProductImage.sort_order)
    ).all() == old_ids


def test_image_from_another_product_is_rejected_without_changes(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, original_ids = make_product(db, seller_id, category_id, brand_id)
    other_id, other_images = make_product(db, seller_id, category_id, brand_id)

    response = client.patch(
        f"/products/{product_id}",
        headers=headers,
        json={"images": [{"image_id": other_images[0]}]},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_IMAGE_REFERENCE"
    db.expire_all()
    current = db.scalars(
        select(ProductImage)
        .where(ProductImage.product_id == product_id)
        .order_by(ProductImage.sort_order)
    ).all()
    assert [image.image_id for image in current] == original_ids
    assert count(db, ProductImage) == len(original_ids) + len(other_images)
    assert db.get(Product, other_id) is not None


def test_pending_upload_from_another_seller_is_rejected_without_changes(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    other_id, _ = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, original_ids = make_product(db, seller_id, category_id, brand_id)
    foreign_upload_id = pending_upload(db, other_id)

    response = client.patch(
        f"/products/{product_id}",
        headers=headers,
        json={"images": [{"upload_id": foreign_upload_id}]},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_IMAGE_REFERENCE"
    db.expire_all()
    assert db.get(ProductUpload, foreign_upload_id).state == "PENDING"
    assert db.scalars(
        select(ProductImage.image_id)
        .where(ProductImage.product_id == product_id)
        .order_by(ProductImage.sort_order)
    ).all() == original_ids


def test_expired_upload_is_rejected_without_changes(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, original_ids = make_product(db, seller_id, category_id, brand_id)
    upload_id = pending_upload(db, seller_id)
    upload = db.get(ProductUpload, upload_id)
    upload.uploaded_at = datetime.now(timezone.utc) - timedelta(hours=25)
    upload.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db.commit()

    response = client.patch(
        f"/products/{product_id}",
        headers=headers,
        json={"images": [{"upload_id": upload_id}]},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "UPLOAD_EXPIRED"
    db.expire_all()
    assert db.get(ProductUpload, upload_id).state == "PENDING"
    assert db.scalars(
        select(ProductImage.image_id)
        .where(ProductImage.product_id == product_id)
        .order_by(ProductImage.sort_order)
    ).all() == original_ids


def test_update_rejects_missing_category_without_changing_product(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id)

    response = client.patch(
        f"/products/{product_id}", headers=headers, json={"category_id": 999999}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REFERENCE"
    db.expire_all()
    assert db.get(Product, product_id).category_id == category_id


@pytest.mark.parametrize("status", ["RESERVED", "SOLD", "CANCELLED"])
def test_non_available_product_cannot_be_updated(db, status):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id, status=status)

    response = client.patch(
        f"/products/{product_id}", headers=headers, json={"product_name": "ห้ามเปลี่ยน"}
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PRODUCT_NOT_EDITABLE"


@pytest.mark.parametrize("body", [{}, {"price": None}, {"status": "SOLD"}])
def test_invalid_update_body_is_rejected(db, body):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id)

    response = client.patch(f"/products/{product_id}", headers=headers, json=body)

    assert response.status_code == 422
    expected = "FIELD_NOT_ALLOWED" if "status" in body else "VALIDATION_ERROR"
    assert response.json()["error"]["code"] == expected


def test_other_owner_gets_not_found_before_payload_validation(db):
    owner_id, _ = create_user(db, UserRole.SELLER)
    other_id, other_headers = create_user(db, UserRole.SELLER)
    approve(db, owner_id)
    approve(db, other_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, owner_id, category_id, brand_id)

    response = client.patch(
        f"/products/{product_id}", headers=other_headers, json={"status": "SOLD"}
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PRODUCT_NOT_FOUND"


def test_missing_token_and_latest_rejected_verification_block_update(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id)
    approve(db, seller_id, "REJECTED")

    rejected = client.patch(
        f"/products/{product_id}", headers=headers, json={"price": "90.00"}
    )
    anonymous = client.patch(f"/products/{product_id}", json={"price": "90.00"})

    assert rejected.status_code == 403
    assert rejected.json()["error"]["code"] == "SELLER_NOT_APPROVED"
    assert anonymous.status_code == 401
    assert anonymous.json()["error"]["code"] == "AUTH_REQUIRED"


def test_latest_status_wins_during_update_race(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id)
    request_db = SessionLocal()
    cached = request_db.get(Product, product_id)
    assert cached.status == "AVAILABLE"
    with SessionLocal() as order_db:
        order_db.execute(
            update(Product).where(Product.id == product_id).values(status="RESERVED")
        )
        order_db.commit()

    def cached_get_db():
        try:
            yield request_db
        finally:
            request_db.close()

    app.dependency_overrides[get_db] = cached_get_db
    try:
        response = client.patch(
            f"/products/{product_id}", headers=headers, json={"product_name": "ห้ามทับ"}
        )
    finally:
        app.dependency_overrides[get_db] = _session_dependency

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PRODUCT_NOT_EDITABLE"
    db.expire_all()
    assert db.get(Product, product_id).product_name == "สินค้าเดิม"
    assert db.get(Product, product_id).status == "RESERVED"


def test_cancel_is_idempotent_and_keeps_images(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, image_ids = make_product(db, seller_id, category_id, brand_id)

    first = client.post(f"/products/{product_id}/cancel", headers=headers)
    second = client.post(f"/products/{product_id}/cancel", headers=headers, json={})

    assert first.status_code == second.status_code == 200
    assert first.json()["data"] == second.json()["data"]
    assert first.json()["data"]["status"] == "CANCELLED"
    db.expire_all()
    product = db.get(Product, product_id)
    assert product.deleted_at is None
    assert db.scalars(
        select(ProductImage.image_id)
        .where(ProductImage.product_id == product_id)
        .order_by(ProductImage.sort_order)
    ).all() == image_ids


def test_missing_token_and_latest_rejected_verification_block_cancel(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id)
    approve(db, seller_id, "REJECTED")

    rejected = client.post(f"/products/{product_id}/cancel", headers=headers)
    anonymous = client.post(f"/products/{product_id}/cancel")

    assert rejected.status_code == 403
    assert rejected.json()["error"]["code"] == "SELLER_NOT_APPROVED"
    assert anonymous.status_code == 401
    assert anonymous.json()["error"]["code"] == "AUTH_REQUIRED"
    db.expire_all()
    assert db.get(Product, product_id).status == "AVAILABLE"


@pytest.mark.parametrize("status", ["RESERVED", "SOLD"])
def test_reserved_or_sold_product_cannot_be_cancelled(db, status):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id, status=status)

    response = client.post(f"/products/{product_id}/cancel", headers=headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PRODUCT_NOT_CANCELLABLE"


def test_other_owner_cannot_cancel_and_cancel_rejects_fields(db):
    owner_id, owner_headers = create_user(db, UserRole.SELLER)
    other_id, other_headers = create_user(db, UserRole.SELLER)
    approve(db, owner_id)
    approve(db, other_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, owner_id, category_id, brand_id)

    hidden = client.post(f"/products/{product_id}/cancel", headers=other_headers)
    invalid = client.post(
        f"/products/{product_id}/cancel", headers=owner_headers, json={"status": "CANCELLED"}
    )

    assert hidden.status_code == 404
    assert hidden.json()["error"]["code"] == "PRODUCT_NOT_FOUND"
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "FIELD_NOT_ALLOWED"
    db.expire_all()
    assert db.get(Product, product_id).status == "AVAILABLE"


def test_latest_status_wins_during_cancel_race(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id)
    request_db = SessionLocal()
    assert request_db.get(Product, product_id).status == "AVAILABLE"
    with SessionLocal() as order_db:
        order_db.execute(update(Product).where(Product.id == product_id).values(status="SOLD"))
        order_db.commit()

    def cached_get_db():
        try:
            yield request_db
        finally:
            request_db.close()

    app.dependency_overrides[get_db] = cached_get_db
    try:
        response = client.post(f"/products/{product_id}/cancel", headers=headers)
    finally:
        app.dependency_overrides[get_db] = _session_dependency

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PRODUCT_NOT_CANCELLABLE"
    db.expire_all()
    assert db.get(Product, product_id).status == "SOLD"


def test_update_commit_failure_rolls_back_fields_and_images(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, old_ids = make_product(db, seller_id, category_id, brand_id)
    new_id = pending_upload(db, seller_id)
    failing_db = SessionLocal()
    failing_db.commit = lambda: (_ for _ in ()).throw(RuntimeError("commit failed"))

    def failing_get_db():
        try:
            yield failing_db
        finally:
            failing_db.close()

    app.dependency_overrides[get_db] = failing_get_db
    try:
        response = client.patch(
            f"/products/{product_id}",
            headers=headers,
            json={"product_name": "ไม่ควรค้าง", "images": [{"upload_id": new_id}]},
        )
    finally:
        app.dependency_overrides[get_db] = _session_dependency

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "PRODUCT_SAVE_FAILED"
    db.expire_all()
    assert db.get(Product, product_id).product_name == "สินค้าเดิม"
    assert db.get(ProductUpload, new_id).state == "PENDING"
    assert db.scalars(
        select(ProductImage.image_id)
        .where(ProductImage.product_id == product_id)
        .order_by(ProductImage.sort_order)
    ).all() == old_ids


def test_lost_update_commit_acknowledgement_returns_confirmed_result(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id)
    uncertain_db = SessionLocal()
    real_commit = uncertain_db.commit

    def commit_then_raise():
        real_commit()
        raise RuntimeError("lost acknowledgement")

    uncertain_db.commit = commit_then_raise

    def uncertain_get_db():
        try:
            yield uncertain_db
        finally:
            uncertain_db.close()

    app.dependency_overrides[get_db] = uncertain_get_db
    try:
        response = client.patch(
            f"/products/{product_id}", headers=headers, json={"price": "88.00"}
        )
    finally:
        app.dependency_overrides[get_db] = _session_dependency

    assert response.status_code == 200
    assert response.json()["data"]["price"] == "88.00"
    db.expire_all()
    assert format(db.get(Product, product_id).price, ".2f") == "88.00"


def test_lost_update_acknowledgement_with_distinct_image_and_upload_ids(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, image_ids = make_product(db, seller_id, category_id, brand_id, image_count=1)
    original_image = db.get(ProductImage, (product_id, image_ids[0]))
    original_image.image_id = 101
    db.commit()
    uncertain_db = SessionLocal()
    real_commit = uncertain_db.commit

    def commit_then_raise():
        real_commit()
        raise RuntimeError("lost acknowledgement")

    uncertain_db.commit = commit_then_raise

    def uncertain_get_db():
        try:
            yield uncertain_db
        finally:
            uncertain_db.close()

    app.dependency_overrides[get_db] = uncertain_get_db
    try:
        response = client.patch(
            f"/products/{product_id}", headers=headers, json={"price": "88.00"}
        )
    finally:
        app.dependency_overrides[get_db] = _session_dependency

    assert response.status_code == 200
    assert response.json()["data"]["images"][0]["image_id"] == 101
    db.expire_all()
    assert db.get(ProductImage, (product_id, 101)).upload_id == image_ids[0]


def test_lost_update_acknowledgement_with_legacy_image(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id, image_count=0)
    legacy_url = add_legacy_image(db, product_id)
    uncertain_db = SessionLocal()
    real_commit = uncertain_db.commit

    def commit_then_raise():
        real_commit()
        raise RuntimeError("lost acknowledgement")

    uncertain_db.commit = commit_then_raise

    def uncertain_get_db():
        try:
            yield uncertain_db
        finally:
            uncertain_db.close()

    app.dependency_overrides[get_db] = uncertain_get_db
    try:
        response = client.patch(
            f"/products/{product_id}", headers=headers, json={"price": "88.00"}
        )
    finally:
        app.dependency_overrides[get_db] = _session_dependency

    assert response.status_code == 200
    assert response.json()["data"]["images"][0]["image_url"] == legacy_url
    db.expire_all()
    assert format(db.get(Product, product_id).price, ".2f") == "88.00"


def test_lost_cancel_commit_acknowledgement_returns_confirmed_result(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id)
    uncertain_db = SessionLocal()
    real_commit = uncertain_db.commit

    def commit_then_raise():
        real_commit()
        raise RuntimeError("lost acknowledgement")

    uncertain_db.commit = commit_then_raise

    def uncertain_get_db():
        try:
            yield uncertain_db
        finally:
            uncertain_db.close()

    app.dependency_overrides[get_db] = uncertain_get_db
    try:
        response = client.post(f"/products/{product_id}/cancel", headers=headers)
    finally:
        app.dependency_overrides[get_db] = _session_dependency

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "CANCELLED"
    db.expire_all()
    assert db.get(Product, product_id).status == "CANCELLED"


def test_cancel_commit_failure_rolls_back_status(db):
    seller_id, headers = create_user(db, UserRole.SELLER)
    approve(db, seller_id)
    category_id, brand_id = catalog(db)
    product_id, _ = make_product(db, seller_id, category_id, brand_id)
    failing_db = SessionLocal()
    failing_db.commit = lambda: (_ for _ in ()).throw(RuntimeError("commit failed"))

    def failing_get_db():
        try:
            yield failing_db
        finally:
            failing_db.close()

    app.dependency_overrides[get_db] = failing_get_db
    try:
        response = client.post(f"/products/{product_id}/cancel", headers=headers)
    finally:
        app.dependency_overrides[get_db] = _session_dependency

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "PRODUCT_SAVE_FAILED"
    db.expire_all()
    assert db.get(Product, product_id).status == "AVAILABLE"
