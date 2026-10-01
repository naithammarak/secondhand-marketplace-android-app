"""FINISH foundation: linear schema extension, immutable snapshots and terminal facts.

Revision ID: a02f20261002
Revises: 714f11c84d53
"""
from alembic import op
import sqlalchemy as sa

revision = "a02f20261002"
down_revision = "714f11c84d53"
branch_labels = None
depends_on = None

# Frozen DDL: do not import changing application metadata during replay.
DDL = [
    """ALTER TABLE orders ADD CONSTRAINT uq_orders_currency_amount UNIQUE (id, total_amount, currency)""",
    """ALTER TABLE orders ADD CONSTRAINT uq_orders_parties UNIQUE (id, seller_id, buyer_id)""",
    """ALTER TABLE payment_attempts ADD CONSTRAINT uq_attempts_order_amount UNIQUE (id, order_id, amount)""",
    """ALTER TABLE payments ADD CONSTRAINT uq_payments_order_amount UNIQUE (id, order_id, amount)""",
    """ALTER TABLE escrows ADD CONSTRAINT uq_escrows_financial_tuple UNIQUE (id, order_id, payment_id, amount)""",
    """ALTER TABLE shipments ADD CONSTRAINT uq_shipments_courier UNIQUE (id, courier_id)""",
    """ALTER TABLE shipments ADD CONSTRAINT uq_shipments_delivery_time UNIQUE (id, courier_delivered_at)""",
    """ALTER TABLE shipment_delivery_proofs ADD CONSTRAINT uq_proofs_shipment_uploader UNIQUE (id, shipment_id, uploaded_by)""",
    """ALTER TABLE orders ADD CONSTRAINT ck_orders_missing_report CHECK ((missing_reported_at IS NULL AND missing_report_reason IS NULL AND missing_report_id IS NULL) OR (missing_reported_at IS NOT NULL AND missing_report_reason IS NOT NULL AND missing_report_id IS NOT NULL AND length(trim(missing_report_reason)) BETWEEN 10 AND 2000 AND receipt_deadline_at IS NOT NULL AND missing_reported_at < receipt_deadline_at AND receipt_confirmed_at IS NULL AND status IN ('DELIVERY_DISPUTED','COMPLETED','REFUNDED')))""",
    """ALTER TABLE orders ADD CONSTRAINT ck_orders_receipt_boundary CHECK (receipt_confirmation_source IS NULL OR (receipt_confirmation_source = 'BUYER' AND receipt_confirmed_at < receipt_deadline_at) OR (receipt_confirmation_source = 'AUTO' AND receipt_confirmed_at >= receipt_deadline_at))""",
    """ALTER TABLE orders ADD CONSTRAINT ck_orders_receipt_confirmation CHECK ((receipt_confirmed_at IS NULL AND receipt_confirmation_source IS NULL) OR (receipt_confirmed_at IS NOT NULL AND receipt_confirmation_source IS NOT NULL AND receipt_confirmation_source IN ('BUYER','AUTO') AND receipt_deadline_at IS NOT NULL AND missing_reported_at IS NULL AND status = 'COMPLETED'))""",
    """ALTER TABLE orders ADD CONSTRAINT ck_orders_return_address_pair CHECK ((return_address IS NULL) = (return_address_saved_at IS NULL))""",
    """ALTER TABLE payments ADD CONSTRAINT fk_payments_attempt_tuple FOREIGN KEY(attempt_id, order_id, amount) REFERENCES payment_attempts (id, order_id, amount)""",
    """ALTER TABLE escrows ADD CONSTRAINT ck_escrows_settlement_time CHECK ((status = 'HELD' AND settled_at IS NULL) OR (status IN ('RELEASED','REFUNDED') AND settled_at IS NOT NULL AND settled_at >= held_at))""",
    """ALTER TABLE escrows ADD CONSTRAINT fk_escrows_payment_tuple FOREIGN KEY(payment_id, order_id, amount) REFERENCES payments (id, order_id, amount)""",
    """ALTER TABLE receipts ADD CONSTRAINT fk_receipts_payment_tuple FOREIGN KEY(payment_id, order_id, total_amount) REFERENCES payments (id, order_id, amount)""",
    """ALTER TABLE shipments ADD CONSTRAINT ck_shipments_outbound_destination CHECK (leg = 'TO_CENTER' OR destination_address IS NOT NULL)""",
    """CREATE TABLE fulfillment_commands (
	id SERIAL NOT NULL,
	actor_scope VARCHAR(100) NOT NULL,
	actor_id INTEGER,
	action VARCHAR(50) NOT NULL,
	resource_type VARCHAR(32) NOT NULL,
	resource_id INTEGER NOT NULL,
	idempotency_key VARCHAR(100) NOT NULL,
	request_hash VARCHAR(64) NOT NULL,
	response_status INTEGER NOT NULL,
	result JSON NOT NULL,
	committed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_fulfillment_command_scope UNIQUE (actor_scope, action, resource_type, resource_id, idempotency_key),
	CONSTRAINT ck_commands_scope CHECK (length(actor_scope) BETWEEN 1 AND 100 AND length(action) BETWEEN 1 AND 50 AND resource_id > 0),
	CONSTRAINT ck_commands_fingerprint CHECK (length(idempotency_key) BETWEEN 8 AND 100 AND length(request_hash) = 64),
	CONSTRAINT ck_commands_response CHECK (response_status BETWEEN 200 AND 299),
	CONSTRAINT ck_commands_result_object CHECK (json_typeof(result) = 'object'),
	CONSTRAINT ck_commands_actor CHECK ((actor_id IS NOT NULL AND actor_scope = 'USER:' || cast(actor_id AS varchar)) OR (actor_id IS NULL AND actor_scope LIKE 'SYSTEM:%%' AND length(actor_scope) > 7)),
	FOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE RESTRICT
)""",
    """CREATE TABLE delivery_evidence_access (
	id SERIAL NOT NULL,
	order_id INTEGER NOT NULL,
	admin_id INTEGER NOT NULL,
	reason VARCHAR(2000) NOT NULL,
	accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_evidence_access_reason CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
	FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE RESTRICT,
	FOREIGN KEY(admin_id) REFERENCES users (id) ON DELETE RESTRICT
)""",
    """CREATE TABLE order_status_history (
	id SERIAL NOT NULL,
	order_id INTEGER NOT NULL,
	command_id INTEGER NOT NULL,
	from_status VARCHAR(32) NOT NULL,
	to_status VARCHAR(32) NOT NULL,
	event VARCHAR(50) NOT NULL,
	source VARCHAR(32) NOT NULL,
	occurred_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_history_command_event UNIQUE (command_id, event),
	CONSTRAINT ck_history_from_status CHECK (from_status IN ('WAITING_PAYMENT', 'WAITING_SELLER_SHIP', 'CANCELLED', 'SHIPPING_TO_CENTER', 'RECEIVED_AT_CENTER', 'INSPECTING', 'RESULT_NOTIFIED', 'SHIPPING_TO_BUYER', 'DELIVERED_PENDING_BUYER', 'DELIVERY_DISPUTED', 'RETURNED_TO_SELLER', 'COMPLETED', 'REFUNDED')),
	CONSTRAINT ck_history_to_status CHECK (to_status IN ('WAITING_PAYMENT', 'WAITING_SELLER_SHIP', 'CANCELLED', 'SHIPPING_TO_CENTER', 'RECEIVED_AT_CENTER', 'INSPECTING', 'RESULT_NOTIFIED', 'SHIPPING_TO_BUYER', 'DELIVERED_PENDING_BUYER', 'DELIVERY_DISPUTED', 'RETURNED_TO_SELLER', 'COMPLETED', 'REFUNDED')),
	FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE RESTRICT,
	FOREIGN KEY(command_id) REFERENCES fulfillment_commands (id) ON DELETE RESTRICT
)""",
    """CREATE TABLE shipment_confirmed_proofs (
	proof_id INTEGER NOT NULL,
	shipment_id INTEGER NOT NULL,
	courier_id INTEGER NOT NULL,
	confirmed_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (proof_id),
	CONSTRAINT fk_confirmed_proof_tuple FOREIGN KEY(proof_id, shipment_id, courier_id) REFERENCES shipment_delivery_proofs (id, shipment_id, uploaded_by) ON DELETE RESTRICT,
	CONSTRAINT fk_confirmed_proof_courier FOREIGN KEY(shipment_id, courier_id) REFERENCES shipments (id, courier_id) ON DELETE RESTRICT,
	CONSTRAINT fk_confirmed_proof_time FOREIGN KEY(shipment_id, confirmed_at) REFERENCES shipments (id, courier_delivered_at) ON DELETE RESTRICT
)""",
    """CREATE TABLE order_settlements (
	id SERIAL NOT NULL,
	order_id INTEGER NOT NULL,
	escrow_id INTEGER NOT NULL,
	payment_id INTEGER NOT NULL,
	seller_id INTEGER NOT NULL,
	buyer_id INTEGER NOT NULL,
	command_id INTEGER NOT NULL,
	kind VARCHAR(8) NOT NULL,
	source VARCHAR(32) NOT NULL,
	reason VARCHAR(40) NOT NULL,
	currency VARCHAR(3) NOT NULL,
	held_amount NUMERIC(12, 2) NOT NULL,
	seller_payout NUMERIC(12, 2) NOT NULL,
	buyer_refund NUMERIC(12, 2) NOT NULL,
	commission_amount NUMERIC(12, 2) NOT NULL,
	inspection_amount NUMERIC(12, 2) NOT NULL,
	shipping_amount NUMERIC(12, 2) NOT NULL,
	settled_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_settlements_order UNIQUE (order_id),
	CONSTRAINT uq_settlements_resolution_tuple UNIQUE (id, order_id, kind),
	CONSTRAINT uq_settlements_escrow UNIQUE (escrow_id),
	CONSTRAINT uq_settlements_command UNIQUE (command_id),
	CONSTRAINT fk_settlements_escrow_tuple FOREIGN KEY(escrow_id, order_id, payment_id, held_amount) REFERENCES escrows (id, order_id, payment_id, amount) ON DELETE RESTRICT,
	CONSTRAINT fk_settlements_payment_tuple FOREIGN KEY(payment_id, order_id, held_amount) REFERENCES payments (id, order_id, amount) ON DELETE RESTRICT,
	CONSTRAINT fk_settlements_order_money FOREIGN KEY(order_id, held_amount, currency) REFERENCES orders (id, total_amount, currency) ON DELETE RESTRICT,
	CONSTRAINT fk_settlements_order_parties FOREIGN KEY(order_id, seller_id, buyer_id) REFERENCES orders (id, seller_id, buyer_id) ON DELETE RESTRICT,
	CONSTRAINT ck_settlements_nonnegative CHECK (held_amount > 0 AND seller_payout >= 0 AND buyer_refund >= 0 AND commission_amount >= 0 AND inspection_amount >= 0 AND shipping_amount >= 0),
	CONSTRAINT ck_settlements_allocation CHECK ((kind = 'RELEASE' AND buyer_refund = 0 AND held_amount = seller_payout + commission_amount + inspection_amount + shipping_amount) OR (kind = 'REFUND' AND buyer_refund = held_amount AND seller_payout = 0 AND commission_amount = 0 AND inspection_amount = 0 AND shipping_amount = 0)),
	CONSTRAINT ck_settlements_codes CHECK ((kind = 'RELEASE' AND ((source = 'BUYER_RECEIPT' AND reason = 'RECEIPT_CONFIRMED') OR (source = 'AUTO_RECEIPT' AND reason = 'RECEIPT_TIMEOUT') OR (source = 'ADMIN_RESOLUTION' AND reason = 'DELIVERY_REVIEW_RELEASE'))) OR (kind = 'REFUND' AND ((source = 'RETURN_DELIVERY' AND reason IN ('BUYER_REJECTED_INSPECTION','INSPECTION_NOT_AS_DESCRIBED','INSPECTION_FAKE')) OR (source = 'SELLER_NO_SHIP' AND reason = 'SELLER_NO_SHIP') OR (source = 'ADMIN_RESOLUTION' AND reason = 'DELIVERY_REVIEW_REFUND')))),
	FOREIGN KEY(command_id) REFERENCES fulfillment_commands (id) ON DELETE RESTRICT
)""",
    """CREATE TABLE delivery_resolutions (
	id SERIAL NOT NULL,
	order_id INTEGER NOT NULL,
	settlement_id INTEGER NOT NULL,
	admin_id INTEGER NOT NULL,
	kind VARCHAR(8) NOT NULL,
	reason VARCHAR(2000) NOT NULL,
	evidence_references JSON NOT NULL,
	resolved_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_delivery_resolution_order UNIQUE (order_id),
	CONSTRAINT fk_resolution_settlement_tuple FOREIGN KEY(settlement_id, order_id, kind) REFERENCES order_settlements (id, order_id, kind) ON DELETE RESTRICT,
	CONSTRAINT uq_delivery_resolution_settlement UNIQUE (settlement_id),
	CONSTRAINT ck_resolution_reason CHECK (kind IN ('RELEASE','REFUND') AND length(trim(reason)) BETWEEN 10 AND 2000),
	FOREIGN KEY(order_id) REFERENCES orders (id) ON DELETE RESTRICT,
	FOREIGN KEY(settlement_id) REFERENCES order_settlements (id) ON DELETE RESTRICT,
	FOREIGN KEY(admin_id) REFERENCES users (id) ON DELETE RESTRICT
)""",
]


def upgrade():
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("FINISH foundation migration requires PostgreSQL")
    op.execute(PREFLIGHT)
    for table, columns in FINITE_MONEY.items():
        condition = " AND ".join(f"{column}::text NOT IN ('NaN','Infinity','-Infinity')" for column in columns)
        op.create_check_constraint(f"ck_{table}_finite_money", table, condition)

    for column, kind in {
        "return_address": sa.JSON(), "return_address_saved_at": sa.DateTime(timezone=True),
        "receipt_deadline_at": sa.DateTime(timezone=True), "receipt_confirmed_at": sa.DateTime(timezone=True),
        "receipt_confirmation_source": sa.String(8), "missing_reported_at": sa.DateTime(timezone=True),
        "missing_report_reason": sa.String(2000), "missing_report_id": sa.String(36),
        "inspection_overdue_escalated_at": sa.DateTime(timezone=True),
    }.items():
        op.add_column("orders", sa.Column(column, kind, nullable=True))
    op.create_unique_constraint("uq_orders_missing_report_id", "orders", ["missing_report_id"])
    op.add_column("escrows", sa.Column("settled_at", sa.DateTime(timezone=True)))
    op.add_column("shipments", sa.Column("destination_address", sa.JSON()))
    op.add_column("shipments", sa.Column("confirmation_txid", sa.BigInteger()))
    op.execute("UPDATE shipments SET confirmation_txid=txid_current() WHERE courier_delivered_at IS NOT NULL")
    op.drop_constraint("ck_orders_status", "orders", type_="check")
    op.create_check_constraint("ck_orders_status", "orders", "status IN ('WAITING_PAYMENT','WAITING_SELLER_SHIP','CANCELLED','SHIPPING_TO_CENTER','RECEIVED_AT_CENTER','INSPECTING','RESULT_NOTIFIED','SHIPPING_TO_BUYER','DELIVERED_PENDING_BUYER','DELIVERY_DISPUTED','RETURNED_TO_SELLER','COMPLETED','REFUNDED')")
    op.drop_constraint("ck_escrows_status", "escrows", type_="check")
    op.create_check_constraint("ck_escrows_status", "escrows", "status IN ('HELD','RELEASED','REFUNDED')")
    for statement in DDL:
        op.execute(statement)
    op.create_index("uq_shipments_one_outbound", "shipments", ["order_id"], unique=True, postgresql_where=sa.text("leg IN ('TO_BUYER','TO_SELLER')"))
    # Preserve already-confirmed legacy proof using its actual persisted delivery
    # time and assignment. No address or timestamps are fabricated.
    op.execute("INSERT INTO shipment_confirmed_proofs (proof_id,shipment_id,courier_id,confirmed_at) SELECT p.id,s.id,s.courier_id,s.courier_delivered_at FROM shipments s JOIN shipment_delivery_proofs p ON p.shipment_id=s.id WHERE s.courier_delivered_at IS NOT NULL")
    op.create_check_constraint("ck_orders_return_address_shape", "orders", "return_address IS NULL OR (jsonb_typeof(return_address::jsonb) = 'object' AND return_address::jsonb ?& ARRAY['recipient_name','phone','address_line','subdistrict','district','province','postal_code'] AND return_address::jsonb - ARRAY['recipient_name','phone','address_line','subdistrict','district','province','postal_code'] = '{}'::jsonb AND jsonb_typeof(return_address::jsonb->'recipient_name') = 'string' AND jsonb_typeof(return_address::jsonb->'phone') = 'string' AND jsonb_typeof(return_address::jsonb->'address_line') = 'string' AND jsonb_typeof(return_address::jsonb->'subdistrict') = 'string' AND jsonb_typeof(return_address::jsonb->'district') = 'string' AND jsonb_typeof(return_address::jsonb->'province') = 'string' AND jsonb_typeof(return_address::jsonb->'postal_code') = 'string' AND length(return_address->>'recipient_name') BETWEEN 2 AND 100 AND length(return_address->>'address_line') BETWEEN 5 AND 255 AND length(return_address->>'subdistrict') BETWEEN 2 AND 100 AND length(return_address->>'district') BETWEEN 2 AND 100 AND length(return_address->>'province') BETWEEN 2 AND 100 AND return_address->>'phone' ~ '^0[0-9]{8,9}$' AND return_address->>'postal_code' ~ '^[0-9]{5}$')")
    op.execute(GUARDS)
    for table in ("fulfillment_commands", "order_settlements", "shipment_confirmed_proofs", "order_status_history", "delivery_resolutions", "delivery_evidence_access"):
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
        op.execute(f'REVOKE ALL ON TABLE "{table}" FROM PUBLIC')
        for role in ("anon", "authenticated"):
            if op.get_bind().execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname=:role"), {"role":role}).scalar():
                op.execute(f'REVOKE ALL ON TABLE "{table}" FROM "{role}"')


def downgrade():
    # New private records and immutability guarantees have no faithful legacy
    # representation. Refuse rather than erase facts or relax historical locks.
    raise RuntimeError("FINISH foundation downgrade refused: preserve terminal/proof/address audit records; restore a reviewed pre-upgrade backup or write an explicit forward compatibility migration")

PREFLIGHT = r"""
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM escrows e JOIN payments p ON p.id=e.payment_id WHERE (e.order_id,e.amount) IS DISTINCT FROM (p.order_id,p.amount))
 OR EXISTS (SELECT 1 FROM receipts r JOIN payments p ON p.id=r.payment_id WHERE (r.order_id,r.total_amount) IS DISTINCT FROM (p.order_id,p.amount))
 OR EXISTS (SELECT 1 FROM payments p JOIN payment_attempts a ON a.id=p.attempt_id WHERE (p.order_id,p.amount) IS DISTINCT FROM (a.order_id,a.amount) OR a.outcome <> 'SUCCEEDED')
 THEN RAISE EXCEPTION 'FINISH preflight: cross-order or non-successful Payment/Attempt/Escrow/Receipt; repair affected rows through a reviewed migration before upgrade'; END IF;
 IF EXISTS (SELECT 1 FROM shipment_delivery_proofs p JOIN shipments s ON s.id=p.shipment_id WHERE p.uploaded_by IS DISTINCT FROM s.courier_id) THEN
 RAISE EXCEPTION 'FINISH preflight: proof uploader does not match assignment; audited review required'; END IF;
 IF EXISTS (SELECT 1 FROM shipments WHERE leg <> 'TO_CENTER') THEN
 RAISE EXCEPTION 'FINISH preflight: legacy outbound destination is unknown; audited address/proof review required before upgrade'; END IF;
 IF EXISTS (SELECT 1 FROM shipments s LEFT JOIN shipment_delivery_proofs p ON p.shipment_id=s.id WHERE s.courier_delivered_at IS NOT NULL GROUP BY s.id HAVING count(p.id) NOT BETWEEN 1 AND 3 OR bool_or(p.uploaded_by IS DISTINCT FROM s.courier_id)) THEN
 RAISE EXCEPTION 'FINISH preflight: confirmed legacy proof count/courier inconsistent; audited evidence review required before upgrade'; END IF;
END $$;
"""

GUARDS = r"""
CREATE FUNCTION finish_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'FINISH immutable record: %', TG_TABLE_NAME USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_payments BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION finish_append_only();
CREATE TRIGGER immutable_receipts BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION finish_append_only();
CREATE TRIGGER immutable_attempts BEFORE UPDATE OR DELETE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION finish_append_only();
CREATE TRIGGER immutable_commands BEFORE UPDATE OR DELETE ON fulfillment_commands FOR EACH ROW EXECUTE FUNCTION finish_append_only();
CREATE TRIGGER immutable_settlements BEFORE UPDATE OR DELETE ON order_settlements FOR EACH ROW EXECUTE FUNCTION finish_append_only();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON order_status_history FOR EACH ROW EXECUTE FUNCTION finish_append_only();
CREATE TRIGGER immutable_resolutions BEFORE UPDATE OR DELETE ON delivery_resolutions FOR EACH ROW EXECUTE FUNCTION finish_append_only();
CREATE TRIGGER immutable_access BEFORE UPDATE OR DELETE ON delivery_evidence_access FOR EACH ROW EXECUTE FUNCTION finish_append_only();
CREATE TRIGGER immutable_confirmed_proofs BEFORE UPDATE OR DELETE ON shipment_confirmed_proofs FOR EACH ROW EXECUTE FUNCTION finish_append_only();

CREATE FUNCTION finish_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.return_address::jsonb, OLD.return_address_saved_at) IS DISTINCT FROM (NEW.return_address::jsonb, NEW.return_address_saved_at)
 AND EXISTS (SELECT 1 FROM shipments WHERE order_id=OLD.id) THEN
 RAISE EXCEPTION 'FINISH return address frozen after shipment' USING ERRCODE='23514'; END IF;
 IF OLD.paid_at IS NOT NULL AND (OLD.buyer_id,OLD.seller_id,OLD.product_id,OLD.product_name,OLD.product_condition,OLD.product_size,OLD.currency,OLD.item_price,OLD.shipping_fee,OLD.inspection_fee,OLD.commission_fee,OLD.seller_payout,OLD.total_amount,OLD.paid_at,OLD.ship_recipient_name,OLD.ship_phone,OLD.ship_address_line,OLD.ship_subdistrict,OLD.ship_district,OLD.ship_province,OLD.ship_postal_code)
 IS DISTINCT FROM (NEW.buyer_id,NEW.seller_id,NEW.product_id,NEW.product_name,NEW.product_condition,NEW.product_size,NEW.currency,NEW.item_price,NEW.shipping_fee,NEW.inspection_fee,NEW.commission_fee,NEW.seller_payout,NEW.total_amount,NEW.paid_at,NEW.ship_recipient_name,NEW.ship_phone,NEW.ship_address_line,NEW.ship_subdistrict,NEW.ship_district,NEW.ship_province,NEW.ship_postal_code)
 THEN RAISE EXCEPTION 'FINISH paid order snapshot immutable' USING ERRCODE='23514'; END IF;
 IF (OLD.receipt_confirmed_at IS NOT NULL AND (OLD.receipt_confirmed_at,OLD.receipt_confirmation_source) IS DISTINCT FROM (NEW.receipt_confirmed_at,NEW.receipt_confirmation_source))
 OR (OLD.receipt_deadline_at IS NOT NULL AND OLD.receipt_deadline_at IS DISTINCT FROM NEW.receipt_deadline_at)
 OR (OLD.missing_reported_at IS NOT NULL AND (OLD.missing_reported_at,OLD.missing_report_reason,OLD.missing_report_id) IS DISTINCT FROM (NEW.missing_reported_at,NEW.missing_report_reason,NEW.missing_report_id))
 OR (OLD.inspection_overdue_escalated_at IS NOT NULL AND OLD.inspection_overdue_escalated_at IS DISTINCT FROM NEW.inspection_overdue_escalated_at)
 THEN RAISE EXCEPTION 'FINISH receipt/report/deadline audit immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finish_order_snapshot BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION finish_order_snapshot();

CREATE FUNCTION finish_shipment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o orders%ROWTYPE;
BEGIN
 SELECT * INTO o FROM orders WHERE id=NEW.order_id FOR UPDATE;
 IF TG_OP='INSERT' AND NEW.leg='TO_CENTER' AND (o.paid_at IS NULL OR clock_timestamp() >= o.paid_at + interval '72 hours') THEN
 RAISE EXCEPTION 'FINISH seller shipping deadline passed' USING ERRCODE='23514', CONSTRAINT='ck_shipments_seller_deadline'; END IF;
 IF TG_OP='INSERT' AND NEW.leg='TO_CENTER' AND o.return_address IS NULL THEN
 RAISE EXCEPTION 'FINISH fulfillment_destination_missing: seller return address required' USING ERRCODE='23514'; END IF;
 IF NEW.leg IN ('TO_BUYER','TO_SELLER') AND (NEW.destination_address::jsonb IS NULL OR
 (NEW.leg='TO_SELLER' AND NEW.destination_address::jsonb IS DISTINCT FROM o.return_address::jsonb)) THEN
 RAISE EXCEPTION 'FINISH destination must be a verified order snapshot' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.courier_delivered_at IS NOT NULL OR TG_OP='UPDATE' AND OLD.courier_delivered_at IS NULL AND NEW.courier_delivered_at IS NOT NULL THEN NEW.confirmation_txid := txid_current(); END IF;
 IF TG_OP='UPDATE' THEN
 IF (OLD.confirmation_txid IS DISTINCT FROM NEW.confirmation_txid AND OLD.courier_delivered_at IS NOT NULL) OR
 (OLD.order_id,OLD.leg,OLD.destination_address::jsonb,OLD.shipped_at) IS DISTINCT FROM (NEW.order_id,NEW.leg,NEW.destination_address::jsonb,NEW.shipped_at)
 OR (OLD.courier_delivered_at IS NOT NULL AND (OLD.courier_delivered_at,OLD.courier_id) IS DISTINCT FROM (NEW.courier_delivered_at,NEW.courier_id))
 OR (OLD.courier_id IS DISTINCT FROM NEW.courier_id AND EXISTS (SELECT 1 FROM shipment_delivery_proofs WHERE shipment_id=OLD.id))
 THEN RAISE EXCEPTION 'FINISH shipment/delivery snapshot immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finish_shipment_guard BEFORE INSERT OR UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION finish_shipment_guard();

CREATE FUNCTION finish_proof_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE shipment_key integer; delivered timestamptz;
BEGIN
 shipment_key := CASE WHEN TG_OP='INSERT' THEN NEW.shipment_id ELSE OLD.shipment_id END;
 SELECT courier_delivered_at INTO delivered FROM shipments WHERE id=shipment_key FOR UPDATE;
 IF TG_OP <> 'DELETE' AND NOT EXISTS (SELECT 1 FROM shipments WHERE id=NEW.shipment_id AND courier_id=NEW.uploaded_by) THEN
 RAISE EXCEPTION 'FINISH proof belongs to assigned courier only' USING ERRCODE='23514'; END IF;
 IF delivered IS NOT NULL THEN RAISE EXCEPTION 'FINISH confirmed proof metadata immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND NEW.shipment_id <> OLD.shipment_id THEN
 RAISE EXCEPTION 'FINISH proof shipment immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finish_proof_guard BEFORE INSERT OR UPDATE OR DELETE ON shipment_delivery_proofs FOR EACH ROW EXECUTE FUNCTION finish_proof_guard();

CREATE FUNCTION finish_proof_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE shipment_key integer; delivered timestamptz; n integer;
BEGIN
 IF TG_TABLE_NAME='shipments' THEN shipment_key := NEW.id; ELSE shipment_key := NEW.shipment_id; END IF;
 SELECT courier_delivered_at INTO delivered FROM shipments WHERE id=shipment_key;
 SELECT count(*) INTO n FROM shipment_confirmed_proofs WHERE shipment_id=shipment_key;
 IF delivered IS NOT NULL AND n NOT BETWEEN 1 AND 3 THEN
 RAISE EXCEPTION 'FINISH confirmation requires 1-3 bound proofs' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finish_delivery_proof_count AFTER INSERT OR UPDATE ON shipments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finish_proof_count();
CREATE CONSTRAINT TRIGGER finish_selected_proof_count AFTER INSERT ON shipment_confirmed_proofs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finish_proof_count();

CREATE FUNCTION finish_terminal_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_key integer; o orders%ROWTYPE; e escrows%ROWTYPE; s order_settlements%ROWTYPE; c fulfillment_commands%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='orders' THEN order_key := NEW.id; ELSE order_key := NEW.order_id; END IF;
 SELECT * INTO o FROM orders WHERE id=order_key;
 SELECT * INTO e FROM escrows WHERE order_id=order_key;
 SELECT * INTO s FROM order_settlements WHERE order_id=order_key;
 IF s.id IS NULL THEN
 IF o.status IN ('COMPLETED','REFUNDED') OR e.status IN ('RELEASED','REFUNDED') THEN
 RAISE EXCEPTION 'FINISH terminal state requires exactly one settlement' USING ERRCODE='23514'; END IF;
 RETURN NULL;
 END IF;
 SELECT * INTO c FROM fulfillment_commands WHERE id=s.command_id;
 IF c.resource_type <> 'ORDER' OR c.resource_id <> order_key OR o.paid_at IS NULL
 OR (s.kind='RELEASE' AND (o.status <> 'COMPLETED' OR e.status <> 'RELEASED'))
 OR (s.kind='REFUND' AND (o.status <> 'REFUNDED' OR e.status <> 'REFUNDED'))
 OR e.settled_at IS DISTINCT FROM s.settled_at THEN
 RAISE EXCEPTION 'FINISH terminal order/escrow/command mismatch' USING ERRCODE='23514'; END IF;
 IF s.kind='RELEASE' AND (s.seller_payout,s.commission_amount,s.inspection_amount,s.shipping_amount) IS DISTINCT FROM (o.seller_payout,o.commission_fee,o.inspection_fee,o.shipping_fee) THEN
 RAISE EXCEPTION 'FINISH release must match original allocations' USING ERRCODE='23514'; END IF;
 IF (s.source='BUYER_RECEIPT' AND (o.receipt_confirmation_source IS DISTINCT FROM 'BUYER' OR c.actor_id IS DISTINCT FROM o.buyer_id))
 OR (s.source='AUTO_RECEIPT' AND (o.receipt_confirmation_source IS DISTINCT FROM 'AUTO' OR c.actor_id IS NOT NULL))
 OR (s.source='ADMIN_RESOLUTION' AND (o.receipt_confirmed_at IS NOT NULL OR o.missing_reported_at IS NULL)) THEN
 RAISE EXCEPTION 'FINISH settlement source does not match receipt/report' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finish_terminal_order AFTER INSERT OR UPDATE ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finish_terminal_consistency();
CREATE CONSTRAINT TRIGGER finish_terminal_escrow AFTER INSERT OR UPDATE ON escrows DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finish_terminal_consistency();
CREATE CONSTRAINT TRIGGER finish_terminal_settlement AFTER INSERT ON order_settlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finish_terminal_consistency();

CREATE FUNCTION finish_payment_success() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM payment_attempts WHERE id=NEW.attempt_id AND outcome='SUCCEEDED') THEN
 RAISE EXCEPTION 'FINISH original Payment requires successful attempt' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finish_payment_success BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION finish_payment_success();
"""

# Selection may only be inserted by the transaction first confirming delivery.
GUARDS += r"""
CREATE FUNCTION finish_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid bigint;
BEGIN
 SELECT confirmation_txid INTO tid FROM shipments WHERE id=NEW.shipment_id FOR UPDATE;
 IF tid IS DISTINCT FROM txid_current() THEN
 RAISE EXCEPTION 'FINISH confirmed proof selection is frozen' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finish_binding_guard BEFORE INSERT ON shipment_confirmed_proofs FOR EACH ROW EXECUTE FUNCTION finish_binding_guard();
CREATE FUNCTION finish_escrow_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.order_id,OLD.payment_id,OLD.amount,OLD.held_at) IS DISTINCT FROM (NEW.order_id,NEW.payment_id,NEW.amount,NEW.held_at) THEN
 RAISE EXCEPTION 'FINISH escrow original amount/payment immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finish_escrow_snapshot BEFORE UPDATE ON escrows FOR EACH ROW EXECUTE FUNCTION finish_escrow_snapshot();
"""

GUARDS += r"""
CREATE FUNCTION finish_history_resource() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM fulfillment_commands WHERE id=NEW.command_id AND resource_type='ORDER' AND resource_id=NEW.order_id) THEN
 RAISE EXCEPTION 'FINISH history command/order mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finish_history_resource BEFORE INSERT ON order_status_history FOR EACH ROW EXECUTE FUNCTION finish_history_resource();
ALTER TABLE delivery_resolutions ADD CONSTRAINT ck_resolution_evidence CHECK (jsonb_typeof(evidence_references::jsonb)='array' AND jsonb_array_length(evidence_references::jsonb)>0);
"""

FINITE_MONEY = {
    "orders": ("item_price","shipping_fee","inspection_fee","commission_fee","seller_payout","total_amount"),
    "payment_attempts": ("amount",), "payments": ("amount",), "escrows": ("amount",),
    "receipts": ("item_price","shipping_fee","inspection_fee","total_amount"),
}
PREFLIGHT += r"""
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM orders WHERE total_amount::text='NaN' OR item_price::text='NaN' OR shipping_fee::text='NaN' OR inspection_fee::text='NaN' OR commission_fee::text='NaN' OR seller_payout::text='NaN')
 OR EXISTS (SELECT 1 FROM receipts WHERE total_amount::text='NaN' OR item_price::text='NaN' OR shipping_fee::text='NaN' OR inspection_fee::text='NaN') THEN
 RAISE EXCEPTION 'FINISH preflight: nonfinite money snapshot; reviewed reconciliation required, amounts will not be guessed'; END IF;
END $$;
"""
GUARDS += "ALTER TABLE order_settlements ADD CONSTRAINT ck_settlements_finite_money CHECK (held_amount::text NOT IN ('NaN','Infinity','-Infinity'));"
