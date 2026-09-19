from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Identity, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProductImage(Base):
    __tablename__ = "product_images"
    __table_args__ = (
        UniqueConstraint("upload_id", name="uq_product_images_upload_id"),
        Index(
            "uq_product_images_product_sort_order",
            "product_id",
            "sort_order",
            unique=True,
            postgresql_where=text("sort_order IS NOT NULL"),
        ),
    )

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
    upload_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("product_uploads.id"), nullable=True
    )
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
