"""External shipping and result-decision policy; existing facts stay legacy.

Revision r01e20261002; parent c08f20261002. Frozen DDL only.
"""
from alembic import op
import sqlalchemy as sa
revision = "r01e20261002"
down_revision = "c08f20261002"
branch_labels = None
depends_on = None

OLD_CHECKS = {'orders': {'ck_orders_receipt_confirmation': "(receipt_confirmed_at IS NULL AND receipt_confirmation_source IS NULL) OR (receipt_confirmed_at IS NOT NULL AND receipt_confirmation_source IS NOT NULL AND receipt_confirmation_source IN ('BUYER','AUTO') AND receipt_deadline_at IS NOT NULL AND missing_reported_at IS NULL AND status = 'COMPLETED')", 'ck_orders_missing_report': "(missing_reported_at IS NULL AND missing_report_reason IS NULL AND missing_report_id IS NULL) OR (missing_reported_at IS NOT NULL AND missing_report_reason IS NOT NULL AND missing_report_id IS NOT NULL AND length(trim(missing_report_reason)) BETWEEN 10 AND 2000 AND receipt_deadline_at IS NOT NULL AND missing_reported_at < receipt_deadline_at AND receipt_confirmed_at IS NULL AND status IN ('DELIVERY_DISPUTED','COMPLETED','REFUNDED'))", 'ck_orders_receipt_boundary': "receipt_confirmation_source IS NULL OR (receipt_confirmation_source = 'BUYER' AND receipt_confirmed_at < receipt_deadline_at) OR (receipt_confirmation_source = 'AUTO' AND receipt_confirmed_at >= receipt_deadline_at)"}, 'shipments': {'ck_shipments_receipt': "(leg = 'TO_CENTER' AND ((status = 'IN_TRANSIT' AND received_at IS NULL AND received_by IS NULL) OR (status = 'DELIVERED' AND received_at IS NOT NULL AND received_by IS NOT NULL AND courier_delivered_at IS NOT NULL AND received_at >= courier_delivered_at))) OR (leg IN ('TO_BUYER', 'TO_SELLER') AND received_at IS NULL AND received_by IS NULL AND ((status = 'IN_TRANSIT' AND courier_delivered_at IS NULL) OR (status = 'DELIVERED' AND courier_delivered_at IS NOT NULL)))"}, 'order_settlements': {'ck_settlements_allocation': "(kind = 'RELEASE' AND buyer_refund = 0 AND held_amount = seller_payout + commission_amount + inspection_amount + shipping_amount) OR (kind = 'REFUND' AND buyer_refund = held_amount AND seller_payout = 0 AND commission_amount = 0 AND inspection_amount = 0 AND shipping_amount = 0)", 'ck_settlements_codes': "(kind = 'RELEASE' AND ((source = 'BUYER_RECEIPT' AND reason = 'RECEIPT_CONFIRMED') OR (source = 'AUTO_RECEIPT' AND reason = 'RECEIPT_TIMEOUT') OR (source = 'ADMIN_RESOLUTION' AND reason = 'DELIVERY_REVIEW_RELEASE'))) OR (kind = 'REFUND' AND ((source = 'RETURN_DELIVERY' AND reason IN ('BUYER_REJECTED_INSPECTION','INSPECTION_NOT_AS_DESCRIBED','INSPECTION_FAKE')) OR (source = 'SELLER_NO_SHIP' AND reason = 'SELLER_NO_SHIP') OR (source = 'ADMIN_RESOLUTION' AND reason = 'DELIVERY_REVIEW_REFUND')))"}}
NEW_CHECKS = {'orders': {'ck_orders_receipt_confirmation': "(receipt_confirmed_at IS NULL AND receipt_confirmation_source IS NULL) OR (receipt_confirmed_at IS NOT NULL AND receipt_confirmation_source IS NOT NULL AND receipt_confirmation_source IN ('BUYER','AUTO') AND (receipt_deadline_at IS NOT NULL OR (fulfillment_policy = 'EXTERNAL_V2' AND receipt_confirmation_source = 'BUYER')) AND missing_reported_at IS NULL AND status = 'COMPLETED')", 'ck_orders_missing_report': "(missing_reported_at IS NULL AND missing_report_reason IS NULL AND missing_report_id IS NULL) OR (missing_reported_at IS NOT NULL AND missing_report_reason IS NOT NULL AND missing_report_id IS NOT NULL AND length(trim(missing_report_reason)) BETWEEN 10 AND 2000 AND ((receipt_deadline_at IS NOT NULL AND missing_reported_at < receipt_deadline_at) OR (fulfillment_policy = 'EXTERNAL_V2' AND receipt_deadline_at IS NULL)) AND receipt_confirmed_at IS NULL AND status IN ('DELIVERY_DISPUTED','COMPLETED','REFUNDED'))", 'ck_orders_receipt_boundary': "receipt_confirmation_source IS NULL OR (receipt_confirmation_source = 'BUYER' AND (receipt_confirmed_at < receipt_deadline_at OR (fulfillment_policy = 'EXTERNAL_V2' AND receipt_deadline_at IS NULL))) OR (receipt_confirmation_source = 'AUTO' AND receipt_confirmed_at >= receipt_deadline_at)"}, 'shipments': {'ck_shipments_receipt': "(fulfillment_policy = 'LEGACY_V1' AND ((leg = 'TO_CENTER' AND ((status = 'IN_TRANSIT' AND received_at IS NULL AND received_by IS NULL) OR (status = 'DELIVERED' AND received_at IS NOT NULL AND received_by IS NOT NULL AND courier_delivered_at IS NOT NULL AND received_at >= courier_delivered_at))) OR (leg IN ('TO_BUYER', 'TO_SELLER') AND received_at IS NULL AND received_by IS NULL AND ((status = 'IN_TRANSIT' AND courier_delivered_at IS NULL) OR (status = 'DELIVERED' AND courier_delivered_at IS NOT NULL))))) OR (fulfillment_policy = 'EXTERNAL_V2' AND courier_id IS NULL AND courier_delivered_at IS NULL AND ((received_at IS NULL AND received_by IS NULL AND recipient_source IS NULL AND recipient_command_id IS NULL) OR (received_at IS NOT NULL AND received_at >= shipped_at AND received_by IS NOT NULL AND recipient_source IS NOT NULL AND recipient_command_id IS NOT NULL AND status = 'DELIVERED')))"}, 'order_settlements': {'ck_settlements_allocation': "(kind = 'RELEASE' AND buyer_refund = 0 AND held_amount = seller_payout + commission_amount + inspection_amount + shipping_amount) OR (kind = 'REFUND' AND seller_payout = 0 AND commission_amount = 0 AND held_amount = buyer_refund + inspection_amount + shipping_amount AND ((fulfillment_policy = 'EXTERNAL_V2' AND source = 'RETURN_DELIVERY' AND reason IN ('BUYER_REJECTED_INSPECTION','RESULT_DECISION_TIMEOUT')) OR (buyer_refund = held_amount AND inspection_amount = 0 AND shipping_amount = 0)))", 'ck_settlements_codes': "(kind = 'RELEASE' AND ((source = 'BUYER_RECEIPT' AND reason = 'RECEIPT_CONFIRMED') OR (source = 'AUTO_RECEIPT' AND reason = 'RECEIPT_TIMEOUT') OR (source = 'ADMIN_RESOLUTION' AND reason = 'DELIVERY_REVIEW_RELEASE'))) OR (kind = 'REFUND' AND ((source = 'RETURN_DELIVERY' AND reason IN ('BUYER_REJECTED_INSPECTION','RESULT_DECISION_TIMEOUT','INSPECTION_NOT_AS_DESCRIBED','INSPECTION_FAKE')) OR (source = 'SELLER_NO_SHIP' AND reason = 'SELLER_NO_SHIP') OR (source = 'ADMIN_RESOLUTION' AND reason = 'DELIVERY_REVIEW_REFUND')))"}}


def checks(mapping):
    for table, names in mapping.items():
        for name, expression in names.items():
            op.execute(f'ALTER TABLE {table} DROP CONSTRAINT {name}')
            op.execute(f'ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({expression})')


def upgrade():
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("External shipping requires PostgreSQL")
    for table in ("orders", "shipments", "order_settlements"):
        op.add_column(table, sa.Column("fulfillment_policy", sa.String(24), nullable=False, server_default="LEGACY_V1"))
    for name in ("result_available_at", "result_decision_deadline_at", "result_timed_out_at"):
        op.add_column("orders", sa.Column(name, sa.DateTime(timezone=True)))
    op.add_column("shipments", sa.Column("recipient_source", sa.String(16)))
    op.add_column("shipments", sa.Column("recipient_command_id", sa.Integer(), sa.ForeignKey("fulfillment_commands.id", ondelete="RESTRICT")))
    op.execute("ALTER TABLE orders ADD CONSTRAINT ck_orders_fulfillment_policy CHECK (fulfillment_policy IN ('LEGACY_V1','EXTERNAL_V2'))")
    op.execute("ALTER TABLE orders ADD CONSTRAINT ck_orders_result_window CHECK ((result_available_at IS NULL AND result_decision_deadline_at IS NULL AND result_timed_out_at IS NULL) OR (fulfillment_policy='EXTERNAL_V2' AND result_available_at IS NOT NULL AND result_decision_deadline_at=result_available_at+interval '72 hours' AND (result_timed_out_at IS NULL OR result_timed_out_at>=result_decision_deadline_at)))")
    op.execute("ALTER TABLE shipments ADD CONSTRAINT ck_shipments_policy CHECK (fulfillment_policy IN ('LEGACY_V1','EXTERNAL_V2'))")
    op.execute("ALTER TABLE shipments ADD CONSTRAINT ck_shipments_recipient_source CHECK (recipient_source IS NULL OR recipient_source IN ('INSPECTOR','BUYER','SELLER','ADMIN'))")
    op.execute("ALTER TABLE shipments ADD CONSTRAINT uq_shipments_event_tuple UNIQUE(id,order_id,leg)")
    checks(NEW_CHECKS)
    op.execute("""CREATE TABLE shipping_events (
        id SERIAL PRIMARY KEY, order_id integer NOT NULL, shipment_id integer NOT NULL,
        leg varchar(16) NOT NULL, source varchar(24) NOT NULL, event varchar(16) NOT NULL,
        event_id varchar(100) NOT NULL, admin_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        command_id integer NOT NULL REFERENCES fulfillment_commands(id) ON DELETE RESTRICT,
        confirmed_at timestamptz NOT NULL,
        CONSTRAINT uq_shipping_event_identity UNIQUE(source,event_id),
        CONSTRAINT uq_shipping_event_delivered UNIQUE(shipment_id),
        CONSTRAINT uq_shipping_event_command UNIQUE(command_id),
        CONSTRAINT fk_shipping_event_shipment FOREIGN KEY(shipment_id,order_id,leg) REFERENCES shipments(id,order_id,leg) ON DELETE RESTRICT,
        CONSTRAINT ck_shipping_event_source CHECK(source='ADMIN_DEMO' AND event='DELIVERED' AND length(event_id) BETWEEN 8 AND 100))""")
    op.execute(GUARDS)
    op.execute("ALTER TABLE shipping_events ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON shipping_events FROM PUBLIC")
    op.execute("""DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON shipping_events FROM anon; END IF;
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON shipping_events FROM authenticated; END IF;
    END $$""")


def downgrade():
    # A new snapshot or new evidence cannot be interpreted by the old API.
    if op.get_bind().scalar(sa.text("SELECT EXISTS(SELECT 1 FROM orders WHERE fulfillment_policy <> 'LEGACY_V1') OR EXISTS(SELECT 1 FROM shipping_events)")):
        raise RuntimeError("External shipping downgrade refused: new-policy Orders/evidence cannot be represented safely; preserve history and use forward repair")
    for table, name in (("orders","external_order_guard"),("shipments","external_shipment_guard"),("order_settlements","external_settlement_guard"),("orders","external_order_facts"),("shipments","external_shipment_facts"),("buyer_inspection_decisions","external_decision_guard")):
        op.execute(f"DROP TRIGGER {name} ON {table}")
    op.execute("DROP TABLE shipping_events")
    for name in ("external_order_guard","external_shipment_guard","external_settlement_guard","external_facts","external_decision_guard","external_event_guard"):
        op.execute(f"DROP FUNCTION {name}()")
    checks(OLD_CHECKS)
    op.execute("ALTER TABLE orders DROP CONSTRAINT ck_orders_result_window, DROP CONSTRAINT ck_orders_fulfillment_policy")
    op.execute("ALTER TABLE shipments DROP CONSTRAINT uq_shipments_event_tuple, DROP CONSTRAINT ck_shipments_policy, DROP CONSTRAINT ck_shipments_recipient_source")
    for name in ("recipient_source","recipient_command_id","fulfillment_policy"):
        op.drop_column("shipments",name)
    for name in ("result_available_at","result_decision_deadline_at","result_timed_out_at","fulfillment_policy"):
        op.drop_column("orders",name)
    op.drop_column("order_settlements","fulfillment_policy")


GUARDS = r"""
CREATE FUNCTION external_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.fulfillment_policy IS DISTINCT FROM NEW.fulfillment_policy THEN
 RAISE EXCEPTION 'delivery/refund policy snapshot immutable' USING ERRCODE='23514'; END IF;
 IF OLD.result_available_at IS NOT NULL AND (OLD.result_available_at,OLD.result_decision_deadline_at) IS DISTINCT FROM (NEW.result_available_at,NEW.result_decision_deadline_at)
 OR OLD.result_timed_out_at IS NOT NULL AND OLD.result_timed_out_at IS DISTINCT FROM NEW.result_timed_out_at THEN
 RAISE EXCEPTION 'result availability/deadline/timeout immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_order_guard BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION external_order_guard();

CREATE FUNCTION external_shipment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o orders%ROWTYPE; c fulfillment_commands%ROWTYPE; actor users%ROWTYPE;
BEGIN
 SELECT * INTO o FROM orders WHERE id=NEW.order_id FOR UPDATE;
 IF NEW.fulfillment_policy <> o.fulfillment_policy THEN
 RAISE EXCEPTION 'shipment policy differs from order' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (OLD.fulfillment_policy IS DISTINCT FROM NEW.fulfillment_policy OR
 (OLD.received_at IS NOT NULL AND (OLD.received_at,OLD.received_by,OLD.received_note,OLD.recipient_source,OLD.recipient_command_id) IS DISTINCT FROM (NEW.received_at,NEW.received_by,NEW.received_note,NEW.recipient_source,NEW.recipient_command_id))) THEN
 RAISE EXCEPTION 'recipient confirmation immutable' USING ERRCODE='23514'; END IF;
 IF NEW.fulfillment_policy='EXTERNAL_V2' AND NEW.received_at IS NOT NULL THEN
 SELECT * INTO c FROM fulfillment_commands WHERE id=NEW.recipient_command_id;
 SELECT * INTO actor FROM users WHERE id=NEW.received_by;
 IF c.id IS NULL OR c.resource_type <> 'ORDER' OR c.resource_id <> o.id OR c.actor_id IS DISTINCT FROM actor.id OR actor.status <> 'ACTIVE' OR c.committed_at <> NEW.received_at
 OR (NEW.leg='TO_CENTER' AND (NEW.recipient_source <> 'INSPECTOR' OR actor.role <> 'INSPECTOR' OR c.action <> 'CENTER_RECEIPT'))
 OR (NEW.leg='TO_BUYER' AND (NEW.recipient_source <> 'BUYER' OR actor.id <> o.buyer_id OR c.action <> 'SETTLE_BUYER_RECEIPT'))
 OR (NEW.leg='TO_SELLER' AND ((NEW.recipient_source='SELLER' AND (actor.id <> o.seller_id OR actor.role <> 'SELLER' OR c.action <> 'RETURN_RECEIPT')) OR (NEW.recipient_source='ADMIN' AND (actor.role <> 'ADMIN' OR c.action <> 'ADMIN_RETURN_RECEIPT')) OR NEW.recipient_source NOT IN ('SELLER','ADMIN'))) THEN
 RAISE EXCEPTION 'recipient receipt requires authorized matching command' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_shipment_guard BEFORE INSERT OR UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION external_shipment_guard();

CREATE FUNCTION external_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o orders%ROWTYPE; s shipments%ROWTYPE; c fulfillment_commands%ROWTYPE;
BEGIN
 SELECT * INTO o FROM orders WHERE id=NEW.order_id FOR UPDATE;
 SELECT * INTO s FROM shipments WHERE id=NEW.shipment_id FOR UPDATE;
 SELECT * INTO c FROM fulfillment_commands WHERE id=NEW.command_id;
 IF o.fulfillment_policy <> 'EXTERNAL_V2' OR s.fulfillment_policy <> o.fulfillment_policy OR s.leg <> NEW.leg OR s.order_id <> o.id OR o.status IN ('COMPLETED','REFUNDED') OR s.received_at IS NOT NULL
 OR c.id IS NULL OR c.resource_type <> 'ORDER' OR c.resource_id <> o.id OR c.action <> 'SHIPPING_EVENT' OR c.actor_id IS DISTINCT FROM NEW.admin_id OR c.actor_scope IS DISTINCT FROM 'USER:' || NEW.admin_id OR c.committed_at <> NEW.confirmed_at
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.admin_id AND role='ADMIN' AND status='ACTIVE') OR NEW.confirmed_at < s.shipped_at THEN
 RAISE EXCEPTION 'trusted shipment event requires active Admin and matching command/leg' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_event_guard BEFORE INSERT ON shipping_events FOR EACH ROW EXECUTE FUNCTION external_event_guard();
CREATE TRIGGER immutable_shipping_events BEFORE UPDATE OR DELETE ON shipping_events FOR EACH ROW EXECUTE FUNCTION finish_append_only();

CREATE FUNCTION external_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o orders%ROWTYPE;
BEGIN
 SELECT * INTO o FROM orders WHERE id=NEW.order_id FOR UPDATE;
 IF o.fulfillment_policy='EXTERNAL_V2' AND (o.result_timed_out_at IS NOT NULL OR o.result_decision_deadline_at IS NULL OR clock_timestamp() >= o.result_decision_deadline_at OR NEW.decided_at >= o.result_decision_deadline_at) THEN
 RAISE EXCEPTION 'result decision deadline passed' USING ERRCODE='23514',CONSTRAINT='ck_result_decision_deadline'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_decision_guard BEFORE INSERT ON buyer_inspection_decisions FOR EACH ROW EXECUTE FUNCTION external_decision_guard();

CREATE FUNCTION external_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o orders%ROWTYPE;
BEGIN
 SELECT * INTO o FROM orders WHERE id=NEW.order_id FOR UPDATE;
 IF NEW.fulfillment_policy IS DISTINCT FROM o.fulfillment_policy THEN
 RAISE EXCEPTION 'settlement policy must match immutable Order' USING ERRCODE='23514'; END IF;
 IF NEW.reason='RESULT_DECISION_TIMEOUT' AND (o.fulfillment_policy <> 'EXTERNAL_V2' OR o.result_timed_out_at IS NULL) THEN
 RAISE EXCEPTION 'timeout cause requires persisted new-policy outcome' USING ERRCODE='23514'; END IF;
 IF NEW.kind='REFUND' AND o.fulfillment_policy='EXTERNAL_V2' AND NEW.source='RETURN_DELIVERY' AND NEW.reason IN ('BUYER_REJECTED_INSPECTION','RESULT_DECISION_TIMEOUT') THEN
 IF (NEW.buyer_refund,NEW.inspection_amount,NEW.shipping_amount) IS DISTINCT FROM (o.item_price,o.inspection_fee,o.shipping_fee) THEN
 RAISE EXCEPTION 'item-only refund must retain exact original fees once' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_settlement_guard BEFORE INSERT ON order_settlements FOR EACH ROW EXECUTE FUNCTION external_settlement_guard();

CREATE FUNCTION external_facts() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o orders%ROWTYPE; s shipments%ROWTYPE; w inspections%ROWTYPE; d buyer_inspection_decisions%ROWTYPE; e shipping_events%ROWTYPE; terminal order_settlements%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='orders' THEN SELECT * INTO o FROM orders WHERE id=NEW.id; ELSE SELECT * INTO o FROM orders WHERE id=NEW.order_id; END IF;
 IF o.fulfillment_policy <> 'EXTERNAL_V2' THEN RETURN NULL; END IF;
 SELECT * INTO w FROM inspections WHERE order_id=o.id;
 SELECT * INTO d FROM buyer_inspection_decisions WHERE order_id=o.id;
 IF (w.result IN ('PASS','MINOR_ISSUE') AND o.result_available_at IS NULL) OR (o.result_available_at IS NOT NULL AND (w.result NOT IN ('PASS','MINOR_ISSUE') OR w.inspected_at IS DISTINCT FROM o.result_available_at OR NOT EXISTS(SELECT 1 FROM certificates WHERE order_id=o.id AND inspection_id=w.id AND result=w.result))) THEN
 RAISE EXCEPTION 'result window requires matching atomic positive result/certificate' USING ERRCODE='23514'; END IF;
 IF o.result_timed_out_at IS NOT NULL AND (d.id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM fulfillment_commands WHERE resource_type='ORDER' AND resource_id=o.id AND action='RESULT_DECISION_TIMEOUT' AND actor_scope='SYSTEM:lifecycle' AND actor_id IS NULL AND committed_at=o.result_timed_out_at)) THEN
 RAISE EXCEPTION 'timeout requires SYSTEM outcome and no Buyer decision' USING ERRCODE='23514'; END IF;
 SELECT * INTO s FROM shipments WHERE order_id=o.id AND leg <> 'TO_CENTER';
 IF s.id IS NOT NULL THEN
 IF w.id IS NULL OR w.result IS NULL OR NOT EXISTS(SELECT 1 FROM shipments WHERE order_id=o.id AND leg='TO_CENTER' AND received_at IS NOT NULL)
 OR s.shipped_at < coalesce(d.decided_at,o.result_timed_out_at,w.inspected_at)
 OR (s.leg='TO_BUYER' AND s.destination_address::jsonb IS DISTINCT FROM jsonb_build_object('recipient_name',o.ship_recipient_name,'phone',o.ship_phone,'address_line',o.ship_address_line,'subdistrict',o.ship_subdistrict,'district',o.ship_district,'province',o.ship_province,'postal_code',o.ship_postal_code))
 OR (w.result IN ('PASS','MINOR_ISSUE') AND NOT EXISTS(SELECT 1 FROM certificates WHERE order_id=o.id AND inspection_id=w.id AND result=w.result)) THEN
 RAISE EXCEPTION 'final dispatch requires actual outcome and immutable destination' USING ERRCODE='23514'; END IF;
 IF s.status='DELIVERED' AND s.received_at IS NULL AND NOT EXISTS(SELECT 1 FROM shipping_events WHERE shipment_id=s.id) THEN
 RAISE EXCEPTION 'transport delivered status requires trusted event' USING ERRCODE='23514'; END IF;
 IF w.result IN ('PASS','MINOR_ISSUE') AND ((s.leg='TO_BUYER' AND (d.decision IS DISTINCT FROM 'CONFIRM' OR o.result_timed_out_at IS NOT NULL)) OR (s.leg='TO_SELLER' AND d.decision IS DISTINCT FROM 'REJECT' AND o.result_timed_out_at IS NULL)) OR w.result IN ('FAKE','NOT_AS_DESCRIBED') AND s.leg <> 'TO_SELLER' THEN
 RAISE EXCEPTION 'final leg must match actual result/decision/timeout' USING ERRCODE='23514'; END IF;
 END IF;
 IF o.receipt_deadline_at IS NOT NULL THEN
 SELECT * INTO e FROM shipping_events WHERE order_id=o.id AND leg='TO_BUYER';
 IF e.id IS NULL OR o.receipt_deadline_at <> e.confirmed_at+interval '72 hours' THEN
 RAISE EXCEPTION 'AUTO deadline requires trusted TO_BUYER delivery time' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT * INTO terminal FROM order_settlements WHERE order_id=o.id;
 IF o.status='RETURNED_TO_SELLER' AND (s.leg IS DISTINCT FROM 'TO_SELLER' OR s.received_at IS NULL OR s.recipient_source NOT IN ('SELLER','ADMIN')) THEN
 RAISE EXCEPTION 'durable returned state requires actual recipient confirmation' USING ERRCODE='23514'; END IF;
 IF terminal.source='BUYER_RECEIPT' AND (s.leg IS DISTINCT FROM 'TO_BUYER' OR s.received_at IS DISTINCT FROM o.receipt_confirmed_at OR s.recipient_source IS DISTINCT FROM 'BUYER' OR s.recipient_command_id IS DISTINCT FROM terminal.command_id) THEN
 RAISE EXCEPTION 'manual RELEASE requires same-command physical Buyer receipt' USING ERRCODE='23514'; END IF;
 IF terminal.source='RETURN_DELIVERY' AND (s.leg IS DISTINCT FROM 'TO_SELLER' OR s.received_at IS NULL OR s.recipient_source NOT IN ('SELLER','ADMIN')
 OR terminal.reason IS DISTINCT FROM CASE WHEN w.result='FAKE' THEN 'INSPECTION_FAKE' WHEN w.result='NOT_AS_DESCRIBED' THEN 'INSPECTION_NOT_AS_DESCRIBED' WHEN o.result_timed_out_at IS NOT NULL THEN 'RESULT_DECISION_TIMEOUT' ELSE 'BUYER_REJECTED_INSPECTION' END) THEN
 RAISE EXCEPTION 'return refund requires actual correct recipient/cause' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER external_order_facts AFTER INSERT OR UPDATE ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION external_facts();
CREATE CONSTRAINT TRIGGER external_shipment_facts AFTER INSERT OR UPDATE ON shipments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION external_facts();
"""
