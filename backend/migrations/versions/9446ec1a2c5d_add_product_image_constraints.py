"""add product image constraints

Revision ID: 9446ec1a2c5d
Revises: daf675afc8fc
Create Date: 2026-09-20 13:48:39.124573

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9446ec1a2c5d"
down_revision: Union[str, Sequence[str], None] = "daf675afc8fc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # sort_order must exist for every product image.
    op.alter_column(
        "product_images",
        "sort_order",
        existing_type=sa.Integer(),
        nullable=False,
    )

    # Each image position must be between 0 and 9.
    op.create_check_constraint(
        "ck_product_images_sort_order",
        "product_images",
        "sort_order >= 0 AND sort_order <= 9",
    )

    # sort_order 0 is the main image; all other positions are gallery images.
    op.create_check_constraint(
        "ck_product_images_photo_type",
        "product_images",
        "(sort_order = 0 AND photo_type = 'MAIN') "
        "OR (sort_order > 0 AND photo_type = 'GALLERY')",
    )


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_constraint(
        "ck_product_images_photo_type",
        "product_images",
        type_="check",
    )

    op.drop_constraint(
        "ck_product_images_sort_order",
        "product_images",
        type_="check",
    )

    op.alter_column(
        "product_images",
        "sort_order",
        existing_type=sa.Integer(),
        nullable=True,
    )