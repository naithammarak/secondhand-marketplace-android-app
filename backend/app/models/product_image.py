from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Identity, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProductImage(Base):
    __tablename__ = "product_images"

    product_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("products.id"),
        primary_key=True,
    )

    image_id: Mapped[int] = mapped_column(
        Integer,
        Identity(),
        primary_key=True,
    )

    image_url: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    file_size: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    photo_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )