import uuid
import jwt
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
TEST_SECRET = "test-secret-key-for-jwt-testing-12345"

def make_token(payload: dict) -> str:
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")

def test_missing_token():
    response = client.get("/auth/me")
    assert response.status_code in [401, 403]

def test_invalid_token():
    response = client.get("/auth/me", headers={"Authorization": "Bearer invalidtoken123"})
    assert response.status_code == 401

def test_login_and_me_lifecycle(monkeypatch):
    import app.api.auth as auth_module
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_SECRET", TEST_SECRET)

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

    # 2. Login ซ้ำ (ต้องไม่สร้างซ้ำ)
    res_repeat = client.post("/auth/google", json={"role": "SELLER"}, headers=headers)
    assert res_repeat.status_code == 200
    assert res_repeat.json()["id"] == data["id"]

    # 3. เรียกดูโปรไฟล์ตนเอง /me
    res_me = client.get("/auth/me", headers=headers)
    assert res_me.status_code == 200
    assert res_me.json()["supabase_user_id"] == test_uid