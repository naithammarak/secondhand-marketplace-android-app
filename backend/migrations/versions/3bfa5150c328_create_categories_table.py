"""create categories table

Revision ID: 3bfa5150c328
Revises: a17abbc276d7
Create Date: 2026-09-13 07:45:03.800534

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3bfa5150c328"
down_revision: Union[str, Sequence[str], None] = "a17abbc276d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("parent_category_id", sa.Integer(), nullable=True),
        sa.Column("category_name", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(
            ["parent_category_id"],
            ["categories.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("categories")