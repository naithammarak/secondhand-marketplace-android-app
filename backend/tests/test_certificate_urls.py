"""Deployment origin is validated before serving requests."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.certificate_urls import public_certificate_base_url


@pytest.mark.parametrize("value", [
    "", "http://cert.example.test", "https://user:pass@cert.example.test",
    "https://cert.example.test/path", "https://cert.example.test?next=evil",
    "https://cert.example.test#fragment", "https://cert.example.test:invalid",
    "https://cert.example.test:0",
    " https://cert.example.test", "https://cert.example.test\\@evil.test",
])
def test_bad_origin_stops_app_startup(monkeypatch, value):
    monkeypatch.setenv("PUBLIC_CERTIFICATE_BASE_URL", value)
    with pytest.raises(ValueError, match="PUBLIC_CERTIFICATE_BASE_URL must be an HTTPS origin"):
        with TestClient(app):
            pytest.fail("Invalid certificate origin reached request handling")


def test_missing_origin_stops_app_startup(monkeypatch):
    monkeypatch.delenv("PUBLIC_CERTIFICATE_BASE_URL", raising=False)
    with pytest.raises(ValueError, match="PUBLIC_CERTIFICATE_BASE_URL must be an HTTPS origin"):
        with TestClient(app):
            pytest.fail("Missing certificate origin reached request handling")


def test_https_origin_works_without_host_header(monkeypatch):
    monkeypatch.setenv("PUBLIC_CERTIFICATE_BASE_URL", "https://cert.example.test:8443/")
    assert public_certificate_base_url() == "https://cert.example.test:8443"
    with TestClient(app) as client:
        assert client.get("/health", headers={"Host": "attacker.test"}).status_code == 200
