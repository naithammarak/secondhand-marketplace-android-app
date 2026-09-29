"""INSPECT-02/03: authorized shipment, inspection and private result flow."""

import secrets
import logging
import hashlib
from datetime import datetime, timezone
from uuid import uuid4
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.admin_verifications import require_admin
from app.api.orders import api_error, key_reused, load_order_for, request_fingerprint, require_idempotency_key, validation_error
from app.database import get_db
from app.models.certificate import Certificate
from app.models.inspection import Inspection, InspectionEvidence, InspectionIdempotency, InspectionResultEvidence
from app.models.order import Escrow, Order, Payment
from app.models.shipment import Shipment, ShipmentDeliveryProof
from app.models.user import User, UserRole, UserStatus
from app.services import inspection_storage
from app.services.certificate_urls import public_certificate_base_url


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


def _fresh_actor(db: Session, actor: User, role: UserRole, error_code: str) -> User:
    """Refresh the authenticated row after locking the Order, before a write.

    The auth dependency has already loaded this User into SQLAlchemy's identity
    map. A plain SELECT FOR UPDATE can therefore return the stale Python object
    when another transaction suspends the account between auth and the write.
    """
    fresh = db.scalar(select(User).where(User.id == actor.id).with_for_update().execution_options(populate_existing=True))
    if fresh is None or fresh.status != UserStatus.ACTIVE or fresh.role != role:
        raise api_error(403, error_code, "Account is no longer authorized for this action")
    return fresh


def _order(db: Session, order_id: int) -> Order:
    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
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
    order_id = db.scalar(select(Shipment.order_id).where(Shipment.id == shipment_id, Shipment.leg == "TO_CENTER"))
    if order_id is None:
        raise api_error(404, "shipment_not_found", "Shipment not found")
    order = _order(db, order_id)
    shipment = db.scalar(select(Shipment).where(Shipment.id == shipment_id).with_for_update().execution_options(populate_existing=True))
    fresh_actor = db.scalar(select(User).where(User.id == actor.id).with_for_update().execution_options(populate_existing=True))
    if fresh_actor is None or fresh_actor.role != UserRole.COURIER or fresh_actor.status != UserStatus.ACTIVE:
        raise api_error(403, "courier_role_required", "Active Courier account required")
    if shipment is None or shipment.courier_id != actor.id:
        raise api_error(404, "shipment_not_found", "Shipment not found")
    return order, shipment


def _proofs(db: Session, shipment_id: int) -> list[ShipmentDeliveryProof]:
    return list(db.scalars(select(ShipmentDeliveryProof).where(ShipmentDeliveryProof.shipment_id == shipment_id).order_by(ShipmentDeliveryProof.sort_order)))


def _proof_view(row: ShipmentDeliveryProof) -> dict:
    return {"id": row.id, "sort_order": row.sort_order, "mime_type": row.mime_type,
            "size_bytes": row.size_bytes, "url": f"/shipment-delivery-proofs/{row.id}"}


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
    return {
        "id": work.id, "order_id": order.id, "order_status": order.status,
        "product": {"id": order.product_id, "name": order.product_name, "condition": order.product_condition, "size": order.product_size},
        "shipment": _shipment_view(_shipment(db, order.id)),
        "inspector_id": work.inspector_id, "started_at": work.started_at,
        "result": work.result, "summary": work.summary, "inspected_at": work.inspected_at,
        "evidence": [{"id": item.id, "mime_type": item.mime_type, "size_bytes": item.size_bytes, "url": f"/inspection-evidence/{item.id}", "expires_at": None} for item in photos],
        "certificate": _certificate_view(cert),
        "next_action": None if work.result is None else ("WAIT_BUYER_DECISION" if work.result in POSITIVE else "RETURN_TO_SELLER"),
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
    db.add_all([
        Shipment(order_id=order.id, leg="TO_CENTER", status="IN_TRANSIT", carrier=carrier, tracking_number=tracking, shipped_at=now()),
        Inspection(order_id=order.id),
    ])
    order.status = "SHIPPING_TO_CENTER"
    db.flush()
    return _commit(db, order.id, actor.id, "ship", key, fingerprint, _progress(db, order))


@router.get("/orders/{order_id}/inspection-progress")
def inspection_progress(order_id: int, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order, _ = load_order_for(db, order_id, actor)
    return _progress(db, order)


@router.post("/admin/shipments/{shipment_id}/assign-courier")
def assign_courier(shipment_id: int, body: CourierAssignment, response: Response,
                   actor: User = Depends(require_admin), key: str = Depends(require_idempotency_key),
                   db: Session = Depends(get_db)):
    order_id = db.scalar(select(Shipment.order_id).where(Shipment.id == shipment_id, Shipment.leg == "TO_CENTER"))
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
    fingerprint = request_fingerprint({"courier_id": body.courier_id})
    replay = _replay(db, order.id, actor.id, "assign_courier", key, fingerprint, response)
    if replay is not None:
        return replay
    if order.status != "SHIPPING_TO_CENTER" or shipment.status != "IN_TRANSIT" or shipment.courier_delivered_at is not None or _proofs(db, shipment.id):
        raise api_error(409, "assignment_locked", "Courier assignment can no longer change")
    courier = db.scalar(select(User).where(User.id == body.courier_id).with_for_update().execution_options(populate_existing=True))
    if courier is None or courier.role != UserRole.COURIER or courier.status != UserStatus.ACTIVE:
        raise api_error(422, "invalid_courier", "An active Courier is required")
    previous_id = shipment.courier_id
    shipment.courier_id = courier.id
    db.flush()
    # Persist the assignment event with actor, previous/new assignee and time
    # in the idempotency ledger, so reassignments remain traceable.
    return _commit(db, order.id, actor.id, "assign_courier", key, fingerprint,
                   {"shipment_id": shipment.id, "previous_courier_id": previous_id,
                    "courier_id": courier.id, "assigned_by": actor.id})


@router.get("/courier/shipments")
def courier_queue(actor: User = Depends(courier_only), db: Session = Depends(get_db),
                  scope: Literal["pending", "history", "all"] = Query("pending", description="pending: งานที่ยังไม่ยืนยันส่ง, history: ส่งแล้ว, all: ทั้งหมด"),
                  offset: int = Query(0, ge=0, description="จำนวนรายการที่ข้ามเพื่อเปิดหน้าถัดไป"),
                  limit: int = Query(100, ge=1, le=100, description="จำนวนรายการต่อหน้า สูงสุด 100")):
    query = select(Shipment).where(Shipment.courier_id == actor.id, Shipment.leg == "TO_CENTER")
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
    return {"items": [{"id": row.id, "order_id": row.order_id, "status": row.status,
                       "courier_delivered_at": row.courier_delivered_at,
                       "proofs": proofs[row.id]} for row in rows],
            "scope": scope, "offset": offset, "limit": limit,
            "has_more": has_more, "next_offset": offset + limit if has_more else None}


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
        replay = _replay(db, order.id, actor.id, "courier_proof", key, fingerprint, response)
        if replay is not None:
            response.status_code = 201
            return replay
        if order.status != "SHIPPING_TO_CENTER" or shipment.status != "IN_TRANSIT" or shipment.courier_delivered_at is not None:
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
            proof = ShipmentDeliveryProof(shipment_id=shipment.id, sort_order=len(proof_rows),
                                          object_key=path, mime_type=mime, size_bytes=len(content),
                                          sha256=digest, uploaded_by=actor.id, uploaded_at=now())
            db.add(proof)
            db.flush()
            result = jsonable_encoder({"proof": _proof_view(proof)})
            db.add(InspectionIdempotency(order_id=order.id, actor_id=actor.id, operation="courier_proof",
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
def confirm_courier_delivery(shipment_id: int, response: Response,
                             actor: User = Depends(courier_only), key: str = Depends(require_idempotency_key),
                             db: Session = Depends(get_db)):
    order, shipment = _courier_shipment(db, shipment_id, actor)
    fingerprint = request_fingerprint({})
    replay = _replay(db, order.id, actor.id, "courier_confirm", key, fingerprint, response)
    if replay is not None:
        return replay
    if order.status != "SHIPPING_TO_CENTER" or shipment.status != "IN_TRANSIT" or shipment.courier_delivered_at is not None:
        raise api_error(409, "delivery_locked", "Delivery cannot be confirmed now")
    proofs = _proofs(db, shipment.id)
    if not 1 <= len(proofs) <= 3:
        raise api_error(409, "proof_required", "One to three delivery photos required")
    for proof in proofs:
        content = inspection_storage.download_object(proof.object_key)
        if len(content) != proof.size_bytes or hashlib.sha256(content).hexdigest() != proof.sha256:
            raise api_error(503, "storage_unavailable", "Delivery photo could not be verified")
    shipment.courier_delivered_at = now()
    db.flush()
    return _commit(db, order.id, actor.id, "courier_confirm", key, fingerprint,
                   {"shipment_id": shipment.id, "courier_delivered_at": shipment.courier_delivered_at,
                    "proofs": [_proof_view(item) for item in proofs]})


@router.get("/shipment-delivery-proofs/{proof_id}")
def read_delivery_proof(proof_id: int, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    proof = db.get(ShipmentDeliveryProof, proof_id)
    if proof is None:
        raise api_error(404, "proof_not_found", "Delivery photo not found")
    shipment = db.get(Shipment, proof.shipment_id)
    order = db.get(Order, shipment.order_id)
    work = _inspection(db, order.id)
    allowed = actor.status == UserStatus.ACTIVE and (
        (actor.role == UserRole.COURIER and shipment.courier_id == actor.id) or
        (actor.role == UserRole.BUYER and order.buyer_id == actor.id) or
        (actor.role == UserRole.INSPECTOR and work is not None and
         (work.inspector_id is None or work.inspector_id == actor.id))
    )
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
    if shipment.courier_delivered_at is None or not 1 <= len(_proofs(db, shipment.id)) <= 3:
        raise api_error(409, "courier_delivery_required", "Courier delivery and photos required before receipt")
    shipment.status, shipment.received_by, shipment.received_at, shipment.received_note = "DELIVERED", actor.id, now(), note
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
        work.result, work.summary, work.inspected_at = body.result, summary, now()
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


@router.get("/orders/{order_id}/inspection")
def buyer_inspection(order_id: int, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order, role = load_order_for(db, order_id, actor)
    if role.value != "buyer":
        raise api_error(403, "buyer_role_required", "Only this Order's buyer can view the result")
    work = _inspection(db, order.id)
    if work is None or work.result is None or order.status != "RESULT_NOTIFIED":
        raise api_error(409, "invalid_state", "Result not available yet")
    selected = db.scalars(select(InspectionEvidence).join(InspectionResultEvidence, InspectionResultEvidence.evidence_id == InspectionEvidence.id).where(InspectionResultEvidence.inspection_id == work.id).order_by(InspectionEvidence.id)).all()
    cert = _certificate(db, order.id)
    return {"order_id": order.id, "order_status": order.status, "result": work.result, "summary": work.summary, "inspected_at": work.inspected_at, "next_action": "WAIT_BUYER_DECISION" if work.result in POSITIVE else "RETURN_TO_SELLER", "certificate": _certificate_view(cert), "evidence": [{"id": photo.id, "mime_type": photo.mime_type, "size_bytes": photo.size_bytes, "url": f"/inspection-evidence/{photo.id}"} for photo in selected]}


@router.get("/inspection-evidence/{evidence_id}")
def read_evidence(evidence_id: int, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    photo = db.get(InspectionEvidence, evidence_id)
    if photo is None:
        raise api_error(404, "evidence_not_found", "Image not found")
    work = db.get(Inspection, photo.inspection_id)
    order = db.get(Order, work.order_id)
    allowed_inspector = actor.role == UserRole.INSPECTOR and actor.status == UserStatus.ACTIVE and work.inspector_id == actor.id
    selected = db.get(InspectionResultEvidence, (work.id, photo.id)) is not None
    allowed_buyer = actor.role == UserRole.BUYER and actor.id == order.buyer_id and work.result is not None and selected
    if not (allowed_inspector or allowed_buyer):
        raise api_error(404, "evidence_not_found", "Image not found")
    return Response(content=inspection_storage.download_object(photo.object_key), media_type=photo.mime_type, headers={"Cache-Control": "no-store"})


@router.get("/certificates/{token}")
def public_certificate(token: str, db: Session = Depends(get_db)):
    cert = db.scalar(select(Certificate).where(Certificate.public_token == token))
    if cert is None:
        raise api_error(404, "certificate_not_found", "Certificate not found")
    return {"certificate_no": cert.certificate_no, "result": cert.result, "issued_at": cert.issued_at}
