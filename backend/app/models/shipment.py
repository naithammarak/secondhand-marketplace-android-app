"""Shipment and private courier delivery proof metadata."""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Shipment(Base):
    __tablename__ = "shipments"
    __table_args__ = (
        UniqueConstraint("order_id", "leg", name="uq_shipments_order_leg"),
        UniqueConstraint("id", "courier_id", name="uq_shipments_courier"),
        UniqueConstraint("id", "courier_delivered_at", name="uq_shipments_delivery_time"),
        Index("uq_shipments_one_outbound", "order_id", unique=True, postgresql_where=text("leg IN ('TO_BUYER','TO_SELLER')"), sqlite_where=text("leg IN ('TO_BUYER','TO_SELLER')")),
        CheckConstraint("leg = 'TO_CENTER' OR destination_address IS NOT NULL", name="ck_shipments_outbound_destination"),
        CheckConstraint("leg IN ('TO_CENTER', 'TO_BUYER', 'TO_SELLER')", name="ck_shipments_leg"),
        CheckConstraint("status IN ('IN_TRANSIT', 'DELIVERED')", name="ck_shipments_status"),
        CheckConstraint("length(carrier) BETWEEN 1 AND 100 AND carrier = trim(carrier)", name="ck_shipments_carrier"),
        CheckConstraint("length(tracking_number) BETWEEN 1 AND 100 AND tracking_number = trim(tracking_number)", name="ck_shipments_tracking_number"),
        CheckConstraint("received_note IS NULL OR (length(received_note) <= 1000 AND received_note = trim(received_note))", name="ck_shipments_received_note"),
        CheckConstraint("courier_delivered_at IS NULL OR (courier_id IS NOT NULL AND courier_delivered_at >= shipped_at)", name="ck_shipments_courier_delivery"),
        CheckConstraint("(leg = 'TO_CENTER' AND ((status = 'IN_TRANSIT' AND received_at IS NULL AND received_by IS NULL) OR (status = 'DELIVERED' AND received_at IS NOT NULL AND received_by IS NOT NULL AND courier_delivered_at IS NOT NULL AND received_at >= courier_delivered_at))) OR (leg IN ('TO_BUYER', 'TO_SELLER') AND received_at IS NULL AND received_by IS NULL AND ((status = 'IN_TRANSIT' AND courier_delivered_at IS NULL) OR (status = 'DELIVERED' AND courier_delivered_at IS NOT NULL)))", name="ck_shipments_receipt"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False)
    leg: Mapped[str] = mapped_column(String(16), nullable=False, server_default="TO_CENTER")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="IN_TRANSIT")
    carrier: Mapped[str] = mapped_column(String(100), nullable=False)
    tracking_number: Mapped[str] = mapped_column(String(100), nullable=False)
    shipped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    confirmation_txid: Mapped[int | None] = mapped_column(BigInteger)
    destination_address: Mapped[dict | None] = mapped_column(JSON)
    courier_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"))
    courier_delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"))
    received_note: Mapped[str | None] = mapped_column(String(1000))


class ShipmentDeliveryProof(Base):
    __tablename__ = "shipment_delivery_proofs"
    __table_args__ = (
        UniqueConstraint("object_key", name="uq_shipment_delivery_proofs_object_key"),
        UniqueConstraint("id", "shipment_id", "uploaded_by", name="uq_proofs_shipment_uploader"),
        UniqueConstraint("shipment_id", "sort_order", name="uq_shipment_delivery_proofs_order"),
        CheckConstraint("sort_order BETWEEN 0 AND 2", name="ck_shipment_delivery_proofs_sort_order"),
        CheckConstraint("mime_type IN ('image/jpeg', 'image/png')", name="ck_shipment_delivery_proofs_mime_type"),
        CheckConstraint("size_bytes BETWEEN 1 AND 5242880", name="ck_shipment_delivery_proofs_size_bytes"),
        CheckConstraint("length(sha256) = 64 AND sha256 !~ '[^0-9a-f]'", name="ck_shipment_delivery_proofs_sha256").ddl_if(dialect="postgresql"),
        CheckConstraint("length(object_key) BETWEEN 1 AND 500 AND object_key = trim(object_key)", name="ck_shipment_delivery_proofs_object_key"),
        Index("ix_shipment_delivery_proofs_shipment_id", "shipment_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    shipment_id: Mapped[int] = mapped_column(Integer, ForeignKey("shipments.id", ondelete="RESTRICT"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(32), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
