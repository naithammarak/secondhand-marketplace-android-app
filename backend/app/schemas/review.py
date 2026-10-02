from datetime import datetime, timezone
import unicodedata
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rating: StrictInt = Field(ge=1, le=5)
    comment: StrictStr = ""

    @field_validator("comment")
    @classmethod
    def canonical_comment(cls, value):
        if len(value) > 1000 or any(unicodedata.category(c) in {"Cs", "Cc"} and c not in '\n\r\t' for c in value):
            raise ValueError("Invalid comment; maximum 1000 characters")
        return value.strip()


class PrivateReview(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    order_id: int
    rating: int
    comment: str
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def utc_created(cls, value):
        return value.astimezone(timezone.utc)
