from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class VerificationStatus(str, Enum):
    """สถานะคำขอยืนยันผู้ขายที่ Mobile ใช้แสดงผล"""

    NOT_SUBMITTED = "NOT_SUBMITTED"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


# สถานะที่เก็บจริงในตาราง verifications (NOT_SUBMITTED เป็นสถานะสังเคราะห์เมื่อยังไม่มีแถว)
STORED_STATUSES = frozenset(
    {
        VerificationStatus.PENDING.value,
        VerificationStatus.APPROVED.value,
        VerificationStatus.REJECTED.value,
    }
)


class VerificationResponse(BaseModel):
    """ผลลัพธ์คำขอล่าสุด โดยไม่ส่งข้อมูลบัตรประชาชนกลับไปที่เครื่องผู้ใช้"""

    status: VerificationStatus
    id: int | None = None
    bank_name: str | None = None
    bank_account_name: str | None = None
    bank_account_last4: str | None = None
    reject_reason: str | None = None
    reviewed_at: datetime | None = None
    verified_at: datetime | None = None
    can_submit: bool = False
