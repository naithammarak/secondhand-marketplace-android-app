"""Check the current seller approval before a product write operation."""

import logging

from fastapi import Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification


logger = logging.getLogger(__name__)
VALID_STATUSES = {"PENDING", "APPROVED", "REJECTED"}


def require_approved_seller(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if current_user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=403, detail={"code": "ACCOUNT_INACTIVE"})
    if current_user.role != UserRole.SELLER:
        raise HTTPException(status_code=403, detail={"code": "SELLER_ONLY"})

    try:
        pending_count = db.scalar(
            select(func.count(Verification.id)).where(
                Verification.user_id == current_user.id,
                Verification.verification_status == "PENDING",
            )
        )
        latest = db.scalar(
            select(Verification)
            .where(Verification.user_id == current_user.id)
            .order_by(Verification.created_at.desc(), Verification.id.desc())
            .limit(1)
        )
    except Exception as exc:
        logger.exception("PRODUCT-02 approval lookup failed for user_id=%s", current_user.id)
        raise HTTPException(
            status_code=503, detail={"code": "APPROVAL_STATE_UNAVAILABLE"}
        ) from exc

    if (
        pending_count is None
        or pending_count > 1
        or latest is not None
        and (
            latest.id is None
            or latest.created_at is None
            or latest.verification_status not in VALID_STATUSES
        )
    ):
        logger.error("PRODUCT-02 invalid approval state for user_id=%s", current_user.id)
        raise HTTPException(status_code=503, detail={"code": "APPROVAL_STATE_UNAVAILABLE"})
    if latest is None or latest.verification_status != "APPROVED":
        raise HTTPException(status_code=403, detail={"code": "SELLER_NOT_APPROVED"})
    return current_user
