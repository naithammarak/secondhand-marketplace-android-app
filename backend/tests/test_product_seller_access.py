"""Seller approval must use the newest persisted verification row."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.auth import get_current_user
from app.database import Base, get_db
from app.main import app
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification
from app.services.product_seller_access import require_approved_seller


@pytest.fixture
def seller_db():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine, tables=[User.__table__, Verification.__table__])
    with Session(engine) as db:
        seller = User(
            supabase_user_id=uuid4(),
            full_name="Seller",
            email="seller@example.test",
            role=UserRole.SELLER,
        )
        db.add(seller)
        db.commit()
        db.refresh(seller)
        yield db, seller
        db.rollback()
    engine.dispose()


def add_verification(db, seller, state, created_at):
    row = Verification(
        user_id=seller.id,
        id_card_image_url="private/test.jpg",
        bank_account_name="Test Seller",
        bank_account_number="1234567890",
        bank_name="Test Bank",
        verification_status=state,
        created_at=created_at,
    )
    db.add(row)
    db.commit()
    return row


def assert_denied(db, seller, status_code, code):
    with pytest.raises(HTTPException) as error:
        require_approved_seller(current_user=seller, db=db)
    assert error.value.status_code == status_code
    assert error.value.detail == {"code": code}


def test_latest_approved_verification_allows_seller(seller_db):
    db, seller = seller_db
    add_verification(db, seller, "REJECTED", datetime.now(timezone.utc) - timedelta(days=1))
    add_verification(db, seller, "APPROVED", datetime.now(timezone.utc))
    assert require_approved_seller(current_user=seller, db=db) is seller


@pytest.mark.parametrize("newest_state", ["PENDING", "REJECTED"])
def test_older_approval_does_not_override_newer_request(seller_db, newest_state):
    db, seller = seller_db
    add_verification(db, seller, "APPROVED", datetime.now(timezone.utc) - timedelta(days=1))
    add_verification(db, seller, newest_state, datetime.now(timezone.utc))
    assert_denied(db, seller, 403, "SELLER_NOT_APPROVED")


def test_equal_timestamps_use_highest_id(seller_db):
    db, seller = seller_db
    submitted_at = datetime.now(timezone.utc)
    add_verification(db, seller, "APPROVED", submitted_at)
    add_verification(db, seller, "REJECTED", submitted_at)
    assert_denied(db, seller, 403, "SELLER_NOT_APPROVED")


def test_missing_or_malformed_approval_is_denied(seller_db):
    db, seller = seller_db
    assert_denied(db, seller, 403, "SELLER_NOT_APPROVED")
    add_verification(db, seller, "UNKNOWN", datetime.now(timezone.utc))
    assert_denied(db, seller, 503, "APPROVAL_STATE_UNAVAILABLE")


def test_inactive_account_and_other_roles_cannot_upload(seller_db):
    db, seller = seller_db
    seller.status = UserStatus.SUSPENDED
    assert_denied(db, seller, 403, "ACCOUNT_INACTIVE")
    seller.status = UserStatus.ACTIVE
    seller.role = UserRole.BUYER
    assert_denied(db, seller, 403, "SELLER_ONLY")


def test_duplicate_pending_or_query_failure_fails_closed(seller_db):
    _, seller = seller_db

    class DuplicatePendingDb:
        def scalar(self, _statement):
            return 2

    assert_denied(DuplicatePendingDb(), seller, 503, "APPROVAL_STATE_UNAVAILABLE")

    class BrokenDb:
        def scalar(self, _statement):
            raise RuntimeError("database unavailable")

    assert_denied(BrokenDb(), seller, 503, "APPROVAL_STATE_UNAVAILABLE")


def test_upload_route_checks_approval_before_product_or_storage(seller_db):
    db, seller = seller_db
    app.dependency_overrides[get_current_user] = lambda: seller
    app.dependency_overrides[get_db] = lambda: db
    try:
        response = TestClient(app).post(
            "/products/images/upload", files={"file": ("item.png", b"not a real image", "image/png")}
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "SELLER_NOT_APPROVED"
    finally:
        app.dependency_overrides.clear()
