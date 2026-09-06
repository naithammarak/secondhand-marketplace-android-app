import argparse
import sys
from uuid import UUID

from sqlalchemy import select

from app.database import SessionLocal
from app.models.user import User, UserRole
from app.services.test_user_roles import (
    TestUserNotFoundError,
    assign_test_user_role,
)


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
    return parser


def main(
    argv: list[str] | None = None,
    *,
    session_factory=SessionLocal,
) -> int:
    parser = build_parser()
    try:
        arguments = parser.parse_args(argv)
    except SystemExit as error:
        return int(error.code)

    db = None
    try:
        db = session_factory()
        if not arguments.apply:
            user = db.scalar(
                select(User).where(User.supabase_user_id == arguments.supabase_user_id)
            )
            if user is None:
                raise TestUserNotFoundError(str(arguments.supabase_user_id))
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
