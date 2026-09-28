from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Verification(Base):
    __tablename__ = "verifications"
    __table_args__ = (
        CheckConstraint(
            "shop_name IS NULL OR (shop_name = trim(shop_name) AND length(shop_name) BETWEEN 2 AND 100)",
            name="ck_verifications_shop_name",
        ),
        # ผู้ขายหนึ่งคนมีคำขอที่รอตรวจได้ครั้งละหนึ่งใบ กันการกดส่งซ้ำพร้อมกันหลายอุปกรณ์
        Index(
            "uq_verifications_user_pending",
            "user_id",
            unique=True,
            sqlite_where=text("verification_status = 'PENDING'"),
            postgresql_where=text("verification_status = 'PENDING'"),
        ),
        Index(
            "ix_verifications_queue",
            "verification_status",
            "created_at",
            "id",
        ),
        Index(
            "ix_verifications_owner_latest",
            "user_id",
            "created_at",
            "id",
        ),
        CheckConstraint(
            "verification_status IN ('PENDING', 'APPROVED', 'REJECTED')",
            name="ck_verifications_status",
        ),
        CheckConstraint(
            "verification_status != 'REJECTED' OR (reject_reason IS NOT NULL AND length(trim(reject_reason)) BETWEEN 5 AND 500)",
            name="ck_verifications_reject_reason",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    id_card_image_url: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    bank_account_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    bank_account_number: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    bank_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    shop_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    verification_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    reject_reason: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    reviewed_by: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )

    purge_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
