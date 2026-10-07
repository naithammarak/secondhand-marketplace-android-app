"""Shared FINISH locks, command records and private proof verification."""
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select

from app.api.orders import api_error, key_reused, request_fingerprint
from app.models.fulfillment import FulfillmentCommand, OrderStatusHistory, ShipmentConfirmedProof
from app.models.order import Order
from app.models.shipment import Shipment, ShipmentDeliveryProof
from app.models.user import User, UserRole, UserStatus
from app.services import inspection_storage
from app.services.finish_policy import FinishPolicyError
from app.services.finish_proofs import verify_selected_proofs


def locked_order(db, order_id):
    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update()
                      .execution_options(populate_existing=True))
    if order is None:
        raise api_error(404, "order_not_found", "Order not found")
    return order


def fresh_actor(db, actor_id, roles):
    actor = db.scalar(select(User).where(User.id == actor_id).with_for_update()
                      .execution_options(populate_existing=True))
    if actor is None or actor.status != UserStatus.ACTIVE or actor.role not in roles:
        raise api_error(403, "actor_not_authorized", "Active authorized account required")
    return actor


def buyer_actor(db, order, actor_id):
    actor = fresh_actor(db, actor_id, {UserRole.BUYER, UserRole.SELLER})
    if order.buyer_id != actor.id:
        raise api_error(404, "order_not_found", "Order not found")
    return actor


def replay(db, order_id, scope, action, key, payload):
    row = db.scalar(select(FulfillmentCommand).where(
        FulfillmentCommand.resource_type == "ORDER", FulfillmentCommand.resource_id == order_id,
        FulfillmentCommand.actor_scope == scope, FulfillmentCommand.action == action,
        FulfillmentCommand.idempotency_key == key))
    if row is not None and row.request_hash != request_fingerprint(payload):
        raise key_reused()
    return row


def command(db, order_id, scope, actor_id, action, key, payload, result, at, status=200, command_id=None):
    row = FulfillmentCommand(actor_scope=scope, actor_id=actor_id, action=action,
        resource_type="ORDER", resource_id=order_id, idempotency_key=key,
        request_hash=request_fingerprint(payload), response_status=status,
        result=jsonable_encoder(result), committed_at=at)
    if command_id is not None:
        row.id = command_id
    db.add(row)
    db.flush()
    return row


def history(db, order, cmd, previous, event, source, at):
    db.add(OrderStatusHistory(order_id=order.id, command_id=cmd.id,
        from_status=previous, to_status=order.status, event=event, source=source, occurred_at=at))


def shipments_locked(db, order_id):
    return list(db.scalars(select(Shipment).where(Shipment.order_id == order_id)
        .order_by(Shipment.id).with_for_update().execution_options(populate_existing=True)))


def selected_proofs(db, shipment):
    return list(db.scalars(select(ShipmentDeliveryProof).join(ShipmentConfirmedProof,
        ShipmentConfirmedProof.proof_id == ShipmentDeliveryProof.id)
        .where(ShipmentConfirmedProof.shipment_id == shipment.id)
        .order_by(ShipmentDeliveryProof.id).execution_options(populate_existing=True)))


def verify_proofs(db, shipment, rows, ids):
    # Locks are per Order/Shipment. At most three bounded private Storage calls.
    before = [(p.id, p.shipment_id, p.uploaded_by, p.object_key, p.mime_type,
               p.size_bytes, p.sha256) for p in rows if p.id in ids]
    try:
        selected = verify_selected_proofs(shipment_id=shipment.id,
            courier_id=shipment.courier_id, selected_ids=ids, rows=rows,
            download=inspection_storage.download_object)
    except FinishPolicyError as exc:
        status = 503 if exc.code == "storage_unavailable" else 409
        raise api_error(status, exc.code, "Delivery proof could not be verified") from exc
    db.refresh(shipment)
    for p in rows:
        db.refresh(p)
    after = [(p.id, p.shipment_id, p.uploaded_by, p.object_key, p.mime_type,
              p.size_bytes, p.sha256) for p in rows if p.id in ids]
    if before != after or any(p.uploaded_by != shipment.courier_id for p in rows if p.id in ids):
        raise api_error(409, "proof_changed", "Delivery proof changed during verification")
    return selected


def verify_confirmed(db, shipment):
    if shipment is None or shipment.courier_delivered_at is None:
        raise api_error(409, "delivery_proof_required", "Confirmed delivery required")
    rows = selected_proofs(db, shipment)
    return verify_proofs(db, shipment, rows, [p.id for p in rows])


def final_inputs(db, order, shipments):
    from app.models.inspection import Inspection
    from app.models.buyer_inspection_decision import BuyerInspectionDecision
    from app.models.certificate import Certificate
    from app.services.finish_policy import final_leg
    inbound = next((s for s in shipments if s.leg == "TO_CENTER"), None)
    work = db.scalar(select(Inspection).where(Inspection.order_id == order.id)
                     .execution_options(populate_existing=True))
    decision = db.scalar(select(BuyerInspectionDecision).where(BuyerInspectionDecision.order_id == order.id))
    if (order.paid_at is None or inbound is None or inbound.received_at is None
            or work is None or work.inspected_at is None):
        raise api_error(409, "inspection_not_ready", "Final received inspection required")
    try:
        leg = final_leg(work.result, decision.decision if decision else "TIMEOUT" if order.fulfillment_policy == "EXTERNAL_V2" and order.result_timed_out_at is not None else None)
    except FinishPolicyError as exc:
        raise api_error(409, exc.code, "Final inspection and Buyer decision required") from exc
    if work.result in {"PASS", "MINOR_ISSUE"}:
        cert = db.scalar(select(Certificate).where(Certificate.order_id == order.id,
            Certificate.inspection_id == work.id, Certificate.result == work.result))
        if (cert is None or (decision is not None and (decision.inspection_id != work.id or decision.buyer_id != order.buyer_id))
                or (decision is None and order.result_timed_out_at is None)):
            raise api_error(409, "inspection_not_ready", "Matching certificate and decision required")
    return work, decision, leg
