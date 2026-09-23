"""INSPECT-02/03: authorized shipment, inspection and private result flow."""

import os
import secrets
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.orders import api_error, key_reused, load_order_for, request_fingerprint, require_idempotency_key, validation_error
from app.database import get_db
from app.models.certificate import Certificate
from app.models.inspection import Inspection, InspectionEvidence, InspectionIdempotency, InspectionResultEvidence
from app.models.order import Escrow, Order, Payment
from app.models.shipment import Shipment
from app.models.user import User, UserRole, UserStatus
from app.services import inspection_storage


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


def now() -> datetime:
    return datetime.now(timezone.utc)


def inspector_only(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.INSPECTOR:
        raise api_error(403, "inspector_role_required", "Inspector account required")
    if user.status != UserStatus.ACTIVE:
        raise api_error(403, "account_inactive", "Account inactive")
    return user


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
    return {"carrier": row.carrier, "tracking_number": row.tracking_number, "shipped_at": row.shipped_at, "received_at": row.received_at}


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
    origin = (os.getenv("CERT_PUBLIC_ORIGIN") or "").rstrip("/")
    if not origin.startswith(("https://", "http://")) or "/" in origin.split("://", 1)[1]:
        raise api_error(503, "certificate_unavailable", "Certificate service is unavailable")
    return f"{origin}/certificates/{token}"


def _certificate_view(row: Certificate | None):
    return None if row is None else {"certificate_no": row.certificate_no, "public_url": _public_url(row.public_token)}


def issue_certificate(db: Session, order: Order, work: Inspection, result: str) -> Certificate:
    """Called before the result transaction commits; failures roll everything back."""
    if result not in POSITIVE:
        raise ValueError("Only qualifying results receive certificates")
    token = secrets.token_urlsafe(32)
    _public_url(token)  # Validate configuration before creating any row.
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
    order = db.get(Order, cert.order_id)
    return {"certificate_no": cert.certificate_no, "result": cert.result, "product_name": order.product_name, "issued_at": cert.issued_at}
