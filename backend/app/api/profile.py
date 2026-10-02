from fastapi import APIRouter, Depends, Request
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.orders import validation_error
from app.database import get_db
from app.models.user import User
from app.schemas.profile import PolicyAcknowledgement, ProfileResponse, ProfileUpdate
from app.services.profile import save_profile

router = APIRouter(prefix="/profile", tags=["Profile"])


async def parse_body(request, schema):
    try:
        return schema.model_validate(await request.json())
    except (ValidationError, ValueError, TypeError):
        raise validation_error({"body": "Invalid or unsupported profile fields"})


@router.get("", response_model=ProfileResponse)
def get_profile(actor: User = Depends(get_current_user)):
    return actor


@router.patch("", response_model=ProfileResponse)
async def patch_profile(request: Request, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    body = await parse_body(request, ProfileUpdate)
    return save_profile(db, actor, full_name=body.full_name)


@router.post("/policy-acknowledgement", response_model=ProfileResponse)
async def acknowledge_policy(request: Request, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    body = await parse_body(request, PolicyAcknowledgement)
    return save_profile(db, actor, policy_version=body.policy_version)
