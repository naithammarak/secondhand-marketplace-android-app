"""หน้าตรวจคำขอยืนยันตัวตนผู้ขายสำหรับผู้ดูแลระบบ

เฉพาะบัญชีบทบาท ADMIN ที่ยังใช้งานได้เท่านั้นจึงเห็นรายการและหลักฐาน
ส่วนรูปบัตรประชาชนส่งกลับเป็นลิงก์ชั่วคราว ไม่ส่ง path ใน storage ให้เครื่องผู้ใช้
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.verifications import id_card_storage_dependency
from app.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification
from app.schemas.verification import (
    AdminVerificationItem,
    AdminVerificationPage,
    IdCardEvidence,
    VerificationDecision,
    VerificationDecisionRequest,
    VerificationStatus,
    STORED_STATUSES,
)
from app.services.id_card_storage import SIGNED_URL_TTL_SECONDS, StorageSignError

router = APIRouter(prefix="/admin/verifications", tags=["Seller verification review"])

MIN_REJECT_REASON_LENGTH = 5
MAX_REJECT_REASON_LENGTH = 500
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """ปิดทางบัญชีที่ไม่ใช่ผู้ดูแล ก่อนที่จะแตะข้อมูลคำขอใด ๆ

    งานอื่นที่ต้องการสิทธิ์ผู้ดูแล (เช่น มุมมอง Order ใน `app/api/admin_orders.py`)
    ต้องใช้ตัวนี้ร่วมกัน ห้ามเขียนการตรวจสิทธิ์ผู้ดูแลขึ้นใหม่
    """
    if current_user.role != UserRole.ADMIN or current_user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role is required",
        )
    return current_user


def to_item(record: Verification, seller: User, reviewer_name: str | None) -> AdminVerificationItem:
    return AdminVerificationItem(
        id=record.id,
        status=VerificationStatus(record.verification_status),
        seller_id=seller.id,
        seller_name=seller.full_name,
        seller_email=seller.email,
        bank_name=record.bank_name,
        bank_account_name=record.bank_account_name,
        # ผู้ดูแลเห็นแค่เลขท้ายบัญชีพอให้ตรวจ ไม่ต้องเห็นเลขเต็ม
        bank_account_last4=record.bank_account_number[-4:],
        submitted_at=record.created_at,
        reject_reason=record.reject_reason
        if record.verification_status == VerificationStatus.REJECTED.value
        else None,
        reviewed_at=record.reviewed_at,
        verified_at=record.verified_at,
        reviewed_by_name=reviewer_name,
        has_id_card_image=bool(record.id_card_image_url),
    )


def load_item(db: Session, record: Verification) -> AdminVerificationItem:
    seller = db.get(User, record.user_id)
    if seller is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Verification request not found",
        )
    reviewer = db.get(User, record.reviewed_by) if record.reviewed_by else None
    return to_item(record, seller, reviewer.full_name if reviewer else None)


def get_record(db: Session, verification_id: int) -> Verification:
    record = db.get(Verification, verification_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Verification request not found",
        )
    return record


def clean_reject_reason(value: str | None) -> str:
    reason = (value or "").strip()
    if not reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "validation_error", "fields": {"reject_reason": "กรุณากรอกเหตุผลที่ปฏิเสธ"}},
        )
    if len(reason) < MIN_REJECT_REASON_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "validation_error",
                "fields": {"reject_reason": f"เหตุผลต้องมีอย่างน้อย {MIN_REJECT_REASON_LENGTH} ตัวอักษร"},
            },
        )
    if len(reason) > MAX_REJECT_REASON_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "validation_error",
                "fields": {"reject_reason": f"เหตุผลยาวเกิน {MAX_REJECT_REASON_LENGTH} ตัวอักษร"},
            },
        )
    return reason


@router.get("", response_model=AdminVerificationPage)
def list_verifications(
    request_status: VerificationStatus = Query(default=VerificationStatus.PENDING, alias="status"),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if request_status.value not in STORED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "validation_error", "fields": {"status": "สถานะที่ขอดูไม่ถูกต้อง"}},
        )

    total = db.scalar(
        select(func.count())
        .select_from(Verification)
        .where(Verification.verification_status == request_status.value)
    ) or 0
    rows = db.execute(
        select(Verification, User)
        .join(User, User.id == Verification.user_id)
        # คิวรอตรวจเรียงจากคำขอที่ส่งมาก่อน ส่วนคำขอที่ตรวจแล้วเอาใบล่าสุดขึ้นก่อน
        .where(Verification.verification_status == request_status.value)
        .order_by(
            Verification.id.asc()
            if request_status == VerificationStatus.PENDING
            else Verification.id.desc()
        )
        .limit(limit)
        .offset(offset)
    ).all()

    reviewer_ids = {record.reviewed_by for record, _ in rows if record.reviewed_by}
    reviewers: dict[int, str] = {}
    if reviewer_ids:
        reviewers = {
            reviewer.id: reviewer.full_name
            for reviewer in db.scalars(select(User).where(User.id.in_(reviewer_ids))).all()
        }

    return AdminVerificationPage(
        items=[
            to_item(record, seller, reviewers.get(record.reviewed_by) if record.reviewed_by else None)
            for record, seller in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{verification_id}", response_model=AdminVerificationItem)
def get_verification(
    verification_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return load_item(db, get_record(db, verification_id))


@router.get("/{verification_id}/id-card", response_model=IdCardEvidence)
def get_id_card_evidence(
    verification_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    storage=Depends(id_card_storage_dependency),
):
    record = get_record(db, verification_id)
    if not record.id_card_image_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This request has no ID card image",
        )
    try:
        url = storage.create_signed_url(record.id_card_image_url, SIGNED_URL_TTL_SECONDS)
    except StorageSignError:
        # รูปอาจถูกลบตามกำหนดเก็บแล้ว ไม่ส่งรายละเอียดของ storage ต่อให้ผู้ใช้
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not open the ID card image",
        )
    return IdCardEvidence(url=url, expires_in=SIGNED_URL_TTL_SECONDS)


@router.post("/{verification_id}/decision", response_model=AdminVerificationItem)
def decide_verification(
    verification_id: int,
    body: VerificationDecisionRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    record = get_record(db, verification_id)

    approved = body.decision == VerificationDecision.APPROVED
    # ปฏิเสธต้องมีเหตุผลเสมอ ส่วนอนุมัติจะล้างเหตุผลเก่าทิ้ง
    reason = None if approved else clean_reject_reason(body.reject_reason)

    reviewed_at = datetime.now(timezone.utc)
    result = db.execute(
        update(Verification)
        # เงื่อนไขสถานะในคำสั่งเดียวกัน กันสองคนกดตรวจใบเดียวกันพร้อมกัน
        .where(
            Verification.id == verification_id,
            Verification.verification_status == VerificationStatus.PENDING.value,
        )
        .values(
            verification_status=body.decision.value,
            reject_reason=reason,
            reviewed_at=reviewed_at,
            reviewed_by=admin.id,
            verified_at=reviewed_at if approved else None,
        )
    )
    if result.rowcount == 0:
        db.rollback()
        db.refresh(record)
        reviewer = db.get(User, record.reviewed_by) if record.reviewed_by else None
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "already_reviewed",
                "status": record.verification_status,
                "reviewed_by_name": reviewer.full_name if reviewer else None,
            },
        )
    db.commit()
    db.refresh(record)
    return load_item(db, record)
