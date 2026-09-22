"""add verification constraints, queue indexes, and enable rls

Revision ID: f02a03c91801
Revises: e8a4f1c02d77
Create Date: 2026-09-19 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f02a03c91801"
down_revision: Union[str, Sequence[str], None] = "e8a4f1c02d77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add check constraints, queue indexes, and enable RLS on verifications."""
    op.create_check_constraint(
        "ck_verifications_status",
        "verifications",
        "verification_status IN ('PENDING', 'APPROVED', 'REJECTED')",
    )
    op.create_check_constraint(
        "ck_verifications_reject_reason",
        "verifications",
        "verification_status != 'REJECTED' OR (reject_reason IS NOT NULL AND length(trim(reject_reason)) BETWEEN 5 AND 500)",
    )
    op.create_index(
        "ix_verifications_queue",
        "verifications",
        ["verification_status", "created_at", "id"],
    )
    op.create_index(
        "ix_verifications_owner_latest",
        "verifications",
        ["user_id", "created_at", "id"],
    )

    op.execute("ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL PRIVILEGES ON TABLE public.verifications FROM anon;
            END IF;
            IF EXISTS (
                SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'
            ) THEN
                REVOKE ALL PRIVILEGES ON TABLE public.verifications FROM authenticated;
            END IF;
        END
        $$
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_verifications_owner_latest", table_name="verifications")
    op.drop_index("ix_verifications_queue", table_name="verifications")
    op.drop_constraint("ck_verifications_reject_reason", "verifications", type_="check")
    op.drop_constraint("ck_verifications_status", "verifications", type_="check")
    op.execute("ALTER TABLE public.verifications DISABLE ROW LEVEL SECURITY")
