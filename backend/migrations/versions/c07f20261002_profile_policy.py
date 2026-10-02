"""PROFILE-01: nullable policy acknowledgement after A/task02."""
from alembic import op
import sqlalchemy as sa

revision = "c07f20261002"
down_revision = "a02f20261002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("privacy_policy_version", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("privacy_acknowledged_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint("ck_users_policy_pair", "users", "(privacy_policy_version IS NULL) = (privacy_acknowledged_at IS NULL)")


def downgrade():
    raise RuntimeError("PROFILE downgrade refused: preserve recorded policy acknowledgement")
