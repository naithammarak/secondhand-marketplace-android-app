"""Owning delivery reads, physical receipt/report and scoped Admin cases."""
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.orders import api_error, load_order_for, require_idempotency_key
from app.database import get_db
from app.models.fulfillment import DeliveryEvidenceAccess, OrderSettlement, OrderStatusHistory
from app.models.order import Escrow, Order
from app.models.shipment import Shipment, ShipmentDeliveryProof
from app.models.user import User, UserRole, UserStatus
from app.schemas.finish import ConfirmReceiptRequest, DeliveryReviewRequest, ReportNotReceivedRequest, ResolveDeliveryRequest
from app.services import finish_core as core, inspection_storage
from app.services.finish_policy import buyer_action_flags
from app.services.fulfillment_guard import require_fulfillment_simulation
from app.services.order_settlement import settlement_service, settlement_view
from app.services.transaction_clock import database_now

router = APIRouter(tags=["Settlement"])


@router.get("/admin/delivery-cases")
def delivery_cases(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
    actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    core.fresh_actor(db, actor.id, {UserRole.ADMIN})
    rows = db.scalars(select(Order).where(Order.status == "DELIVERY_DISPUTED")
        .order_by(Order.missing_reported_at, Order.id).offset(offset).limit(limit + 1)).all()
    return {"items": [{"order_id":o.id,"reported_at":o.missing_reported_at} for o in rows[:limit]],
            "limit":limit,"offset":offset,"has_more":len(rows)>limit}


@router.get("/admin/inspection-overdue")
def overdue_cases(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
    actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models.inspection import Inspection
    core.fresh_actor(db, actor.id, {UserRole.ADMIN})
    rows = db.execute(select(Order, Inspection.id).join(Inspection, Inspection.order_id == Order.id)
        .where(Order.inspection_overdue_escalated_at.is_not(None), Inspection.result.is_(None))
        .order_by(Order.inspection_overdue_escalated_at, Order.id).offset(offset).limit(limit + 1)).all()
    return {"items":[{"order_id":o.id,"inspection_id":ident,"escalated_at":o.inspection_overdue_escalated_at}
                     for o,ident in rows[:limit]], "limit":limit,"offset":offset,"has_more":len(rows)>limit}


def delivery_view(db, order, actor, seller=False):
    now = database_now(db)
    rows = list(db.scalars(select(Shipment).where(Shipment.order_id == order.id).order_by(Shipment.id)))
    escrow = db.scalar(select(Escrow).where(Escrow.order_id == order.id))
    settlement = db.scalar(select(OrderSettlement).where(OrderSettlement.order_id == order.id))
    outbound = next((s for s in rows if s.leg == "TO_BUYER"), None)
    flags = buyer_action_flags(role=actor.role.value, active=actor.status == UserStatus.ACTIVE,
        owns_order=order.buyer_id == actor.id, status=order.status,
        escrow_status=escrow.status if escrow else None, deadline=order.receipt_deadline_at,
        now=now, reported=order.missing_reported_at is not None, settled=settlement is not None,
        confirmed_buyer_delivery=outbound is not None and outbound.courier_delivered_at is not None)
    shipments = []
    for row in rows:
        proofs = core.selected_proofs(db, row)
        shipments.append({"id": row.id, "leg": row.leg, "status": row.status,
            "carrier": row.carrier, "tracking_number": row.tracking_number, "shipped_at": row.shipped_at,
            "delivered_at": row.courier_delivered_at, "delivery_proof_confirmed_at": row.courier_delivered_at,
            "proofs": [] if seller and row.leg == "TO_BUYER" else
                [{"id": p.id, "url": f"/shipment-delivery-proofs/{p.id}", "expires_at": None} for p in proofs]})
    return {"order_id": order.id, "order_status": order.status, "server_time": now,
        "shipments": shipments, "receipt_deadline_at": order.receipt_deadline_at,
        "receipt_confirmed_at": order.receipt_confirmed_at,
        "receipt_confirmation_source": order.receipt_confirmation_source,
        "missing_reported_at": order.missing_reported_at,
        "missing_report": None if seller or order.missing_reported_at is None else
            {"id": order.missing_report_id, "reason": order.missing_report_reason},
        "settlement_status": escrow.status if escrow else None,
        "settlement": settlement_view(settlement, seller=seller),
        "pending_processing": order.status == "RETURNED_TO_SELLER" and settlement is None,
        "inspection_overdue_escalated_at": order.inspection_overdue_escalated_at,
        **flags}


@router.get("/orders/{order_id}/delivery")
def read_delivery(order_id: int, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order, role = load_order_for(db, order_id, actor)
    return delivery_view(db, order, actor, seller=role.value == "seller")


@router.get("/orders/{order_id}/history")
def read_history(order_id: int, limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0),
    actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order, _ = load_order_for(db, order_id, actor)
    rows = db.scalars(select(OrderStatusHistory).where(OrderStatusHistory.order_id == order.id)
        .order_by(OrderStatusHistory.id).offset(offset).limit(limit + 1)).all()
    return {"items": [{"id": r.id, "from_status": r.from_status, "to_status": r.to_status,
        "event": r.event, "source": r.source, "occurred_at": r.occurred_at} for r in rows[:limit]],
        "limit": limit, "offset": offset, "has_more": len(rows) > limit}


@router.post("/orders/{order_id}/confirm-receipt")
def confirm_receipt(order_id: int, body: ConfirmReceiptRequest, response: Response,
    actor: User = Depends(get_current_user), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    result = settlement_service.settle(db, order_id=order_id, kind="RELEASE", source="BUYER_RECEIPT",
        reason="RECEIPT_CONFIRMED", actor_id=actor.id, idempotency_key=key)
    db.commit()
    if result.replayed:
        response.headers["Idempotent-Replayed"] = "true"
    return result.result


@router.post("/orders/{order_id}/report-not-received")
def report_not_received(order_id: int, body: ReportNotReceivedRequest, response: Response,
    actor: User = Depends(get_current_user), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    order = core.locked_order(db, order_id)
    core.buyer_actor(db, order, actor.id)
    old = core.replay(db, order.id, f"USER:{actor.id}", "REPORT_NOT_RECEIVED", key, body.model_dump())
    if old:
        response.headers["Idempotent-Replayed"] = "true"
        return old.result
    require_fulfillment_simulation()
    shipments = core.shipments_locked(db, order.id)
    escrow = db.scalar(select(Escrow).where(Escrow.order_id == order.id).with_for_update())
    outbound = next((s for s in shipments if s.leg == "TO_BUYER"), None)
    # Reporting non-receipt remains possible during a Storage outage.
    if (order.status != "DELIVERED_PENDING_BUYER" or order.missing_reported_at is not None
            or order.receipt_deadline_at is None or outbound is None or outbound.courier_delivered_at is None
            or not core.selected_proofs(db, outbound) or escrow is None or escrow.status != "HELD"):
        raise api_error(409, "invalid_state", "Undisputed Buyer delivery required")
    at = database_now(db)
    if at >= order.receipt_deadline_at:
        raise api_error(409, "receipt_deadline_passed", "Non-receipt report deadline passed")
    previous = order.status
    order.status = "DELIVERY_DISPUTED"
    order.missing_reported_at, order.missing_report_reason = at, body.reason
    report_command_id = db.scalar(select(func.nextval("fulfillment_commands_id_seq")))
    order.missing_report_id = str(report_command_id)
    result = {"order_id": order.id, "order_status": order.status, "reported_at": at,
        "report_id": order.missing_report_id, "settlement_status": "HELD"}
    cmd = core.command(db, order.id, f"USER:{actor.id}", actor.id, "REPORT_NOT_RECEIVED", key,
        body.model_dump(), result, at, command_id=report_command_id)
    core.history(db, order, cmd, previous, "NON_RECEIPT_REPORTED", "BUYER", at)
    db.commit()
    return cmd.result


@router.post("/admin/orders/{order_id}/delivery-review")
def review_delivery(order_id: int, body: DeliveryReviewRequest, response: Response,
    actor: User = Depends(get_current_user), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    order = core.locked_order(db, order_id)
    core.fresh_actor(db, actor.id, {UserRole.ADMIN})
    old = core.replay(db, order.id, f"USER:{actor.id}", "DELIVERY_REVIEW", key, body.model_dump())
    if old:
        response.headers["Idempotent-Replayed"] = "true"
        return old.result
    if order.status != "DELIVERY_DISPUTED" or order.missing_reported_at is None:
        raise api_error(404, "delivery_case_not_found", "Open delivery dispute required")
    at = database_now(db)
    audit = DeliveryEvidenceAccess(order_id=order.id, admin_id=actor.id, reason=body.reason, accessed_at=at)
    db.add(audit)
    db.flush()
    rows = core.shipments_locked(db, order.id)
    result = {"order_id": order.id, "order_status": order.status, "audit_id": audit.id,
        "report": {"id": order.missing_report_id, "reason": order.missing_report_reason,
                   "reference": f"delivery-report:{order.missing_report_id}"},
        "proofs": [{"id": p.id, "reference": f"delivery-proof:{p.id}",
            "url": f"/admin/orders/{order.id}/delivery-proofs/{p.id}?audit_id={audit.id}"}
            for s in rows for p in core.selected_proofs(db, s)],
        "audit_reference": f"delivery-audit:{audit.id}"}
    cmd = core.command(db, order.id, f"USER:{actor.id}", actor.id, "DELIVERY_REVIEW", key,
        body.model_dump(), result, at)
    db.commit()
    return cmd.result


@router.get("/admin/orders/{order_id}/delivery-proofs/{proof_id}")
def read_case_proof(order_id: int, proof_id: int, audit_id: int = Query(gt=0),
    actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    core.fresh_actor(db, actor.id, {UserRole.ADMIN})
    audit = db.get(DeliveryEvidenceAccess, audit_id)
    order = db.get(Order, order_id)
    if (audit is None or audit.admin_id != actor.id or audit.order_id != order_id
            or order is None or order.missing_reported_at is None):
        raise api_error(404, "proof_not_found", "Authorized case proof not found")
    rows = db.scalars(select(Shipment).where(Shipment.order_id == order_id)).all()
    proof = next((p for s in rows for p in core.selected_proofs(db, s) if p.id == proof_id), None)
    if proof is None:
        raise api_error(404, "proof_not_found", "Authorized case proof not found")
    return Response(content=inspection_storage.download_object(proof.object_key), media_type=proof.mime_type,
        headers={"Cache-Control": "no-store"})


@router.post("/admin/orders/{order_id}/resolve-delivery")
def resolve_delivery(order_id: int, body: ResolveDeliveryRequest, response: Response,
    actor: User = Depends(get_current_user), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    result = settlement_service.settle(db, order_id=order_id, kind=body.resolution,
        source="ADMIN_RESOLUTION", reason="DELIVERY_REVIEW_" + body.resolution,
        actor_id=actor.id, idempotency_key=key, admin_reason=body.reason, evidence_refs=tuple(body.evidence_refs))
    db.commit()
    if result.replayed:
        response.headers["Idempotent-Replayed"] = "true"
    return result.result
