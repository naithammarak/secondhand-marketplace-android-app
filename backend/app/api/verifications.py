from datetime import datetime, timedelta, timezone
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification
from app.schemas.verification import VerificationResponse, VerificationStatus
from app.services.id_card_storage import (
    ALLOWED_IMAGE_TYPES,
    MAX_IMAGE_BYTES,
    StorageNotConfiguredError,
    StorageUploadError,
    content_type_matches_bytes,
    get_id_card_storage,
    normalize_image_content_type,
)

router = APIRouter(prefix="/verifications", tags=["Seller verification"])


def id_card_storage_dependency():
    try:
        return get_id_card_storage()
    except StorageNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ID card storage is not configured",
        )

# เก็บรูปบัตรประชาชนไว้เท่าที่จำเป็นต่อการตรวจสอบ แล้วให้งานเก็บกวาดลบตามกำหนด
ID_CARD_RETENTION_DAYS = 90

MIN_NAME_LENGTH = 2
MAX_NAME_LENGTH = 255
MIN_ACCOUNT_DIGITS = 10
MAX_ACCOUNT_DIGITS = 15


def require_active_seller(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.SELLER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seller role is required for verification requests",
        )
    if current_user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active",
        )
    return current_user


require_seller = require_active_seller


def validation_error(fields: dict) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": "validation_error", "fields": fields},
    )


ACCOUNT_NUMBER_DIGITS_PATTERN = re.compile(r"^[0-9]+$")


def normalize_account_number(value: str) -> str:
    return (value or "").replace(" ", "").replace("-", "")


def validate_text(value: str | None, field_label: str) -> tuple[str, str | None]:
    text = (value or "").strip()
    if not text:
        return text, f"กรุณากรอก{field_label}"
    if len(text) < MIN_NAME_LENGTH:
        return text, f"{field_label}สั้นเกินไป"
    if len(text) > MAX_NAME_LENGTH:
        return text, f"{field_label}ยาวเกิน {MAX_NAME_LENGTH} ตัวอักษร"
    return text, None


def latest_verification(db: Session, user_id: int) -> Verification | None:
    return db.scalars(
        select(Verification)
        .where(Verification.user_id == user_id)
        .order_by(Verification.id.desc())
        .limit(1)
    ).first()


def to_response(record: Verification | None) -> VerificationResponse:
    if record is None:
        return VerificationResponse(status=VerificationStatus.NOT_SUBMITTED, can_submit=True)
    current_status = VerificationStatus(record.verification_status)
    return VerificationResponse(
        status=current_status,
        id=record.id,
        bank_name=record.bank_name,
        bank_account_name=record.bank_account_name,
        bank_account_last4=record.bank_account_number[-4:],
        reject_reason=record.reject_reason if current_status == VerificationStatus.REJECTED else None,
        reviewed_at=record.reviewed_at,
        verified_at=record.verified_at,
        can_submit=current_status == VerificationStatus.REJECTED,
    )


@router.get("/me", response_model=VerificationResponse)
def get_my_verification(
    current_user: User = Depends(require_active_seller),
    db: Session = Depends(get_db),
):
    return to_response(latest_verification(db, current_user.id))


@router.post("", response_model=VerificationResponse, status_code=status.HTTP_201_CREATED)
def submit_verification(
    bank_name: str | None = Form(default=None),
    bank_account_name: str | None = Form(default=None),
    bank_account_number: str | None = Form(default=None),
    id_card_image: UploadFile | None = File(default=None),
    current_user: User = Depends(require_active_seller),
    db: Session = Depends(get_db),
    storage=Depends(id_card_storage_dependency),
):
    existing = latest_verification(db, current_user.id)
    if existing is not None and existing.verification_status in {
        VerificationStatus.PENDING.value,
        VerificationStatus.APPROVED.value,
    }:
        # กันกดส่งซ้ำระหว่างรอผล และกันส่งซ้ำหลังอนุมัติแล้ว
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_submitted", "status": existing.verification_status},
        )

    fields: dict[str, str] = {}
    clean_bank_name, error = validate_text(bank_name, "ชื่อธนาคาร")
    if error:
        fields["bank_name"] = error
    clean_account_name, error = validate_text(bank_account_name, "ชื่อบัญชี")
    if error:
        fields["bank_account_name"] = error

    raw_account = (bank_account_number or "").strip()
    digits = normalize_account_number(raw_account)
    if not raw_account:
        fields["bank_account_number"] = "กรุณากรอกเลขที่บัญชี"
    elif not digits or not ACCOUNT_NUMBER_DIGITS_PATTERN.fullmatch(digits):
        fields["bank_account_number"] = "เลขที่บัญชีต้องเป็นตัวเลขเท่านั้น"
    elif len(digits) < MIN_ACCOUNT_DIGITS or len(digits) > MAX_ACCOUNT_DIGITS:
        fields["bank_account_number"] = (
            f"เลขที่บัญชีต้องมี {MIN_ACCOUNT_DIGITS}-{MAX_ACCOUNT_DIGITS} หลัก"
        )

    content = b""
    if id_card_image is None or not id_card_image.filename:
        fields["id_card_image"] = "กรุณาแนบรูปบัตรประชาชน"
    else:
        content = id_card_image.file.read()
        content_type = normalize_image_content_type(id_card_image.content_type)
        if content_type not in ALLOWED_IMAGE_TYPES:
            fields["id_card_image"] = "รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP"
        elif not content:
            fields["id_card_image"] = "ไฟล์รูปว่าง กรุณาเลือกรูปใหม่"
        elif len(content) > MAX_IMAGE_BYTES:
            fields["id_card_image"] = "ไฟล์รูปต้องมีขนาดไม่เกิน 5 MB"
        elif not content_type_matches_bytes(content_type, content):
            fields["id_card_image"] = "ไฟล์รูปไม่ถูกต้อง กรุณาเลือกรูปใหม่"

    if fields:
        raise validation_error(fields)

    try:
        stored_path = storage.upload(
            current_user.id,
            content,
            content_type,
        )
    except StorageUploadError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not store the ID card image",
        )

    record = Verification(
        user_id=current_user.id,
        id_card_image_url=stored_path,
        bank_account_name=clean_account_name,
        bank_account_number=digits,
        bank_name=clean_bank_name,
        verification_status=VerificationStatus.PENDING.value,
        purge_at=datetime.now(timezone.utc) + timedelta(days=ID_CARD_RETENTION_DAYS),
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        # คำขอที่รออยู่ถูกสร้างพร้อมกันจากอีกอุปกรณ์ ดัชนีเฉพาะของฐานข้อมูลกันไว้
        db.rollback()
        storage.remove(stored_path)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_submitted", "status": VerificationStatus.PENDING.value},
        )
    except Exception:
        db.rollback()
        storage.remove(stored_path)
        raise
    db.refresh(record)
    return to_response(record)
