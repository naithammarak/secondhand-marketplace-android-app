"""record when a verification was submitted and which admin reviewed it

Revision ID: d5c9e2a71b40
Revises: c7d41b6a90e2
Create Date: 2026-09-18 14:05:12.884210

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d5c9e2a71b40"
down_revision: Union[str, Sequence[str], None] = "c7d41b6a90e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Keep the submission time and an audit trail of the reviewing admin."""
    op.add_column(
        "verifications",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.add_column(
        "verifications",
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_verifications_reviewed_by_users",
        "verifications",
        "users",
        ["reviewed_by"],
        ["id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_verifications_reviewed_by_users", "verifications", type_="foreignkey")
    op.drop_column("verifications", "reviewed_by")
    op.drop_column("verifications", "created_at")
