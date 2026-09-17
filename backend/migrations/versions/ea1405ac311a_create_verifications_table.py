"""create verifications table

Revision ID: ea1405ac311a
Revises: 9ff73113281a
Create Date: 2026-09-16 23:37:43.569099

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "ea1405ac311a"
down_revision: Union[str, Sequence[str], None] = "b3f1a6c8d902"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "verifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("id_card_image_url", sa.String(length=500), nullable=False),
        sa.Column("bank_account_name", sa.String(length=255), nullable=False),
        sa.Column("bank_account_number", sa.String(length=50), nullable=False),
        sa.Column("bank_name", sa.String(length=255), nullable=False),
        sa.Column("verification_status", sa.String(length=20), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reject_reason", sa.String(length=500), nullable=True),
        sa.Column("purge_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("verifications")