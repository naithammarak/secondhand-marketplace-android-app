from uuid import UUID, uuid4

import pytest

from app.models.user import User, UserRole
from app.services.test_user_roles import (
    MultipleTestUsersFoundError,
    RoleAssignmentResult,
    TestUserNotFoundError as UserNotFoundError,
    assign_test_user_role,
)


class FakeScalarResult:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)


class FakeSession:
    def __init__(self, user=None, users=None, commit_error=None):
        if users is not None:
            self.users = list(users)
        elif user is not None:
            self.users = [user]
        else:
            self.users = []
        self.commit_error = commit_error
        self.commit_count = 0
        self.rollback_count = 0
        self.last_statement = None

    @property
    def user(self):
        return self.users[0] if self.users else None

    def scalars(self, statement):
        self.last_statement = statement
        criterion = statement.whereclause
        assert criterion.left.key == User.supabase_user_id.key
        assert criterion.left.table is User.__table__
        target_uuid = criterion.right.value
        matched = [u for u in self.users if u.supabase_user_id == target_uuid]
        return FakeScalarResult(matched)

    def scalar(self, statement):
        results = self.scalars(statement).all()
        return results[0] if results else None

    def commit(self):
        self.commit_count += 1
        if self.commit_error is not None:
            raise self.commit_error

    def rollback(self):
        self.rollback_count += 1

    def refresh(self, user):
        raise AssertionError("refresh() must not be called in assign_test_user_role")


def make_user(role, user_id=None):
    return User(
        supabase_user_id=user_id or uuid4(),
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


def test_missing_user_is_rejected_without_insert():
    db = FakeSession(None)
    supabase_user_id = uuid4()

    with pytest.raises(UserNotFoundError):
        assign_test_user_role(db, supabase_user_id, UserRole.BUYER)

    assert db.commit_count == 0


def test_assign_role_switches_existing_buyer_to_seller():
    user = make_user(role=UserRole.BUYER)
    db = FakeSession(user)

    result = assign_test_user_role(db, user.supabase_user_id, UserRole.SELLER)

    assert result.previous_role is UserRole.BUYER
    assert result.current_role is UserRole.SELLER
    assert result.changed is True
    assert user.role is UserRole.SELLER
    assert db.commit_count == 1


def test_assign_role_rejects_duplicate_users_without_commit():
    target_id = uuid4()
    user1 = make_user(role=UserRole.BUYER, user_id=target_id)
    user2 = make_user(role=UserRole.BUYER, user_id=target_id)
    db = FakeSession(users=[user1, user2])

    with pytest.raises(MultipleTestUsersFoundError):
        assign_test_user_role(db, target_id, UserRole.ADMIN)

    assert db.commit_count == 0
    assert user1.role is UserRole.BUYER
    assert user2.role is UserRole.BUYER


def test_assign_role_rolls_back_and_raises_when_commit_fails():
    user = make_user(role=None)
    db = FakeSession(user=user, commit_error=RuntimeError("database commit failed"))

    with pytest.raises(RuntimeError, match="database commit failed"):
        assign_test_user_role(db, user.supabase_user_id, UserRole.ADMIN)

    assert db.commit_count == 1
    assert db.rollback_count == 1


def test_assign_role_never_calls_refresh_after_commit():
    user = make_user(role=None)
    db = FakeSession(user=user)

    result = assign_test_user_role(db, user.supabase_user_id, UserRole.ADMIN)

    assert result.current_role is UserRole.ADMIN
    assert db.commit_count == 1
