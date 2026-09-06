from uuid import UUID

import pytest

from app.models.user import User, UserRole
from scripts.assign_test_role import main


TEST_USER_ID = UUID("00000000-0000-4000-8000-000000000001")
PRIVATE_FULL_NAME = "private test name"
PRIVATE_EMAIL = "private@example.invalid"
PRIVATE_DATABASE_URL = "postgresql://private-host/private-database"
PRIVATE_TOKEN = "private-token"


class FakeSession:
    def __init__(self, user=None, error=None):
        self.user = user
        self.error = error
        self.commit_count = 0
        self.refresh_count = 0
        self.close_count = 0

    def scalar(self, statement):
        if self.error is not None:
            raise self.error
        return self.user

    def commit(self):
        self.commit_count += 1

    def refresh(self, user):
        self.refresh_count += 1

    def rollback(self):
        pass

    def close(self):
        self.close_count += 1


class FakeSessionFactory:
    def __init__(self, user=None, error=None):
        self.session = FakeSession(user=user, error=error)
        self.call_count = 0

    def __call__(self):
        self.call_count += 1
        return self.session


def make_user(role):
    return User(
        supabase_user_id=TEST_USER_ID,
        full_name=PRIVATE_FULL_NAME,
        email=PRIVATE_EMAIL,
        role=role,
    )


def cli_args(*, role="ADMIN", apply=False, supabase_user_id=str(TEST_USER_ID)):
    args = ["--supabase-user-id", supabase_user_id, "--role", role]
    if apply:
        args.append("--apply")
    return args


def test_cli_requires_apply_before_mutation(capsys):
    session_factory = FakeSessionFactory(make_user(role=None))

    code = main(cli_args(), session_factory=session_factory)

    assert code == 0
    assert session_factory.session.user.role is None
    assert session_factory.session.commit_count == 0
    assert session_factory.session.close_count == 1
    assert "No change was made" in capsys.readouterr().out


def test_cli_apply_assigns_the_requested_role_and_closes_session(capsys):
    session_factory = FakeSessionFactory(make_user(role=None))

    code = main(cli_args(role="INSPECTOR", apply=True), session_factory=session_factory)

    assert code == 0
    assert session_factory.session.user.role is UserRole.INSPECTOR
    assert session_factory.session.commit_count == 1
    assert session_factory.session.close_count == 1
    assert "updated" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("arguments", "expected_fragment"),
    [
        (cli_args(supabase_user_id="not-a-uuid"), "invalid UUID"),
        (cli_args(role="not-a-role"), "invalid role"),
    ],
)
def test_cli_rejects_invalid_arguments_without_opening_a_session(
    arguments, expected_fragment, capsys
):
    session_factory = FakeSessionFactory(make_user(role=None))

    code = main(arguments, session_factory=session_factory)

    assert code == 2
    assert session_factory.call_count == 0
    assert expected_fragment in capsys.readouterr().err


def test_cli_reports_missing_application_user_and_closes_session(capsys):
    session_factory = FakeSessionFactory(user=None)

    code = main(cli_args(apply=True), session_factory=session_factory)

    assert code == 3
    assert session_factory.session.commit_count == 0
    assert session_factory.session.close_count == 1
    assert (
        capsys.readouterr().out
        == "Application user not found. Ask the tester to sign in once before assigning a role.\n"
    )


def test_cli_reports_repeated_assignment_as_already_set(capsys):
    session_factory = FakeSessionFactory(make_user(role=UserRole.ADMIN))

    code = main(cli_args(apply=True), session_factory=session_factory)

    assert code == 0
    assert session_factory.session.commit_count == 0
    assert session_factory.session.close_count == 1
    assert "already-set" in capsys.readouterr().out


def test_cli_hides_sensitive_values_when_the_database_fails(capsys):
    session_factory = FakeSessionFactory(
        error=RuntimeError(
            f"{PRIVATE_FULL_NAME} {PRIVATE_EMAIL} {PRIVATE_DATABASE_URL} {PRIVATE_TOKEN}"
        )
    )

    code = main(cli_args(apply=True), session_factory=session_factory)

    output = capsys.readouterr()

    assert code == 1
    assert session_factory.session.close_count == 1
    assert "Unexpected database failure." in output.err
    for sensitive_value in (
        PRIVATE_FULL_NAME,
        PRIVATE_EMAIL,
        PRIVATE_DATABASE_URL,
        PRIVATE_TOKEN,
    ):
        assert sensitive_value not in output.out
        assert sensitive_value not in output.err
