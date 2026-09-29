"""Extend certificates and store one buyer decision per final inspection.

Revision ID: d8b7c4e2910a
Revises: c7e4b21a9d08
"""

from alembic import op
import sqlalchemy as sa

revision = "d8b7c4e2910a"
down_revision = "c7e4b21a9d08"
branch_labels = None
depends_on = None


def upgrade():
    # Existing certificate snapshots are validated by the new FK. A mismatch
    # aborts this transactional migration; never silently rewrite old results.
    op.create_unique_constraint("uq_inspections_id_order_result", "inspections", ["id", "order_id", "result"])
    op.create_unique_constraint("uq_orders_id_buyer_id", "orders", ["id", "buyer_id"])
    op.create_unique_constraint("uq_certificates_inspection_order", "certificates", ["inspection_id", "order_id"])
    op.create_foreign_key(
        "fk_certificates_result_snapshot", "certificates", "inspections",
        ["inspection_id", "order_id", "result"], ["id", "order_id", "result"], ondelete="RESTRICT",
    )
    op.add_column("certificates", sa.Column("status", sa.String(16), nullable=False, server_default="ISSUED"))
    op.add_column("certificates", sa.Column("revoked_at", sa.DateTime(timezone=True)))
    op.add_column("certificates", sa.Column("revocation_reason", sa.String(500)))
    op.create_check_constraint("ck_certificates_status", "certificates", "status IN ('ISSUED', 'REVOKED')")
    op.create_check_constraint(
        "ck_certificates_revocation", "certificates",
        "(status = 'ISSUED' AND revoked_at IS NULL AND revocation_reason IS NULL) OR "
        "(status = 'REVOKED' AND revoked_at IS NOT NULL AND revoked_at >= issued_at)",
    )
    op.create_check_constraint(
        "ck_certificates_revocation_reason", "certificates",
        "revocation_reason IS NULL OR (length(revocation_reason) BETWEEN 1 AND 500 AND revocation_reason = trim(revocation_reason))",
    )
    op.create_table(
        "buyer_inspection_decisions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("order_id", sa.Integer, nullable=False),
        sa.Column("inspection_id", sa.Integer, nullable=False),
        sa.Column("buyer_id", sa.Integer, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("decision", sa.String(16), nullable=False),
        sa.Column("reason", sa.String(500)),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("order_id", name="uq_buyer_decisions_order_id"),
        sa.UniqueConstraint("inspection_id", name="uq_buyer_decisions_inspection_id"),
        sa.ForeignKeyConstraint(
            ["order_id", "buyer_id"], ["orders.id", "orders.buyer_id"],
            ondelete="RESTRICT", name="fk_buyer_decisions_order_buyer",
        ),
        sa.ForeignKeyConstraint(
            ["inspection_id", "order_id"], ["inspections.id", "inspections.order_id"],
            ondelete="RESTRICT", name="fk_buyer_decisions_inspection_order",
        ),
        sa.ForeignKeyConstraint(
            ["inspection_id", "order_id"], ["certificates.inspection_id", "certificates.order_id"],
            ondelete="RESTRICT", name="fk_buyer_decisions_certificate",
        ),
        sa.CheckConstraint("decision IN ('CONFIRM', 'REJECT')", name="ck_buyer_decisions_decision"),
        sa.CheckConstraint("decision <> 'CONFIRM' OR reason IS NULL", name="ck_buyer_decisions_confirm_reason"),
        sa.CheckConstraint("reason IS NULL OR (length(reason) BETWEEN 1 AND 500 AND reason = trim(reason))", name="ck_buyer_decisions_reason"),
    )
    op.execute("ALTER TABLE public.buyer_inspection_decisions ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE FUNCTION public.cert_guard_snapshot() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            IF ROW(NEW.id, NEW.order_id, NEW.inspection_id, NEW.result,
                   NEW.certificate_no, NEW.public_token, NEW.issued_at)
               IS DISTINCT FROM
               ROW(OLD.id, OLD.order_id, OLD.inspection_id, OLD.result,
                   OLD.certificate_no, OLD.public_token, OLD.issued_at) THEN
                RAISE EXCEPTION 'certificate snapshot is immutable' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER trg_certificates_snapshot BEFORE UPDATE
        ON public.certificates FOR EACH ROW EXECUTE FUNCTION public.cert_guard_snapshot()
    """)
    op.execute("""
        CREATE FUNCTION public.cert_guard_buyer_decision() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'buyer inspection decision is final' USING ERRCODE = '23514';
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER trg_buyer_decisions_final BEFORE UPDATE OR DELETE
        ON public.buyer_inspection_decisions FOR EACH ROW
        EXECUTE FUNCTION public.cert_guard_buyer_decision()
    """)


def downgrade():
    connection = op.get_bind()
    # Lock through the checks and DDL so concurrent writes cannot bypass refusal.
    op.execute("LOCK TABLE public.buyer_inspection_decisions, public.certificates IN ACCESS EXCLUSIVE MODE")
    if connection.execute(sa.text("SELECT EXISTS (SELECT 1 FROM public.buyer_inspection_decisions)")).scalar_one():
        raise RuntimeError("CERT-01 downgrade refused: buyer decisions exist")
    if connection.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM public.certificates WHERE status <> 'ISSUED' "
        "OR revoked_at IS NOT NULL OR revocation_reason IS NOT NULL)"
    )).scalar_one():
        raise RuntimeError("CERT-01 downgrade refused: revocation data exists")
    op.drop_table("buyer_inspection_decisions")
    op.execute("DROP FUNCTION public.cert_guard_buyer_decision()")
    op.execute("DROP TRIGGER trg_certificates_snapshot ON public.certificates")
    op.execute("DROP FUNCTION public.cert_guard_snapshot()")
    for name in ("ck_certificates_revocation_reason", "ck_certificates_revocation", "ck_certificates_status"):
        op.drop_constraint(name, "certificates", type_="check")
    for column in ("revocation_reason", "revoked_at", "status"):
        op.drop_column("certificates", column)
    op.drop_constraint("fk_certificates_result_snapshot", "certificates", type_="foreignkey")
    op.drop_constraint("uq_certificates_inspection_order", "certificates", type_="unique")
    op.drop_constraint("uq_orders_id_buyer_id", "orders", type_="unique")
    op.drop_constraint("uq_inspections_id_order_result", "inspections", type_="unique")
