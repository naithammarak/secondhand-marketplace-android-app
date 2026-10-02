"""Durable bounded-scan progress in the existing SYSTEM command journal."""
from contextlib import contextmanager
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy import func, select

from app.api.orders import request_fingerprint
from app.models.fulfillment import FulfillmentCommand
from app.services.transaction_clock import database_now

SCOPE = "SYSTEM:lifecycle-cursor"
ACTION = "LIFECYCLE_SCAN"
RESOURCE = "LIFECYCLE_JOB"
# Stable PostgreSQL advisory namespace; no Order/Shipment locks are held here.
LOCK_NAMESPACE = 1179209299


@dataclass
class ScanCursor:
    last_order_id: int = 0
    scanned: int = 0
    failed: int = 0


@contextmanager
def scan_cursor(session_factory, job_id, *, apply):
    """Serialize each applying job's cursor across processes, not business rows.

    A completed scan is a SYSTEM command, including when individual Orders
    failed. Only its traversal position is committed here; successful business
    commands and failed-business rollbacks retain their own transactions.
    Dry-run reads the next position and writes/allocates nothing.
    """
    with session_factory() as db:
        if apply and not db.scalar(select(func.pg_try_advisory_xact_lock(LOCK_NAMESPACE, job_id))):
            yield None
            return
        record = db.scalar(select(FulfillmentCommand).where(
            FulfillmentCommand.actor_scope == SCOPE,
            FulfillmentCommand.action == ACTION,
            FulfillmentCommand.resource_type == RESOURCE,
            FulfillmentCommand.resource_id == job_id,
        ).order_by(FulfillmentCommand.id.desc()).limit(1))
        cursor = ScanCursor(last_order_id=record.result["last_order_id"] if record else 0)
        yield cursor
        if apply and cursor.scanned:
            result = {"last_order_id": cursor.last_order_id,
                      "scanned": cursor.scanned, "failed": cursor.failed}
            db.add(FulfillmentCommand(actor_scope=SCOPE, actor_id=None, action=ACTION,
                resource_type=RESOURCE, resource_id=job_id, idempotency_key=str(uuid4()),
                request_hash=request_fingerprint(result), response_status=200,
                result=result, committed_at=database_now(db)))
            db.commit()
