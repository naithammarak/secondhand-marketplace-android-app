import os
import threading
import time
import uuid
from unittest.mock import patch
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
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
AUTH_TEST_DATABASE_URL = os.getenv("AUTH_TEST_DATABASE_URL")

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


def test_token_issued_slightly_in_future_is_accepted():
    token = make_token({
        "sub": str(uuid.uuid4()),
        "iat": int(time.time()) + 15,
    })
    response = client.post(
        "/auth/google",
        json={"role": "BUYER"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def test_token_issued_far_in_future_is_rejected():
    token = make_token({
        "sub": str(uuid.uuid4()),
        "iat": int(time.time()) + 120,
    })
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "not yet valid (iat)" in response.json()["detail"]


def test_token_invalid_algorithm():
    # Token signed with HS512 while backend expects HS256
    token = make_token(
        {"sub": str(uuid.uuid4())},
        algorithm="HS512",
    )
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "The specified alg value is not allowed" in response.json()["detail"]


def test_es256_token_is_verified_with_supabase_public_key(monkeypatch):
    private_key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "aud": TEST_AUDIENCE,
            "iss": TEST_ISSUER,
            "exp": int(time.time()) + 3600,
            "email": "es256@example.com",
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "test-signing-key"},
    )

    class TestJwksClient:
        def get_signing_key_from_jwt(self, received_token):
            assert received_token == token
            return type("SigningKey", (), {"key": private_key.public_key()})()

    monkeypatch.setattr(auth_module, "SUPABASE_JWT_ALGORITHM", None)
    monkeypatch.delenv("SUPABASE_JWT_ALGORITHM", raising=False)
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_SECRET", None)
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
    monkeypatch.setattr(auth_module, "get_jwks_client", lambda issuer: TestJwksClient())

    response = client.post(
        "/auth/google",
        json={"role": "SELLER"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["email"] == "es256@example.com"
    assert response.json()["role"] == "SELLER"


def test_es256_token_with_wrong_public_key_is_rejected(monkeypatch):
    private_key = ec.generate_private_key(ec.SECP256R1())
    wrong_key = ec.generate_private_key(ec.SECP256R1()).public_key()
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "aud": TEST_AUDIENCE,
            "iss": TEST_ISSUER,
            "exp": int(time.time()) + 3600,
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "test-signing-key"},
    )

    class TestJwksClient:
        def get_signing_key_from_jwt(self, received_token):
            return type("SigningKey", (), {"key": wrong_key})()

    monkeypatch.setattr(auth_module, "SUPABASE_JWT_ALGORITHM", None)
    monkeypatch.delenv("SUPABASE_JWT_ALGORITHM", raising=False)
    monkeypatch.setattr(auth_module, "get_jwks_client", lambda issuer: TestJwksClient())

    response = client.post(
        "/auth/google",
        json={},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401
    assert "Signature verification failed" in response.json()["detail"]


def test_configured_es256_rejects_hs256_token(monkeypatch):
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_ALGORITHM", "ES256")
    token = make_token({"sub": str(uuid.uuid4())})
    response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
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
    assert res_repeat.json()["role"] == "BUYER"

    # 3. เรียกดูโปรไฟล์ตนเอง /me
    res_me = client.get("/auth/me", headers=headers)
    assert res_me.status_code == 200
    assert res_me.json()["supabase_user_id"] == test_uid


def create_user_without_role(name="New User", user_status=UserStatus.ACTIVE):
    test_uid = uuid.uuid4()
    with TestingSessionLocal() as session:
        session.add(User(
            supabase_user_id=test_uid,
            full_name=name,
            email=f"{test_uid}@example.com",
            role=None,
            status=user_status,
        ))
        session.commit()
    token = make_token({"sub": str(test_uid)})
    return test_uid, {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("role", ["BUYER", "SELLER"])
def test_user_without_role_can_select_buyer_or_seller(role):
    test_uid, headers = create_user_without_role("Role Picker")

    response = client.post("/auth/role", json={"role": role}, headers=headers)

    assert response.status_code == 200
    assert response.json()["full_name"] == "Role Picker"
    assert response.json()["role"] == role
    with TestingSessionLocal() as session:
        assert session.query(User).filter_by(supabase_user_id=test_uid).one().role == UserRole(role)


def test_selecting_same_role_is_idempotent_but_different_role_conflicts():
    test_uid, headers = create_user_without_role()
    first = client.post("/auth/role", json={"role": "BUYER"}, headers=headers)
    repeated = client.post("/auth/role", json={"role": "BUYER"}, headers=headers)
    conflict = client.post("/auth/role", json={"role": "SELLER"}, headers=headers)

    assert first.status_code == repeated.status_code == 200
    assert first.json()["id"] == repeated.json()["id"]
    assert conflict.status_code == 409
    with TestingSessionLocal() as session:
        assert session.query(User).filter_by(supabase_user_id=test_uid).one().role == UserRole.BUYER


@pytest.mark.parametrize("user_status", [UserStatus.SUSPENDED, UserStatus.CLOSED])
def test_inactive_user_cannot_select_a_role(user_status):
    test_uid, headers = create_user_without_role(user_status=user_status)

    response = client.post("/auth/role", json={"role": "BUYER"}, headers=headers)

    assert response.status_code == 403
    assert response.json()["detail"] == "Account is not active"
    with TestingSessionLocal() as session:
        assert session.query(User).filter_by(supabase_user_id=test_uid).one().role is None


@pytest.mark.parametrize("body", [
    {"role": "ADMIN"},
    {"role": "INSPECTOR"},
    {"role": None},
    {"role": ""},
    {"role": "UNKNOWN"},
    {},
])
def test_set_role_rejects_unsupported_or_missing_role(body):
    test_uid, headers = create_user_without_role()

    response = client.post("/auth/role", json=body, headers=headers)

    assert response.status_code == 422
    with TestingSessionLocal() as session:
        assert session.query(User).filter_by(supabase_user_id=test_uid).one().role is None


def test_set_role_requires_a_valid_token():
    assert client.post("/auth/role", json={"role": "BUYER"}).status_code in (401, 403)
    response = client.post(
        "/auth/role",
        json={"role": "BUYER"},
        headers={"Authorization": "Bearer invalid"},
    )
    assert response.status_code == 401


@pytest.mark.skipif(
    not AUTH_TEST_DATABASE_URL,
    reason="AUTH_TEST_DATABASE_URL is not set (isolated PostgreSQL required)",
)
def test_different_roles_racing_on_postgresql_have_exactly_one_winner():
    parsed = make_url(AUTH_TEST_DATABASE_URL)
    if parsed.get_backend_name() != "postgresql":
        raise RuntimeError("AUTH_TEST_DATABASE_URL must use PostgreSQL")
    if parsed.host not in {"localhost", "127.0.0.1", "::1"} or "test" not in (parsed.database or ""):
        raise RuntimeError("AUTH_TEST_DATABASE_URL must be an isolated local test database")

    engine = create_engine(AUTH_TEST_DATABASE_URL, pool_size=4)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    test_uid = uuid.uuid4()
    with factory() as session:
        session.add(User(
            supabase_user_id=test_uid,
            full_name="Concurrent Role User",
            email=f"{test_uid}@example.com",
            role=None,
            status=UserStatus.ACTIVE,
        ))
        session.commit()

    def override_get_db():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    headers = {"Authorization": f"Bearer {make_token({'sub': str(test_uid)})}"}
    barrier = threading.Barrier(2)
    responses = [None, None]

    def select_role(index, role):
        barrier.wait()
        with TestClient(app) as thread_client:
            responses[index] = thread_client.post("/auth/role", json={"role": role}, headers=headers)

    threads = [
        threading.Thread(target=select_role, args=(0, "BUYER")),
        threading.Thread(target=select_role, args=(1, "SELLER")),
    ]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        assert all(not thread.is_alive() for thread in threads)
        assert sorted(response.status_code for response in responses) == [200, 409]
        with factory() as session:
            saved_role = session.scalar(select(User.role).where(User.supabase_user_id == test_uid))
            assert saved_role in {UserRole.BUYER, UserRole.SELLER}
            session.query(User).filter(User.supabase_user_id == test_uid).delete()
            session.commit()
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


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
