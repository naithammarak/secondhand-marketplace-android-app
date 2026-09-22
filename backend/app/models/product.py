from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    __table_args__ = (
        CheckConstraint(
            "price > 0",
            name="ck_products_price_positive",
        ),
        CheckConstraint(
            "sale_type = 'FIXED_PRICE'",
            name="ck_products_sale_type",
        ),
        CheckConstraint(
            "condition IN ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR')",
            name="ck_products_condition",
        ),
        CheckConstraint(
            "status IN ('AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED')",
            name="ck_products_status",
        ),
        Index(
            "ix_products_public_status_created_id",
            "status",
            "created_at",
            "id",
            unique=False,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_products_owner_user_created_id",
            "user_id",
            "created_at",
            "id",
            unique=False,
            postgresql_where=text("deleted_at IS NULL"),
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

    category_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("categories.id"),
        nullable=False,
    )

    brand_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("brands.id"),
        nullable=False,
    )

    product_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        String(1000),
        nullable=False,
    )

    size: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    condition: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    sale_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )