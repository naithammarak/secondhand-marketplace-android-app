from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_check_returns_ok():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_auth_router_is_registered():
    route_paths = app.openapi()["paths"]

    assert "/auth/google" in route_paths
