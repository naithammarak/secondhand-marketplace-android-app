"""Certificate row for atomic positive inspection results.

Revision ID: c7e4b21a9d08
Revises: f3c1a09d8b56
"""

from alembic import op
import sqlalchemy as sa


revision = "c7e4b21a9d08"
down_revision = "f3c1a09d8b56"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "certificates",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("order_id", sa.Integer, sa.ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("inspection_id", sa.Integer, nullable=False),
        sa.Column("result", sa.String(32), nullable=False),
        sa.Column("certificate_no", sa.String(40), nullable=False),
        sa.Column("public_token", sa.String(100), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("order_id", name="uq_certificates_order_id"),
        sa.UniqueConstraint("inspection_id", name="uq_certificates_inspection_id"),
        sa.UniqueConstraint("certificate_no", name="uq_certificates_no"),
        sa.UniqueConstraint("public_token", name="uq_certificates_public_token"),
        sa.ForeignKeyConstraint(
            ["inspection_id", "order_id"], ["inspections.id", "inspections.order_id"],
            ondelete="RESTRICT", name="fk_certificates_inspection_order",
        ),
        sa.CheckConstraint("result IN ('PASS', 'MINOR_ISSUE')", name="ck_certificates_result"),
    )
    op.execute("ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY")


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT EXISTS (SELECT 1 FROM public.certificates LIMIT 1)")).scalar_one():
        raise RuntimeError("certificate downgrade refused: certificate data exists")
    op.drop_table("certificates")
