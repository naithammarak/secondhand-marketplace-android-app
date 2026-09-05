"""create users table

Revision ID: b3f1a6c8d902
Revises: 9ff73113281a
Create Date: 2026-09-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3f1a6c8d902"
down_revision: Union[str, Sequence[str], None] = "9ff73113281a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the application user table and deny direct Data API access."""
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supabase_user_id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'ACTIVE'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IS NULL OR role IN ('BUYER', 'SELLER', 'ADMIN', 'INSPECTOR')",
            name="ck_users_role",
        ),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')",
            name="ck_users_status",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint(
            "supabase_user_id",
            name="uq_users_supabase_user_id",
        ),
    )

    op.execute("ALTER TABLE public.users ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL PRIVILEGES ON TABLE public.users FROM anon;
            END IF;
            IF EXISTS (
                SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'
            ) THEN
                REVOKE ALL PRIVILEGES ON TABLE public.users FROM authenticated;
            END IF;
        END
        $$
        """
    )


def downgrade() -> None:
    """Drop only the application user table created by this revision."""
    op.drop_table("users")
