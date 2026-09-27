"""create admin access logs (ORDER-09)

Revision ID: a5f1c9d2e7b3
Revises: b41d7ce09f35
Create Date: 2026-09-23 12:00:00.000000

ตารางบันทึกการเข้าถึงข้อมูลส่วนบุคคลโดยผู้ดูแลระบบ ตาม NFR-04
ไม่แตะตารางเดิมเลย จึงถอยกลับได้ทุกเมื่อด้วยการลบตารางนี้ทิ้ง (ข้อมูล Audit จะหายไปด้วย)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a5f1c9d2e7b3"
down_revision: Union[str, Sequence[str], None] = "b41d7ce09f35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ACTION_CHECK = "action IN ('ORDER_CONTACT_REVEAL')"
TARGET_CHECK = "target_type IN ('ORDER')"
# เหตุผลว่างหรือสั้นเกินไปไม่นับเป็นเหตุผล บังคับที่ฐานข้อมูลด้วยไม่ใช่แค่ใน API
REASON_CHECK = "length(trim(reason)) >= 10"


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "admin_access_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(ACTION_CHECK, name="ck_admin_access_logs_action"),
        sa.CheckConstraint(TARGET_CHECK, name="ck_admin_access_logs_target_type"),
        sa.CheckConstraint(REASON_CHECK, name="ck_admin_access_logs_reason"),
        sa.ForeignKeyConstraint(["admin_id"], ["users.id"], name="fk_admin_access_logs_admin"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_admin_access_logs_target",
        "admin_access_logs",
        ["target_type", "target_id", "created_at"],
    )
    op.create_index(
        "ix_admin_access_logs_admin",
        "admin_access_logs",
        ["admin_id", "created_at"],
    )

    # เปิด RLS ไว้เหมือนตารางอื่นใน public schema ของ Supabase: ไม่มี policy แปลว่า
    # anon/authenticated ผ่าน PostgREST อ่านไม่ได้เลย ส่วน backend ต่อด้วย role เจ้าของตาราง
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE public.admin_access_logs ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_admin_access_logs_admin", table_name="admin_access_logs")
    op.drop_index("ix_admin_access_logs_target", table_name="admin_access_logs")
    op.drop_table("admin_access_logs")
