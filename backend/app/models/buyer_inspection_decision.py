"""One immutable buyer decision per qualifying final inspection.

PostgreSQL migration also installs an UPDATE/DELETE guard. API normalization,
authorization, state checks and identical-request replay belong to CERT-04.
"""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BuyerInspectionDecision(Base):
    __tablename__ = "buyer_inspection_decisions"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_buyer_decisions_order_id"),
        UniqueConstraint("inspection_id", name="uq_buyer_decisions_inspection_id"),
        ForeignKeyConstraint(
            ["order_id", "buyer_id"], ["orders.id", "orders.buyer_id"],
            ondelete="RESTRICT", name="fk_buyer_decisions_order_buyer",
        ),
        ForeignKeyConstraint(
            ["inspection_id", "order_id"], ["inspections.id", "inspections.order_id"],
            ondelete="RESTRICT", name="fk_buyer_decisions_inspection_order",
        ),
        ForeignKeyConstraint(
            ["inspection_id", "order_id"], ["certificates.inspection_id", "certificates.order_id"],
            ondelete="RESTRICT", name="fk_buyer_decisions_certificate",
        ),
        CheckConstraint("decision IN ('CONFIRM', 'REJECT')", name="ck_buyer_decisions_decision"),
        CheckConstraint("decision <> 'CONFIRM' OR reason IS NULL", name="ck_buyer_decisions_confirm_reason"),
        CheckConstraint(
            "reason IS NULL OR (length(reason) BETWEEN 1 AND 500 AND reason = trim(reason))",
            name="ck_buyer_decisions_reason",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, nullable=False)
    inspection_id: Mapped[int] = mapped_column(Integer, nullable=False)
    buyer_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    decision: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500))
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
