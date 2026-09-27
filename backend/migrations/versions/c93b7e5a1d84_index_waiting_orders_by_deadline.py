"""index waiting orders by payment deadline (ORDER-09)

Revision ID: c93b7e5a1d84
Revises: a5f1c9d2e7b3
Create Date: 2026-09-23 16:00:00.000000

แคตตาล็อกสินค้าถาม "มี Order ที่เลยเส้นตายค้างอยู่ไหม" ก่อนอ่านทุกครั้ง (D-05)
index บางส่วนนี้ทำให้คำถามนั้นแตะเฉพาะแถวที่ยังรอชำระเงิน ไม่ใช่ทั้งตาราง
เป็น index อย่างเดียว ไม่เปลี่ยนข้อมูลและไม่เปลี่ยนพฤติกรรมของ constraint ใด
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c93b7e5a1d84"
down_revision: Union[str, Sequence[str], None] = "a5f1c9d2e7b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix_orders_waiting_expires_at"


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        INDEX_NAME,
        "orders",
        ["expires_at"],
        postgresql_where=sa.text("status = 'WAITING_PAYMENT'"),
        sqlite_where=sa.text("status = 'WAITING_PAYMENT'"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(INDEX_NAME, table_name="orders")
