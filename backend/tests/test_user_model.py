from uuid import UUID, uuid4

import pytest
from sqlalchemy import CheckConstraint, Enum as SqlEnum, Integer, String, Uuid


def _load_user_model():
    try:
        from app.models.user import User, UserRole, UserStatus
    except ModuleNotFoundError:
        pytest.fail("User model has not been created yet")

    return User, UserRole, UserStatus


def test_user_model_exposes_the_login_03_schema_contract():
    User, _, _ = _load_user_model()
    columns = User.__table__.columns

    assert User.__tablename__ == "users"
    assert set(columns.keys()) == {
        "id",
        "supabase_user_id",
        "full_name",
        "email",
        "role",
        "status",
        "created_at",
        "updated_at",
    }
    assert isinstance(columns["id"].type, Integer)
    assert columns["id"].primary_key
    assert isinstance(columns["supabase_user_id"].type, Uuid)
    assert not columns["supabase_user_id"].nullable
    assert isinstance(columns["full_name"].type, String)
    assert columns["full_name"].type.length == 255
    assert not columns["full_name"].nullable
    assert isinstance(columns["email"].type, String)
    assert columns["email"].type.length == 320
    assert not columns["email"].nullable
    assert isinstance(columns["role"].type, SqlEnum)
    assert columns["role"].nullable
    assert columns["role"].default is None
    assert columns["role"].server_default is None
    assert isinstance(columns["status"].type, SqlEnum)
    assert not columns["status"].nullable
    assert columns["created_at"].type.timezone
    assert columns["updated_at"].type.timezone


def test_user_model_defines_allowed_role_and_status_values():
    User, UserRole, UserStatus = _load_user_model()

    assert {role.value for role in UserRole} == {
        "BUYER",
        "SELLER",
        "ADMIN",
        "INSPECTOR",
    }
    assert {status.value for status in UserStatus} == {
        "ACTIVE",
        "SUSPENDED",
        "CLOSED",
    }

    checks = {
        constraint.name
        for constraint in User.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert checks == {"ck_users_role", "ck_users_status"}


def test_user_model_accepts_an_unselected_role():
    User, _, _ = _load_user_model()
    supabase_user_id = uuid4()

    user = User(
        supabase_user_id=supabase_user_id,
        full_name="New User",
        email="new.user@example.com",
        role=None,
    )

    assert isinstance(user.supabase_user_id, UUID)
    assert user.supabase_user_id == supabase_user_id
    assert user.role is None
