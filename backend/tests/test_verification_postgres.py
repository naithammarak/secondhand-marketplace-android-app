"""PostgreSQL integration tests for verification migrations, RLS, and concurrency.

Runs only when TEST_DATABASE_URL is explicitly set to an isolated PostgreSQL test database.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
from pathlib import Path
from threading import Barrier
import time
from uuid import uuid4

import jwt
import pytest
from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

import app.api.auth as auth_module
from app.api.verifications import id_card_storage_dependency
from app.database import get_db
from app.main import app
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification
from test_user_migration import _alembic_config, _isolated_test_database_url, _require_data_api_roles

LATEST_REVISION = "f02a03c91801"
TEST_SECRET = "test-secret-key-for-jwt-testing-12345678901234567890"
TEST_AUDIENCE = "authenticated"
TEST_ISSUER = "https://hzromkehaftcfthhrunm.supabase.co/auth/v1"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 64


class FakeStorage:
    def __init__(self):
        self.uploads: list[tuple[int, bytes, str]] = []
        self.removed: list[str] = []

    def upload(self, user_id: int, content: bytes, content_type: str) -> str:
        self.uploads.append((user_id, content, content_type))
        return f"seller-verifications/{user_id}/card-{len(self.uploads)}.png"

    def create_signed_url(self, stored_path: str, expires_in: int = 120) -> str:
        return f"https://mock-storage.supabase.co/{stored_path}?expires={expires_in}"

    def remove(self, stored_path: str) -> None:
        self.removed.append(stored_path)


@pytest.fixture(scope="module")
def postgres_engine():
    url = _isolated_test_database_url()
    engine = create_engine(url, pool_pre_ping=True)
    with engine.connect() as connection:
        existing = inspect(connection).get_table_names(schema="public")
        if existing:
            pytest.fail(f"TEST_DATABASE_URL must point to an empty database; found tables: {existing}")

    previous_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    upgraded = False
    try:
        command.upgrade(_alembic_config(), "head")
        upgraded = True
        yield engine
    finally:
        try:
            if upgraded:
                command.downgrade(_alembic_config(), "base")
                with engine.begin() as connection:
                    connection.execute(text("DROP TABLE IF EXISTS alembic_version CASCADE"))
        finally:
            engine.dispose()
            if previous_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous_url


@pytest.fixture
def pg_session(postgres_engine):
    with Session(postgres_engine) as session:
        yield session
        session.rollback()

    with postgres_engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE public.verifications, public.users RESTART IDENTITY CASCADE"))


@pytest.fixture
def pg_api(postgres_engine, monkeypatch):
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_SECRET", TEST_SECRET)
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_ISSUER", TEST_ISSUER)
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_AUDIENCE", TEST_AUDIENCE)
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_ALGORITHM", "HS256")

    storage = FakeStorage()

    def get_pg_db():
        with Session(postgres_engine) as session:
            yield session

    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = get_pg_db
    app.dependency_overrides[id_card_storage_dependency] = lambda: storage

    client = TestClient(app)
    try:
        yield client, storage
    finally:
        app.dependency_overrides = previous_overrides


def make_token(sub: str) -> str:
    return jwt.encode(
        {"sub": sub, "aud": TEST_AUDIENCE, "iss": TEST_ISSUER, "exp": int(time.time()) + 3600},
        TEST_SECRET,
        algorithm="HS256",
    )


def create_user(session: Session, role: UserRole = UserRole.SELLER, status: UserStatus = UserStatus.ACTIVE) -> tuple[int, str]:
    sub = str(uuid4())
    user = User(
        supabase_user_id=uuid4(),
        full_name=f"User {sub[:8]}",
        email=f"user-{sub[:8]}@example.com",
        role=role,
        status=status,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user.id, make_token(str(user.supabase_user_id))


def test_migration_upgrades_to_verification_head(postgres_engine):
    with postgres_engine.connect() as connection:
        context = MigrationContext.configure(connection)
        current = context.get_current_revision()
        assert current == LATEST_REVISION


def test_verifications_table_has_rls_enabled_and_no_direct_api_access(postgres_engine):
    with postgres_engine.connect() as connection:
        rls_enabled = connection.execute(
            text(
                """
                SELECT table_info.relrowsecurity
                FROM pg_class AS table_info
                JOIN pg_namespace AS schema_info ON schema_info.oid = table_info.relnamespace
                WHERE schema_info.nspname = 'public' AND table_info.relname = 'verifications'
                """
            )
        ).scalar_one()
        assert rls_enabled is True

        data_api_roles = _require_data_api_roles(
            connection.execute(
                text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")
            ).scalars()
        )
        for role_name in data_api_roles:
            for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                has_priv = connection.execute(
                    text("SELECT has_table_privilege(:role, 'public.verifications', :priv)"),
                    {"role": role_name, "priv": privilege},
                ).scalar_one()
                assert has_priv is False, f"{role_name} should not have {privilege} on verifications"


def test_database_rejects_invalid_verification_status(pg_session):
    user_id, _ = create_user(pg_session)
    with pytest.raises(IntegrityError):
        with pg_session.begin_nested():
            pg_session.execute(
                text(
                    """
                    INSERT INTO public.verifications
                        (user_id, id_card_image_url, bank_account_name, bank_account_number, bank_name, verification_status)
                    VALUES
                        (:uid, 'url', 'Name', '1234567890', 'Bank', 'INVALID')
                    """
                ),
                {"uid": user_id},
            )


def test_database_rejects_rejected_status_without_sufficient_reason(pg_session):
    user_id, _ = create_user(pg_session)
    with pytest.raises(IntegrityError):
        with pg_session.begin_nested():
            pg_session.execute(
                text(
                    """
                    INSERT INTO public.verifications
                        (user_id, id_card_image_url, bank_account_name, bank_account_number, bank_name, verification_status, reject_reason)
                    VALUES
                        (:uid, 'url', 'Name', '1234567890', 'Bank', 'REJECTED', 'bad')
                    """
                ),
                {"uid": user_id},
            )


def test_concurrent_pending_submissions_enforce_single_pending(postgres_engine, pg_api):
    client, storage = pg_api
    with Session(postgres_engine) as session:
        user_id, token = create_user(session, role=UserRole.SELLER)

    headers = {"Authorization": f"Bearer {token}"}
    barrier = Barrier(2)

    def submit_one():
        barrier.wait()
        data = {
            "bank_name": "ธนาคารไทยพาณิชย์",
            "bank_account_name": "นาย ทดสอบ ผู้ขาย",
            "bank_account_number": "1234567890",
        }
        files = {"id_card_image": ("card.png", PNG_BYTES, "image/png")}
        return client.post("/verifications", data=data, files=files, headers=headers)

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(submit_one)
        f2 = executor.submit(submit_one)
        r1 = f1.result()
        r2 = f2.result()

    statuses = {r1.status_code, r2.status_code}
    assert 201 in statuses
    assert 409 in statuses


def test_concurrent_admin_decision_allows_only_one_winner(postgres_engine, pg_api):
    client, _ = pg_api
    with Session(postgres_engine) as session:
        seller_id, _ = create_user(session, role=UserRole.SELLER)
        admin1_id, token_admin1 = create_user(session, role=UserRole.ADMIN)
        admin2_id, token_admin2 = create_user(session, role=UserRole.ADMIN)

        rec = Verification(
            user_id=seller_id,
            id_card_image_url="seller-verifications/test.png",
            bank_account_name="นาย ผู้ขาย",
            bank_account_number="1234567890",
            bank_name="ธนาคารกสิกรไทย",
            verification_status="PENDING",
        )
        session.add(rec)
        session.commit()
        session.refresh(rec)
        ver_id = rec.id

    barrier = Barrier(2)

    def decide(token, decision, reason=None):
        barrier.wait()
        body = {"decision": decision}
        if reason:
            body["reject_reason"] = reason
        return client.post(
            f"/admin/verifications/{ver_id}/decision",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(decide, token_admin1, "APPROVED")
        f2 = executor.submit(decide, token_admin2, "REJECTED", "เอกสารไม่ชัดเจน กรุณาถ่ายใหม่")
        r1 = f1.result()
        r2 = f2.result()

    codes = {r1.status_code, r2.status_code}
    assert 200 in codes
    assert 409 in codes
    conflict_resp = r1 if r1.status_code == 409 else r2
    assert conflict_resp.json()["detail"]["code"] == "already_reviewed"
