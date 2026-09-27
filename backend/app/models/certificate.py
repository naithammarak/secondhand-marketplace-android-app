"""Certificate issued atomically with a qualifying inspection result."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Certificate(Base):
    __tablename__ = "certificates"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_certificates_order_id"),
        UniqueConstraint("inspection_id", name="uq_certificates_inspection_id"),
        UniqueConstraint("certificate_no", name="uq_certificates_no"),
        UniqueConstraint("public_token", name="uq_certificates_public_token"),
        ForeignKeyConstraint(
            ["inspection_id", "order_id"], ["inspections.id", "inspections.order_id"],
            ondelete="RESTRICT", name="fk_certificates_inspection_order",
        ),
        CheckConstraint("result IN ('PASS', 'MINOR_ISSUE')", name="ck_certificates_result"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False)
    inspection_id: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[str] = mapped_column(String(32), nullable=False)
    certificate_no: Mapped[str] = mapped_column(String(40), nullable=False)
    public_token: Mapped[str] = mapped_column(String(100), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
