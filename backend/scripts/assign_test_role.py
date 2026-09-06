import argparse
import os
import sys
from uuid import UUID

from sqlalchemy import select

from app.database import SessionLocal
from app.models.user import User, UserRole
from app.services.test_user_roles import (
    MultipleTestUsersFoundError,
    TestUserNotFoundError,
    assign_test_user_role,
)

try:
    from app.database import DATABASE_URL as APP_DATABASE_URL
except Exception:
    APP_DATABASE_URL = None


def parse_supabase_user_id(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("invalid UUID") from error


def parse_role(value: str) -> UserRole:
    try:
        return UserRole(value.upper())
    except ValueError as error:
        raise argparse.ArgumentTypeError("invalid role") from error


def is_production_environment(
    environment: str | None = None,
    database_url: str | None = None,
) -> bool:
    env = (
        environment
        or os.getenv("APP_ENV")
        or os.getenv("ENVIRONMENT")
        or ""
    ).strip().lower()
    if env in ("production", "prod"):
        return True

    if database_url:
        lowered = database_url.lower()
        if "production" in lowered:
            return True
        for token in ("prod.", "-prod-", "_prod_", "/prod", "-prod.", ".prod:"):
            if token in lowered:
                return True

    return False


import urllib.parse

DEFAULT_ALLOWED_TEST_PROJECT_REFS = {
    "hzromkehaftcfthhrunm",
    "localhost",
    "127.0.0.1",
    "private-host",
}


def get_allowed_project_refs() -> set[str]:
    env_allowed = os.getenv("ALLOWED_TEST_PROJECT_REFS")
    if env_allowed:
        return {ref.strip() for ref in env_allowed.split(",") if ref.strip()}
    return set(DEFAULT_ALLOWED_TEST_PROJECT_REFS)


def extract_supabase_project_ref(database_url: str | None) -> str | None:
    if not database_url:
        return None
    try:
        parsed = urllib.parse.urlparse(database_url)
        # 1. Pooler username format: postgres.<project_ref>
        if parsed.username and "." in parsed.username:
            prefix, sep, ref = parsed.username.partition(".")
            if prefix == "postgres" and ref:
                return ref
        # 2. Hostname format: db.<ref>.supabase.co or <ref>.supabase.co
        if parsed.hostname:
            parts = parsed.hostname.split(".")
            if len(parts) >= 3 and parts[-2:] == ["supabase", "co"]:
                if parts[0] == "db" and len(parts) >= 4:
                    return parts[1]
                return parts[0]
            return parsed.hostname
        return None
    except Exception:
        return None


def verify_project_ref(
    expected_ref: str | None,
    database_url: str | None,
) -> tuple[bool, str | None]:
    if not expected_ref:
        return True, None
    if not database_url:
        return False, None
    extracted = extract_supabase_project_ref(database_url)
    if extracted is None:
        return False, None
    return extracted == expected_ref, extracted


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Assign an existing application user a test role."
    )
    parser.add_argument(
        "--supabase-user-id",
        required=True,
        type=parse_supabase_user_id,
    )
    parser.add_argument("--role", required=True, type=parse_role)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--environment",
        type=str,
        default=None,
        help="Target environment name (rejects 'production' by default)",
    )
    parser.add_argument(
        "--project-ref",
        type=str,
        default=None,
        help="Expected Supabase project ref to verify against target database",
    )
    parser.add_argument(
        "--allow-production",
        action="store_true",
        help="Explicitly permit applying test roles in a production or unlisted environment",
    )
    return parser


def main(
    argv: list[str] | None = None,
    *,
    session_factory=SessionLocal,
    database_url: str | None = None,
) -> int:
    parser = build_parser()
    try:
        arguments = parser.parse_args(argv)
    except SystemExit as error:
        return int(error.code)

    effective_db_url = (
        database_url
        if database_url is not None
        else (os.getenv("DATABASE_URL") or APP_DATABASE_URL or "")
    )

    if arguments.apply:
        expected_ref = (
            arguments.project_ref
            or os.getenv("EXPECTED_PROJECT_REF")
            or os.getenv("SUPABASE_PROJECT_REF")
        )
        if not expected_ref:
            print(
                "Error: --apply requires an explicit project ref (--project-ref or EXPECTED_PROJECT_REF / SUPABASE_PROJECT_REF) to prevent accidental execution.",
                file=sys.stderr,
            )
            return 2

        matches, extracted_ref = verify_project_ref(expected_ref, effective_db_url)
        if not matches:
            print(
                f"Project mismatch: expected '{expected_ref}', but target database URL points to '{extracted_ref or 'unknown'}'.",
                file=sys.stderr,
            )
            return 1

        allowed_refs = get_allowed_project_refs()
        if extracted_ref not in allowed_refs and not arguments.allow_production:
            print(
                f"Project '{extracted_ref}' is not in the allowed test project roster ({', '.join(sorted(allowed_refs))}). "
                "Test role assignment rejected to protect non-test and production projects.",
                file=sys.stderr,
            )
            return 1

        if is_production_environment(
            environment=arguments.environment,
            database_url=effective_db_url,
        ) and not arguments.allow_production:
            print(
                "Role assignment rejected: production environment detected. "
                "Test roles cannot be applied to production by default.",
                file=sys.stderr,
            )
            return 1
    elif arguments.project_ref:
        matches, extracted_ref = verify_project_ref(arguments.project_ref, effective_db_url)
        if not matches:
            print(
                f"Project mismatch: expected '{arguments.project_ref}', but target database URL points to '{extracted_ref or 'unknown'}'.",
                file=sys.stderr,
            )
            return 1

    db = None
    try:
        db = session_factory()
        if not arguments.apply:
            users = list(
                db.scalars(
                    select(User).where(
                        User.supabase_user_id == arguments.supabase_user_id
                    )
                ).all()
            )
            if not users:
                raise TestUserNotFoundError(str(arguments.supabase_user_id))
            if len(users) > 1:
                raise MultipleTestUsersFoundError(str(arguments.supabase_user_id))

            user = users[0]
            outcome = (
                "already-set"
                if user.role == arguments.role
                else "pending-change"
            )
            print(
                f"UUID: {arguments.supabase_user_id}\n"
                f"Requested role: {arguments.role.value}\n"
                f"Status: {outcome} (no change was made)"
            )
            return 0

        result = assign_test_user_role(
            db,
            arguments.supabase_user_id,
            arguments.role,
        )
    except TestUserNotFoundError:
        print(
            "Application user not found. Ask the tester to sign in once before assigning a role."
        )
        return 3
    except MultipleTestUsersFoundError:
        print("Multiple application users found with this UUID.", file=sys.stderr)
        return 1
    except Exception:
        print("Unexpected database failure.", file=sys.stderr)
        return 1
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass

    outcome = "updated" if result.changed else "already-set"
    print(
        f"UUID {result.supabase_user_id}; requested role {arguments.role.value}; {outcome}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
