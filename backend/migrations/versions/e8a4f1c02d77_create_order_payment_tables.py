"""create order, payment attempt, payment, escrow and receipt tables (ORDER-01)

Revision ID: e8a4f1c02d77
Revises: d5c9e2a71b40
Create Date: 2026-09-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8a4f1c02d77"
down_revision: Union[str, Sequence[str], None] = "d5c9e2a71b40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MONEY = sa.Numeric(precision=12, scale=2)


def _timestamp(name: str, nullable: bool = False) -> sa.Column:
    if nullable:
        return sa.Column(name, sa.DateTime(timezone=True), nullable=True)
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("buyer_id", sa.Integer(), nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("product_condition", sa.String(length=50), nullable=False),
        sa.Column("product_size", sa.String(length=100), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default=sa.text("'THB'"), nullable=False),
        sa.Column("item_price", MONEY, nullable=False),
        sa.Column("shipping_fee", MONEY, nullable=False),
        sa.Column("inspection_fee", MONEY, nullable=False),
        sa.Column("commission_fee", MONEY, nullable=False),
        sa.Column("total_amount", MONEY, nullable=False),
        sa.Column("seller_payout", MONEY, nullable=False),
        sa.Column("ship_recipient_name", sa.String(length=100), nullable=False),
        sa.Column("ship_phone", sa.String(length=20), nullable=False),
        sa.Column("ship_address_line", sa.String(length=255), nullable=False),
        sa.Column("ship_subdistrict", sa.String(length=100), nullable=False),
        sa.Column("ship_district", sa.String(length=100), nullable=False),
        sa.Column("ship_province", sa.String(length=100), nullable=False),
        sa.Column("ship_postal_code", sa.String(length=5), nullable=False),
        sa.Column("idempotency_key", sa.String(length=100), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        _timestamp("paid_at", nullable=True),
        sa.CheckConstraint(
            "status IN ('WAITING_PAYMENT', 'WAITING_SELLER_SHIP')", name="ck_orders_status"
        ),
        sa.CheckConstraint("buyer_id <> seller_id", name="ck_orders_not_self_purchase"),
        sa.CheckConstraint(
            "item_price >= 0 AND shipping_fee >= 0 AND inspection_fee >= 0 "
            "AND commission_fee >= 0 AND seller_payout >= 0",
            name="ck_orders_amounts_non_negative",
        ),
        sa.CheckConstraint(
            "total_amount = item_price + shipping_fee + inspection_fee",
            name="ck_orders_total_amount",
        ),
        sa.CheckConstraint(
            "seller_payout = item_price - commission_fee", name="ck_orders_seller_payout"
        ),
        sa.ForeignKeyConstraint(["buyer_id"], ["users.id"], name="fk_orders_buyer_id_users"),
        sa.ForeignKeyConstraint(["seller_id"], ["users.id"], name="fk_orders_seller_id_users"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], name="fk_orders_product_id_products"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("buyer_id", "idempotency_key", name="uq_orders_buyer_idempotency_key"),
        sa.UniqueConstraint("id", "total_amount", name="uq_orders_id_total_amount"),
    )
    op.create_index(
        "uq_orders_active_product",
        "orders",
        ["product_id"],
        unique=True,
        postgresql_where=sa.text("status <> 'CANCELLED'"),
    )
    op.create_index("ix_orders_buyer_created", "orders", ["buyer_id", "created_at", "id"])
    op.create_index("ix_orders_seller_created", "orders", ["seller_id", "created_at", "id"])

    op.create_table(
        "payment_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("idempotency_key", sa.String(length=100), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        _timestamp("created_at"),
        sa.CheckConstraint("outcome IN ('SUCCEEDED', 'FAILED')", name="ck_payment_attempts_outcome"),
        sa.CheckConstraint("amount > 0", name="ck_payment_attempts_amount_positive"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], name="fk_payment_attempts_order_id_orders"),
        sa.ForeignKeyConstraint(
            ["order_id", "amount"],
            ["orders.id", "orders.total_amount"],
            name="fk_payment_attempts_order_amount",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", "idempotency_key", name="uq_payment_attempts_order_key"),
    )
    op.create_index("ix_payment_attempts_order_id", "payment_attempts", ["order_id", "id"])

    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("attempt_id", sa.Integer(), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("method", sa.String(length=20), server_default=sa.text("'SIMULATED'"), nullable=False),
        _timestamp("paid_at"),
        sa.CheckConstraint("amount > 0", name="ck_payments_amount_positive"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], name="fk_payments_order_id_orders"),
        sa.ForeignKeyConstraint(
            ["attempt_id"], ["payment_attempts.id"], name="fk_payments_attempt_id_payment_attempts"
        ),
        sa.ForeignKeyConstraint(
            ["order_id", "amount"],
            ["orders.id", "orders.total_amount"],
            name="fk_payments_order_amount",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", name="uq_payments_order_id"),
        sa.UniqueConstraint("attempt_id", name="uq_payments_attempt_id"),
    )

    op.create_table(
        "escrows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("payment_id", sa.Integer(), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        _timestamp("held_at"),
        sa.CheckConstraint("status IN ('HELD')", name="ck_escrows_status"),
        sa.CheckConstraint("amount > 0", name="ck_escrows_amount_positive"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], name="fk_escrows_order_id_orders"),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], name="fk_escrows_payment_id_payments"),
        sa.ForeignKeyConstraint(
            ["order_id", "amount"],
            ["orders.id", "orders.total_amount"],
            name="fk_escrows_order_amount",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", name="uq_escrows_order_id"),
        sa.UniqueConstraint("payment_id", name="uq_escrows_payment_id"),
    )

    op.create_table(
        "receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("payment_id", sa.Integer(), nullable=False),
        sa.Column("receipt_no", sa.String(length=32), nullable=False),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("item_price", MONEY, nullable=False),
        sa.Column("shipping_fee", MONEY, nullable=False),
        sa.Column("inspection_fee", MONEY, nullable=False),
        sa.Column("total_amount", MONEY, nullable=False),
        _timestamp("issued_at"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], name="fk_receipts_order_id_orders"),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], name="fk_receipts_payment_id_payments"),
        sa.ForeignKeyConstraint(
            ["order_id", "total_amount"],
            ["orders.id", "orders.total_amount"],
            name="fk_receipts_order_amount",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", name="uq_receipts_order_id"),
        sa.UniqueConstraint("payment_id", name="uq_receipts_payment_id"),
        sa.UniqueConstraint("receipt_no", name="uq_receipts_receipt_no"),
    )

    # ตารางใหม่อยู่ใน public schema ของ Supabase จึงเปิด RLS ไว้ก่อนเหมือน test_messages
    # Backend ต่อฐานข้อมูลด้วย role เจ้าของตารางจึงไม่ถูก RLS บล็อก ส่วน anon/authenticated
    # ผ่าน PostgREST จะอ่านไม่ได้เพราะไม่มี policy
    for table in ("orders", "payment_attempts", "payments", "escrows", "receipts"):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("receipts")
    op.drop_table("escrows")
    op.drop_table("payments")
    op.drop_index("ix_payment_attempts_order_id", table_name="payment_attempts")
    op.drop_table("payment_attempts")
    op.drop_index("ix_orders_seller_created", table_name="orders")
    op.drop_index("ix_orders_buyer_created", table_name="orders")
    op.drop_index("uq_orders_active_product", table_name="orders")
    op.drop_table("orders")
