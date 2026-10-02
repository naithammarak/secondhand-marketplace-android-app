from datetime import datetime, timezone
import unicodedata

from pydantic import BaseModel, ConfigDict, StrictStr, field_validator

POLICY_VERSION = "submission-2026-10-01"


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: StrictStr

    @field_validator("full_name")
    @classmethod
    def valid_name(cls, value):
        if any(unicodedata.category(char).startswith("C") for char in value):
            raise ValueError("Control characters are not allowed")
        value = value.strip()
        if not 1 <= len(value) <= 100:
            raise ValueError("Name must contain 1-100 characters")
        return value


class PolicyAcknowledgement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    policy_version: StrictStr

    @field_validator("policy_version")
    @classmethod
    def supported_version(cls, value):
        if value != POLICY_VERSION:
            raise ValueError("Unsupported policy version")
        return value


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str
    role: str | None
    status: str
    privacy_policy_version: str | None
    privacy_acknowledged_at: datetime | None

    @field_validator("privacy_acknowledged_at")
    @classmethod
    def utc_acknowledgement(cls, value):
        return value.astimezone(timezone.utc) if value is not None else None
