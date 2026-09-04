"""enable rls on test messages

Revision ID: 9ff73113281a
Revises: 7c2146b03fa3
Create Date: 2026-09-04 20:24:41.022899

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9ff73113281a'
down_revision: Union[str, Sequence[str], None] = '7c2146b03fa3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Enable RLS on test_messages."""
    op.execute(
        "ALTER TABLE public.test_messages "
        "ENABLE ROW LEVEL SECURITY"
    )


def downgrade() -> None:
    """Disable RLS on test_messages."""
    op.execute(
        "ALTER TABLE public.test_messages "
        "DISABLE ROW LEVEL SECURITY"
    )
