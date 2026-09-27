"""มุมมองคำสั่งซื้อสำหรับผู้ดูแลระบบ (ORDER-09, FR-42)

หลักการเดียวที่ต้องไม่หลุด: **ผู้ดูแลมีสิทธิ์เข้าถึง แต่ระบบไม่แสดงให้อัตโนมัติ**
- Response ปกติของทุก Endpoint ในไฟล์นี้ปิดบังอีเมลและที่อยู่เสมอ
- การดูข้อมูลเต็มเป็นคำขอแยก (POST /admin/orders/{id}/contact) ต้องระบุเหตุผล
  และบันทึกลง admin_access_logs ทุกครั้งก่อนตอบกลับ (NFR-04)
- ถ้าทีมตัดสินภายหลังว่าผู้ดูแลไม่ควรเห็นข้อมูลติดต่อเลย ให้ตั้ง
  ADMIN_ORDER_CONTACT_REVEAL_ENABLED=false ปิดเฉพาะ Endpoint เดียว
  โดยไม่ต้องแก้ Schema หรือหน้าจอ (ดู D-21)

สิทธิ์ผู้ดูแลใช้ require_admin ตัวเดิมของงานตรวจคำขอผู้ขาย ไม่มีกลไก Auth ใหม่ในไฟล์นี้
"""

import os

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.api.admin_verifications import require_admin
from app.api.orders import api_error, sweep_expired_orders, validation_error
from app.database import get_db
from app.models.audit import MAX_REASON_LENGTH, AdminAccessLog
from app.models.order import Order, Receipt
from app.models.user import User
from app.schemas.admin_order import (
    AdminMaskedAddress,
    AdminOrderAmounts,
    AdminOrderContact,
    AdminOrderDetail,
    AdminOrderListItem,
    AdminOrderPage,
    AdminParty,
    AdminRevealRequest,
)
from app.schemas.order import (
    CancelReason,
    OrderStatus,
    PaymentStatus,
    ProductSnapshot,
    ShippingAddress,
)
from app.services.order_pricing import utcnow
from app.services.pii_masking import mask_email, mask_phone

router = APIRouter(prefix="/admin/orders", tags=["Admin orders"])

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MIN_REASON_LENGTH = 10
ACTION_CONTACT_REVEAL = "ORDER_CONTACT_REVEAL"
TARGET_ORDER = "ORDER"


def contact_reveal_enabled() -> bool:
    """เปิดเป็นค่าเริ่มต้นตาม FR-42 ปิดได้ด้วยค่าเดียวโดยไม่ต้องแก้โค้ด"""
    return os.getenv("ADMIN_ORDER_CONTACT_REVEAL_ENABLED", "true").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


def order_not_found() -> HTTPException:
    return api_error(status.HTTP_404_NOT_FOUND, "order_not_found", "ไม่พบคำสั่งซื้อ")


def party(user: User | None, user_id: int) -> AdminParty:
    """ผู้ใช้ที่หายไปจากฐานข้อมูลต้องไม่ทำให้หน้าผู้ดูแลพัง Order ยังต้องดูได้"""
    if user is None:
        return AdminParty(id=user_id, name="(ไม่พบผู้ใช้)", email_masked=mask_email(None))
    return AdminParty(id=user.id, name=user.full_name, email_masked=mask_email(user.email))


def product_snapshot(order: Order) -> ProductSnapshot:
    return ProductSnapshot(
        id=order.product_id,
        name=order.product_name,
        condition=order.product_condition,
        size=order.product_size,
    )


def payment_status_of(order: Order) -> PaymentStatus:
    """ดูจาก `paid_at` ไม่ใช่สถานะ สถานะหลังการจัดส่งในรอบถัดไปก็ยังต้องขึ้นว่าชำระแล้ว"""
    return PaymentStatus.PAID if order.paid_at is not None else PaymentStatus.UNPAID


def cancel_reason_of(order: Order) -> CancelReason | None:
    return CancelReason(order.cancel_reason) if order.cancel_reason else None


def masked_address(order: Order) -> AdminMaskedAddress:
    return AdminMaskedAddress(
        province=order.ship_province,
        postal_code=order.ship_postal_code,
        phone_masked=mask_phone(order.ship_phone),
    )


def full_address(order: Order) -> ShippingAddress:
    return ShippingAddress(
        recipient_name=order.ship_recipient_name,
        phone=order.ship_phone,
        address_line=order.ship_address_line,
        subdistrict=order.ship_subdistrict,
        district=order.ship_district,
        province=order.ship_province,
        postal_code=order.ship_postal_code,
    )


def clean_reason(raw: str | None) -> str:
    reason = " ".join((raw or "").split())
    if not reason:
        raise validation_error({"reason": "กรุณาระบุเหตุผลที่ต้องเปิดดูข้อมูลติดต่อ"})
    if len(reason) < MIN_REASON_LENGTH:
        raise validation_error({"reason": f"เหตุผลต้องมีอย่างน้อย {MIN_REASON_LENGTH} ตัวอักษร"})
    if len(reason) > MAX_REASON_LENGTH:
        raise validation_error({"reason": f"เหตุผลยาวเกิน {MAX_REASON_LENGTH} ตัวอักษร"})
    return reason


def load_order(db: Session, order_id: int) -> Order:
    order = db.get(Order, order_id)
    if order is None:
        raise order_not_found()
    return order


def receipt_number_of(db: Session, order_id: int) -> str | None:
    receipt = db.scalars(select(Receipt).where(Receipt.order_id == order_id)).first()
    return receipt.receipt_no if receipt else None


@router.get("", response_model=AdminOrderPage)
def list_orders(
    order_status: OrderStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """รายการคำสั่งซื้อทั้งระบบ (ปิดบังอีเมล ไม่มีที่อยู่เลยในระดับรายการ)

    กวาด Order ที่หมดเวลาทั้งระบบก่อนอ่าน เพื่อไม่ให้ผู้ดูแลเห็นสถานะรอชำระเงินที่เลยเวลาไปแล้ว
    และเป็นการปล่อยสินค้าที่ค้างจองให้กลับไปขายได้ในตัว (ดู D-05)
    """
    sweep_expired_orders(db)

    condition = Order.status == order_status.value if order_status else None
    total_query = select(func.count()).select_from(Order)
    if condition is not None:
        total_query = total_query.where(condition)
    total = db.scalar(total_query) or 0

    buyer = aliased(User)
    seller = aliased(User)
    query = (
        select(Order, buyer, seller)
        .join(buyer, buyer.id == Order.buyer_id, isouter=True)
        .join(seller, seller.id == Order.seller_id, isouter=True)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(limit)
        .offset(offset)
    )
    if condition is not None:
        query = query.where(condition)

    items = [
        AdminOrderListItem(
            id=order.id,
            status=OrderStatus(order.status),
            payment_status=payment_status_of(order),
            product=product_snapshot(order),
            buyer=party(buyer_user, order.buyer_id),
            seller=party(seller_user, order.seller_id),
            currency=order.currency,
            total_amount=order.total_amount,
            expires_at=order.expires_at,
            cancel_reason=cancel_reason_of(order),
            created_at=order.created_at,
            paid_at=order.paid_at,
        )
        for order, buyer_user, seller_user in db.execute(query).all()
    ]
    return AdminOrderPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/{order_id}", response_model=AdminOrderDetail)
def get_order(
    order_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """รายละเอียดคำสั่งซื้อแบบปิดบัง: ที่อยู่เหลือจังหวัดกับรหัสไปรษณีย์ อีเมลเหลือตัวแรก"""
    if sweep_expired_orders(db, Order.id == order_id):
        db.expire_all()
    order = load_order(db, order_id)
    return AdminOrderDetail(
        id=order.id,
        status=OrderStatus(order.status),
        payment_status=payment_status_of(order),
        product=product_snapshot(order),
        buyer=party(db.get(User, order.buyer_id), order.buyer_id),
        seller=party(db.get(User, order.seller_id), order.seller_id),
        amounts=AdminOrderAmounts(
            currency=order.currency,
            item_price=order.item_price,
            shipping_fee=order.shipping_fee,
            inspection_fee=order.inspection_fee,
            total_amount=order.total_amount,
            commission_fee=order.commission_fee,
            seller_payout=order.seller_payout,
        ),
        shipping_address_masked=masked_address(order),
        receipt_no=receipt_number_of(db, order.id),
        paid_at=order.paid_at,
        expires_at=order.expires_at,
        cancelled_at=order.cancelled_at,
        cancel_reason=cancel_reason_of(order),
        created_at=order.created_at,
        updated_at=order.updated_at,
        contact_reveal_available=contact_reveal_enabled(),
    )


@router.post("/{order_id}/contact", response_model=AdminOrderContact)
def reveal_contact(
    order_id: int,
    body: AdminRevealRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """เปิดดูอีเมลและที่อยู่เต็มของผู้ซื้อหนึ่งครั้ง ต้องมีเหตุผลและถูกบันทึกเสมอ

    Audit Log ถูก commit ก่อนสร้าง Response เสมอ ถ้าบันทึกไม่สำเร็จจะไม่มีการเปิดเผยข้อมูล
    """
    if not contact_reveal_enabled():
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "admin_contact_reveal_disabled",
            "การเปิดดูข้อมูลติดต่อถูกปิดใช้งานในระบบนี้",
        )

    reason = clean_reason(body.reason)
    order = load_order(db, order_id)

    entry = AdminAccessLog(
        admin_id=admin.id,
        action=ACTION_CONTACT_REVEAL,
        target_type=TARGET_ORDER,
        target_id=order.id,
        reason=reason,
    )
    try:
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(entry)

    buyer = db.get(User, order.buyer_id)
    return AdminOrderContact(
        order_id=order.id,
        buyer_email=buyer.email if buyer else "",
        shipping_address=full_address(order),
        reason=reason,
        revealed_at=entry.created_at or utcnow(),
        audit_log_id=entry.id,
    )
