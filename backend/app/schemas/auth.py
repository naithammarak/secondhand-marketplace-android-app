from enum import Enum
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr


class AllowedRole(str, Enum):
    BUYER = "BUYER"
    SELLER = "SELLER"


class GoogleLoginRequest(BaseModel):
    role: Optional[AllowedRole] = None  # Legacy compatibility only; ignored by server.


class SetRoleRequest(BaseModel):
    role: AllowedRole


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    supabase_user_id: UUID
    full_name: str
    email: str
    role: Optional[str] = None
    status: str
