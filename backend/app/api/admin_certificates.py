"""Minimal certificate revocation; no inspection, Order or money transitions."""

from typing import Literal

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, StrictStr, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.admin_verifications import require_admin
from app.api.inspections import _fresh_actor, _public_url
from app.api.orders import api_error, key_reused, request_fingerprint, require_idempotency_key
from app.database import get_db
from app.models.certificate import Certificate
from app.models.fulfillment import FulfillmentCommand
from app.models.user import User, UserRole
from app.services.transaction_clock import database_now

router = APIRouter(prefix="/admin/certificates", tags=["Certificate revocation"])
REVOKE_ACTION = "REVOKE_CERTIFICATE"


class RevokeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: StrictStr

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        value = value.strip()
        if not 10 <= len(value) <= 1000:
            raise ValueError("Use 10–1000 characters after trimming")
        if any((ord(char) < 32 and char not in "\t\n\r") or 0xD800 <= ord(char) <= 0xDFFF for char in value):
            raise ValueError("Reason contains unsupported characters")
        return value


async def parse_revoke(request: Request) -> RevokeRequest:
    try:
        return RevokeRequest.model_validate(await request.json())
    except (ValueError, ValidationError) as exc:
        # Do not echo private notes into validation responses/logs.
        raise api_error(422, "validation_error", "Invalid revocation reason", fields={
            "reason": "Send only a string reason of 10–1000 characters after trimming",
        }) from exc


def certificate_view(row: Certificate) -> dict:
    return {
        "id": row.id,
        "certificate_no": row.certificate_no,
        "result": row.result,
        "issued_at": row.issued_at,
        "status": row.status,
        "revoked_at": row.revoked_at,
        "public_url": _public_url(row.public_token),
        "can_revoke": row.status == "ISSUED",
    }


@router.get("")
def list_certificates(
    actor: User = Depends(require_admin),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=50),
    before_id: int | None = Query(None, ge=1, le=2147483647),
    status: Literal["ISSUED", "REVOKED"] | None = None,
):
    query = select(Certificate)
    if before_id is not None:
        query = query.where(Certificate.id < before_id)
    if status is not None:
        query = query.where(Certificate.status == status)
    rows = list(db.scalars(query.order_by(Certificate.id.desc()).limit(limit + 1)))
    more = len(rows) > limit
    return {"items": [certificate_view(row) for row in rows[:limit]],
            "next_before_id": rows[limit - 1].id if more else None}


@router.get("/{certificate_id}")
def get_certificate(certificate_id: int = Path(ge=1, le=2147483647), actor: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.get(Certificate, certificate_id)
    if row is None:
        raise api_error(404, "certificate_not_found", "Certificate not found")
    return certificate_view(row)


@router.post("/{certificate_id}/revoke")
def revoke_certificate(
    response: Response,
    certificate_id: int = Path(ge=1, le=2147483647),
    actor: User = Depends(require_admin),
    body: RevokeRequest = Depends(parse_revoke),
    key: str = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    try:
        # Serialize competing Admins and refresh SQLAlchemy's identity map after
        # waiting. No Order lock/mutation is needed for this certificate-only fact.
        row = db.scalar(select(Certificate).where(Certificate.id == certificate_id)
                        .with_for_update().execution_options(populate_existing=True))
        if row is None:
            raise api_error(404, "certificate_not_found", "Certificate not found")
        _fresh_actor(db, actor, UserRole.ADMIN, "admin_role_required")
        fingerprint = request_fingerprint(body.model_dump())
        scope = f"USER:{actor.id}"
        previous = db.scalar(select(FulfillmentCommand).where(
            FulfillmentCommand.actor_scope == scope,
            FulfillmentCommand.action == REVOKE_ACTION,
            FulfillmentCommand.resource_type == "CERTIFICATE",
            FulfillmentCommand.resource_id == row.id,
            FulfillmentCommand.idempotency_key == key,
        ))
        if previous is not None:
            if previous.request_hash != fingerprint:
                raise key_reused()
            response.headers["Idempotent-Replayed"] = "true"
            result = previous.result["response"]
            db.rollback()
            return result
        if row.status != "ISSUED":
            raise api_error(409, "certificate_already_revoked", "Certificate has already been revoked")

        revoked_at = database_now(db)
        row.status = "REVOKED"
        row.revoked_at = revoked_at
        # This legacy 500-character column is a safe code, never private notes.
        row.revocation_reason = "ADMIN_REVOKED"
        result = jsonable_encoder(certificate_view(row))
        # Reuse A's append-only, RLS-protected command audit. Its JSON holds the
        # full private reason (up to 1000 chars); only response is ever replayed.
        db.add(FulfillmentCommand(
            actor_scope=scope, actor_id=actor.id, action=REVOKE_ACTION,
            resource_type="CERTIFICATE", resource_id=row.id, idempotency_key=key,
            request_hash=fingerprint, response_status=200, committed_at=revoked_at,
            result={"response": result, "audit": {
                "reason": body.reason, "from_status": "ISSUED", "to_status": "REVOKED",
            }},
        ))
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
