"""Explicit demo transport facts and actual return recipient confirmations."""
import os

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.orders import api_error, require_idempotency_key
from app.database import get_db
from app.models.fulfillment import DeliveryEvidenceAccess, FulfillmentCommand, ShippingEvent
from app.models.order import Escrow
from app.models.shipment import Shipment
from app.models.user import User, UserRole
from app.schemas.finish import (ShippingEventRequest, ReturnConfirmationRequest,
    AdminReturnConfirmationRequest, DeliveryReviewRequest)
from app.services import finish_core as core
from app.services.fulfillment_guard import require_fulfillment_simulation
from app.services.order_settlement import attempt_return_refund
from app.services.transaction_clock import database_now

router = APIRouter(tags=["External shipping"])


def external_order(order):
    if order.fulfillment_policy != "EXTERNAL_V2":
        raise api_error(409, "external_policy_required", "Historical Order retains legacy delivery rules")


def return_context(db, order):
    external_order(order)
    shipments = core.shipments_locked(db, order.id)
    work, decision, leg = core.final_inputs(db, order, shipments)
    shipment = next((s for s in shipments if s.leg == "TO_SELLER"), None)
    if leg != "TO_SELLER" or shipment is None:
        raise api_error(409, "return_dispatch_required", "Matching authorized return dispatch required")
    return shipment


@router.post("/admin/shipments/{shipment_id}/shipping-events")
def shipping_event(shipment_id: int, body: ShippingEventRequest, response: Response,
    actor: User = Depends(get_current_user), key: str = Depends(require_idempotency_key),
    db: Session = Depends(get_db)):
    require_fulfillment_simulation()
    if os.getenv("EXTERNAL_SHIPPING_DEMO_ENABLED", "false").strip().lower() != "true":
        raise api_error(403, "shipping_demo_disabled", "Explicit demo shipping flag required")
    # Stable event identity ownership across different Orders; no business lock yet.
    db.execute(select(func.pg_advisory_xact_lock(1790520303, func.hashtext("ADMIN_DEMO:" + body.event_id))))
    order_id = db.scalar(select(Shipment.order_id).where(Shipment.id == shipment_id))
    if order_id is None:
        core.fresh_actor(db, actor.id, {UserRole.ADMIN})
        raise api_error(404, "shipment_not_found", "Shipment not found")
    order = core.locked_order(db, order_id)
    core.fresh_actor(db, actor.id, {UserRole.ADMIN})
    external_order(order)
    payload = {"shipment_id": shipment_id, **body.model_dump()}
    old = core.replay(db, order.id, f"USER:{actor.id}", "SHIPPING_EVENT", key, payload)
    if old:
        response.headers["Idempotent-Replayed"] = "true"
        return old.result
    rows = core.shipments_locked(db, order.id)
    shipment = next(s for s in rows if s.id == shipment_id)
    if shipment.leg != body.leg:
        raise api_error(409, "shipping_leg_mismatch", "Event must match persisted shipment leg")
    duplicate = db.scalar(select(ShippingEvent).where(ShippingEvent.source == "ADMIN_DEMO", ShippingEvent.event_id == body.event_id))
    if duplicate:
        if (duplicate.shipment_id, duplicate.leg, duplicate.event) != (shipment_id, body.leg, body.event):
            raise api_error(409, "shipping_event_reused", "Event identity already belongs to another shipment/leg")
        result = db.get(FulfillmentCommand, duplicate.command_id).result
        core.command(db, order.id, f"USER:{actor.id}", actor.id, "SHIPPING_EVENT", key, payload, result, database_now(db))
        db.commit()
        response.headers["Idempotent-Replayed"] = "true"
        return result
    if order.status in {"COMPLETED", "REFUNDED", "RETURNED_TO_SELLER"} or shipment.received_at is not None:
        raise api_error(409, "shipping_event_too_late", "Recipient/terminal facts cannot be reversed")
    if db.scalar(select(ShippingEvent.id).where(ShippingEvent.shipment_id == shipment.id)):
        raise api_error(409, "delivery_already_recorded", "Shipment delivered event already recorded")
    if shipment.leg != "TO_CENTER":
        _, _, leg = core.final_inputs(db, order, rows)
        if leg != shipment.leg:
            raise api_error(409, "shipping_leg_mismatch", "Final direction does not match result outcome")
    escrow = db.scalar(select(Escrow).where(Escrow.order_id == order.id).with_for_update())
    if escrow is None or escrow.status != "HELD":
        raise api_error(409, "invalid_state", "Held shipment required")
    at = database_now(db)
    event_ident = db.scalar(select(func.nextval("shipping_events_id_seq")))
    result = {"order_id": order.id, "shipment_id": shipment.id, "leg": shipment.leg,
        "event_id": body.event_id, "event": body.event, "source": "ADMIN_DEMO",
        "confirmed_at": at, "simulated": True, "recipient_confirmed": False}
    cmd = core.command(db, order.id, f"USER:{actor.id}", actor.id, "SHIPPING_EVENT", key, payload, result, at)
    db.add(ShippingEvent(id=event_ident, order_id=order.id, shipment_id=shipment.id, leg=shipment.leg,
        source="ADMIN_DEMO", event=body.event, event_id=body.event_id, admin_id=actor.id,
        command_id=cmd.id, confirmed_at=at))
    previous = order.status
    if shipment.leg != "TO_CENTER":
        shipment.status = "DELIVERED"
    if shipment.leg == "TO_BUYER":
        from datetime import timedelta
        order.receipt_deadline_at = at + timedelta(hours=72)
        if order.missing_reported_at is None:
            order.status = "DELIVERED_PENDING_BUYER"
    core.history(db, order, cmd, previous, "SHIPPING_DELIVERED_SIMULATED", "ADMIN_DEMO", at)
    db.commit()
    return cmd.result


@router.post("/orders/{order_id}/confirm-return")
def seller_return_receipt(order_id: int, body: ReturnConfirmationRequest, response: Response,
    actor: User = Depends(get_current_user), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    order = core.locked_order(db, order_id)
    core.fresh_actor(db, actor.id, {UserRole.SELLER})
    if order.seller_id != actor.id:
        raise api_error(404, "order_not_found", "Order not found")
    return record_return(db, order, actor.id, key, body.model_dump(), response, admin=False)


@router.post("/admin/orders/{order_id}/return-review")
def review_return(order_id: int, body: DeliveryReviewRequest, response: Response,
    actor: User = Depends(get_current_user), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    order = core.locked_order(db, order_id)
    core.fresh_actor(db, actor.id, {UserRole.ADMIN})
    old = core.replay(db, order.id, f"USER:{actor.id}", "RETURN_REVIEW", key, body.model_dump())
    if old:
        response.headers["Idempotent-Replayed"] = "true"
        return old.result
    shipment = return_context(db, order)
    if order.status != "RESULT_NOTIFIED" or shipment.received_at is not None:
        raise api_error(409, "return_case_closed", "Unconfirmed dispatched return required")
    at = database_now(db)
    audit = DeliveryEvidenceAccess(order_id=order.id, admin_id=actor.id, reason=body.reason, accessed_at=at)
    db.add(audit)
    db.flush()
    result = {"order_id": order.id, "shipment_id": shipment.id, "return_recipient": order.return_address,
        "evidence_refs": [f"delivery-audit:{audit.id}", f"return-shipment:{shipment.id}"], "simulated": True}
    cmd = core.command(db, order.id, f"USER:{actor.id}", actor.id, "RETURN_REVIEW", key, body.model_dump(), result, at)
    db.commit()
    return cmd.result


@router.post("/admin/orders/{order_id}/confirm-return")
def admin_return_receipt(order_id: int, body: AdminReturnConfirmationRequest, response: Response,
    actor: User = Depends(get_current_user), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    order = core.locked_order(db, order_id)
    core.fresh_actor(db, actor.id, {UserRole.ADMIN})
    return record_return(db, order, actor.id, key, body.model_dump(), response, admin=True)


def record_return(db, order, actor_id, key, payload, response, *, admin):
    action = "ADMIN_RETURN_RECEIPT" if admin else "RETURN_RECEIPT"
    old = core.replay(db, order.id, f"USER:{actor_id}", action, key, payload)
    if old:
        response.headers["Idempotent-Replayed"] = "true"
        return old.result
    require_fulfillment_simulation()
    shipment = return_context(db, order)
    escrow = db.scalar(select(Escrow).where(Escrow.order_id == order.id).with_for_update())
    if order.status != "RESULT_NOTIFIED" or shipment.received_at is not None or escrow is None or escrow.status != "HELD":
        raise api_error(409, "return_receipt_already_recorded", "Unconfirmed authorized return required")
    if admin:
        refs = payload["evidence_refs"]
        audits = list(db.scalars(select(DeliveryEvidenceAccess.id).where(DeliveryEvidenceAccess.order_id == order.id,
            DeliveryEvidenceAccess.admin_id == actor_id)))
        allowed = {f"delivery-audit:{ident}" for ident in audits} | {f"return-shipment:{shipment.id}"}
        if (not set(refs) <= allowed or f"return-shipment:{shipment.id}" not in refs
                or not any(f"delivery-audit:{ident}" in refs for ident in audits)):
            raise api_error(422, "invalid_evidence_reference", "Same-case Admin review and return shipment evidence required")
    at = database_now(db)
    result = {"order_id": order.id, "shipment_id": shipment.id, "return_received_at": at,
        "recipient_source": "ADMIN" if admin else "SELLER", "order_status": "RETURNED_TO_SELLER",
        "settlement_attempt": "SEPARATE", "simulated": True}
    cmd = core.command(db, order.id, f"USER:{actor_id}", actor_id, action, key, payload, result, at)
    shipment.status = "DELIVERED"
    shipment.received_at, shipment.received_by = at, actor_id
    shipment.recipient_source, shipment.recipient_command_id = result["recipient_source"], cmd.id
    shipment.received_note = payload.get("reason")
    previous = order.status
    order.status = "RETURNED_TO_SELLER"
    core.history(db, order, cmd, previous, "RETURN_RECIPIENT_CONFIRMED", result["recipient_source"], at)
    db.commit()  # Actual return must survive an independent financial failure.
    attempt_return_refund(db.get_bind(), order.id)
    return cmd.result
