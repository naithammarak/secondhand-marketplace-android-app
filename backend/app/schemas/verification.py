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


class VerificationDecision(str, Enum):
    """ผลการตรวจที่ผู้ดูแลเลือกได้"""

    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class VerificationDecisionRequest(BaseModel):
    """คำสั่งอนุมัติหรือปฏิเสธคำขอ โดยการปฏิเสธต้องมีเหตุผลเสมอ"""

    decision: VerificationDecision
    reject_reason: str | None = None


class AdminVerificationItem(BaseModel):
    """รายการคำขอสำหรับหน้าตรวจของผู้ดูแล ไม่มีเลขบัญชีเต็มและไม่มีรูปบัตร"""

    id: int
    status: VerificationStatus
    seller_id: int
    seller_name: str
    seller_email: str
    bank_name: str
    bank_account_name: str
    bank_account_last4: str
    submitted_at: datetime | None = None
    reject_reason: str | None = None
    reviewed_at: datetime | None = None
    verified_at: datetime | None = None
    reviewed_by_name: str | None = None
    has_id_card_image: bool = False


class AdminVerificationPage(BaseModel):
    """หน้าของรายการคำขอ พร้อมบอกว่ายังมีรายการถัดไปหรือไม่"""

    items: list[AdminVerificationItem]
    total: int
    limit: int
    offset: int


class IdCardEvidence(BaseModel):
    """ลิงก์ชั่วคราวสำหรับเปิดดูรูปบัตรประชาชนของคำขอ"""

    url: str
    expires_in: int
