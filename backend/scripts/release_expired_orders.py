"""ยกเลิก Order ที่เลยเส้นตายการจ่ายเงินและปล่อยสินค้ากลับไปขายต่อ (NFR-10, D-05)

รันจากโฟลเดอร์ backend: python -m scripts.release_expired_orders [--apply]
ค่าเริ่มต้นเป็นโหมดดูอย่างเดียว ต้องใส่ --apply ถึงจะเขียนจริง

ระบบยกเลิกให้เองอยู่แล้วเมื่อมีคนมาแตะ Order (lazy expiry ใน app/api/orders.py) และเมื่อผู้ดูแล
เปิดหน้ารายการ Order สคริปต์นี้มีไว้สำหรับกรณีที่ไม่มีใครมาแตะเลย เช่น สินค้าที่ถูกจองแล้ว
ผู้ซื้อหายไป และไม่มีผู้ซื้อรายอื่นเปิดดูสินค้าชิ้นนั้น สินค้าจะค้าง RESERVED จนกว่าจะมีคนกวาด
ให้รันสคริปต์นี้เป็นงานประจำ (เช่น วันละครั้ง) จนกว่าจะมี Background Job จริง
"""

import argparse

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models.order import Order
from app.models.product import Product
from app.services.order_pricing import (
    ORDER_WAITING_PAYMENT,
    PRODUCT_RESERVED,
    utcnow,
)


def expired_orders(db, now):
    return db.scalars(
        select(Order)
        .where(Order.status == ORDER_WAITING_PAYMENT, Order.expires_at <= now)
        .order_by(Order.id)
    ).all()


def stuck_products(db):
    """สินค้าที่ยังถูกจองทั้งที่ไม่มี Order ที่ยังมีผลผูกอยู่ ต้องไม่เหลือค้างหลังรันสคริปต์นี้"""
    active_product_ids = select(Order.product_id).where(Order.status != "CANCELLED")
    return db.scalars(
        select(Product.id)
        .where(
            Product.status == PRODUCT_RESERVED,
            Product.deleted_at.is_(None),
            Product.id.not_in(active_product_ids),
        )
        .order_by(Product.id)
    ).all()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="เขียนจริง (ไม่ใส่ = ดูอย่างเดียว)")
    args = parser.parse_args()

    if SessionLocal is None:
        raise SystemExit("DATABASE_URL is not set")

    # นำเข้าเมื่อถึงเวลาใช้ เพื่อให้สคริปต์ใช้ตรรกะเดียวกับ API ไม่ใช่สำเนาที่แยกกันไปคนละทาง
    from app.api.orders import release_reserved_products, sweep_expired_orders

    db = SessionLocal()
    try:
        now = utcnow()
        pending = expired_orders(db, now)
        orphans = stuck_products(db)
        print(f"เวลาปัจจุบัน (UTC): {now.isoformat()}")
        print(f"Order ที่เลยเส้นตายและยังรอชำระเงิน: {len(pending)}")
        for order in pending:
            print(f"  - order {order.id} product {order.product_id} expires_at {order.expires_at}")
        print(f"สินค้าที่ค้างสถานะ RESERVED โดยไม่มี Order ที่ยังมีผล: {len(orphans)}")
        for product_id in orphans:
            print(f"  - product {product_id}")

        if not args.apply:
            print("โหมดดูอย่างเดียว ยังไม่เขียนอะไร ใส่ --apply เพื่อยกเลิกจริง")
            return

        cancelled = sweep_expired_orders(db)
        if orphans:
            release_reserved_products(db, list(orphans))
            db.commit()
        remaining = db.scalar(
            select(func.count()).select_from(Order).where(
                Order.status == ORDER_WAITING_PAYMENT, Order.expires_at <= utcnow()
            )
        )
        print(f"ยกเลิกแล้ว {cancelled} รายการ ปล่อยสินค้าค้างจอง {len(orphans)} ชิ้น เหลือค้าง {remaining}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
