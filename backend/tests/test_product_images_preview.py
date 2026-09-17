from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.auth import get_current_user
from app.main import app
from app.models.user import UserRole, UserStatus


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        role=UserRole.SELLER, status=UserStatus.ACTIVE
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def upload(client, filename: str, content: bytes, content_type: str):
    return client.post(
        "/products/1/images/preview",
        files={"file": (filename, content, content_type)},
    )


def test_valid_jpeg_is_checked_but_not_saved(client):
    response = upload(client, "item.jpg", b"\xff\xd8\xffexample", "image/jpeg")
    assert response.status_code == 200
    assert response.json()["stored"] is False


def test_valid_png_is_checked_but_not_saved(client):
    response = upload(client, "item.png", b"\x89PNG\r\n\x1a\nexample", "image/png")
    assert response.status_code == 200
    assert response.json()["stored"] is False
    assert response.json()["status"] == "validated_only"


@pytest.mark.parametrize(
    ("filename", "content", "content_type", "expected_status"),
    [
        ("item.txt", b"hello", "text/plain", 415),
        ("item.webp", b"RIFFxxxxWEBPexample", "image/webp", 415),
        ("item.png", b"not an image", "image/png", 415),
        ("item.png", b"", "image/png", 400),
    ],
)
def test_rejects_invalid_uploads(client, filename, content, content_type, expected_status):
    assert upload(client, filename, content, content_type).status_code == expected_status


def test_rejects_oversized_image(client):
    content = b"\x89PNG\r\n\x1a\n" + b"a" * (5 * 1024 * 1024 + 1)
    assert upload(client, "item.png", content, "image/png").status_code == 413


def test_rejects_buyer(client):
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        role=UserRole.BUYER, status=UserStatus.ACTIVE
    )
    assert upload(client, "item.png", b"\x89PNG\r\n\x1a\nexample", "image/png").status_code == 403


def test_preview_is_in_main_openapi(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert "/products/{product_id}/images/preview" in paths
