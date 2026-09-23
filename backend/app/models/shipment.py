"""Inbound shipment for an Order undergoing inspection."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Shipment(Base):
    __tablename__ = "shipments"
    __table_args__ = (
        UniqueConstraint("order_id", "leg", name="uq_shipments_order_leg"),
        CheckConstraint("leg = 'TO_CENTER'", name="ck_shipments_leg"),
        CheckConstraint("status IN ('IN_TRANSIT', 'DELIVERED')", name="ck_shipments_status"),
        CheckConstraint("length(carrier) BETWEEN 1 AND 100 AND carrier = trim(carrier)", name="ck_shipments_carrier"),
        CheckConstraint("length(tracking_number) BETWEEN 1 AND 100 AND tracking_number = trim(tracking_number)", name="ck_shipments_tracking_number"),
        CheckConstraint("received_note IS NULL OR (length(received_note) <= 1000 AND received_note = trim(received_note))", name="ck_shipments_received_note"),
        CheckConstraint("(status = 'IN_TRANSIT' AND received_at IS NULL AND received_by IS NULL) OR (status = 'DELIVERED' AND received_at IS NOT NULL AND received_by IS NOT NULL AND received_at >= shipped_at)", name="ck_shipments_receipt"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False)
    leg: Mapped[str] = mapped_column(String(16), nullable=False, server_default="TO_CENTER")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="IN_TRANSIT")
    carrier: Mapped[str] = mapped_column(String(100), nullable=False)
    tracking_number: Mapped[str] = mapped_column(String(100), nullable=False)
    shipped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"))
    received_note: Mapped[str | None] = mapped_column(String(1000))
