"""Create private pending product uploads (PRODUCT-02).

Revision ID: 7f4c2e91a6b0
Revises: c6b19e0d4f2a

The shared database currently sits at c6b19e0d4f2a. This revision can be
applied by itself without applying the independent verification/order branch.
"""

from alembic import op
import sqlalchemy as sa


revision = "7f4c2e91a6b0"
down_revision = "c6b19e0d4f2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_uploads",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("object_key", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=50), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "state",
            sa.String(length=20),
            server_default=sa.text("'PENDING'"),
            nullable=False,
        ),
        sa.Column("attached_product_id", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "state IN ('PENDING', 'ATTACHED', 'DETACHED')",
            name="ck_product_uploads_state",
        ),
        sa.CheckConstraint(
            "mime_type IN ('image/jpeg', 'image/png')",
            name="ck_product_uploads_mime_type",
        ),
        sa.CheckConstraint(
            "file_size > 0 AND file_size <= 5242880",
            name="ck_product_uploads_file_size",
        ),
        sa.CheckConstraint(
            "expires_at > uploaded_at",
            name="ck_product_uploads_expiry",
        ),
        sa.CheckConstraint(
            "(state != 'PENDING' OR attached_product_id IS NULL) "
            "AND (state != 'ATTACHED' OR attached_product_id IS NOT NULL)",
            name="ck_product_uploads_attachment",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_product_uploads_user_id_users"
        ),
        sa.ForeignKeyConstraint(
            ["attached_product_id"],
            ["products.id"],
            name="fk_product_uploads_attached_product_id_products",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_product_uploads"),
        sa.UniqueConstraint("object_key", name="uq_product_uploads_object_key"),
    )
    op.create_index(
        "ix_product_uploads_owner_state_expiry",
        "product_uploads",
        ["user_id", "state", "expires_at"],
    )
    op.create_index(
        "ix_product_uploads_attached_product_id",
        "product_uploads",
        ["attached_product_id"],
    )

    # The backend owns this registry; mobile clients never query it via PostgREST.
    op.execute("ALTER TABLE public.product_uploads ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL PRIVILEGES ON TABLE public.product_uploads FROM anon;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                REVOKE ALL PRIVILEGES ON TABLE public.product_uploads FROM authenticated;
            END IF;
        END
        $$
        """
    )


def downgrade() -> None:
    # Only this new table is removed. Existing products, images, and users stay.
    op.drop_index("ix_product_uploads_attached_product_id", table_name="product_uploads")
    op.drop_index("ix_product_uploads_owner_state_expiry", table_name="product_uploads")
    op.drop_table("product_uploads")
