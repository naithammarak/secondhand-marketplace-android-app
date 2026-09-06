import os
import time
import uuid
from unittest.mock import patch
import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.api.auth as auth_module
from app.database import Base, get_db
from app.main import app
from app.models.user import User, UserRole, UserStatus

client = TestClient(app)

TEST_SECRET = "test-secret-key-for-jwt-testing-12345678901234567890"
TEST_AUDIENCE = "authenticated"
TEST_ISSUER = "https://hzromkehaftcfthhrunm.supabase.co/auth/v1"

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(autouse=True)
def setup_auth_env(monkeypatch):
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_SECRET", TEST_SECRET)
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_AUDIENCE", TEST_AUDIENCE)
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_ISSUER", TEST_ISSUER)
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_ALGORITHM", "HS256")


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=test_engine)


def make_token(payload: dict, secret: str = TEST_SECRET, algorithm: str = "HS256") -> str:
    default_payload = {
        "aud": TEST_AUDIENCE,
        "iss": TEST_ISSUER,
        "exp": int(time.time()) + 3600,
    }
    default_payload.update(payload)
    return jwt.encode(default_payload, secret, algorithm=algorithm)


def test_missing_token():
    response = client.get("/auth/me")
    assert response.status_code in [401, 403]


def test_invalid_token():
    response = client.get("/auth/me", headers={"Authorization": "Bearer invalidtoken123"})
    assert response.status_code == 401


def test_token_invalid_audience():
    token = make_token({
        "sub": str(uuid.uuid4()),
        "aud": "wrong_audience",
    })
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "Audience doesn't match" in response.json()["detail"]


def test_token_invalid_issuer():
    token = make_token({
        "sub": str(uuid.uuid4()),
        "iss": "https://other-project.supabase.co/auth/v1",
    })
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "Invalid issuer" in response.json()["detail"]


def test_token_expired():
    token = make_token({
        "sub": str(uuid.uuid4()),
        "exp": int(time.time()) - 3600,
    })
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Token has expired"


def test_token_invalid_algorithm():
    # Token signed with HS512 while backend expects HS256
    token = make_token(
        {"sub": str(uuid.uuid4())},
        algorithm="HS512",
    )
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "The specified alg value is not allowed" in response.json()["detail"]


def test_missing_secret_returns_500(monkeypatch):
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_SECRET", None)
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
    response = client.get("/auth/me", headers={"Authorization": "Bearer anytoken"})
    assert response.status_code == 500
    assert "SUPABASE_JWT_SECRET is missing" in response.json()["detail"]


def test_placeholder_secret_returns_500(monkeypatch):
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_SECRET", "YOUR_SUPABASE_JWT_SECRET")
    response = client.get("/auth/me", headers={"Authorization": "Bearer anytoken"})
    assert response.status_code == 500
    assert "placeholder" in response.json()["detail"]


def test_missing_issuer_returns_500(monkeypatch):
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_ISSUER", None)
    monkeypatch.delenv("SUPABASE_JWT_ISSUER", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_PROJECT_REF", raising=False)
    response = client.get("/auth/me", headers={"Authorization": "Bearer anytoken"})
    assert response.status_code == 500
    assert "SUPABASE_JWT_ISSUER" in response.json()["detail"]


def test_missing_audience_returns_500(monkeypatch):
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_AUDIENCE", None)
    monkeypatch.delenv("SUPABASE_JWT_AUDIENCE", raising=False)
    response = client.get("/auth/me", headers={"Authorization": "Bearer anytoken"})
    assert response.status_code == 500
    assert "SUPABASE_JWT_AUDIENCE is missing" in response.json()["detail"]


def test_login_and_me_lifecycle():
    test_uid = str(uuid.uuid4())
    token = make_token({
        "sub": test_uid,
        "email": "testuser@example.com",
        "user_metadata": {"full_name": "Test Lifecycle User"}
    })
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Login ครั้งแรก (สร้าง user)
    res_login = client.post("/auth/google", json={"role": "BUYER"}, headers=headers)
    assert res_login.status_code == 200
    data = res_login.json()
    assert data["email"] == "testuser@example.com"
    assert data["role"] == "BUYER"
    assert data["supabase_user_id"] == test_uid

    # Verify user exists in test db (isolated from shared Supabase)
    with TestingSessionLocal() as session:
        saved_user = session.query(User).filter(User.supabase_user_id == uuid.UUID(test_uid)).first()
        assert saved_user is not None
        assert saved_user.email == "testuser@example.com"

    # 2. Login ซ้ำ (ต้องไม่สร้างซ้ำ)
    res_repeat = client.post("/auth/google", json={"role": "SELLER"}, headers=headers)
    assert res_repeat.status_code == 200
    assert res_repeat.json()["id"] == data["id"]

    # 3. เรียกดูโปรไฟล์ตนเอง /me
    res_me = client.get("/auth/me", headers=headers)
    assert res_me.status_code == 200
    assert res_me.json()["supabase_user_id"] == test_uid


def test_first_login_concurrent_race_condition():
    test_uid = str(uuid.uuid4())
    token = make_token({
        "sub": test_uid,
        "email": "race@example.com",
        "user_metadata": {"full_name": "Race User"},
    })
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Pre-insert the user into the database as if Request A just committed it
    with TestingSessionLocal() as session:
        session.add(
            User(
                supabase_user_id=uuid.UUID(test_uid),
                full_name="Concurrent User",
                email="race@example.com",
                role=UserRole.BUYER,
                status=UserStatus.ACTIVE,
            )
        )
        session.commit()

    # 2. Simulate Request B querying at the same time: its first query sees None,
    # then tries to INSERT, hitting an IntegrityError on unique constraint.
    from sqlalchemy.orm import Query

    orig_first = Query.first
    query_count = 0

    def mock_first(q_self):
        nonlocal query_count
        query_count += 1
        if query_count == 1:
            return None
        return orig_first(q_self)

    with patch.object(Query, "first", autospec=True, side_effect=mock_first):
        response = client.post("/auth/google", json={"role": "BUYER"}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["supabase_user_id"] == test_uid
        assert data["full_name"] == "Concurrent User"