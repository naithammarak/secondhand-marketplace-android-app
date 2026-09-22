"""Checks shared by seller operations; approval is a separate decision."""

from fastapi import HTTPException

from app.models.user import User, UserRole, UserStatus


def ensure_active_seller(
    user: User, *, detail: str = "Only active sellers can perform this action"
) -> None:
    """Reject accounts that lack the existing seller role or active status."""
    if user.role != UserRole.SELLER or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=403, detail=detail)
