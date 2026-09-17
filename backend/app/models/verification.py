from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Verification(Base):
    __tablename__ = "verifications"

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