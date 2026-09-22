"""add product constraints and indexes

Revision ID: daf675afc8fc
Revises: f3862bffea77
Create Date: 2026-09-20 13:31:13.936035

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "daf675afc8fc"
down_revision: Union[str, Sequence[str], None] = "f3862bffea77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    op.create_check_constraint(
        "ck_products_price_positive",
        "products",
        "price > 0",
    )

    op.create_check_constraint(
        "ck_products_sale_type",
        "products",
        "sale_type = 'FIXED_PRICE'",
    )

    op.create_check_constraint(
        "ck_products_condition",
        "products",
        "condition IN ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR')",
    )

    op.create_check_constraint(
        "ck_products_status",
        "products",
        "status IN ('AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED')",
    )

    op.create_index(
        "ix_products_public_status_created_id",
        "products",
        ["status", "created_at", "id"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_index(
        "ix_products_owner_user_created_id",
        "products",
        ["user_id", "created_at", "id"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_index(
        "ix_products_owner_user_created_id",
        table_name="products",
    )

    op.drop_index(
        "ix_products_public_status_created_id",
        table_name="products",
    )

    op.drop_constraint(
        "ck_products_status",
        "products",
        type_="check",
    )

    op.drop_constraint(
        "ck_products_condition",
        "products",
        type_="check",
    )

    op.drop_constraint(
        "ck_products_sale_type",
        "products",
        type_="check",
    )

    op.drop_constraint(
        "ck_products_price_positive",
        "products",
        type_="check",
    )