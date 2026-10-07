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
    # VERIFY deployments may already have the compatible VARCHAR(255) shop
    # field. Preserve that column and its data instead of shrinking it.
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"]: column for column in inspector.get_columns("verifications")}
    existing = columns.get("shop_name")
    if existing is None:
        op.add_column("verifications", sa.Column("shop_name", sa.String(100), nullable=True))
        op.create_check_constraint(
            "ck_verifications_shop_name", "verifications",
            "shop_name IS NULL OR (shop_name = trim(shop_name) AND length(shop_name) BETWEEN 2 AND 100)",
        )
        op.execute("COMMENT ON COLUMN verifications.shop_name IS 'Created by Wondee migration 19d4be72a610'")
    elif not (isinstance(existing["type"], sa.String) and existing["nullable"]
              and (existing["type"].length is None or existing["type"].length >= 100)):
        raise RuntimeError("Existing shop_name schema is incompatible; review before migration")
    op.execute("UPDATE users SET role = 'BUYER' WHERE role IS NULL")
    op.alter_column("users", "role", existing_type=sa.String(16), server_default=sa.text("'BUYER'"))


def downgrade():
    # A pre-existing VERIFY field/default belongs to the previous deployment.
    # Only remove the field when this migration created it.
    columns = sa.inspect(op.get_bind()).get_columns("verifications")
    created_here = any(column["name"] == "shop_name" and column.get("comment") ==
                       "Created by Wondee migration 19d4be72a610" for column in columns)
    if created_here:
        op.alter_column("users", "role", existing_type=sa.String(16), server_default=None)
        op.drop_constraint("ck_verifications_shop_name", "verifications", type_="check")
        op.drop_column("verifications", "shop_name")
