"""add partial unique index for pending seller verifications

Revision ID: c7d41b6a90e2
Revises: b3f13a88f22a
Create Date: 2026-09-18 10:12:07.114233

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7d41b6a90e2"
down_revision: Union[str, Sequence[str], None] = "b3f13a88f22a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Allow at most one pending verification request per seller."""
    op.create_index(
        "uq_verifications_user_pending",
        "verifications",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("verification_status = 'PENDING'"),
        sqlite_where=sa.text("verification_status = 'PENDING'"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_verifications_user_pending", table_name="verifications")
