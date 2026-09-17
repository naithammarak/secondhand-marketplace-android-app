from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Verification(Base):
    __tablename__ = "verifications"
    __table_args__ = (
        # ผู้ขายหนึ่งคนมีคำขอที่รอตรวจได้ครั้งละหนึ่งใบ กันการกดส่งซ้ำพร้อมกันหลายอุปกรณ์
        Index(
            "uq_verifications_user_pending",
            "user_id",
            unique=True,
            sqlite_where=text("verification_status = 'PENDING'"),
            postgresql_where=text("verification_status = 'PENDING'"),
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

    verification_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
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

    purge_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )