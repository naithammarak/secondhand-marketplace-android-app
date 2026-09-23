"""INSPECT-01 shipment, inspection and private evidence storage.

Revision ID: f3c1a09d8b56
Revises: 9446ec1a2c5d
"""

from alembic import op
import sqlalchemy as sa


revision = "f3c1a09d8b56"
down_revision = "9446ec1a2c5d"
branch_labels = None
depends_on = None

OLD_ORDER_STATUS = "status IN ('WAITING_PAYMENT', 'WAITING_SELLER_SHIP')"
NEW_ORDER_STATUS = (
    "status IN ('WAITING_PAYMENT', 'WAITING_SELLER_SHIP', 'SHIPPING_TO_CENTER', "
    "'RECEIVED_AT_CENTER', 'INSPECTING', 'RESULT_NOTIFIED')"
)


def _timestamp(name, nullable=False):
    return sa.Column(
        name, sa.DateTime(timezone=True), nullable=nullable,
        **({} if nullable else {"server_default": sa.text("now()")}),
    )


def upgrade():
    op.drop_constraint("ck_orders_status", "orders", type_="check")
    op.create_check_constraint("ck_orders_status", "orders", NEW_ORDER_STATUS)
    op.create_index("ix_orders_inspection_queue", "orders", ["status", "created_at", "id"])

    op.create_table(
        "shipments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("order_id", sa.Integer, sa.ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("leg", sa.String(16), server_default="TO_CENTER", nullable=False),
        sa.Column("status", sa.String(16), server_default="IN_TRANSIT", nullable=False),
        sa.Column("carrier", sa.String(100), nullable=False),
        sa.Column("tracking_number", sa.String(100), nullable=False),
        _timestamp("shipped_at"),
        _timestamp("received_at", True),
        sa.Column("received_by", sa.Integer, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("received_note", sa.String(1000)),
        sa.UniqueConstraint("order_id", "leg", name="uq_shipments_order_leg"),
        sa.CheckConstraint("leg = 'TO_CENTER'", name="ck_shipments_leg"),
        sa.CheckConstraint("status IN ('IN_TRANSIT', 'DELIVERED')", name="ck_shipments_status"),
        sa.CheckConstraint("length(carrier) BETWEEN 1 AND 100 AND carrier = trim(carrier)", name="ck_shipments_carrier"),
        sa.CheckConstraint("length(tracking_number) BETWEEN 1 AND 100 AND tracking_number = trim(tracking_number)", name="ck_shipments_tracking_number"),
        sa.CheckConstraint("received_note IS NULL OR (length(received_note) <= 1000 AND received_note = trim(received_note))", name="ck_shipments_received_note"),
        sa.CheckConstraint("(status = 'IN_TRANSIT' AND received_at IS NULL AND received_by IS NULL) OR (status = 'DELIVERED' AND received_at IS NOT NULL AND received_by IS NOT NULL AND received_at >= shipped_at)", name="ck_shipments_receipt"),
    )

    op.create_table(
        "inspections",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("order_id", sa.Integer, sa.ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("inspector_id", sa.Integer, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        _timestamp("started_at", True),
        sa.Column("result", sa.String(32)),
        sa.Column("summary", sa.String(2000)),
        _timestamp("inspected_at", True),
        _timestamp("created_at"),
        sa.UniqueConstraint("order_id", name="uq_inspections_order_id"),
        sa.UniqueConstraint("id", "order_id", name="uq_inspections_id_order_id"),
        sa.CheckConstraint("(inspector_id IS NULL AND started_at IS NULL) OR (inspector_id IS NOT NULL AND started_at IS NOT NULL)", name="ck_inspections_assignment"),
        sa.CheckConstraint("result IS NULL OR result IN ('PASS', 'MINOR_ISSUE', 'NOT_AS_DESCRIBED', 'FAKE')", name="ck_inspections_result"),
        sa.CheckConstraint("(result IS NULL AND summary IS NULL AND inspected_at IS NULL) OR (result IS NOT NULL AND summary IS NOT NULL AND inspected_at IS NOT NULL AND inspector_id IS NOT NULL AND started_at IS NOT NULL AND inspected_at >= started_at AND length(summary) BETWEEN 10 AND 2000 AND summary = trim(summary))", name="ck_inspections_final_result"),
    )
    op.create_index("ix_inspections_inspector_created", "inspections", ["inspector_id", "created_at", "id"])

    op.create_table(
        "inspection_evidence",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("inspection_id", sa.Integer, sa.ForeignKey("inspections.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("object_key", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(32), nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("uploaded_by", sa.Integer, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        _timestamp("uploaded_at"),
        sa.UniqueConstraint("object_key", name="uq_inspection_evidence_object_key"),
        sa.UniqueConstraint("id", "inspection_id", name="uq_inspection_evidence_id_inspection_id"),
        sa.CheckConstraint("mime_type IN ('image/jpeg', 'image/png', 'image/webp')", name="ck_inspection_evidence_mime_type"),
        sa.CheckConstraint("size_bytes BETWEEN 1 AND 5242880", name="ck_inspection_evidence_size_bytes"),
        sa.CheckConstraint("length(sha256) = 64 AND sha256 !~ '[^0-9a-f]'", name="ck_inspection_evidence_sha256"),
        sa.CheckConstraint("length(object_key) BETWEEN 1 AND 500 AND object_key = trim(object_key)", name="ck_inspection_evidence_object_key"),
    )
    op.create_index("ix_inspection_evidence_inspection_id", "inspection_evidence", ["inspection_id"])

    op.create_table(
        "inspection_result_evidence",
        sa.Column("inspection_id", sa.Integer, nullable=False),
        sa.Column("evidence_id", sa.Integer, nullable=False),
        sa.PrimaryKeyConstraint("inspection_id", "evidence_id", name="pk_inspection_result_evidence"),
        sa.ForeignKeyConstraint(["inspection_id"], ["inspections.id"], ondelete="RESTRICT", name="fk_inspection_result_evidence_inspection"),
        sa.ForeignKeyConstraint(["evidence_id", "inspection_id"], ["inspection_evidence.id", "inspection_evidence.inspection_id"], ondelete="RESTRICT", name="fk_inspection_result_evidence_same_inspection"),
    )

    op.create_table(
        "inspection_idempotency",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("order_id", sa.Integer, sa.ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("actor_id", sa.Integer, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("operation", sa.String(50), nullable=False),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("response_status", sa.Integer, nullable=False),
        sa.Column("response_body", sa.JSON, nullable=False),
        _timestamp("created_at"),
        sa.UniqueConstraint("order_id", "actor_id", "operation", "idempotency_key", name="uq_inspection_idempotency_scope"),
        sa.CheckConstraint("length(idempotency_key) BETWEEN 8 AND 100 AND idempotency_key !~ '[^A-Za-z0-9_-]'", name="ck_inspection_idempotency_key"),
        sa.CheckConstraint("length(request_hash) = 64 AND request_hash !~ '[^0-9a-f]'", name="ck_inspection_idempotency_request_hash"),
        sa.CheckConstraint("response_status BETWEEN 200 AND 299", name="ck_inspection_idempotency_response_status"),
        sa.CheckConstraint("length(operation) BETWEEN 1 AND 50 AND operation = trim(operation)", name="ck_inspection_idempotency_operation"),
    )

    for table in ("shipments", "inspections", "inspection_evidence", "inspection_result_evidence", "inspection_idempotency"):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")

    # A final result is one-shot even if two writers bypass the API row lock.
    # Association rows become immutable once the parent result is final.
    op.execute("""
        CREATE FUNCTION public.inspection_guard_final_result() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                IF OLD.result IS NOT NULL THEN
                    RAISE EXCEPTION 'final inspection result is immutable';
                END IF;
                RETURN OLD;
            END IF;
            IF OLD.result IS NOT NULL AND (
                NEW.result IS DISTINCT FROM OLD.result OR
                NEW.summary IS DISTINCT FROM OLD.summary OR
                NEW.inspected_at IS DISTINCT FROM OLD.inspected_at OR
                NEW.inspector_id IS DISTINCT FROM OLD.inspector_id OR
                NEW.started_at IS DISTINCT FROM OLD.started_at
            ) THEN
                RAISE EXCEPTION 'final inspection result is immutable';
            END IF;
            RETURN NEW;
        END $$
    """)
    op.execute("""
        CREATE TRIGGER trg_inspections_guard_final_result
        BEFORE UPDATE OR DELETE ON public.inspections
        FOR EACH ROW EXECUTE FUNCTION public.inspection_guard_final_result()
    """)
    op.execute("""
        CREATE FUNCTION public.inspection_guard_result_evidence() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP IN ('UPDATE', 'DELETE') THEN
                RAISE EXCEPTION 'inspection result evidence is immutable';
            END IF;
            RETURN NEW;
        END $$
    """)
    op.execute("""
        CREATE TRIGGER trg_inspection_result_evidence_guard
        BEFORE UPDATE OR DELETE ON public.inspection_result_evidence
        FOR EACH ROW EXECUTE FUNCTION public.inspection_guard_result_evidence()
    """)


def downgrade():
    connection = op.get_bind()
    for table in ("shipments", "inspections", "inspection_evidence", "inspection_result_evidence", "inspection_idempotency"):
        if connection.execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM public.{table} LIMIT 1)")).scalar_one():
            raise RuntimeError(f"INSPECT-01 downgrade refused: {table} contains data; back up or migrate it first")
    if connection.execute(sa.text("SELECT EXISTS (SELECT 1 FROM public.orders WHERE status IN ('SHIPPING_TO_CENTER', 'RECEIVED_AT_CENTER', 'INSPECTING', 'RESULT_NOTIFIED') LIMIT 1)")).scalar_one():
        raise RuntimeError("INSPECT-01 downgrade refused: orders use Inspect statuses; back up or migrate them first")

    op.drop_table("inspection_idempotency")
    op.drop_table("inspection_result_evidence")
    op.drop_index("ix_inspection_evidence_inspection_id", table_name="inspection_evidence")
    op.drop_table("inspection_evidence")
    op.drop_index("ix_inspections_inspector_created", table_name="inspections")
    op.drop_table("inspections")
    op.drop_table("shipments")
    op.execute("DROP FUNCTION public.inspection_guard_result_evidence()")
    op.execute("DROP FUNCTION public.inspection_guard_final_result()")
    op.drop_index("ix_orders_inspection_queue", table_name="orders")
    op.drop_constraint("ck_orders_status", "orders", type_="check")
    op.create_check_constraint("ck_orders_status", "orders", OLD_ORDER_STATUS)
