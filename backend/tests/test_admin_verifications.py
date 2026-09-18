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
from app.services.id_card_storage import StorageSignError

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


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 64


class FakeStorage:
    def __init__(self, error: Exception | None = None):
        self.signed: list[tuple[str, int]] = []
        self.uploads: list[int] = []
        self.error = error

    def upload(self, user_id: int, content: bytes, content_type: str) -> str:
        self.uploads.append(user_id)
        return f"seller-verifications/{user_id}/card-{len(self.uploads)}.png"

    def remove(self, stored_path: str) -> None:
        pass

    def create_signed_url(self, stored_path: str, expires_in: int) -> str:
        if self.error:
            raise self.error
        self.signed.append((stored_path, expires_in))
        return f"https://storage.test/sign/{stored_path}?token=abc"


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


def create_user(
    role: UserRole | None = UserRole.ADMIN,
    status: UserStatus = UserStatus.ACTIVE,
    full_name: str = "ผู้ดูแล ทดสอบ",
):
    supabase_uid = uuid.uuid4()
    db = TestingSessionLocal()
    try:
        user = User(
            supabase_user_id=supabase_uid,
            full_name=full_name,
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


def add_verification(
    user_id: int,
    status: str = "PENDING",
    reject_reason: str | None = None,
    reviewed_by: int | None = None,
    account_number: str = "1234567890",
    id_card_image_url: str = "seller-verifications/1/card.png",
) -> int:
    db = TestingSessionLocal()
    try:
        record = Verification(
            user_id=user_id,
            id_card_image_url=id_card_image_url,
            bank_account_name="ผู้ขาย ทดสอบ",
            bank_account_number=account_number,
            bank_name="ธนาคารทดสอบ",
            verification_status=status,
            reject_reason=reject_reason,
            reviewed_by=reviewed_by,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record.id
    finally:
        db.close()


def seller_with_pending(full_name: str = "ผู้ขาย ทดสอบ") -> tuple[int, int]:
    seller_id, _ = create_user(role=UserRole.SELLER, full_name=full_name)
    return seller_id, add_verification(seller_id)


def test_requires_authentication():
    assert client.get("/admin/verifications").status_code in [401, 403]


@pytest.mark.parametrize("role", [UserRole.BUYER, UserRole.SELLER, UserRole.INSPECTOR, None])
def test_accounts_without_the_admin_role_see_no_request_data(role, storage):
    seller_id, verification_id = seller_with_pending()
    _, headers = create_user(role=role)

    listing = client.get("/admin/verifications", headers=headers)
    detail = client.get(f"/admin/verifications/{verification_id}", headers=headers)
    evidence = client.get(f"/admin/verifications/{verification_id}/id-card", headers=headers)
    decision = client.post(
        f"/admin/verifications/{verification_id}/decision",
        json={"decision": "APPROVED"},
        headers=headers,
    )

    assert [response.status_code for response in [listing, detail, evidence, decision]] == [403] * 4
    for response in [listing, detail, evidence, decision]:
        body = response.text
        assert "ธนาคารทดสอบ" not in body
        assert str(seller_id) not in body
    assert storage.signed == []


def test_suspended_admin_cannot_review():
    _, verification_id = seller_with_pending()
    _, headers = create_user(role=UserRole.ADMIN, status=UserStatus.SUSPENDED)
    assert client.get("/admin/verifications", headers=headers).status_code == 403
    assert client.get(f"/admin/verifications/{verification_id}", headers=headers).status_code == 403


def test_pending_queue_lists_the_details_an_admin_needs():
    seller_id, verification_id = seller_with_pending()
    _, headers = create_user()

    response = client.get("/admin/verifications", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["id"] == verification_id
    assert item["status"] == "PENDING"
    assert item["seller_id"] == seller_id
    assert item["seller_name"] == "ผู้ขาย ทดสอบ"
    assert item["bank_name"] == "ธนาคารทดสอบ"
    assert item["bank_account_last4"] == "7890"
    assert item["submitted_at"] is not None
    assert item["has_id_card_image"] is True
    # เลขบัญชีเต็มและ path ของรูปบัตรต้องไม่หลุดออกไปที่เครื่องผู้ดูแล
    assert "1234567890" not in response.text
    assert "id_card_image_url" not in response.text
    assert "seller-verifications" not in response.text


def test_empty_queue_returns_an_empty_page():
    _, headers = create_user()
    body = client.get("/admin/verifications", headers=headers).json()
    assert body["items"] == []
    assert body["total"] == 0


def test_queue_only_returns_the_requested_status_oldest_first():
    first_seller, first_id = seller_with_pending()
    second_seller, second_id = seller_with_pending()
    approved_seller, _ = create_user(role=UserRole.SELLER)
    approved_id = add_verification(approved_seller, "APPROVED")
    _, headers = create_user()

    pending = client.get("/admin/verifications", headers=headers).json()
    assert [item["id"] for item in pending["items"]] == [first_id, second_id]

    approved = client.get("/admin/verifications?status=APPROVED", headers=headers).json()
    assert [item["id"] for item in approved["items"]] == [approved_id]


def test_queue_paginates():
    ids = [seller_with_pending()[1] for _ in range(3)]
    _, headers = create_user()
    page = client.get("/admin/verifications?limit=2", headers=headers).json()
    assert [item["id"] for item in page["items"]] == ids[:2]
    assert page["total"] == 3
    rest = client.get("/admin/verifications?limit=2&offset=2", headers=headers).json()
    assert [item["id"] for item in rest["items"]] == ids[2:]


def test_queue_rejects_an_unknown_status():
    _, headers = create_user()
    assert client.get("/admin/verifications?status=NOT_A_STATUS", headers=headers).status_code == 422
    # NOT_SUBMITTED ไม่เคยถูกเก็บในตาราง จึงขอดูเป็นรายการไม่ได้
    assert client.get("/admin/verifications?status=NOT_SUBMITTED", headers=headers).status_code == 422


def test_id_card_evidence_is_a_short_lived_signed_link(storage):
    _, verification_id = seller_with_pending()
    _, headers = create_user()

    response = client.get(f"/admin/verifications/{verification_id}/id-card", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["url"].startswith("https://storage.test/sign/")
    assert 0 < body["expires_in"] <= 600
    assert storage.signed == [("seller-verifications/1/card.png", body["expires_in"])]


def test_id_card_evidence_reports_when_storage_cannot_open_the_image():
    _, verification_id = seller_with_pending()
    app.dependency_overrides[id_card_storage_dependency] = lambda: FakeStorage(
        error=StorageSignError("gone")
    )
    _, headers = create_user()
    response = client.get(f"/admin/verifications/{verification_id}/id-card", headers=headers)
    assert response.status_code == 502
    assert "gone" not in response.text


def test_approve_marks_the_request_and_records_the_reviewer():
    seller_id, verification_id = seller_with_pending()
    admin_id, headers = create_user(full_name="แอดมิน หนึ่ง")

    response = client.post(
        f"/admin/verifications/{verification_id}/decision",
        json={"decision": "APPROVED"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "APPROVED"
    assert body["reviewed_at"] is not None
    assert body["verified_at"] is not None
    assert body["reviewed_by_name"] == "แอดมิน หนึ่ง"

    db = TestingSessionLocal()
    try:
        record = db.get(Verification, verification_id)
        assert record.verification_status == "APPROVED"
        assert record.reviewed_by == admin_id
        assert record.reject_reason is None
    finally:
        db.close()


def test_approve_clears_a_reason_sent_by_mistake():
    _, verification_id = seller_with_pending()
    _, headers = create_user()
    body = client.post(
        f"/admin/verifications/{verification_id}/decision",
        json={"decision": "APPROVED", "reject_reason": "ไม่ควรถูกเก็บ"},
        headers=headers,
    ).json()
    assert body["status"] == "APPROVED"
    assert body["reject_reason"] is None


def test_reject_stores_the_reason_and_the_seller_can_read_it():
    seller_id, verification_id = seller_with_pending()
    _, headers = create_user()

    response = client.post(
        f"/admin/verifications/{verification_id}/decision",
        json={"decision": "REJECTED", "reject_reason": "รูปบัตรไม่ชัด กรุณาถ่ายใหม่"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "REJECTED"
    assert body["reject_reason"] == "รูปบัตรไม่ชัด กรุณาถ่ายใหม่"
    assert body["verified_at"] is None

    db = TestingSessionLocal()
    try:
        record = db.get(Verification, verification_id)
        assert record.verification_status == "REJECTED"
        assert record.reject_reason == "รูปบัตรไม่ชัด กรุณาถ่ายใหม่"
    finally:
        db.close()


@pytest.mark.parametrize("reason", [None, "", "   ", "สั้น"])
def test_reject_without_a_usable_reason_is_refused(reason):
    _, verification_id = seller_with_pending()
    _, headers = create_user()

    payload = {"decision": "REJECTED"}
    if reason is not None:
        payload["reject_reason"] = reason
    response = client.post(
        f"/admin/verifications/{verification_id}/decision", json=payload, headers=headers
    )
    assert response.status_code == 422
    assert response.json()["detail"]["fields"]["reject_reason"]

    db = TestingSessionLocal()
    try:
        # คำขอต้องยังรอตรวจอยู่ ไม่ถูกเปลี่ยนสถานะจากคำสั่งที่ไม่ผ่านการตรวจสอบ
        assert db.get(Verification, verification_id).verification_status == "PENDING"
    finally:
        db.close()


def test_reject_reason_longer_than_the_column_is_refused():
    _, verification_id = seller_with_pending()
    _, headers = create_user()
    response = client.post(
        f"/admin/verifications/{verification_id}/decision",
        json={"decision": "REJECTED", "reject_reason": "ก" * 501},
        headers=headers,
    )
    assert response.status_code == 422


def test_a_request_another_admin_reviewed_cannot_be_reviewed_again():
    _, verification_id = seller_with_pending()
    first_admin_id, first_headers = create_user(full_name="แอดมิน หนึ่ง")
    _, second_headers = create_user(full_name="แอดมิน สอง")

    assert client.post(
        f"/admin/verifications/{verification_id}/decision",
        json={"decision": "APPROVED"},
        headers=first_headers,
    ).status_code == 200

    response = client.post(
        f"/admin/verifications/{verification_id}/decision",
        json={"decision": "REJECTED", "reject_reason": "ตรวจซ้ำไม่ได้แล้ว"},
        headers=second_headers,
    )
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "already_reviewed"
    assert detail["status"] == "APPROVED"
    assert detail["reviewed_by_name"] == "แอดมิน หนึ่ง"

    db = TestingSessionLocal()
    try:
        record = db.get(Verification, verification_id)
        # ผลของผู้ตรวจคนแรกต้องไม่ถูกทับ
        assert record.verification_status == "APPROVED"
        assert record.reviewed_by == first_admin_id
    finally:
        db.close()


def test_unknown_request_is_not_found():
    _, headers = create_user()
    assert client.get("/admin/verifications/404", headers=headers).status_code == 404
    assert client.post(
        "/admin/verifications/404/decision",
        json={"decision": "APPROVED"},
        headers=headers,
    ).status_code == 404


def test_reviewed_request_detail_shows_who_reviewed_it():
    seller_id, _ = create_user(role=UserRole.SELLER)
    admin_id, headers = create_user(full_name="แอดมิน หนึ่ง")
    verification_id = add_verification(
        seller_id, "REJECTED", reject_reason="รูปบัตรไม่ชัด", reviewed_by=admin_id
    )

    body = client.get(f"/admin/verifications/{verification_id}", headers=headers).json()
    assert body["status"] == "REJECTED"
    assert body["reject_reason"] == "รูปบัตรไม่ชัด"
    assert body["reviewed_by_name"] == "แอดมิน หนึ่ง"


def submit_as_seller(headers):
    """ผู้ขายส่งคำขอผ่าน endpoint จริง เพื่อทดสอบทั้งวงจรกับฝั่งผู้ดูแล"""
    return client.post(
        "/verifications",
        data={
            "bank_name": "ธนาคารทดสอบ",
            "bank_account_name": "ผู้ขาย ทดสอบ",
            "bank_account_number": "123-4-56789-0",
        },
        files={"id_card_image": ("card.png", PNG_BYTES, "image/png")},
        headers=headers,
    )


def test_an_approval_reaches_the_seller_status_screen(storage):
    _, seller_headers = create_user(role=UserRole.SELLER)
    assert submit_as_seller(seller_headers).status_code == 201
    _, admin_headers = create_user()

    queued = client.get("/admin/verifications", headers=admin_headers).json()["items"]
    assert len(queued) == 1
    assert client.post(
        f"/admin/verifications/{queued[0]['id']}/decision",
        json={"decision": "APPROVED"},
        headers=admin_headers,
    ).status_code == 200

    seller_view = client.get("/verifications/me", headers=seller_headers).json()
    assert seller_view["status"] == "APPROVED"
    assert seller_view["can_submit"] is False
    assert seller_view["verified_at"] is not None
    # คิวรอตรวจว่างลงหลังคำขอถูกตรวจแล้ว
    assert client.get("/admin/verifications", headers=admin_headers).json()["total"] == 0


def test_a_rejection_reaches_the_seller_and_lets_them_send_a_new_request(storage):
    _, seller_headers = create_user(role=UserRole.SELLER)
    submit_as_seller(seller_headers)
    _, admin_headers = create_user()

    first_id = client.get("/admin/verifications", headers=admin_headers).json()["items"][0]["id"]
    assert client.post(
        f"/admin/verifications/{first_id}/decision",
        json={"decision": "REJECTED", "reject_reason": "รูปบัตรไม่ชัด กรุณาถ่ายใหม่"},
        headers=admin_headers,
    ).status_code == 200

    seller_view = client.get("/verifications/me", headers=seller_headers).json()
    assert seller_view["status"] == "REJECTED"
    assert seller_view["reject_reason"] == "รูปบัตรไม่ชัด กรุณาถ่ายใหม่"
    assert seller_view["can_submit"] is True

    # ผู้ขายแก้ไขแล้วส่งใหม่ คำขอใบใหม่ต้องกลับเข้าคิวรอตรวจ
    assert submit_as_seller(seller_headers).status_code == 201
    queue = client.get("/admin/verifications", headers=admin_headers).json()
    assert queue["total"] == 1
    assert queue["items"][0]["id"] != first_id
