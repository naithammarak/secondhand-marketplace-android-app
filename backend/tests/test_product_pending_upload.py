"""Exercise the new file-only private upload contract with an isolated DB."""

from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import uuid4
import asyncio

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api import product_uploads
from app.api.auth import get_current_user
from app.database import Base, get_db
from app.models.brand import Brand
from app.models.category import Category
from app.models.product import Product
from app.models.product_upload import ProductUpload
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification


def image_bytes():
    output = BytesIO()
    Image.new("RGB", (4, 4), "red").save(output, format="PNG")
    return output.getvalue()


@pytest.fixture
def pending_client(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__, Category.__table__, Brand.__table__, Product.__table__,
            Verification.__table__, ProductUpload.__table__,
        ],
    )
    db = Session(engine)
    seller = User(
        supabase_user_id=uuid4(), full_name="Seller", email="seller@example.test", role=UserRole.SELLER
    )
    db.add(seller)
    db.commit()
    db.refresh(seller)
    db.add(
        Verification(
            user_id=seller.id,
            id_card_image_url="private/id.jpg",
            bank_account_name="Seller",
            bank_account_number="1234567890",
            bank_name="Bank",
            verification_status="APPROVED",
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    calls = {"bucket": 0, "upload": [], "sign": [], "delete": []}

    async def bucket():
        calls["bucket"] += 1

    async def upload(path, content, mime_type):
        calls["upload"].append((path, content, mime_type))

    async def sign(path):
        calls["sign"].append(path)
        return f"https://example.supabase.co/storage/v1/object/sign/product-images/{path}?token=short-lived"

    async def delete(path):
        calls["delete"].append(path)

    monkeypatch.setattr(product_uploads, "require_private_bucket", bucket)
    monkeypatch.setattr(product_uploads, "upload_private_object", upload)
    monkeypatch.setattr(product_uploads, "sign_private_object", sign)
    monkeypatch.setattr(product_uploads, "compensate_upload", delete)

    test_app = FastAPI()
    test_app.include_router(product_uploads.router)
    test_app.dependency_overrides[get_current_user] = lambda: seller
    test_app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(test_app), db, seller, calls
    finally:
        db.close()
        engine.dispose()


def post_png(client, **extra):
    return client.post(
        "/products/images/upload",
        data=extra,
        files={"file": ("item.png", image_bytes(), "image/png")},
    )


def test_upload_creates_owned_pending_reference_with_signed_url(pending_client):
    client, db, seller, calls = pending_client
    response = post_png(client)
    assert response.status_code == 201
    data = response.json()["data"]
    record = db.get(ProductUpload, data["upload_id"])
    assert record.user_id == seller.id
    assert record.state == "PENDING"
    assert record.attached_product_id is None
    assert record.expires_at - record.uploaded_at == timedelta(hours=24)
    assert record.object_key.startswith("pending/")
    assert record.object_key == calls["upload"][0][0] == calls["sign"][0]
    assert record.file_size == len(calls["upload"][0][1])
    assert record.mime_type == "image/png"
    assert data["image_url"].startswith("https://example.supabase.co/storage/v1/object/sign/")
    assert "token=" not in record.object_key
    assert response.headers["cache-control"] == "no-store"


def test_legacy_product_id_field_is_rejected_before_storage(pending_client):
    client, db, _, calls = pending_client
    response = post_png(client, product_id="1")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_IMAGE_COUNT"
    assert response.json()["error"]["request_id"].startswith("req-")
    assert calls["upload"] == []
    assert db.query(ProductUpload).count() == 0


def test_unapproved_seller_cannot_upload(pending_client):
    client, db, _, calls = pending_client
    db.query(Verification).update({"verification_status": "REJECTED"})
    db.commit()
    response = post_png(client)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "SELLER_NOT_APPROVED"
    assert calls["upload"] == []


def test_seller_status_is_refreshed_after_concurrent_suspension(pending_client):
    client, db, seller, calls = pending_client
    assert seller.status == UserStatus.ACTIVE

    with Session(db.get_bind()) as other_db:
        other_db.execute(
            update(User).where(User.id == seller.id).values(status=UserStatus.CLOSED)
        )
        other_db.commit()

    # The dependency still holds the previously loaded ACTIVE object. The locked
    # query must refresh it from the database before checking seller access.
    assert seller.status == UserStatus.ACTIVE
    response = post_png(client)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_INACTIVE"
    assert calls["upload"] == []


def test_missing_upload_registry_schema_returns_503(pending_client, monkeypatch):
    client, db, _, calls = pending_client
    original_scalar = db.scalar

    def scalar_with_missing_registry(statement, *args, **kwargs):
        if "product_uploads" in str(statement):
            raise OperationalError(
                "SELECT count(*) FROM product_uploads",
                {},
                Exception("no such table: product_uploads"),
            )
        return original_scalar(statement, *args, **kwargs)

    monkeypatch.setattr(db, "scalar", scalar_with_missing_registry)
    response = post_png(client)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "UPLOAD_SCHEMA_UNAVAILABLE"
    assert calls["upload"] == []


def test_pending_quota_blocks_seventeenth_upload(pending_client):
    client, db, seller, calls = pending_client
    now = datetime.now(timezone.utc)
    db.add_all(
        ProductUpload(
            user_id=seller.id,
            object_key=f"pending/{number}.png",
            mime_type="image/png",
            file_size=100,
            uploaded_at=now,
            expires_at=now + timedelta(hours=24),
            state="PENDING",
        )
        for number in range(16)
    )
    db.commit()
    response = post_png(client)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "UPLOAD_QUOTA_EXCEEDED"
    assert calls["upload"] == []


def test_storage_sign_failure_cleans_up_and_does_not_create_reference(pending_client, monkeypatch):
    client, db, _, calls = pending_client

    async def unavailable(_path):
        raise HTTPException(status_code=503, detail={"code": "STORAGE_UNAVAILABLE"})

    monkeypatch.setattr(product_uploads, "sign_private_object", unavailable)
    response = post_png(client)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "STORAGE_UNAVAILABLE"
    assert calls["delete"] == [calls["upload"][0][0]]
    assert db.query(ProductUpload).count() == 0


def test_missing_token_returns_401_without_upload(pending_client):
    client, _, _, calls = pending_client
    client.app.dependency_overrides.pop(get_current_user)
    response = post_png(client)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_REQUIRED"
    assert calls["upload"] == []


@pytest.mark.parametrize(
    "filename,content,mime_type,code,status_code",
    [
        ("item.png", b"not a picture", "image/png", "INVALID_IMAGE", 422),
        ("item.webp", image_bytes(), "image/webp", "INVALID_IMAGE", 422),
        ("item.png", "oversized", "image/png", "IMAGE_TOO_LARGE", 413),
    ],
    ids=["fake-image", "webp", "oversized"],
)
def test_bad_files_never_reach_storage(
    pending_client, filename, content, mime_type, code, status_code
):
    client, db, _, calls = pending_client
    if content == "oversized":
        content = b"x" * (5 * 1024 * 1024 + 1)
    response = client.post(
        "/products/images/upload", files={"file": (filename, content, mime_type)}
    )
    assert response.status_code == status_code
    assert response.json()["error"]["code"] == code
    assert calls["upload"] == []
    assert db.query(ProductUpload).count() == 0


def test_multiple_files_are_rejected(pending_client):
    client, _, _, calls = pending_client
    response = client.post(
        "/products/images/upload",
        files=[
            ("file", ("one.png", image_bytes(), "image/png")),
            ("file", ("two.png", image_bytes(), "image/png")),
        ],
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_IMAGE_COUNT"
    assert calls["upload"] == []


def test_public_bucket_is_rejected_before_upload(pending_client, monkeypatch):
    client, db, _, calls = pending_client

    async def public_bucket():
        raise HTTPException(status_code=503, detail={"code": "STORAGE_UNAVAILABLE"})

    monkeypatch.setattr(product_uploads, "require_private_bucket", public_bucket)
    response = post_png(client)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "STORAGE_UNAVAILABLE"
    assert calls["upload"] == []
    assert db.query(ProductUpload).count() == 0


def test_private_bucket_check_rejects_public_bucket(monkeypatch):
    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        product_uploads,
        "storage_config",
        lambda: ("https://example.supabase.co", "sb_secret_example"),
    )

    def handle(request):
        assert request.url.path == "/storage/v1/bucket/product-images"
        return httpx.Response(200, json={"public": True})

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **_kwargs: original_client(transport=httpx.MockTransport(handle)),
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(product_uploads.require_private_bucket())
    assert error.value.status_code == 503


def test_signed_url_uses_private_storage_endpoint(monkeypatch):
    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        product_uploads,
        "storage_config",
        lambda: ("https://example.supabase.co", "sb_secret_example"),
    )

    def handle(request):
        assert request.url.path == "/storage/v1/object/sign/product-images/pending/item.png"
        assert request.content == b'{"expiresIn":300}'
        return httpx.Response(
            200,
            json={"signedURL": "/object/sign/product-images/pending/item.png?token=example"},
        )

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **_kwargs: original_client(transport=httpx.MockTransport(handle)),
    )
    url = asyncio.run(product_uploads.sign_private_object("pending/item.png"))
    assert url == (
        "https://example.supabase.co/storage/v1/object/sign/"
        "product-images/pending/item.png?token=example"
    )
