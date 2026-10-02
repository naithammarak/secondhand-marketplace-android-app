from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.orders import api_error
from app.models.user import User, UserStatus
from app.schemas.profile import ProfileResponse
from app.services.transaction_clock import database_now


def save_profile(db: Session, actor: User, *, full_name=None, policy_version=None):
    try:
        user = db.scalar(select(User).where(User.id == actor.id)
                         .execution_options(populate_existing=True).with_for_update())
        if user is None or user.status != UserStatus.ACTIVE:
            raise api_error(403, "account_inactive", "Account inactive")
        if full_name is not None:
            user.full_name = full_name
        if policy_version is not None and user.privacy_policy_version != policy_version:
            user.privacy_policy_version = policy_version
            user.privacy_acknowledged_at = database_now(db)
        db.flush()
        result = ProfileResponse.model_validate(user)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
