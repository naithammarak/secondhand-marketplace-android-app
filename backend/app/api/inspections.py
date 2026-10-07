"""INSPECT-02/03: authorized shipment, inspection and private result flow."""

import secrets
import logging
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.admin_verifications import require_admin
from app.api.orders import BUYER_ACCOUNT_ROLES, api_error, key_reused, load_order_for, not_order_buyer, request_fingerprint, require_idempotency_key, validation_error
from app.database import get_db
from app.models.certificate import Certificate
from app.models.buyer_inspection_decision import BuyerInspectionDecision
from app.models.inspection import Inspection, InspectionEvidence, InspectionIdempotency, InspectionResultEvidence
from app.models.order import Escrow, Order, Payment
from app.models.shipment import Shipment, ShipmentDeliveryProof
from app.models.fulfillment import ShipmentConfirmedProof
from app.services.transaction_clock import database_now
from app.services.order_pricing import as_utc
from app.models.user import User, UserRole, UserStatus
from app.services import inspection_storage
from app.services.certificate_urls import public_certificate_base_url
from app.services.certificate_page import render_certificate_page
from app.schemas.finish import ConfirmDeliveryRequest
from app.services import finish_core
from app.services.finish_policy import receipt_deadline, proof_read_allowed
from app.services.fulfillment_guard import require_fulfillment_simulation


router = APIRouter(tags=["Inspections"])
logger = logging.getLogger(__name__)
RESULTS = {"PASS", "MINOR_ISSUE", "NOT_AS_DESCRIBED", "FAKE"}
POSITIVE = {"PASS", "MINOR_ISSUE"}


class ShipRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    carrier: str
    tracking_number: str


class ReceiveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str | None = None


class ResultRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    result: str
    summary: str
    evidence_ids: list[int]


class CourierAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    courier_id: int


class BuyerDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["CONFIRM", "REJECT"]
    reason: str | None = None


def decision_validation_error(fields: dict[str, str]) -> HTTPException:
    return api_error(422, "validation_error", "Invalid buyer decision", fields=fields)


async def parse_buyer_decision(request: Request) -> BuyerDecisionRequest:
    """Use the Order API's field-error envelope for malformed decision JSON."""
    try:
        raw = await request.json()
        body = BuyerDecisionRequest.model_validate(raw)
    except (ValueError, ValidationError) as exc:
        if isinstance(exc, ValidationError):
            fields = {str(error["loc"][0]) if error["loc"] else "body": error["msg"] for error in exc.errors()}
        else:
            fields = {"body": "Invalid JSON body"}
        raise decision_validation_error(fields) from exc
    reason = body.reason.strip() if body.reason is not None else None
    if reason is not None and any(char == "\x00" or 0xD800 <= ord(char) <= 0xDFFF for char in reason):
        raise decision_validation_error({"reason": "Reason contains unsupported characters"})
    if body.decision == "CONFIRM" and reason is not None:
        raise decision_validation_error({"reason": "CONFIRM does not accept a reason"})
    if body.decision == "REJECT" and reason is not None and len(reason) > 500:
        raise decision_validation_error({"reason": "At most 500 characters after trimming"})
    body.reason = reason or None
    return body


def now() -> datetime:
    return datetime.now(timezone.utc)


def inspector_only(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.INSPECTOR:
        raise api_error(403, "inspector_role_required", "Inspector account required")
    if user.status != UserStatus.ACTIVE:
        raise api_error(403, "account_inactive", "Account inactive")
    return user


def courier_only(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.COURIER or user.status != UserStatus.ACTIVE:
        raise api_error(403, "courier_role_required", "Active Courier account required")
    return user


def _fresh_actor(db: Session, actor: User, role: UserRole | frozenset[UserRole], error_code: str) -> User:
    """Refresh the authenticated row after locking the Order, before a write.

    The auth dependency has already loaded this User into SQLAlchemy's identity
    map. A plain SELECT FOR UPDATE can therefore return the stale Python object
    when another transaction suspends the account between auth and the write.
    """
    fresh = db.scalar(select(User).where(User.id == actor.id).with_for_update().execution_options(populate_existing=True))
    allowed_roles = {role} if isinstance(role, UserRole) else role
    if fresh is None or fresh.status != UserStatus.ACTIVE or fresh.role not in allowed_roles:
        raise api_error(403, error_code, "Account is no longer authorized for this action")
    return fresh


def _order(db: Session, order_id: int) -> Order:
    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update().execution_options(populate_existing=True))
    if order is None:
        raise api_error(404, "order_not_found", "Order not found")
    return order


def _work(db: Session, inspection_id: int, inspector: User) -> tuple[Order, Inspection]:
    order_id = db.scalar(select(Inspection.order_id).where(Inspection.id == inspection_id))
    if order_id is None:
        raise api_error(404, "inspection_not_found", "Inspection not found")
    order = _order(db, order_id)
    _fresh_actor(db, inspector, UserRole.INSPECTOR, "inspector_role_required")
    work = db.get(Inspection, inspection_id)
    if work is None or (work.inspector_id is not None and work.inspector_id != inspector.id):
        raise api_error(404, "inspection_not_found", "Inspection not found")
    return order, work


def _replay(db: Session, order_id: int, actor_id: int, operation: str, key: str, fingerprint: str, response: Response):
    row = db.scalar(select(InspectionIdempotency).where(
        InspectionIdempotency.order_id == order_id,
        InspectionIdempotency.actor_id == actor_id,
        InspectionIdempotency.operation == operation,
        InspectionIdempotency.idempotency_key == key,
    ))
    if row is None:
        return None
    if row.request_hash != fingerprint:
        raise key_reused()
    response.headers["Idempotent-Replayed"] = "true"
    return row.response_body


def _commit(db: Session, order_id: int, actor_id: int, operation: str, key: str, fingerprint: str, body: dict, status_code: int = 200) -> dict:
    encoded = jsonable_encoder(body)
    db.add(InspectionIdempotency(
        order_id=order_id, actor_id=actor_id, operation=operation,
        idempotency_key=key, request_hash=fingerprint,
        response_status=status_code, response_body=encoded,
    ))
    db.commit()
    return encoded


def _shipment(db: Session, order_id: int) -> Shipment | None:
    return db.scalar(select(Shipment).where(Shipment.order_id == order_id, Shipment.leg == "TO_CENTER"))


def _inspection(db: Session, order_id: int) -> Inspection | None:
    return db.scalar(select(Inspection).where(Inspection.order_id == order_id))


def _shipment_view(row: Shipment | None):
    if row is None:
        return None
    return {"carrier": row.carrier, "tracking_number": row.tracking_number, "shipped_at": row.shipped_at,
            "courier_delivered_at": row.courier_delivered_at, "received_at": row.received_at}


def _courier_shipment(db: Session, shipment_id: int, actor: User) -> tuple[Order, Shipment]:
    order_id = db.scalar(select(Shipment.order_id).where(Shipment.id == shipment_id))
    if order_id is None:
        raise api_error(404, "shipment_not_found", "Shipment not found")
    order = _order(db, order_id)
    shipment = db.scalar(select(Shipment).where(Shipment.id == shipment_id).with_for_update().execution_options(populate_existing=True))
    fresh_actor = db.scalar(select(User).where(User.id == actor.id).with_for_update().execution_options(populate_existing=True))
    if fresh_actor is None or fresh_actor.role != UserRole.COURIER or fresh_actor.status != UserStatus.ACTIVE:
        raise api_error(403, "courier_role_required", "Active Courier account required")
    if order.fulfillment_policy != "LEGACY_V1":
        raise api_error(409, "legacy_courier_only", "External shipping uses recipient confirmation")
    if shipment is None or shipment.courier_id != actor.id:
        raise api_error(404, "shipment_not_found", "Shipment not found")
    return order, shipment


def _proofs(db: Session, shipment_id: int) -> list[ShipmentDeliveryProof]:
    return list(db.scalars(select(ShipmentDeliveryProof).where(ShipmentDeliveryProof.shipment_id == shipment_id).order_by(ShipmentDeliveryProof.sort_order)))


def _proof_view(row: ShipmentDeliveryProof) -> dict:
    return {"id": row.id, "sort_order": row.sort_order, "mime_type": row.mime_type,
            "size_bytes": row.size_bytes, "url": f"/shipment-delivery-proofs/{row.id}"}


def _delivery_pending(order: Order, shipment: Shipment) -> bool:
    expected = {"TO_CENTER": "SHIPPING_TO_CENTER", "TO_BUYER": "SHIPPING_TO_BUYER",
                "TO_SELLER": "RESULT_NOTIFIED"}
    return (order.status == expected.get(shipment.leg) and shipment.status == "IN_TRANSIT"
            and shipment.courier_delivered_at is None)


def _courier_view(db, row, proofs=None):
    return {"id": row.id, "order_id": row.order_id, "leg": row.leg, "status": row.status,
            "carrier": row.carrier, "tracking_number": row.tracking_number,
            "destination_address": row.destination_address if row.courier_delivered_at is None else None,
            "courier_delivered_at": row.courier_delivered_at,
            "proofs": proofs if proofs is not None else [_proof_view(p) for p in _proofs(db, row.id)],
            "can_upload_proof": row.courier_delivered_at is None,
            "can_confirm_delivery": row.courier_delivered_at is None}


def _progress(db: Session, order: Order) -> dict:
    work = _inspection(db, order.id)
    return {
        "order_id": order.id, "order_status": order.status,
        "shipment": _shipment_view(_shipment(db, order.id)),
        "inspection": None if work is None else {"status": order.status, "started_at": work.started_at, "inspected_at": work.inspected_at},
    }


def _certificate(db: Session, order_id: int) -> Certificate | None:
    return db.scalar(select(Certificate).where(Certificate.order_id == order_id))


def _public_url(token: str) -> str:
    try:
        origin = public_certificate_base_url()
    except ValueError as exc:
        raise api_error(503, "certificate_unavailable", "Certificate service is unavailable") from exc
    return f"{origin}/certificates/{token}"


def _certificate_view(row: Certificate | None):
    return None if row is None else {
        "certificate_no": row.certificate_no,
        "status": row.status,
        "issued_at": row.issued_at,
        "public_url": _public_url(row.public_token),
    }


def issue_certificate(db: Session, order: Order, work: Inspection, result: str) -> Certificate:
    """Called before the result transaction commits; failures roll everything back."""
    if result not in POSITIVE:
        raise ValueError("Only qualifying results receive certificates")
    token = secrets.token_urlsafe(32)
    _public_url(token)  # Validate configuration before creating any row.
    # Persist the final result first so the certificate snapshot FK can match it.
    # This flush remains inside the same transaction; failure rolls both back.
    db.flush()
    row = Certificate(
        order_id=order.id, inspection_id=work.id, result=result,
        certificate_no=f"CERT-{uuid4().hex[:24].upper()}", public_token=token,
    )
    db.add(row)
    db.flush()
    return row


def _detail(db: Session, order: Order, work: Inspection) -> dict:
    photos = db.scalars(select(InspectionEvidence).where(InspectionEvidence.inspection_id == work.id).order_by(InspectionEvidence.id)).all()
    cert = _certificate(db, order.id)
    decision = db.scalar(select(BuyerInspectionDecision).where(BuyerInspectionDecision.order_id == order.id))
    outbound = db.scalar(select(Shipment).where(Shipment.order_id == order.id, Shipment.leg != "TO_CENTER"))
    next_action = None
    if work.result is not None and outbound is None:
        next_action = ("RETURN_TO_SELLER" if order.result_timed_out_at is not None else "WAIT_BUYER_DECISION" if decision is None else
                       "SHIP_TO_BUYER" if decision.decision == "CONFIRM" else "RETURN_TO_SELLER") if work.result in POSITIVE else "RETURN_TO_SELLER"
    return {
        "id": work.id, "order_id": order.id, "order_status": order.status,
        "product": {"id": order.product_id, "name": order.product_name, "condition": order.product_condition, "size": order.product_size},
        "shipment": _shipment_view(_shipment(db, order.id)),
        "inspector_id": work.inspector_id, "started_at": work.started_at,
        "result": work.result, "summary": work.summary, "inspected_at": work.inspected_at,
        "inspection_overdue_escalated_at": order.inspection_overdue_escalated_at,
        "fulfillment_policy": order.fulfillment_policy,
        "result_available_at": order.result_available_at,
        "result_decision_deadline_at": order.result_decision_deadline_at,
        "result_timed_out_at": order.result_timed_out_at,
        "evidence": [{"id": item.id, "mime_type": item.mime_type, "size_bytes": item.size_bytes, "url": f"/inspection-evidence/{item.id}", "expires_at": None} for item in photos],
        "certificate": _certificate_view(cert),
        "next_action": next_action,
        "buyer_decision": None if decision is None else {"decision":decision.decision,"decided_at":decision.decided_at},
        "fulfillment": None if outbound is None else {"id":outbound.id,"leg":outbound.leg,"status":outbound.status},
        "can_create_fulfillment": (order.status == "RESULT_NOTIFIED" and work.inspector_id is not None
            and next_action in {"SHIP_TO_BUYER", "RETURN_TO_SELLER"}
            and (next_action != "RETURN_TO_SELLER" or order.return_address is not None)),
    }


@router.post("/orders/{order_id}/ship-to-center")
def ship_to_center(order_id: int, body: ShipRequest, response: Response, actor: User = Depends(get_current_user), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    order, role = load_order_for(db, order_id, actor, lock=True)
    _fresh_actor(db, actor, UserRole.SELLER, "seller_role_required")
    if role.value != "seller" or actor.role != UserRole.SELLER:
        raise api_error(403, "seller_role_required", "Order seller required")
    if actor.status != UserStatus.ACTIVE:
        raise api_error(403, "account_inactive", "Account inactive")
    carrier, tracking = body.carrier.strip(), body.tracking_number.strip()
    errors = {}
    if not 1 <= len(carrier) <= 100:
        errors["carrier"] = "1–100 characters required"
    if not 1 <= len(tracking) <= 100:
        errors["tracking_number"] = "1–100 characters required"
    if errors:
        raise validation_error(errors)
    fingerprint = request_fingerprint({"carrier": carrier, "tracking_number": tracking})
    replay = _replay(db, order.id, actor.id, "ship", key, fingerprint, response)
    if replay is not None:
        return replay
    if order.status != "WAITING_SELLER_SHIP":
        raise api_error(409, "invalid_state", "Order cannot be shipped now")
    if db.scalar(select(Payment.id).where(Payment.order_id == order.id)) is None or db.scalar(select(Escrow.id).where(Escrow.order_id == order.id, Escrow.status == "HELD")) is None:
        raise api_error(409, "invalid_state", "Paid Order with held escrow required")
    shipment = db.scalar(select(Shipment).where(Shipment.order_id == order.id).with_for_update())
    if shipment is not None:
        raise api_error(409, "invalid_state", "Shipment already exists")
    db.scalar(select(Escrow).where(Escrow.order_id == order.id).with_for_update())
    instant = database_now(db)
    if order.paid_at is None or instant >= as_utc(order.paid_at) + timedelta(hours=72):
        raise api_error(409, "seller_shipping_deadline_passed", "Seller shipping deadline has passed")
    if order.return_address is None:
        raise api_error(409, "fulfillment_destination_missing", "Seller must save a return address before shipping")
    db.add_all([
        Shipment(order_id=order.id, fulfillment_policy=order.fulfillment_policy, leg="TO_CENTER", status="IN_TRANSIT", carrier=carrier, tracking_number=tracking, shipped_at=instant),
        Inspection(order_id=order.id),
    ])
    order.status = "SHIPPING_TO_CENTER"
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if getattr(getattr(exc.orig, "diag", None), "constraint_name", None) == "ck_shipments_seller_deadline":
            raise api_error(409, "seller_shipping_deadline_passed", "Seller shipping deadline has passed") from exc
        raise
    return _commit(db, order.id, actor.id, "ship", key, fingerprint, _progress(db, order))


@router.get("/orders/{order_id}/inspection-progress")
def inspection_progress(order_id: int, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order, _ = load_order_for(db, order_id, actor)
    return _progress(db, order)


@router.get("/admin/couriers")
def active_couriers(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                    _admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Minimal staff picker: no private contact fields or inactive accounts."""
    condition = (User.role == UserRole.COURIER, User.status == UserStatus.ACTIVE)
    total = db.scalar(select(func.count()).select_from(User).where(*condition)) or 0
    rows = db.scalars(select(User).where(*condition).order_by(User.full_name, User.id).limit(limit).offset(offset)).all()
    return {"items": [{"id": user.id, "name": user.full_name} for user in rows],
            "total": total, "limit": limit, "offset": offset}


@router.post("/admin/shipments/{shipment_id}/assign-courier")
def assign_courier(shipment_id: int, body: CourierAssignment, response: Response,
                   actor: User = Depends(require_admin), key: str = Depends(require_idempotency_key),
                   db: Session = Depends(get_db)):
    order_id = db.scalar(select(Shipment.order_id).where(Shipment.id == shipment_id))
    if order_id is None:
        raise api_error(404, "shipment_not_found", "Shipment not found")
    order = _order(db, order_id)
    shipment = db.scalar(select(Shipment).where(Shipment.id == shipment_id).with_for_update().execution_options(populate_existing=True))
    return _assign_courier(db, order, shipment, body, response, actor, key)


@router.post("/admin/orders/{order_id}/assign-courier")
def assign_courier_for_order(order_id: int, body: CourierAssignment, response: Response,
                             actor: User = Depends(require_admin), key: str = Depends(require_idempotency_key),
                             db: Session = Depends(get_db)):
    """Admin can find order_id via GET /admin/orders?status=SHIPPING_TO_CENTER."""
    order = _order(db, order_id)
    shipment = db.scalar(select(Shipment).where(Shipment.order_id == order.id, Shipment.leg == "TO_CENTER")
                         .with_for_update().execution_options(populate_existing=True))
    if shipment is None:
        raise api_error(404, "shipment_not_found", "Shipment not found")
    return _assign_courier(db, order, shipment, body, response, actor, key)


def _assign_courier(db: Session, order: Order, shipment: Shipment, body: CourierAssignment,
                    response: Response, actor: User, key: str):
    _fresh_actor(db, actor, UserRole.ADMIN, "admin_role_required")
    operation = "assign_courier" if shipment.leg == "TO_CENTER" else f"assign_courier:{shipment.id}"
    fingerprint = request_fingerprint({"courier_id": body.courier_id})
    replay = _replay(db, order.id, actor.id, operation, key, fingerprint, response)
    if replay is not None:
        return replay
    if order.fulfillment_policy == "EXTERNAL_V2":
        raise api_error(409, "legacy_courier_only", "External shipments use recipient confirmations and trusted shipping events")
    if not _delivery_pending(order, shipment) or _proofs(db, shipment.id):
        raise api_error(409, "assignment_locked", "Courier assignment can no longer change")
    courier = db.scalar(select(User).where(User.id == body.courier_id).with_for_update().execution_options(populate_existing=True))
    if courier is None or courier.role != UserRole.COURIER or courier.status != UserStatus.ACTIVE:
        raise api_error(422, "invalid_courier", "An active Courier is required")
    previous_id = shipment.courier_id
    shipment.courier_id = courier.id
    db.flush()
    # Persist the assignment event with actor, previous/new assignee and time
    # in the idempotency ledger, so reassignments remain traceable.
    return _commit(db, order.id, actor.id, operation, key, fingerprint,
                   {"shipment_id": shipment.id, "previous_courier_id": previous_id,
                    "courier_id": courier.id, "assigned_by": actor.id})


@router.get("/courier/shipments")
def courier_queue(actor: User = Depends(courier_only), db: Session = Depends(get_db),
                  scope: Literal["pending", "history", "all"] = Query("pending", description="pending: งานที่ยังไม่ยืนยันส่ง, history: ส่งแล้ว, all: ทั้งหมด"),
                  offset: int = Query(0, ge=0, description="จำนวนรายการที่ข้ามเพื่อเปิดหน้าถัดไป"),
                  limit: int = Query(100, ge=1, le=100, description="จำนวนรายการต่อหน้า สูงสุด 100")):
    query = select(Shipment).where(Shipment.courier_id == actor.id)
    if scope == "pending":
        query = query.where(Shipment.status == "IN_TRANSIT", Shipment.courier_delivered_at.is_(None))
    elif scope == "history":
        query = query.where(Shipment.courier_delivered_at.is_not(None))
    rows = db.scalars(query.order_by(Shipment.id.desc()).offset(offset).limit(limit + 1)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    proofs = {row.id: [] for row in rows}
    if rows:
        for proof in db.scalars(select(ShipmentDeliveryProof).where(
                ShipmentDeliveryProof.shipment_id.in_(proofs)).order_by(ShipmentDeliveryProof.sort_order)):
            proofs[proof.shipment_id].append(_proof_view(proof))
    return {"items": [_courier_view(db, row, proofs[row.id]) for row in rows],
            "scope": scope, "offset": offset, "limit": limit,
            "has_more": has_more, "next_offset": offset + limit if has_more else None}


@router.get("/courier/shipments/{shipment_id}")
def courier_detail(shipment_id: int, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if actor.role == UserRole.COURIER:
        _, shipment = _courier_shipment(db, shipment_id, actor)
    else:
        shipment = db.get(Shipment, shipment_id)
        if shipment is None:
            raise api_error(404, "shipment_not_found", "Shipment not found")
        work = _inspection(db, shipment.order_id)
        _fresh_actor(db, actor, UserRole.INSPECTOR, "inspector_role_required")
        if work is None or work.inspector_id != actor.id:
            raise api_error(404, "shipment_not_found", "Shipment not found")
    return _courier_view(db, shipment)


@router.post("/courier/shipments/{shipment_id}/proofs", status_code=201)
def upload_delivery_proof(shipment_id: int, response: Response, file: UploadFile = File(...),
                          actor: User = Depends(courier_only), key: str = Depends(require_idempotency_key),
                          db: Session = Depends(get_db)):
    try:
        if (file.content_type or "").lower() not in {"image/jpeg", "image/png"}:
            raise api_error(415, "unsupported_media_type", "JPEG or PNG required")
        content, mime, extension, digest = inspection_storage.validate_image(file)
        order, shipment = _courier_shipment(db, shipment_id, actor)
        fingerprint = request_fingerprint({"sha256": digest, "mime_type": mime})
        operation = "courier_proof" if shipment.leg == "TO_CENTER" else f"courier_proof:{shipment.id}"
        replay = _replay(db, order.id, actor.id, operation, key, fingerprint, response)
        if replay is not None:
            response.status_code = 201
            return replay
        if not _delivery_pending(order, shipment):
            raise api_error(409, "delivery_locked", "Delivery proof can no longer change")
        proof_rows = _proofs(db, shipment.id)
        if len(proof_rows) >= 3:
            raise api_error(409, "proof_limit", "At most three delivery photos")
        path = f"courier/{shipment.id}/{uuid4().hex}{extension}"
        storage_attempted = False
        commit_attempted = False
        try:
            storage_attempted = True
            inspection_storage.upload_object(path, content, mime)
            _fresh_actor(db, actor, UserRole.COURIER, "courier_role_required")
            db.refresh(shipment)
            if shipment.courier_id != actor.id or not _delivery_pending(order, shipment):
                raise api_error(409, "delivery_locked", "Delivery changed during upload")
            proof = ShipmentDeliveryProof(shipment_id=shipment.id, sort_order=len(proof_rows),
                                          object_key=path, mime_type=mime, size_bytes=len(content),
                                          sha256=digest, uploaded_by=actor.id, uploaded_at=now())
            db.add(proof)
            db.flush()
            result = jsonable_encoder({"proof": _proof_view(proof)})
            db.add(InspectionIdempotency(order_id=order.id, actor_id=actor.id, operation=operation,
                                         idempotency_key=key, request_hash=fingerprint,
                                         response_status=201, response_body=result))
            db.flush()
            commit_attempted = True
            db.commit()
            return result
        except Exception:
            db.rollback()
            if storage_attempted and not commit_attempted:
                inspection_storage.cleanup_object(path)
            elif commit_attempted:
                logger.exception("Courier proof commit outcome uncertain: shipment_id=%s object_key=%s", shipment_id, path)
            raise
    finally:
        file.file.close()


@router.post("/courier/shipments/{shipment_id}/confirm-delivery")
def confirm_courier_delivery(shipment_id: int, response: Response, body: object = Body(None),
                             actor: User = Depends(courier_only), key: str = Depends(require_idempotency_key),
                             db: Session = Depends(get_db)):
    order, shipment = _courier_shipment(db, shipment_id, actor)
    # Committed A bodyless commands remain readable without rewriting hashes.
    legacy = db.scalar(select(InspectionIdempotency).where(
        InspectionIdempotency.order_id == order.id, InspectionIdempotency.actor_id == actor.id,
        InspectionIdempotency.operation == "courier_confirm", InspectionIdempotency.idempotency_key == key)) if shipment.leg == "TO_CENTER" else None
    if legacy is not None:
        if body not in (None, {}):
            parsed = _parse_proof_selection(body)
            bound = [p.id for p in finish_core.selected_proofs(db, shipment)]
            if parsed.proof_ids != sorted(bound):
                raise key_reused()
        response.headers["Idempotent-Replayed"] = "true"
        return legacy.response_body
    parsed = _parse_proof_selection(body)
    payload = {"shipment_id": shipment.id, "proof_ids": parsed.proof_ids}
    old = finish_core.replay(db, order.id, f"USER:{actor.id}", "CONFIRM_DELIVERY", key, payload)
    if old is not None:
        response.headers["Idempotent-Replayed"] = "true"
        return old.result
    require_fulfillment_simulation()
    if not _delivery_pending(order, shipment):
        raise api_error(409, "delivery_already_confirmed", "Delivery cannot be confirmed now")
    proofs = _proofs(db, shipment.id)
    finish_core.verify_proofs(db, shipment, proofs, parsed.proof_ids)
    _fresh_actor(db, actor, UserRole.COURIER, "courier_role_required")
    if not _delivery_pending(order, shipment) or shipment.courier_id != actor.id:
        raise api_error(409, "delivery_locked", "Delivery changed during verification")
    shipment.courier_delivered_at = database_now(db)
    previous = order.status
    if shipment.leg != "TO_CENTER":
        shipment.status = "DELIVERED"
        if shipment.leg == "TO_BUYER":
            order.status = "DELIVERED_PENDING_BUYER"
            order.receipt_deadline_at = receipt_deadline(shipment.courier_delivered_at)
        else:
            order.status = "RETURNED_TO_SELLER"
    db.flush()
    db.add_all([ShipmentConfirmedProof(proof_id=proof.id, shipment_id=shipment.id,
                courier_id=shipment.courier_id, confirmed_at=shipment.courier_delivered_at) for proof in proofs if proof.id in parsed.proof_ids])
    db.flush()
    result = {"shipment_id": shipment.id, "courier_delivered_at": shipment.courier_delivered_at,
              "proofs": [_proof_view(item) for item in proofs if item.id in parsed.proof_ids],
              "order_status": order.status, "receipt_deadline_at": order.receipt_deadline_at,
              "settlement_status": "HELD"}
    cmd = finish_core.command(db, order.id, f"USER:{actor.id}", actor.id, "CONFIRM_DELIVERY",
        key, payload, result, shipment.courier_delivered_at)
    finish_core.history(db, order, cmd, previous, "DELIVERY_CONFIRMED", "COURIER", shipment.courier_delivered_at)
    is_return, order_id = shipment.leg == "TO_SELLER", order.id
    stable = cmd.result
    db.commit()  # Physical return survives every subsequent refund failure.
    if is_return:
        from app.services.order_settlement import attempt_return_refund
        attempt_return_refund(db.get_bind(), order_id)
    return stable


def _parse_proof_selection(body):
    try:
        return ConfirmDeliveryRequest.model_validate(body)
    except ValidationError as exc:
        raise validation_error({"proof_ids": "One to three distinct positive integer proof IDs required; no extra fields"}) from exc


@router.get("/shipment-delivery-proofs/{proof_id}")
def read_delivery_proof(proof_id: int, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    proof = db.get(ShipmentDeliveryProof, proof_id)
    if proof is None:
        raise api_error(404, "proof_not_found", "Delivery photo not found")
    shipment = db.get(Shipment, proof.shipment_id)
    order = db.get(Order, shipment.order_id)
    work = _inspection(db, order.id)
    allowed = proof_read_allowed(role=actor.role.value, active=actor.status == UserStatus.ACTIVE,
        leg=shipment.leg, owns_as_buyer=order.buyer_id == actor.id,
        owns_as_seller=order.seller_id == actor.id, assigned_courier=shipment.courier_id == actor.id,
        assigned_inspector=work is not None and work.inspector_id == actor.id)
    if not allowed:
        raise api_error(404, "proof_not_found", "Delivery photo not found")
    return Response(content=inspection_storage.download_object(proof.object_key), media_type=proof.mime_type,
                    headers={"Cache-Control": "no-store"})


@router.get("/inspections")
def inspection_queue(status: str | None = None, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), actor: User = Depends(inspector_only), db: Session = Depends(get_db)):
    query = select(Inspection, Order).join(Order, Inspection.order_id == Order.id).where(
        (Inspection.inspector_id.is_(None) & Order.status.in_(["SHIPPING_TO_CENTER", "RECEIVED_AT_CENTER"])) |
        (Inspection.inspector_id == actor.id)
    )
    if status is not None:
        if status not in {"SHIPPING_TO_CENTER", "RECEIVED_AT_CENTER", "INSPECTING", "RESULT_NOTIFIED"}:
            raise validation_error({"status": "Unknown inspection status"})
        query = query.where(Order.status == status)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(query.order_by(Inspection.created_at, Inspection.id).offset(offset).limit(limit)).all()
    return {"items": [_detail(db, order, work) for work, order in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/inspections/{inspection_id}")
def inspection_detail(inspection_id: int, actor: User = Depends(inspector_only), db: Session = Depends(get_db)):
    order, work = _work(db, inspection_id, actor)
    return _detail(db, order, work)


@router.post("/inspections/{inspection_id}/receive")
def receive_inspection(inspection_id: int, body: ReceiveRequest, response: Response, actor: User = Depends(inspector_only), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    order, work = _work(db, inspection_id, actor)
    note = body.note.strip() if body.note is not None else None
    if note is not None and len(note) > 1000:
        raise validation_error({"note": "At most 1000 characters"})
    fingerprint = request_fingerprint({"note": note})
    replay = _replay(db, order.id, actor.id, "receive", key, fingerprint, response)
    if replay is not None:
        return replay
    if order.status != "SHIPPING_TO_CENTER":
        raise api_error(409, "invalid_state", "Order must be shipping to center")
    shipment = _shipment(db, order.id)
    if shipment is None or shipment.status != "IN_TRANSIT":
        raise api_error(409, "invalid_state", "Inbound shipment unavailable")
    if order.fulfillment_policy == "LEGACY_V1" and (shipment.courier_delivered_at is None or not 1 <= len(_proofs(db, shipment.id)) <= 3):
        raise api_error(409, "courier_delivery_required", "Courier delivery and photos required before receipt")
    instant = database_now(db)
    if order.fulfillment_policy == "EXTERNAL_V2":
        from app.services import finish_core as core
        require_fulfillment_simulation()
        cmd = core.command(db, order.id, f"USER:{actor.id}", actor.id, "CENTER_RECEIPT", key,
                           {"note": note}, {"order_id": order.id, "received_at": instant}, instant)
        shipment.recipient_source, shipment.recipient_command_id = "INSPECTOR", cmd.id
    shipment.status, shipment.received_by, shipment.received_at, shipment.received_note = "DELIVERED", actor.id, instant, note
    order.status = "RECEIVED_AT_CENTER"
    db.flush()
    return _commit(db, order.id, actor.id, "receive", key, fingerprint, _detail(db, order, work))


@router.post("/inspections/{inspection_id}/start")
def start_inspection(inspection_id: int, response: Response, actor: User = Depends(inspector_only), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    order, work = _work(db, inspection_id, actor)
    fingerprint = request_fingerprint({})
    replay = _replay(db, order.id, actor.id, "start", key, fingerprint, response)
    if replay is not None:
        return replay
    if order.status != "RECEIVED_AT_CENTER" or work.inspector_id is not None:
        raise api_error(409, "invalid_state", "Receive item before starting inspection")
    work.inspector_id, work.started_at = actor.id, now()
    order.status = "INSPECTING"
    db.flush()
    return _commit(db, order.id, actor.id, "start", key, fingerprint, _detail(db, order, work))


@router.post("/inspections/{inspection_id}/evidence", status_code=201)
def upload_evidence(inspection_id: int, response: Response, file: UploadFile = File(...), actor: User = Depends(inspector_only), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    content, mime, extension, digest = inspection_storage.validate_image(file)
    try:
        order, work = _work(db, inspection_id, actor)
        if work.inspector_id != actor.id:
            raise api_error(403, "not_assigned_inspector", "Start this inspection first")
        fingerprint = request_fingerprint({"sha256": digest, "mime_type": mime})
        replay = _replay(db, order.id, actor.id, "evidence", key, fingerprint, response)
        if replay is not None:
            response.status_code = 201
            return replay
        if order.status != "INSPECTING" or work.result is not None:
            raise api_error(409, "result_locked", "Inspection is closed")
        if db.scalar(select(func.count()).select_from(InspectionEvidence).where(InspectionEvidence.inspection_id == work.id)) >= 5:
            raise api_error(409, "evidence_limit", "At most five images")
        path = f"inspections/{work.id}/{uuid4().hex}{extension}"
        storage_attempted = False
        commit_attempted = False
        try:
            storage_attempted = True
            inspection_storage.upload_object(path, content, mime)
            image = InspectionEvidence(inspection_id=work.id, object_key=path, mime_type=mime, size_bytes=len(content), sha256=digest, uploaded_by=actor.id, uploaded_at=now())
            db.add(image)
            db.flush()
            result = {"evidence": {"id": image.id, "mime_type": mime, "size_bytes": len(content)}}
            encoded = jsonable_encoder(result)
            db.add(InspectionIdempotency(
                order_id=order.id, actor_id=actor.id, operation="evidence", idempotency_key=key,
                request_hash=fingerprint, response_status=201, response_body=encoded,
            ))
            db.flush()
            commit_attempted = True
            db.commit()
            return encoded
        except Exception:
            db.rollback()
            if storage_attempted and not commit_attempted:
                inspection_storage.cleanup_object(path)
            elif commit_attempted:
                # A lost commit acknowledgement may mean the row exists. Keep
                # the private object until reconciliation can prove otherwise.
                logger.exception("INSPECT upload commit outcome uncertain for inspection_id=%s evidence_key=%s", work.id, path)
            raise
    finally:
        file.file.close()


@router.post("/inspections/{inspection_id}/result")
def submit_result(inspection_id: int, body: ResultRequest, response: Response, actor: User = Depends(inspector_only), key: str = Depends(require_idempotency_key), db: Session = Depends(get_db)):
    order, work = _work(db, inspection_id, actor)
    if work.inspector_id != actor.id:
        raise api_error(403, "not_assigned_inspector", "Not assigned to this inspection")
    summary = body.summary.strip()
    errors = {}
    if body.result not in RESULTS:
        errors["result"] = "Unknown inspection result"
    if not 10 <= len(summary) <= 2000:
        errors["summary"] = "10–2000 characters required"
    if not 1 <= len(body.evidence_ids) <= 5 or len(body.evidence_ids) != len(set(body.evidence_ids)) or any(i <= 0 for i in body.evidence_ids):
        errors["evidence_ids"] = "Select 1–5 distinct images"
    if errors:
        raise validation_error(errors)
    fingerprint = request_fingerprint({"result": body.result, "summary": summary, "evidence_ids": body.evidence_ids})
    replay = _replay(db, order.id, actor.id, "result", key, fingerprint, response)
    if replay is not None:
        return replay
    if order.status != "INSPECTING" or work.result is not None:
        raise api_error(409, "result_locked", "Final result already recorded or inspection not started")
    found = set(db.scalars(select(InspectionEvidence.id).where(InspectionEvidence.inspection_id == work.id, InspectionEvidence.id.in_(body.evidence_ids))).all())
    if found != set(body.evidence_ids):
        raise validation_error({"evidence_ids": "Images must belong to this inspection"})
    try:
        # Attach before finalizing: database triggers prohibit late evidence links.
        for evidence_id in body.evidence_ids:
            db.add(InspectionResultEvidence(inspection_id=work.id, evidence_id=evidence_id))
        db.flush()
        work.result, work.summary, work.inspected_at = body.result, summary, database_now(db)
        if order.fulfillment_policy == "EXTERNAL_V2" and body.result in POSITIVE:
            order.result_available_at = work.inspected_at
            order.result_decision_deadline_at = work.inspected_at + timedelta(hours=72)
        cert = issue_certificate(db, order, work, body.result) if body.result in POSITIVE else None
        order.status = "RESULT_NOTIFIED"
        db.flush()
        result = _detail(db, order, work)
        result["certificate"] = _certificate_view(cert)
        return _commit(db, order.id, actor.id, "result", key, fingerprint, result)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        if body.result in POSITIVE:
            raise api_error(503, "certificate_unavailable", "Certificate could not be issued; retry the same key") from exc
        raise


def _decision_view(row: BuyerInspectionDecision) -> dict:
    return {"decision": row.decision, "reason": row.reason, "decided_at": row.decided_at}


def _next_action(result: str, decision: BuyerInspectionDecision | None) -> str:
    if result not in POSITIVE or (decision is not None and decision.decision == "REJECT"):
        return "RETURN_TO_SELLER"
    if decision is not None:
        return "SHIP_TO_BUYER"
    return "WAIT_BUYER_DECISION"


@router.get("/orders/{order_id}/inspection")
def buyer_inspection(order_id: int, response: Response, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    order, role = load_order_for(db, order_id, actor, allow_inactive=True)
    if role.value != "buyer" or actor.role not in BUYER_ACCOUNT_ROLES:
        raise not_order_buyer()
    work = _inspection(db, order.id)
    if work is None or work.result is None:
        raise api_error(404, "inspection_not_ready", "Inspection result is not ready")
    selected = db.scalars(select(InspectionEvidence).join(InspectionResultEvidence, InspectionResultEvidence.evidence_id == InspectionEvidence.id).where(InspectionResultEvidence.inspection_id == work.id).order_by(InspectionEvidence.id)).all()
    if not 1 <= len(selected) <= 5:
        logger.error("Invalid selected evidence count for order %s inspection %s", order.id, work.id)
        raise api_error(409, "inspection_not_ready", "Inspection result is not ready")
    cert = _certificate(db, order.id)
    if (work.result in POSITIVE and (cert is None or cert.inspection_id != work.id or cert.result != work.result)) or (work.result not in POSITIVE and cert is not None):
        logger.error("Inconsistent certificate for order %s inspection %s", order.id, work.id)
        raise api_error(409, "inspection_not_ready", "Inspection result is not ready")
    decision = db.scalar(select(BuyerInspectionDecision).where(BuyerInspectionDecision.order_id == order.id))
    can_decide = (actor.status == UserStatus.ACTIVE and order.status == "RESULT_NOTIFIED"
                  and work.result in POSITIVE and cert is not None and cert.status == "ISSUED" and decision is None
                  and (order.fulfillment_policy != "EXTERNAL_V2" or (order.result_timed_out_at is None
                       and order.result_decision_deadline_at is not None and database_now(db) < order.result_decision_deadline_at)))
    return {
        "order_id": order.id, "order_status": order.status, "result": work.result,
        "summary": work.summary, "inspected_at": work.inspected_at,
        "evidence": [{"id": photo.id, "mime_type": photo.mime_type, "size_bytes": photo.size_bytes,
                      "url": f"/inspection-evidence/{photo.id}", "expires_at": None} for photo in selected],
        "certificate": _certificate_view(cert),
        "decision": None if decision is None else _decision_view(decision),
        "fulfillment_policy": order.fulfillment_policy,
        "result_available_at": order.result_available_at,
        "result_decision_deadline_at": order.result_decision_deadline_at,
        "result_timed_out_at": order.result_timed_out_at,
        "server_time": database_now(db),
        "can_decide": can_decide,
        "next_action": "RETURN_TO_SELLER" if order.result_timed_out_at is not None else _next_action(work.result, decision),
    }


@router.post(
    "/orders/{order_id}/inspection/decision",
    openapi_extra={"requestBody": {"required": True, "content": {"application/json": {
        "schema": BuyerDecisionRequest.model_json_schema(),
        "example": {"decision": "REJECT", "reason": "สภาพสินค้าไม่ตรงที่คาด"},
    }}}},
)
def decide_inspection(order_id: int, response: Response, actor: User = Depends(get_current_user),
                      body: BuyerDecisionRequest = Depends(parse_buyer_decision), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    try:
        order, role = load_order_for(db, order_id, actor, lock=True)
        if role.value != "buyer":
            raise not_order_buyer()
        _fresh_actor(db, actor, BUYER_ACCOUNT_ROLES, "account_inactive")
        existing = db.scalar(select(BuyerInspectionDecision).where(BuyerInspectionDecision.order_id == order.id))
        if existing is not None:
            if (existing.decision, existing.reason) != (body.decision, body.reason):
                raise api_error(409, "decision_already_recorded", "Buyer decision is already recorded")
            return {"decision": _decision_view(existing), "next_action": _next_action("PASS", existing)}

        work = _inspection(db, order.id)
        if work is None or work.result is None:
            raise api_error(409, "inspection_not_ready", "Inspection result is not ready")
        if work.result not in POSITIVE:
            raise api_error(409, "decision_not_allowed", "This result cannot be decided by the buyer")
        cert = _certificate(db, order.id)
        if cert is None or cert.inspection_id != work.id or cert.result != work.result:
            logger.error("Missing or inconsistent certificate for order %s inspection %s", order.id, work.id)
            raise api_error(409, "inspection_not_ready", "Inspection result is not ready")
        if order.status != "RESULT_NOTIFIED" or cert.status != "ISSUED":
            raise api_error(409, "decision_not_allowed", "Buyer decision is not available")
        instant = database_now(db)
        if order.fulfillment_policy == "EXTERNAL_V2" and (order.result_decision_deadline_at is None
                or order.result_timed_out_at is not None or instant >= order.result_decision_deadline_at):
            raise api_error(409, "result_decision_deadline_passed", "Result decision deadline passed")
        recorded = BuyerInspectionDecision(decided_at=instant, order_id=order.id, inspection_id=work.id, buyer_id=actor.id,
                                           decision=body.decision, reason=body.reason)
        db.add(recorded)
        db.commit()
        db.refresh(recorded)
        return {"decision": _decision_view(recorded), "next_action": _next_action(work.result, recorded)}
    except IntegrityError as exc:
        db.rollback()
        existing = db.scalar(select(BuyerInspectionDecision).where(BuyerInspectionDecision.order_id == order_id))
        if existing is None:
            if getattr(getattr(exc.orig, "diag", None), "constraint_name", None) == "ck_result_decision_deadline":
                raise api_error(409, "result_decision_deadline_passed", "Result decision deadline passed") from exc
            raise
        if (existing.decision, existing.reason) != (body.decision, body.reason):
            raise api_error(409, "decision_already_recorded", "Buyer decision is already recorded") from exc
        return {"decision": _decision_view(existing), "next_action": _next_action("PASS", existing)}
    except Exception:
        db.rollback()
        raise


@router.get("/inspection-evidence/{evidence_id}")
def read_evidence(evidence_id: int, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    photo = db.get(InspectionEvidence, evidence_id)
    if photo is None:
        raise api_error(404, "evidence_not_found", "Image not found")
    work = db.get(Inspection, photo.inspection_id)
    order = db.get(Order, work.order_id)
    allowed_inspector = actor.role == UserRole.INSPECTOR and actor.status == UserStatus.ACTIVE and work.inspector_id == actor.id
    selected = db.get(InspectionResultEvidence, (work.id, photo.id)) is not None
    allowed_buyer = actor.role in BUYER_ACCOUNT_ROLES and actor.id == order.buyer_id and work.result is not None and selected
    if not (allowed_inspector or allowed_buyer):
        raise api_error(404, "evidence_not_found", "Image not found")
    return Response(content=inspection_storage.download_object(photo.object_key), media_type=photo.mime_type, headers={"Cache-Control": "no-store"})


@router.get("/certificates/{token}", response_class=HTMLResponse)
def public_certificate(token: str, db: Session = Depends(get_db)) -> HTMLResponse:
    cert = db.scalar(select(Certificate).where(Certificate.public_token == token))
    return render_certificate_page(cert)


@router.get("/certificates/{token}/json")
def public_certificate_json(token: str, db: Session = Depends(get_db)):
    """Limited machine-readable view; the QR URL continues to render HTML."""
    cert = db.scalar(select(Certificate).where(Certificate.public_token == token))
    if cert is None:
        raise api_error(404, "certificate_not_found", "Certificate not found")
    return JSONResponse(
        content=jsonable_encoder({
            "certificate_no": cert.certificate_no,
            "result": cert.result,
            "issued_at": cert.issued_at,
            "status": cert.status,
        }),
        media_type="application/json",
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex"},
    )
