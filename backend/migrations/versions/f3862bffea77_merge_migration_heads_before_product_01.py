"""merge migration heads before product-01

Revision ID: f3862bffea77
Revises: 9a18d37ce520, f02a03c91801
Create Date: 2026-09-20 13:25:27.097931

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3862bffea77'
down_revision: Union[str, Sequence[str], None] = ('9a18d37ce520', 'f02a03c91801')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
