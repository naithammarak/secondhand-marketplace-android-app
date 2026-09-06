from uuid import UUID, uuid4

import pytest

from app.models.user import User, UserRole
from app.services.test_user_roles import (
    RoleAssignmentResult,
    TestUserNotFoundError as UserNotFoundError,
    assign_test_user_role,
)


class FakeSession:
    def __init__(self, user):
        self.user = user
        self.commit_count = 0
        self.refresh_count = 0
        self.rollback_count = 0
        self.last_statement = None

    def scalar(self, statement):
        self.last_statement = statement
        if self.user is None:
            return None
        criterion = statement.whereclause
        assert criterion.left.key == User.supabase_user_id.key
        assert criterion.left.table is User.__table__
        assert criterion.right.value == self.user.supabase_user_id
        return self.user

    def commit(self):
        self.commit_count += 1

    def refresh(self, user):
        self.refresh_count += 1

    def rollback(self):
        self.rollback_count += 1


def make_user(role):
    return User(
        supabase_user_id=uuid4(),
        full_name="Fixture User",
        email="fixture@example.invalid",
        role=role,
    )


def test_assign_role_updates_existing_user_once():
    user = make_user(role=None)
    db = FakeSession(user)

    result = assign_test_user_role(db, user.supabase_user_id, UserRole.ADMIN)

    assert isinstance(result, RoleAssignmentResult)
    assert result.previous_role is None
    assert result.current_role is UserRole.ADMIN
    assert result.changed is True
    assert user.role is UserRole.ADMIN
    assert db.commit_count == 1
    assert db.refresh_count == 1


def test_repeating_same_role_is_idempotent():
    user = make_user(role=UserRole.INSPECTOR)
    db = FakeSession(user)

    result = assign_test_user_role(
        db, user.supabase_user_id, UserRole.INSPECTOR
    )

    assert result.previous_role is UserRole.INSPECTOR
    assert result.current_role is UserRole.INSPECTOR
    assert result.changed is False
    assert db.commit_count == 0
    assert db.refresh_count == 0


def test_missing_user_is_rejected_without_insert():
    db = FakeSession(None)
    supabase_user_id = uuid4()

    with pytest.raises(UserNotFoundError):
        assign_test_user_role(db, supabase_user_id, UserRole.BUYER)

    assert db.commit_count == 0
    assert db.refresh_count == 0


def test_assign_role_switches_existing_buyer_to_seller():
    user = make_user(role=UserRole.BUYER)
    db = FakeSession(user)

    result = assign_test_user_role(db, user.supabase_user_id, UserRole.SELLER)

    assert result.previous_role is UserRole.BUYER
    assert result.current_role is UserRole.SELLER
    assert result.changed is True
    assert user.role is UserRole.SELLER
    assert db.commit_count == 1
