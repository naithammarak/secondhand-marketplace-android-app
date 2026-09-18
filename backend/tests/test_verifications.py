import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.api.auth as auth_module
from app.api.verifications import id_card_storage_dependency
from app.database import Base, get_db
from app.main import app
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification
from app.services.id_card_storage import StorageUploadError

client = TestClient(app)

TEST_SECRET = "test-secret-key-for-jwt-testing-12345678901234567890"
TEST_AUDIENCE = "authenticated"
TEST_ISSUER = "https://hzromkehaftcfthhrunm.supabase.co/auth/v1"

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 64

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


class FakeStorage:
    def __init__(self, error: Exception | None = None):
        self.uploads: list[tuple[int, bytes, str]] = []
        self.removed: list[str] = []
        self.error = error

    def upload(self, user_id: int, content: bytes, content_type: str) -> str:
        if self.error:
            raise self.error
        self.uploads.append((user_id, content, content_type))
        return f"seller-verifications/{user_id}/card-{len(self.uploads)}.png"

    def remove(self, stored_path: str) -> None:
        self.removed.append(stored_path)


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
    app.dependency_overrides.pop(id_card_storage_dependency, None)
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def storage():
    fake = FakeStorage()
    app.dependency_overrides[id_card_storage_dependency] = lambda: fake
    return fake


def make_token(sub: str) -> str:
    return jwt.encode(
        {"sub": sub, "aud": TEST_AUDIENCE, "iss": TEST_ISSUER, "exp": int(time.time()) + 3600},
        TEST_SECRET,
        algorithm="HS256",
    )


def create_user(role: UserRole | None = UserRole.SELLER, status: UserStatus = UserStatus.ACTIVE):
    supabase_uid = uuid.uuid4()
    db = TestingSessionLocal()
    try:
        user = User(
            supabase_user_id=supabase_uid,
            full_name="Seller Test",
            email=f"{supabase_uid}@example.test",
            role=role,
            status=status,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id
    finally:
        db.close()
    return user_id, {"Authorization": f"Bearer {make_token(str(supabase_uid))}"}


def add_verification(user_id: int, status: str, reject_reason: str | None = None) -> int:
    db = TestingSessionLocal()
    try:
        record = Verification(
            user_id=user_id,
            id_card_image_url="seller-verifications/existing.png",
            bank_account_name="ผู้ขาย ทดสอบ",
            bank_account_number="1234567890",
            bank_name="ธนาคารทดสอบ",
            verification_status=status,
            reject_reason=reject_reason,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record.id
    finally:
        db.close()


def submit(headers, storage_file=("card.png", PNG_BYTES, "image/png"), **fields):
    data = {
        "bank_name": "ธนาคารทดสอบ",
        "bank_account_name": "ผู้ขาย ทดสอบ",
        "bank_account_number": "123-4-56789-0",
    }
    data.update(fields)
    data = {key: value for key, value in data.items() if value is not None}
    files = {"id_card_image": storage_file} if storage_file else None
    return client.post("/verifications", data=data, files=files, headers=headers)


def test_requires_authentication():
    assert client.get("/verifications/me").status_code in [401, 403]


def test_buyer_cannot_read_or_submit(storage):
    _, headers = create_user(role=UserRole.BUYER)
    assert client.get("/verifications/me", headers=headers).status_code == 403
    assert submit(headers).status_code == 403


def test_seller_without_request_sees_not_submitted(storage):
    _, headers = create_user()
    response = client.get("/verifications/me", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "NOT_SUBMITTED"
    assert body["can_submit"] is True
    assert body["id"] is None


def test_submit_stores_request_as_pending_without_returning_id_card(storage):
    user_id, headers = create_user()
    response = submit(headers)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "PENDING"
    assert body["can_submit"] is False
    assert body["bank_account_last4"] == "7890"
    assert "id_card_image_url" not in body
    assert storage.uploads == [(user_id, PNG_BYTES, "image/png")]

    db = TestingSessionLocal()
    try:
        record = db.query(Verification).one()
        # เก็บเฉพาะตัวเลขบัญชี และ path ของรูปใน storage เท่านั้น
        assert record.bank_account_number == "1234567890"
        assert record.id_card_image_url.startswith("seller-verifications/")
        assert record.purge_at is not None
    finally:
        db.close()


def test_status_survives_a_new_client_session(storage):
    _, headers = create_user()
    submit(headers)
    # จำลองการเปิดแอปใหม่: อ่านสถานะจาก backend อีกครั้งด้วย token เดิม
    body = client.get("/verifications/me", headers=headers).json()
    assert body["status"] == "PENDING"
    assert body["bank_name"] == "ธนาคารทดสอบ"


def test_each_seller_only_sees_their_own_request(storage):
    first_user, first_headers = create_user()
    add_verification(first_user, "APPROVED")
    _, second_headers = create_user()
    assert client.get("/verifications/me", headers=second_headers).json()["status"] == "NOT_SUBMITTED"
    assert client.get("/verifications/me", headers=first_headers).json()["status"] == "APPROVED"


@pytest.mark.parametrize(
    "field,value,expected_key",
    [
        ("bank_name", "", "bank_name"),
        ("bank_account_name", " ", "bank_account_name"),
        ("bank_account_number", "", "bank_account_number"),
        ("bank_account_number", "12345", "bank_account_number"),
        ("bank_account_number", "12345678901234567890", "bank_account_number"),
        ("bank_account_number", "abcdefghij", "bank_account_number"),
    ],
)
def test_invalid_fields_are_reported_per_field(storage, field, value, expected_key):
    _, headers = create_user()
    response = submit(headers, **{field: value})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "validation_error"
    assert expected_key in detail["fields"]
    assert storage.uploads == []


def test_all_missing_fields_are_reported_together(storage):
    _, headers = create_user()
    response = submit(
        headers,
        storage_file=None,
        bank_name="",
        bank_account_name="",
        bank_account_number="",
    )
    assert response.status_code == 422
    assert set(response.json()["detail"]["fields"]) == {
        "bank_name",
        "bank_account_name",
        "bank_account_number",
        "id_card_image",
    }


def test_rejects_non_image_and_mismatched_uploads(storage):
    _, headers = create_user()
    pdf = submit(headers, storage_file=("card.pdf", b"%PDF-1.7", "application/pdf"))
    assert pdf.status_code == 422
    assert "id_card_image" in pdf.json()["detail"]["fields"]

    disguised = submit(headers, storage_file=("card.png", b"%PDF-1.7 not an image", "image/png"))
    assert disguised.status_code == 422
    assert "id_card_image" in disguised.json()["detail"]["fields"]

    oversized = submit(headers, storage_file=("card.png", PNG_BYTES + b"0" * (5 * 1024 * 1024), "image/png"))
    assert oversized.status_code == 422
    assert "id_card_image" in oversized.json()["detail"]["fields"]
    assert storage.uploads == []


def test_second_submit_while_pending_is_rejected(storage):
    _, headers = create_user()
    assert submit(headers).status_code == 201
    repeat = submit(headers)
    assert repeat.status_code == 409
    assert repeat.json()["detail"]["code"] == "already_submitted"
    assert len(storage.uploads) == 1


def test_submit_after_approval_is_rejected(storage):
    user_id, headers = create_user()
    add_verification(user_id, "APPROVED")
    assert submit(headers).status_code == 409


def test_rejected_request_exposes_reason_and_allows_resubmission(storage):
    user_id, headers = create_user()
    add_verification(user_id, "REJECTED", reject_reason="รูปบัตรไม่ชัด")
    body = client.get("/verifications/me", headers=headers).json()
    assert body["status"] == "REJECTED"
    assert body["reject_reason"] == "รูปบัตรไม่ชัด"
    assert body["can_submit"] is True

    resubmitted = submit(headers)
    assert resubmitted.status_code == 201
    assert resubmitted.json()["status"] == "PENDING"
    assert client.get("/verifications/me", headers=headers).json()["reject_reason"] is None


def test_concurrent_pending_rows_are_blocked_by_the_database(storage):
    user_id, headers = create_user()
    add_verification(user_id, "PENDING")
    db = TestingSessionLocal()
    try:
        # ดัชนีเฉพาะกันคำขอที่รอตรวจซ้ำ แม้เลี่ยงการตรวจในชั้น API
        duplicate = Verification(
            user_id=user_id,
            id_card_image_url="seller-verifications/dup.png",
            bank_account_name="ผู้ขาย ทดสอบ",
            bank_account_number="1234567890",
            bank_name="ธนาคารทดสอบ",
            verification_status="PENDING",
        )
        db.add(duplicate)
        with pytest.raises(Exception):
            db.commit()
    finally:
        db.rollback()
        db.close()


def test_storage_failure_does_not_create_a_request():
    _, headers = create_user()
    failing = FakeStorage(error=StorageUploadError("boom"))
    app.dependency_overrides[id_card_storage_dependency] = lambda: failing
    response = submit(headers)
    assert response.status_code == 502
    assert "boom" not in response.text
    db = TestingSessionLocal()
    try:
        assert db.query(Verification).count() == 0
    finally:
        db.close()


def test_suspended_seller_cannot_submit(storage):
    _, headers = create_user(status=UserStatus.SUSPENDED)
    assert submit(headers).status_code == 403
    assert storage.uploads == []


WEBP_BYTES = b"RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00" + b"\x00" * 24
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 32


def test_webp_image_upload_is_accepted(storage):
    _, headers = create_user()
    response = submit(headers, storage_file=("card.webp", WEBP_BYTES, "image/webp"))
    assert response.status_code == 201
    assert len(storage.uploads) == 1
    assert storage.uploads[0][2] == "image/webp"


def test_jpg_content_type_is_normalized_and_accepted(storage):
    _, headers = create_user()
    response = submit(headers, storage_file=("card.jpg", JPEG_BYTES, "image/jpg"))
    assert response.status_code == 201
    assert len(storage.uploads) == 1
    assert storage.uploads[0][2] == "image/jpeg"


def test_boundary_name_lengths(storage):
    _, headers = create_user()
    # 2 chars accepted
    r1 = submit(headers, bank_name="KB", bank_account_name="AB")
    assert r1.status_code == 201

    # 1 char rejected
    _, h2 = create_user()
    r2 = submit(h2, bank_name="K")
    assert r2.status_code == 422
    assert "bank_name" in r2.json()["detail"]["fields"]

    # 255 chars accepted
    _, h3 = create_user()
    r3 = submit(h3, bank_name="B" * 255, bank_account_name="A" * 255)
    assert r3.status_code == 201

    # 256 chars rejected
    _, h4 = create_user()
    r4 = submit(h4, bank_name="B" * 256)
    assert r4.status_code == 422
    assert "bank_name" in r4.json()["detail"]["fields"]


def test_boundary_account_number_digits(storage):
    # 10 digits accepted
    _, h1 = create_user()
    r1 = submit(h1, bank_account_number="1234567890")
    assert r1.status_code == 201

    # 15 digits accepted
    _, h2 = create_user()
    r2 = submit(h2, bank_account_number="123456789012345")
    assert r2.status_code == 201

    # 9 digits rejected
    _, h3 = create_user()
    r3 = submit(h3, bank_account_number="123456789")
    assert r3.status_code == 422
    assert "bank_account_number" in r3.json()["detail"]["fields"]

    # 16 digits rejected
    _, h4 = create_user()
    r4 = submit(h4, bank_account_number="1234567890123456")
    assert r4.status_code == 422
    assert "bank_account_number" in r4.json()["detail"]["fields"]


def test_data_minimization_contract(storage):
    _, headers = create_user()
    response = submit(headers, bank_account_number="1234567890")
    assert response.status_code == 201
    body = response.json()
    assert "bank_account_number" not in body
    assert "id_card_image_url" not in body
    assert "document" not in body
    assert body["bank_account_last4"] == "7890"

    me = client.get("/verifications/me", headers=headers)
    assert me.status_code == 200
    me_body = me.json()
    assert "bank_account_number" not in me_body
    assert "id_card_image_url" not in me_body
    assert me_body["bank_account_last4"] == "7890"


def test_seller_cannot_access_admin_verifications():
    _, headers = create_user(role=UserRole.SELLER)
    assert client.get("/admin/verifications", headers=headers).status_code == 403
    assert client.get("/admin/verifications/1", headers=headers).status_code == 403
    assert client.get("/admin/verifications/1/id-card", headers=headers).status_code == 403
