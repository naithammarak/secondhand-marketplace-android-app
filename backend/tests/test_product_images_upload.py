from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.auth import get_current_user
from app.api import product_images
from app.database import get_db
from app.main import app
from app.models.user import UserRole, UserStatus


PNG = b"\x89PNG\r\n\x1a\nexample"


class FakeDb:
    def __init__(self, product=None, fail_commit=False):
        self.product = product
        self.fail_commit = fail_commit
        self.image = None
        self.rolled_back = False

    def get(self, model, product_id):
        return self.product

    def add(self, image):
        self.image = image

    def commit(self):
        if self.fail_commit:
            raise RuntimeError("database unavailable")

    def refresh(self, image):
        image.image_id = 10

    def rollback(self):
        self.rolled_back = True


@pytest.fixture
def upload_client(monkeypatch):
    db = FakeDb(SimpleNamespace(id=1, user_id=7, deleted_at=None))
    user = SimpleNamespace(id=7, role=UserRole.SELLER, status=UserStatus.ACTIVE)
    calls = {"upload": [], "delete": []}

    async def fake_upload(path, content, content_type):
        calls["upload"].append((path, content, content_type))
        return f"https://example.supabase.co/storage/v1/object/public/product-images/{path}"

    async def fake_delete(path):
        calls["delete"].append(path)

    monkeypatch.setattr(product_images, "upload_object", fake_upload)
    monkeypatch.setattr(product_images, "delete_object", fake_delete)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app), db, user, calls
    finally:
        app.dependency_overrides.clear()


def post_image(client, content=PNG, filename="item.png", content_type="image/png"):
    return client.post(
        "/products/1/images",
        files={"file": (filename, content, content_type)},
    )


def test_upload_saves_image_metadata(upload_client):
    client, db, _, calls = upload_client
    response = post_image(client)
    assert response.status_code == 201
    assert response.json()["image_id"] == 10
    assert response.json()["product_id"] == 1
    assert response.json()["image_url"].startswith("https://example.supabase.co/")
    assert db.image.file_size == len(PNG)
    assert db.image.photo_type == "image/png"
    assert calls["upload"][0][0].startswith("1/")
    assert calls["upload"][0][0].endswith(".png")


def test_other_seller_cannot_upload(upload_client):
    client, db, _, calls = upload_client
    db.product.user_id = 8
    assert post_image(client).status_code == 403
    assert calls["upload"] == []


def test_missing_product_cannot_upload(upload_client):
    client, db, _, calls = upload_client
    db.product = None
    assert post_image(client).status_code == 404
    assert calls["upload"] == []


def test_invalid_image_never_reaches_storage(upload_client):
    client, _, _, calls = upload_client
    assert post_image(client, b"bad").status_code == 415
    assert calls["upload"] == []


def test_oversized_image_never_reaches_storage(upload_client):
    client, _, _, calls = upload_client
    oversized = PNG + b"x" * (5 * 1024 * 1024)
    assert post_image(client, oversized).status_code == 413
    assert calls["upload"] == []


def test_buyer_cannot_upload(upload_client):
    client, _, user, calls = upload_client
    user.role = UserRole.BUYER
    assert post_image(client).status_code == 403
    assert calls["upload"] == []


def test_failed_database_save_removes_uploaded_object(upload_client):
    client, db, _, calls = upload_client
    db.fail_commit = True
    response = post_image(client)
    assert response.status_code == 500
    assert db.rolled_back
    assert calls["delete"] == [calls["upload"][0][0]]


def test_upload_endpoint_is_in_openapi(upload_client):
    client, _, _, _ = upload_client
    paths = client.get("/openapi.json").json()["paths"]
    assert "/products/{product_id}/images" in paths
    assert "/products/{product_id}/images/preview" not in paths


def test_storage_headers_use_the_correct_key_format():
    assert product_images.storage_headers("sb_secret_example") == {"apikey": "sb_secret_example"}
    assert product_images.storage_headers("legacy-jwt") == {
        "apikey": "legacy-jwt",
        "Authorization": "Bearer legacy-jwt",
    }
