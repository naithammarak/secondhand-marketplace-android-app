"""Private product image uploaded by a seller before product creation."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Identity, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProductUpload(Base):
    __tablename__ = "product_uploads"
    __table_args__ = (
        CheckConstraint(
            "state IN ('PENDING', 'ATTACHED', 'DETACHED')",
            name="ck_product_uploads_state",
        ),
        CheckConstraint(
            "mime_type IN ('image/jpeg', 'image/png')",
            name="ck_product_uploads_mime_type",
        ),
        CheckConstraint(
            "file_size > 0 AND file_size <= 5242880",
            name="ck_product_uploads_file_size",
        ),
        CheckConstraint(
            "expires_at > uploaded_at",
            name="ck_product_uploads_expiry",
        ),
        CheckConstraint(
            "(state != 'PENDING' OR attached_product_id IS NULL) "
            "AND (state != 'ATTACHED' OR attached_product_id IS NOT NULL)",
            name="ck_product_uploads_attachment",
        ),
        UniqueConstraint("object_key", name="uq_product_uploads_object_key"),
        Index("ix_product_uploads_owner_state_expiry", "user_id", "state", "expires_at"),
        Index("ix_product_uploads_attached_product_id", "attached_product_id"),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    state: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="PENDING"
    )
    attached_product_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("products.id"), nullable=True
    )
