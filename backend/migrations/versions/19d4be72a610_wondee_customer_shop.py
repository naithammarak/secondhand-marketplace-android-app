"""Wondee customer default and public shop name.

Legacy null roles are normalized forward-only: downgrade cannot identify which
BUYER accounts used to have null roles and deliberately keeps all roles intact.
"""
from alembic import op
import sqlalchemy as sa

revision = "19d4be72a610"
down_revision = "c93b7e5a1d84"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("verifications", sa.Column("shop_name", sa.String(100), nullable=True))
    op.create_check_constraint(
        "ck_verifications_shop_name", "verifications",
        "shop_name IS NULL OR (shop_name = trim(shop_name) AND length(shop_name) BETWEEN 2 AND 100)",
    )
    op.execute("UPDATE users SET role = 'BUYER' WHERE role IS NULL")
    op.alter_column("users", "role", existing_type=sa.String(16), server_default=sa.text("'BUYER'"))


def downgrade():
    op.alter_column("users", "role", existing_type=sa.String(16), server_default=None)
    op.drop_constraint("ck_verifications_shop_name", "verifications", type_="check")
    op.drop_column("verifications", "shop_name")
