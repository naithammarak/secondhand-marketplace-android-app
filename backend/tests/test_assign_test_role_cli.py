from uuid import UUID

import pytest

from app.models.user import User, UserRole
from scripts.assign_test_role import main


TEST_USER_ID = UUID("00000000-0000-4000-8000-000000000001")
PRIVATE_FULL_NAME = "private test name"
PRIVATE_EMAIL = "private@example.invalid"
PRIVATE_DATABASE_URL = "postgresql://private-host/private-database"
PRIVATE_TOKEN = "private-token"


class FakeScalarResult:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)


class FakeSession:
    def __init__(self, user=None, users=None, error=None, commit_error=None):
        if users is not None:
            self.users = list(users)
        elif user is not None:
            self.users = [user]
        else:
            self.users = []
        self.error = error
        self.commit_error = commit_error
        self.commit_count = 0
        self.rollback_count = 0
        self.close_count = 0

    @property
    def user(self):
        return self.users[0] if self.users else None

    def scalars(self, statement):
        if self.error is not None:
            raise self.error
        criterion = statement.whereclause
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

    def close(self):
        self.close_count += 1


class FakeSessionFactory:
    def __init__(self, user=None, users=None, error=None, commit_error=None):
        self.session = FakeSession(
            user=user, users=users, error=error, commit_error=commit_error
        )
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


TEST_PROJECT_REF = "private-host"


@pytest.fixture(autouse=True)
def configure_test_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", PRIVATE_DATABASE_URL)
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("EXPECTED_PROJECT_REF", raising=False)
    monkeypatch.delenv("SUPABASE_PROJECT_REF", raising=False)


def cli_args(
    *,
    role="ADMIN",
    apply=False,
    supabase_user_id=str(TEST_USER_ID),
    project_ref=TEST_PROJECT_REF,
):
    args = ["--supabase-user-id", supabase_user_id, "--role", role]
    if apply:
        args.append("--apply")
        if project_ref is not None:
            args.extend(["--project-ref", project_ref])
    return args


def test_cli_preview_reports_pending_change_without_mutation(capsys):
    session_factory = FakeSessionFactory(make_user(role=UserRole.BUYER))

    code = main(cli_args(), session_factory=session_factory)

    assert code == 0
    assert session_factory.session.user.role is UserRole.BUYER
    assert session_factory.session.commit_count == 0
    assert session_factory.session.close_count == 1
    assert capsys.readouterr().out == (
        f"UUID: {TEST_USER_ID}\n"
        "Requested role: ADMIN\n"
        "Status: pending-change (no change was made)\n"
    )


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


def test_cli_preview_reports_already_set_without_mutation(capsys):
    session_factory = FakeSessionFactory(make_user(role=UserRole.ADMIN))

    code = main(cli_args(), session_factory=session_factory)

    assert code == 0
    assert session_factory.session.commit_count == 0
    assert session_factory.session.close_count == 1
    assert capsys.readouterr().out == (
        f"UUID: {TEST_USER_ID}\n"
        "Requested role: ADMIN\n"
        "Status: already-set (no change was made)\n"
    )


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


def test_cli_apply_rejected_in_production_environment_by_default(capsys, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    session_factory = FakeSessionFactory(make_user(role=None))

    code = main(cli_args(apply=True), session_factory=session_factory)

    assert code == 1
    assert session_factory.call_count == 0
    assert "production environment detected" in capsys.readouterr().err


def test_cli_apply_allowed_in_production_with_explicit_flag(capsys, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    session_factory = FakeSessionFactory(make_user(role=None))

    code = main(
        cli_args(apply=True) + ["--allow-production"],
        session_factory=session_factory,
    )

    assert code == 0
    assert session_factory.session.user.role is UserRole.ADMIN
    assert session_factory.session.commit_count == 1


def test_cli_rejects_when_project_ref_mismatches(capsys):
    session_factory = FakeSessionFactory(make_user(role=None))

    code = main(
        cli_args(apply=True) + ["--project-ref", "expected-ref"],
        session_factory=session_factory,
        database_url="postgresql://postgres.different-ref:pass@host/db",
    )

    assert code == 1
    assert session_factory.call_count == 0
    assert "Project mismatch" in capsys.readouterr().err


def test_cli_preview_rejects_duplicate_users(capsys):
    session_factory = FakeSessionFactory(
        users=[make_user(role=UserRole.BUYER), make_user(role=UserRole.BUYER)]
    )

    code = main(cli_args(), session_factory=session_factory)

    assert code == 1
    assert session_factory.session.commit_count == 0
    assert session_factory.session.close_count == 1
    assert "Multiple application users found" in capsys.readouterr().err


def test_cli_apply_rejects_duplicate_users(capsys):
    session_factory = FakeSessionFactory(
        users=[make_user(role=UserRole.BUYER), make_user(role=UserRole.BUYER)]
    )

    code = main(cli_args(apply=True), session_factory=session_factory)

    assert code == 1
    assert session_factory.session.commit_count == 0
    assert session_factory.session.close_count == 1
    assert "Multiple application users found" in capsys.readouterr().err


def test_cli_apply_rejected_when_project_ref_is_missing(capsys):
    session_factory = FakeSessionFactory(make_user(role=None))

    code = main(
        cli_args(apply=True, project_ref=None),
        session_factory=session_factory,
    )

    assert code == 2
    assert session_factory.call_count == 0
    assert "--apply requires an explicit project ref" in capsys.readouterr().err


def test_cli_apply_succeeds_when_project_ref_provided_in_env(capsys, monkeypatch):
    monkeypatch.setenv("EXPECTED_PROJECT_REF", TEST_PROJECT_REF)
    session_factory = FakeSessionFactory(make_user(role=None))

    code = main(
        cli_args(apply=True, project_ref=None),
        session_factory=session_factory,
    )

    assert code == 0
    assert session_factory.session.commit_count == 1
    assert session_factory.session.user.role is UserRole.ADMIN


def test_cli_rejects_substring_match_in_password_or_query(capsys):
    session_factory = FakeSessionFactory(make_user(role=None))

    # expected-ref is in password and query string, but actual host is different-host
    malicious_url = "postgresql://user:expected-ref@different-host/db?ref=expected-ref"
    code = main(
        cli_args(apply=True) + ["--project-ref", "expected-ref"],
        session_factory=session_factory,
        database_url=malicious_url,
    )

    assert code == 1
    assert session_factory.call_count == 0
    assert "Project mismatch: expected 'expected-ref', but target database URL points to 'different-host'" in capsys.readouterr().err


def test_cli_apply_rejected_when_project_not_in_allowlist(capsys, monkeypatch):
    # unlisted project matches URL, but is not in allowed roster
    monkeypatch.setenv("ALLOWED_TEST_PROJECT_REFS", "allowed-project-1,allowed-project-2")
    session_factory = FakeSessionFactory(make_user(role=None))

    code = main(
        cli_args(apply=True) + ["--project-ref", "unlisted-ref"],
        session_factory=session_factory,
        database_url="postgresql+psycopg://postgres.unlisted-ref:pw@host:5432/postgres",
    )

    assert code == 1
    assert session_factory.call_count == 0
    assert "not in the allowed test project roster" in capsys.readouterr().err


def test_cli_apply_allowed_for_unlisted_project_with_allow_production(capsys, monkeypatch):
    monkeypatch.setenv("ALLOWED_TEST_PROJECT_REFS", "allowed-project-1")
    session_factory = FakeSessionFactory(make_user(role=None))

    code = main(
        cli_args(apply=True) + ["--project-ref", "unlisted-ref", "--allow-production"],
        session_factory=session_factory,
        database_url="postgresql+psycopg://postgres.unlisted-ref:pw@host:5432/postgres",
    )

    assert code == 0
    assert session_factory.session.commit_count == 1
    assert session_factory.session.user.role is UserRole.ADMIN
