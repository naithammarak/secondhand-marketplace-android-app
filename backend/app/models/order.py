"""ตารางของงานสั่งซื้อและจ่ายเงินจำลอง (ORDER-01)

กติกาสำคัญถูกบังคับที่ฐานข้อมูลด้วย ไม่ใช่แค่ในโค้ด
- สินค้าหนึ่งชิ้นมี Order ที่ยังไม่ยกเลิกได้ครั้งละหนึ่งรายการ
- Payment สำเร็จ, เงินพัก และใบเสร็จ มีได้อย่างละหนึ่งรายการต่อ Order
- ยอดของ Attempt, Payment และ Escrow ต้องเท่ากับยอดรวมใน Order (composite foreign key)
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

MONEY = Numeric(12, 2)

ORDER_STATUSES = ("WAITING_PAYMENT", "WAITING_SELLER_SHIP", "CANCELLED")
CANCEL_REASONS = ("BUYER", "EXPIRED")
ATTEMPT_OUTCOMES = ("SUCCEEDED", "FAILED")
ESCROW_STATUSES = ("HELD",)


def _in_list(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(value) for value in values)})"


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(_in_list("status", ORDER_STATUSES), name="ck_orders_status"),
        CheckConstraint("buyer_id <> seller_id", name="ck_orders_not_self_purchase"),
        CheckConstraint(
            "item_price >= 0 AND shipping_fee >= 0 AND inspection_fee >= 0 "
            "AND commission_fee >= 0 AND seller_payout >= 0",
            name="ck_orders_amounts_non_negative",
        ),
        CheckConstraint(
            "total_amount = item_price + shipping_fee + inspection_fee",
            name="ck_orders_total_amount",
        ),
        CheckConstraint(
            "seller_payout = item_price - commission_fee",
            name="ck_orders_seller_payout",
        ),
        # ยกเลิกแล้วต้องมีทั้งเหตุผลและเวลาเสมอ ยังไม่ยกเลิกต้องไม่มีทั้งคู่ กันสถานะครึ่ง ๆ กลาง ๆ
        CheckConstraint(
            "(status = 'CANCELLED' AND cancelled_at IS NOT NULL "
            f"AND cancel_reason IN ({', '.join(repr(value) for value in CANCEL_REASONS)})) "
            "OR (status <> 'CANCELLED' AND cancelled_at IS NULL AND cancel_reason IS NULL)",
            name="ck_orders_cancel_fields",
        ),
        # จ่ายเงินสำเร็จแล้วยกเลิกไม่ได้ ห้ามมีแถวที่ทั้งจ่ายแล้วและถูกยกเลิก
        CheckConstraint(
            "status <> 'CANCELLED' OR paid_at IS NULL",
            name="ck_orders_cancel_not_paid",
        ),
        UniqueConstraint("buyer_id", "idempotency_key", name="uq_orders_buyer_idempotency_key"),
        # ให้ payment/escrow อ้างอิงคู่ (id, total_amount) ได้ เพื่อบังคับยอดเท่ากันที่ฐานข้อมูล
        UniqueConstraint("id", "total_amount", name="uq_orders_id_total_amount"),
        # จองสินค้าได้ผู้ซื้อเดียว ใช้ <> 'CANCELLED' เพื่อให้สถานะในอนาคตถูกกันซ้ำไปด้วย
        Index(
            "uq_orders_active_product",
            "product_id",
            unique=True,
            sqlite_where=text("status <> 'CANCELLED'"),
            postgresql_where=text("status <> 'CANCELLED'"),
        ),
        Index("ix_orders_buyer_created", "buyer_id", "created_at", "id"),
        Index("ix_orders_seller_created", "seller_id", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    buyer_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    seller_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)

    # snapshot ของสินค้า ณ เวลาสั่งซื้อ แก้สินค้าภายหลังแล้ว Order ต้องไม่เปลี่ยน
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_condition: Mapped[str] = mapped_column(String(50), nullable=False)
    product_size: Mapped[str] = mapped_column(String(100), nullable=False)

    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default=text("'THB'"))
    item_price: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    shipping_fee: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    inspection_fee: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    commission_fee: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    seller_payout: Mapped[Decimal] = mapped_column(MONEY, nullable=False)

    ship_recipient_name: Mapped[str] = mapped_column(String(100), nullable=False)
    ship_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    ship_address_line: Mapped[str] = mapped_column(String(255), nullable=False)
    ship_subdistrict: Mapped[str] = mapped_column(String(100), nullable=False)
    ship_district: Mapped[str] = mapped_column(String(100), nullable=False)
    ship_province: Mapped[str] = mapped_column(String(100), nullable=False)
    ship_postal_code: Mapped[str] = mapped_column(String(5), nullable=False)

    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    # กำหนดตอนสร้าง Order เท่านั้น การแก้ค่าหน้าต่างเวลาภายหลังจึงไม่ย้ายเส้นตายของ Order เดิม
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(16), nullable=True)


class PaymentAttempt(Base):
    """ทุกครั้งที่ผู้ซื้อกดจ่าย รวมครั้งที่ล้มเหลว"""

    __tablename__ = "payment_attempts"
    __table_args__ = (
        CheckConstraint(_in_list("outcome", ATTEMPT_OUTCOMES), name="ck_payment_attempts_outcome"),
        CheckConstraint("amount > 0", name="ck_payment_attempts_amount_positive"),
        UniqueConstraint("order_id", "idempotency_key", name="uq_payment_attempts_order_key"),
        ForeignKeyConstraint(
            ["order_id", "amount"],
            ["orders.id", "orders.total_amount"],
            name="fk_payment_attempts_order_amount",
        ),
        Index("ix_payment_attempts_order_id", "order_id", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Payment(Base):
    """Payment ที่สำเร็จเท่านั้น มีได้หนึ่งรายการต่อ Order"""

    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_payments_order_id"),
        UniqueConstraint("attempt_id", name="uq_payments_attempt_id"),
        CheckConstraint("amount > 0", name="ck_payments_amount_positive"),
        ForeignKeyConstraint(
            ["order_id", "amount"],
            ["orders.id", "orders.total_amount"],
            name="fk_payments_order_amount",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False)
    attempt_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("payment_attempts.id"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'SIMULATED'"))
    paid_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Escrow(Base):
    """เงินพักของ Order รอปล่อยให้ผู้ขายในงานรอบถัดไป"""

    __tablename__ = "escrows"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_escrows_order_id"),
        UniqueConstraint("payment_id", name="uq_escrows_payment_id"),
        CheckConstraint(_in_list("status", ESCROW_STATUSES), name="ck_escrows_status"),
        CheckConstraint("amount > 0", name="ck_escrows_amount_positive"),
        ForeignKeyConstraint(
            ["order_id", "amount"],
            ["orders.id", "orders.total_amount"],
            name="fk_escrows_order_amount",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False)
    payment_id: Mapped[int] = mapped_column(Integer, ForeignKey("payments.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    held_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Receipt(Base):
    """ใบเสร็จจำลอง เก็บยอดเป็น snapshot เพื่อให้ใบเดิมไม่เปลี่ยนตามข้อมูลอื่น"""

    __tablename__ = "receipts"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_receipts_order_id"),
        UniqueConstraint("payment_id", name="uq_receipts_payment_id"),
        UniqueConstraint("receipt_no", name="uq_receipts_receipt_no"),
        ForeignKeyConstraint(
            ["order_id", "total_amount"],
            ["orders.id", "orders.total_amount"],
            name="fk_receipts_order_amount",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False)
    payment_id: Mapped[int] = mapped_column(Integer, ForeignKey("payments.id"), nullable=False)
    receipt_no: Mapped[str] = mapped_column(String(32), nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    item_price: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    shipping_fee: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    inspection_fee: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
