"""create product images table

Revision ID: b3f13a88f22a
Revises: da43dcf1f8fd
Create Date: 2026-09-13 07:51:26.437784

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3f13a88f22a"
down_revision: Union[str, Sequence[str], None] = "da43dcf1f8fd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "product_images",
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("image_id", sa.Integer(), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column("photo_type", sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
        ),
        sa.PrimaryKeyConstraint(
            "product_id",
            "image_id",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("product_images")