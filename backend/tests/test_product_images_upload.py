import asyncio
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from threading import Lock
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from app.api import product_images
from app import database
from app.api.auth import get_current_user
from app.database import get_db
from app.main import app
from app.models.product import Product
from app.models.user import UserRole, UserStatus


def make_image(image_format):
    output = BytesIO()
    Image.new("RGB", (4, 4), "red").save(output, format=image_format)
    content = output.getvalue()
    with Image.open(BytesIO(content)) as image:
        image.load()
        assert image.format == image_format
    return content


PNG = make_image("PNG")
JPEG = make_image("JPEG")


class FakeStore:
    def __init__(self):
        self.product = SimpleNamespace(id=1, user_id=7, deleted_at=None)
        self.initial_count = 0
        self.images = []
        self.lock = Lock()
        self.sessions = []
        self.fail_flush = False
        self.fail_commit = False
        self.commit_saves_then_raises = False
        self.commit_raises_http = False


class FakeQuery:
    def __init__(self, db, model):
        self.db = db
        self.model = model

    def filter(self, criterion):
        return self

    def with_for_update(self):
        self.db.for_update_called = True
        return self

    def populate_existing(self):
        return self

    def one_or_none(self):
        assert self.model is Product
        assert self.db.for_update_called
        self.db.store.lock.acquire()
        self.db.lock_held = True
        return self.db.store.product

    def scalar(self):
        assert self.db.lock_held
        return self.db.store.initial_count + len(self.db.store.images)


class FakeDb:
    def __init__(self, store):
        self.store = store
        self.pending = None
        self.lock_held = False
        self.for_update_called = False
        self.rolled_back = False
        store.sessions.append(self)

    def get(self, model, product_id):
        assert model is Product
        return self.store.product

    def query(self, model):
        return FakeQuery(self, model)

    def add(self, image):
        self.pending = image

    def flush(self):
        if self.store.fail_flush:
            raise RuntimeError("database flush failed")
        self.pending.image_id = self.store.initial_count + len(self.store.images) + 1

    def commit(self):
        if self.store.commit_raises_http:
            raise HTTPException(status_code=502, detail="database proxy failure")
        if self.store.fail_commit:
            raise RuntimeError("database commit failed")
        self.store.images.append(self.pending)
        self._unlock()
        if self.store.commit_saves_then_raises:
            raise RuntimeError("commit acknowledgement lost")

    def rollback(self):
        self.rolled_back = True
        self.pending = None
        self._unlock()

    def _unlock(self):
        if self.lock_held:
            self.lock_held = False
            self.store.lock.release()


@pytest.fixture
def upload_client(monkeypatch):
    store = FakeStore()
    user = SimpleNamespace(id=7, role=UserRole.SELLER, status=UserStatus.ACTIVE)
    calls = {"upload": [], "delete": [], "objects": set()}

    async def fake_upload(path, content, content_type):
        calls["upload"].append((path, content, content_type))
        calls["objects"].add(path)
        return f"https://example.supabase.co/storage/v1/object/public/product-images/{path}"

    async def fake_delete(path):
        calls["delete"].append(path)
        calls["objects"].discard(path)

    monkeypatch.setattr(product_images, "upload_object", fake_upload)
    monkeypatch.setattr(product_images, "delete_object", fake_delete)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: FakeDb(store)
    try:
        yield TestClient(app), store, user, calls
    finally:
        app.dependency_overrides.clear()


def post_image(client, content=PNG, filename="item.png", content_type="image/png"):
    return client.post(
        "/products/1/images",
        files={"file": (filename, content, content_type)},
    )


@pytest.mark.parametrize(
    ("content", "filename", "content_type", "expected_type", "extension"),
    [
        (PNG, "item.png", "image/png", "image/png", ".png"),
        (JPEG, "item.jpeg", "image/jpeg", "image/jpeg", ".jpg"),
    ],
)
def test_upload_saves_decoded_image_metadata(
    upload_client, content, filename, content_type, expected_type, extension
):
    client, store, _, calls = upload_client
    response = post_image(client, content, filename, content_type)
    assert response.status_code == 201
    assert response.json()["image_id"] == 1
    assert response.json()["product_id"] == 1
    assert response.json()["image_url"].startswith("https://example.supabase.co/")
    assert store.images[0].file_size == len(content)
    assert store.images[0].photo_type == expected_type
    assert calls["upload"][0][0].startswith("1/")
    assert calls["upload"][0][0].endswith(extension)
    assert store.sessions[0].for_update_called


def test_tenth_image_succeeds_and_eleventh_is_rejected(upload_client):
    client, store, _, calls = upload_client
    store.initial_count = 9
    assert post_image(client).status_code == 201
    response = post_image(client)
    assert response.status_code == 409
    assert response.json()["detail"] == "Product already has 10 images"
    assert len(calls["upload"]) == 1
    assert store.initial_count + len(store.images) == 10


def test_concurrent_requests_cannot_both_take_the_tenth_slot(upload_client, monkeypatch):
    client, store, _, calls = upload_client
    store.initial_count = 9
    original_upload = product_images.upload_object

    async def slow_upload(path, content, content_type):
        await asyncio.sleep(0.1)
        return await original_upload(path, content, content_type)

    monkeypatch.setattr(product_images, "upload_object", slow_upload)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: post_image(client), range(2)))
    assert sorted(response.status_code for response in responses) == [201, 409]
    assert len(calls["upload"]) == 1
    assert store.initial_count + len(store.images) == 10


@pytest.mark.parametrize(
    ("content", "filename", "content_type", "expected_status"),
    [
        (b"", "item.png", "image/png", 400),
        (b"not an image", "item.png", "image/png", 415),
        (b"\x89PNG\r\n\x1a\n" + b"broken", "item.png", "image/png", 415),
        (b"\xff\xd8\xff" + b"broken", "item.jpg", "image/jpeg", 415),
        (PNG[:24], "item.png", "image/png", 415),
        (PNG, "item.jpg", "image/jpeg", 415),
        (PNG, "item.jpg", "image/png", 415),
        (PNG, "item.png", "text/plain", 415),
        (PNG + b"x" * (5 * 1024 * 1024), "item.png", "image/png", 413),
    ],
    ids=[
        "empty", "fake", "broken-png", "broken-jpeg", "truncated-png",
        "mime-mismatch", "extension-mismatch", "unsupported-mime", "oversized",
    ],
)
def test_invalid_images_never_reach_storage(
    upload_client, content, filename, content_type, expected_status
):
    client, store, _, calls = upload_client
    assert post_image(client, content, filename, content_type).status_code == expected_status
    assert calls["upload"] == []
    assert store.images == []


def test_other_seller_cannot_upload(upload_client):
    client, store, _, calls = upload_client
    store.product.user_id = 8
    assert post_image(client).status_code == 403
    assert calls["upload"] == []


def test_missing_or_deleted_product_cannot_upload(upload_client):
    client, store, _, calls = upload_client
    store.product = None
    assert post_image(client).status_code == 404
    store.product = SimpleNamespace(id=1, user_id=7, deleted_at="deleted")
    assert post_image(client).status_code == 404
    assert calls["upload"] == []


@pytest.mark.parametrize("role,status", [(UserRole.BUYER, UserStatus.ACTIVE), (UserRole.SELLER, UserStatus.SUSPENDED)])
def test_only_active_seller_can_upload(upload_client, role, status):
    client, _, user, calls = upload_client
    user.role = role
    user.status = status
    assert post_image(client).status_code == 403
    assert calls["upload"] == []


def test_storage_failure_attempts_compensation_without_database_row(upload_client, monkeypatch):
    client, store, _, calls = upload_client

    async def uncertain_upload(path, content, content_type):
        calls["upload"].append(path)
        calls["objects"].add(path)
        raise HTTPException(status_code=502, detail="Could not upload product image")

    monkeypatch.setattr(product_images, "upload_object", uncertain_upload)
    response = post_image(client)
    assert response.status_code == 502
    assert response.json()["detail"] == "Could not upload product image"
    assert calls["delete"] == calls["upload"]
    assert calls["objects"] == set()
    assert store.images == []


def test_database_flush_failure_rolls_back_and_removes_uploaded_object(upload_client):
    client, store, _, calls = upload_client
    store.fail_flush = True
    response = post_image(client)
    assert response.status_code == 500
    assert response.json()["detail"] == "Could not save product image"
    assert store.sessions[0].rolled_back
    assert store.images == []
    assert calls["delete"] == [calls["upload"][0][0]]
    assert calls["objects"] == set()


def test_commit_with_lost_ack_returns_success_without_deleting_saved_object(
    upload_client, monkeypatch
):
    client, store, _, calls = upload_client
    store.commit_saves_then_raises = True

    def find_saved_image(product_id, image_id, image_url):
        return any(
            image.product_id == product_id
            and image.image_id == image_id
            and image.image_url == image_url
            for image in store.images
        )

    monkeypatch.setattr(product_images, "committed_image_exists", find_saved_image)
    response = post_image(client)
    assert response.status_code == 201
    assert response.json()["image_id"] == store.images[0].image_id
    assert store.sessions[0].rolled_back
    assert calls["delete"] == []
    assert calls["objects"] == {calls["upload"][0][0]}


def test_unconfirmed_commit_preserves_object_for_reconciliation(
    upload_client, monkeypatch, caplog
):
    client, store, _, calls = upload_client
    store.fail_commit = True
    monkeypatch.setattr(product_images, "committed_image_exists", lambda *args: False)
    response = post_image(client)
    assert response.status_code == 500
    assert response.json()["detail"] == "Could not save product image"
    assert store.images == []
    assert calls["delete"] == []
    assert calls["objects"] == {calls["upload"][0][0]}
    assert calls["upload"][0][0] in caplog.text
    assert calls["upload"][0][0] not in response.text


def test_failed_commit_outcome_check_never_deletes_object(
    upload_client, monkeypatch, caplog
):
    client, store, _, calls = upload_client
    store.fail_commit = True

    def unavailable(*args):
        raise RuntimeError("inspection database unavailable")

    monkeypatch.setattr(product_images, "committed_image_exists", unavailable)
    response = post_image(client)
    assert response.status_code == 500
    assert calls["delete"] == []
    assert calls["objects"] == {calls["upload"][0][0]}
    assert "commit outcome check failed" in caplog.text
    assert calls["upload"][0][0] not in response.text


def test_http_error_during_commit_never_triggers_storage_deletion(
    upload_client, monkeypatch
):
    client, store, _, calls = upload_client
    store.commit_raises_http = True
    monkeypatch.setattr(product_images, "committed_image_exists", lambda *args: False)
    response = post_image(client)
    assert response.status_code == 500
    assert response.json()["detail"] == "Could not save product image"
    assert calls["delete"] == []
    assert calls["objects"] == {calls["upload"][0][0]}


def test_commit_outcome_check_uses_fresh_session_and_exact_image_key(monkeypatch):
    checked = []

    class InspectionDb:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            checked.append("closed")

        def get(self, model, key):
            checked.append((model, key))
            return SimpleNamespace(image_url="https://example.invalid/exact.png")

    monkeypatch.setattr(database, "SessionLocal", InspectionDb)
    assert product_images.committed_image_exists(
        1, 25, "https://example.invalid/exact.png"
    )
    assert not product_images.committed_image_exists(
        1, 25, "https://example.invalid/other.png"
    )
    assert checked[0] == (product_images.ProductImage, (1, 25))
    assert checked.count("closed") == 2


def test_failed_compensation_is_logged_and_response_stays_safe(
    upload_client, monkeypatch, caplog
):
    client, store, _, calls = upload_client
    store.fail_flush = True

    async def failed_delete(path):
        calls["delete"].append(path)
        raise httpx.HTTPStatusError(
            "Storage unavailable",
            request=httpx.Request("DELETE", "https://example.supabase.co/storage/v1/object/product-images"),
            response=httpx.Response(503),
        )

    monkeypatch.setattr(product_images, "delete_object", failed_delete)
    response = post_image(client)
    assert response.status_code == 500
    assert store.images == []
    assert calls["objects"] == {calls["upload"][0][0]}
    assert calls["upload"][0][0] in caplog.text
    assert "orphan cleanup failed" in caplog.text
    assert calls["upload"][0][0] not in response.text


def test_storage_delete_checks_http_status(monkeypatch):
    original_client = httpx.AsyncClient
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(503)

    monkeypatch.setattr(product_images, "storage_config", lambda: ("https://example.supabase.co", "sb_secret_example"))
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kwargs: original_client(transport=httpx.MockTransport(handle)),
    )
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(product_images.delete_object("1/example.png"))
    assert requests[0].method == "DELETE"
    assert requests[0].url.path == "/storage/v1/object/product-images"
    assert b"1/example.png" in requests[0].content


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
