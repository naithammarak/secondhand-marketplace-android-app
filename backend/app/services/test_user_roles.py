from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User, UserRole


class TestUserNotFoundError(LookupError):
    pass


@dataclass(frozen=True)
class RoleAssignmentResult:
    supabase_user_id: UUID
    previous_role: UserRole | None
    current_role: UserRole
    changed: bool


def assign_test_user_role(
    db: Session,
    supabase_user_id: UUID,
    role: UserRole,
) -> RoleAssignmentResult:
    user = db.scalar(
        select(User).where(User.supabase_user_id == supabase_user_id)
    )
    if user is None:
        raise TestUserNotFoundError(str(supabase_user_id))

    previous_role = user.role
    if previous_role == role:
        return RoleAssignmentResult(
            supabase_user_id=supabase_user_id,
            previous_role=previous_role,
            current_role=role,
            changed=False,
        )

    user.role = role
    try:
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise

    return RoleAssignmentResult(
        supabase_user_id=supabase_user_id,
        previous_role=previous_role,
        current_role=user.role,
        changed=True,
    )
