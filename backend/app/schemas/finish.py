"""Strict FINISH command contracts; not yet mounted on pending task02 models."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints, field_validator


# PostgreSQL text rejects NUL; reject it at the request boundary instead.
ShortText = Annotated[str, StringConstraints(
    strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[^\x00]*$")]
Reason = Annotated[str, StringConstraints(
    strip_whitespace=True, min_length=10, max_length=1000, pattern=r"^[^\x00]*$")]
PositiveId = Annotated[StrictInt, Field(gt=0)]
CaseReference = Annotated[str, StringConstraints(
    pattern=r"^(delivery-report|delivery-proof|delivery-audit):[1-9][0-9]*$", max_length=100)]


class FinishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FulfillmentRequest(FinishRequest):
    carrier: ShortText
    tracking_number: ShortText


class ConfirmDeliveryRequest(FinishRequest):
    proof_ids: Annotated[list[PositiveId], Field(min_length=1, max_length=3)]

    @field_validator("proof_ids")
    @classmethod
    def distinct_sorted(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("Proof IDs must be distinct")
        return sorted(value)


class ConfirmReceiptRequest(FinishRequest):
    pass


class ReportNotReceivedRequest(FinishRequest):
    reason: Reason


class DeliveryReviewRequest(FinishRequest):
    reason: Reason


class ResolveDeliveryRequest(FinishRequest):
    resolution: Literal["RELEASE", "REFUND"]
    reason: Reason
    evidence_refs: Annotated[list[CaseReference], Field(min_length=1, max_length=10)]

    @field_validator("evidence_refs")
    @classmethod
    def distinct_sorted(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("Evidence references must be distinct")
        return sorted(value)
