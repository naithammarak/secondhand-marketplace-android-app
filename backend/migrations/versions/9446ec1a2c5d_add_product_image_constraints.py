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

    # Backfill sort_order for any existing product images where sort_order IS NULL.
    op.execute(
        """
        WITH ranked_nulls AS (
            SELECT
                product_id,
                image_id,
                COALESCE(
                    (SELECT MAX(sort_order) FROM product_images existing WHERE existing.product_id = pi.product_id),
                    -1
                ) + ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY image_id) AS assigned_sort_order
            FROM product_images pi
            WHERE sort_order IS NULL
        )
        UPDATE product_images AS img
        SET sort_order = ranked_nulls.assigned_sort_order
        FROM ranked_nulls
        WHERE img.product_id = ranked_nulls.product_id
          AND img.image_id = ranked_nulls.image_id
        """
    )

    # Normalize photo_type before adding constraint:
    # sort_order = 0 -> 'MAIN', sort_order > 0 -> 'GALLERY'
    op.execute(
        """
        UPDATE product_images
        SET photo_type = CASE
            WHEN sort_order = 0 THEN 'MAIN'
            ELSE 'GALLERY'
        END
        """
    )

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