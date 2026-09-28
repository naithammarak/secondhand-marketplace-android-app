"""add order cancellation and payment expiry (ORDER-08)

Revision ID: b41d7ce09f35
Revises: 9446ec1a2c5d
Create Date: 2026-09-23 10:00:00.000000

เพิ่มสถานะ CANCELLED ให้ orders พร้อมเหตุผลการยกเลิก และเส้นตายการจ่ายเงิน
ไม่แตะตารางอื่นและไม่แตะแถวของ payment/escrow/receipt เพราะ Order ที่ยกเลิกได้ต้องยังไม่จ่ายเงิน

index `uq_orders_active_product` ใช้เงื่อนไข `status <> 'CANCELLED'` อยู่แล้วตั้งแต่ ORDER-01
จึงไม่ต้องสร้างใหม่ สินค้าจะหลุดจากการจองทันทีที่ Order เปลี่ยนเป็น CANCELLED
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b41d7ce09f35"
down_revision: Union[str, Sequence[str], None] = "9446ec1a2c5d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_STATUS_CHECK = "status IN ('WAITING_PAYMENT', 'WAITING_SELLER_SHIP')"
NEW_STATUS_CHECK = "status IN ('WAITING_PAYMENT', 'WAITING_SELLER_SHIP', 'CANCELLED')"

CANCEL_FIELDS_CHECK = (
    "(status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL "
    "AND cancel_reason IN ('BUYER', 'EXPIRED')) "
    "OR (status <> 'CANCELLED' AND cancelled_at IS NULL AND cancel_reason IS NULL)"
)
CANCEL_NOT_PAID_CHECK = "status <> 'CANCELLED' OR paid_at IS NULL"


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("orders", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orders", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orders", sa.Column("cancel_reason", sa.String(length=16), nullable=True))

    # Order เดิมยังไม่เคยมีเส้นตาย ให้ยึดเวลาสร้าง + 30 นาทีเท่ากับกติกาของ Order ใหม่
    op.execute(
        "UPDATE orders SET expires_at = created_at + interval '30 minutes' WHERE expires_at IS NULL"
    )
    op.alter_column("orders", "expires_at", nullable=False)

    op.drop_constraint("ck_orders_status", "orders", type_="check")
    op.create_check_constraint("ck_orders_status", "orders", NEW_STATUS_CHECK)
    op.create_check_constraint("ck_orders_cancel_fields", "orders", CANCEL_FIELDS_CHECK)
    op.create_check_constraint("ck_orders_cancel_not_paid", "orders", CANCEL_NOT_PAID_CHECK)


def downgrade() -> None:
    """Downgrade schema."""
    # ถอยกลับได้เฉพาะตอนที่ยังไม่มี Order ที่ถูกยกเลิก ไม่เช่นนั้น CHECK เดิมจะปฏิเสธข้อมูลที่มีอยู่จริง
    cancelled = op.get_bind().execute(
        sa.text("SELECT count(*) FROM orders WHERE status = 'CANCELLED'")
    ).scalar_one()
    if cancelled:
        raise RuntimeError(
            f"downgrade ไม่ได้: มี Order สถานะ CANCELLED อยู่ {cancelled} รายการ "
            "ต้อง export และตัดสินใจก่อนว่าจะทำอย่างไรกับข้อมูลเหล่านี้"
        )

    op.drop_constraint("ck_orders_cancel_not_paid", "orders", type_="check")
    op.drop_constraint("ck_orders_cancel_fields", "orders", type_="check")
    op.drop_constraint("ck_orders_status", "orders", type_="check")
    op.create_check_constraint("ck_orders_status", "orders", OLD_STATUS_CHECK)

    op.drop_column("orders", "cancel_reason")
    op.drop_column("orders", "cancelled_at")
    op.drop_column("orders", "expires_at")
