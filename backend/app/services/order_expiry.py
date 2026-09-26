"""การหมดเวลาจ่ายเงินของ Order: ยกเลิกและปล่อยสินค้ากลับไปขายต่อ (NFR-10, D-05)

อยู่ที่ชั้น service เพราะมีผู้เรียกสองฝั่งที่ไม่ควรอ้างถึงกันเอง
- งานสั่งซื้อ (`app/api/orders.py`) เรียกตอนอ่าน/จ่าย/ยกเลิก และตอนผู้ดูแลเปิดรายการ
- แคตตาล็อกสินค้า (`app/api/product_reads.py`) เรียกตอนผู้ซื้อเปิดรายการหรือรายละเอียดสินค้า
  ถ้าไม่มีจุดนี้ สินค้าที่การจองหมดเวลาจะหายจากแคตตาล็อก (แคตตาล็อกคืนเฉพาะ `AVAILABLE`)
  แล้วไม่มีใครไปแตะ Order นั้นได้อีกเลย สินค้าจึงค้าง `RESERVED` ถาวร

`sweep_expired_orders` **ปิด transaction ด้วย commit** ผู้เรียกจึงต้องไม่ถือ row lock ที่ยังต้องใช้ต่อ
"""

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.order import Order
from app.models.product import Product
from app.services.order_pricing import (
    CANCEL_REASON_EXPIRED,
    ORDER_CANCELLED,
    ORDER_WAITING_PAYMENT,
    PRODUCT_AVAILABLE,
    PRODUCT_RESERVED,
    utcnow,
)


def release_reserved_products(db: Session, product_ids: list[int]) -> None:
    """คืนสินค้าที่ถูกจองไว้ให้ขายต่อได้ สินค้าที่ถูกลบหรือเปลี่ยนสถานะไปแล้วจะไม่ถูกแตะ"""
    if not product_ids:
        return
    db.execute(
        update(Product)
        .where(
            Product.id.in_(product_ids),
            Product.status == PRODUCT_RESERVED,
            Product.deleted_at.is_(None),
        )
        .values(status=PRODUCT_AVAILABLE)
        .execution_options(synchronize_session=False)
    )


def has_expired_orders(db: Session, *conditions) -> bool:
    """มี Order ที่เลยเส้นตายรออยู่ไหม — คำถามแบบอ่านอย่างเดียวที่ราคาถูก

    ใช้เป็นด่านหน้าของเส้นทางอ่านที่คนเข้าบ่อย (แคตตาล็อก) เพื่อไม่ให้มีคำสั่งเขียนและ commit
    ในคำขอที่ไม่มีอะไรให้กวาด มี index `ix_orders_waiting_expires_at` รองรับคำถามนี้โดยเฉพาะ
    """
    return db.scalar(
        select(Order.id)
        .where(*conditions, Order.status == ORDER_WAITING_PAYMENT, Order.expires_at <= utcnow())
        .limit(1)
    ) is not None


def sweep_expired_orders(db: Session, *conditions) -> int:
    """ยกเลิก Order ที่หมดเวลาจ่ายตามเงื่อนไขที่ให้มา แล้วปล่อยสินค้ากลับไปขายต่อ

    ใช้ conditional update จึงปลอดภัยเมื่อหลายคำขอทำพร้อมกัน มีเพียงคำขอเดียวที่ได้แถวไป
    ผู้เรียกต้องไม่ถือ row lock ที่ยังต้องใช้ต่อ เพราะฟังก์ชันนี้ปิด transaction ด้วย commit
    """
    now = utcnow()
    try:
        released = (
            db.execute(
                update(Order)
                .where(
                    *conditions,
                    Order.status == ORDER_WAITING_PAYMENT,
                    Order.expires_at <= now,
                )
                .values(
                    status=ORDER_CANCELLED,
                    cancel_reason=CANCEL_REASON_EXPIRED,
                    cancelled_at=now,
                )
                .returning(Order.product_id)
                .execution_options(synchronize_session=False)
            )
            .scalars()
            .all()
        )
        release_reserved_products(db, list(released))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return len(released)


def sweep_if_needed(db: Session, *conditions) -> int:
    """กวาดเฉพาะเมื่อมีอะไรให้กวาดจริง สำหรับเส้นทางอ่านที่ถูกเรียกบ่อย"""
    if not has_expired_orders(db, *conditions):
        return 0
    return sweep_expired_orders(db, *conditions)
