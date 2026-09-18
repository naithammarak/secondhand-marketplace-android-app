"""Link newly uploaded private objects to product images without losing old rows.

Revision ID: 54ca8e0731bd
Revises: 7f4c2e91a6b0
"""

from alembic import op
import sqlalchemy as sa


revision = "54ca8e0731bd"
down_revision = "7f4c2e91a6b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("product_images", sa.Column("upload_id", sa.Integer(), nullable=True))
    op.add_column("product_images", sa.Column("sort_order", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_product_images_upload_id_product_uploads",
        "product_images",
        "product_uploads",
        ["upload_id"],
        ["id"],
    )
    op.create_unique_constraint(
        "uq_product_images_upload_id", "product_images", ["upload_id"]
    )
    # Existing public URLs and image rows remain unchanged. Give them stable
    # order while keeping upload_id NULL until a reviewed object migration.
    op.execute(
        """
        WITH ranked AS (
            SELECT product_id, image_id,
                   row_number() OVER (
                       PARTITION BY product_id ORDER BY image_id
                   ) - 1 AS position
            FROM product_images
        )
        UPDATE product_images AS image
        SET sort_order = ranked.position
        FROM ranked
        WHERE image.product_id = ranked.product_id
          AND image.image_id = ranked.image_id
        """
    )
    op.create_index(
        "uq_product_images_product_sort_order",
        "product_images",
        ["product_id", "sort_order"],
        unique=True,
        postgresql_where=sa.text("sort_order IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_product_images_product_sort_order", table_name="product_images")
    op.drop_constraint("uq_product_images_upload_id", "product_images", type_="unique")
    op.drop_constraint(
        "fk_product_images_upload_id_product_uploads", "product_images", type_="foreignkey"
    )
    op.drop_column("product_images", "sort_order")
    op.drop_column("product_images", "upload_id")
