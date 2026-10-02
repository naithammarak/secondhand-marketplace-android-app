"""Bounded five-category runner, shared transactions and restart catch-up."""
from dataclasses import dataclass, field
from datetime import timedelta
import logging

from fastapi import HTTPException
from sqlalchemy import exists, select

from app.models.inspection import Inspection
from app.models.order import Order
from app.models.shipment import Shipment
from app.models.buyer_inspection_decision import BuyerInspectionDecision
from app.services import finish_core as core
from app.services.finish_policy import inspection_due_at, return_reason
from app.services.fulfillment_guard import require_fulfillment_simulation
from app.services.order_settlement import settlement_service
from app.services.transaction_clock import database_now
from app.services import unpaid_expiry_worker
from app.services.lifecycle_progress import ScanCursor, UNPAID_JOB_ID, scan_cursor

log = logging.getLogger(__name__)
JOBS = ("unpaid_expiry", "receipt_release", "seller_no_ship", "return_refund", "inspection_overdue")


@dataclass
class JobResult:
    scanned: int = 0
    eligible: int = 0
    applied: int = 0
    failed: int = 0
    skipped: int = 0
    batches: int = 0
    limit_reached: bool = False


@dataclass
class LifecycleResult:
    jobs: dict[str, JobResult] = field(default_factory=lambda: {job: JobResult() for job in JOBS})
    failed: int = 0


def candidate_query(job, cutoff):
    query = select(Order.id)
    if job == "receipt_release":
        return query.where(Order.status == "DELIVERED_PENDING_BUYER",
            Order.receipt_deadline_at <= cutoff, Order.missing_reported_at.is_(None))
    if job == "seller_no_ship":
        return query.where(Order.status == "WAITING_SELLER_SHIP", Order.paid_at <= cutoff - timedelta(hours=72),
            ~exists(select(Shipment.id).where(Shipment.order_id == Order.id)))
    if job == "return_refund":
        return query.where(Order.status == "RETURNED_TO_SELLER")
    return query.join(Shipment, Shipment.order_id == Order.id).join(Inspection, Inspection.order_id == Order.id).where(
        Shipment.leg == "TO_CENTER", Shipment.received_at <= cutoff - timedelta(days=3),
        Inspection.result.is_(None), Order.status.in_(["RECEIVED_AT_CENTER", "INSPECTING"]),
        Order.inspection_overdue_escalated_at.is_(None))


def run_once(session_factory, *, apply=False, batch_size=100, max_batches=10,
             stop=None, clock=None, retry_order_id=None):
    if not 1 <= batch_size <= 1000 or not 1 <= max_batches <= 1000:
        raise ValueError("batch size and max batches must be between 1 and 1000")
    if apply:
        require_fulfillment_simulation()
    result = LifecycleResult()
    if retry_order_id is None:
        options = dict(apply=apply, batch_size=batch_size, max_batches=max_batches, stop=stop)
        if clock:
            options["clock"] = clock
        with scan_cursor(session_factory, UNPAID_JOB_ID, apply=apply) as progress:
            if progress is not None:
                unpaid = unpaid_expiry_worker.run_once(session_factory, progress=progress, **options)
                result.jobs["unpaid_expiry"] = JobResult(unpaid.scanned, unpaid.eligible, unpaid.cancelled,
                    unpaid.failed, unpaid.skipped, unpaid.batches, unpaid.limit_reached)
            else:
                log.info("lifecycle job busy job=unpaid_expiry")
    with session_factory() as db:
        cutoff = clock() if clock else database_now(db)
    for job in JOBS[1:]:
        if retry_order_id is not None and job != "return_refund":
            continue
        stats = result.jobs[job]
        if retry_order_id is not None:
            # Scoped manual retry must not move the normal queue's position.
            _scan_job(session_factory, job, stats, ScanCursor(), cutoff, apply=apply,
                      batch_size=batch_size, max_batches=max_batches, stop=stop,
                      clock=clock, retry_order_id=retry_order_id)
        else:
            with scan_cursor(session_factory, JOBS.index(job), apply=apply) as progress:
                if progress is None:
                    log.info("lifecycle job busy job=%s", job)
                    continue
                _scan_job(session_factory, job, stats, progress, cutoff, apply=apply,
                          batch_size=batch_size, max_batches=max_batches, stop=stop, clock=clock)
    result.failed = sum(job.failed for job in result.jobs.values())
    return result


def _scan_job(session_factory, job, stats, progress, cutoff, *, apply,
              batch_size, max_batches, stop, clock, retry_order_id=None):
    start = cursor = progress.last_order_id
    wrapped = False
    while stats.batches < max_batches:
        if stop is not None and stop.is_set():
            break
        query = candidate_query(job, cutoff).where(Order.id > cursor).order_by(Order.id).limit(batch_size)
        if wrapped:
            query = query.where(Order.id <= start)
        if retry_order_id is not None:
            query = query.where(Order.id == retry_order_id)
        with session_factory() as db:
            candidates = list(db.scalars(query))
        if not candidates:
            if start and not wrapped:
                cursor, wrapped = 0, True
                continue
            break
        stats.batches += 1
        for order_id in candidates:
            if stop is not None and stop.is_set():
                break
            cursor = order_id
            progress.last_order_id = order_id
            stats.scanned += 1
            with session_factory() as db:
                try:
                    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update(skip_locked=True)
                                      .execution_options(populate_existing=True))
                    if order is None:
                        stats.skipped += 1
                        continue
                    at = clock() if clock else database_now(db)
                    if job == "inspection_overdue":
                        shipments = core.shipments_locked(db, order.id)
                        inbound = next((s for s in shipments if s.leg == "TO_CENTER"), None)
                        work = db.scalar(select(Inspection).where(Inspection.order_id == order.id)
                                         .execution_options(populate_existing=True))
                        at = clock() if clock else database_now(db)
                        if (inbound is None or inbound.received_at is None or work is None or work.result is not None
                            or order.inspection_overdue_escalated_at is not None
                            or order.status not in {"RECEIVED_AT_CENTER", "INSPECTING"}
                            or at < inspection_due_at(inbound.received_at)):
                            stats.skipped += 1
                            continue
                        stats.eligible += 1
                        if apply:
                            order.inspection_overdue_escalated_at = at
                            cmd = core.command(db, order.id, "SYSTEM:lifecycle", None,
                                "INSPECTION_OVERDUE", f"inspection-overdue-{order.id}", {},
                                {"order_id":order.id,"escalated_at":at}, at)
                            core.history(db, order, cmd, order.status, "INSPECTION_OVERDUE", "SYSTEM", at)
                            db.commit()
                            stats.applied += 1
                        continue
                    expected = {"receipt_release":"DELIVERED_PENDING_BUYER", "seller_no_ship":"WAITING_SELLER_SHIP", "return_refund":"RETURNED_TO_SELLER"}[job]
                    if order.status != expected:
                        stats.skipped += 1
                        continue
                    if job == "receipt_release":
                        source, kind, reason = "AUTO_RECEIPT", "RELEASE", "RECEIPT_TIMEOUT"
                    elif job == "seller_no_ship":
                        source, kind, reason = "SELLER_NO_SHIP", "REFUND", "SELLER_NO_SHIP"
                    else:
                        work = db.scalar(select(Inspection).where(Inspection.order_id == order.id))
                        decision = db.scalar(select(BuyerInspectionDecision).where(BuyerInspectionDecision.order_id == order.id))
                        source, kind = "RETURN_DELIVERY", "REFUND"
                        reason = return_reason(work.result, decision.decision if decision else None)
                    # Dry-run shares validation but allocates no IDs and writes no records.
                    outcome = settlement_service.settle(db, order_id=order.id, kind=kind, source=source,
                        reason=reason, worker_name="lifecycle", idempotency_key=f"{job}-{order.id}", clock=clock,
                        dry_run=not apply)
                    stats.eligible += 1
                    if apply:
                        db.commit()
                        stats.applied += int(not outcome.replayed)
                    else:
                        db.rollback()
                except HTTPException as exc:
                    db.rollback()
                    if exc.status_code == 409:
                        stats.skipped += 1
                    else:
                        stats.failed += 1
                        log.error("lifecycle failure job=%s order_id=%s code=%s", job, order_id,
                                  exc.detail.get("code") if isinstance(exc.detail, dict) else "http_error")
                except Exception as exc:
                    db.rollback()
                    stats.failed += 1
                    log.error("lifecycle failure job=%s order_id=%s error_type=%s", job, order_id, type(exc).__name__)
    else:
        stats.limit_reached = True
    progress.scanned, progress.failed = stats.scanned, stats.failed


def run_recurring(session_factory, stop, *, interval_seconds=300, **options):
    return unpaid_expiry_worker.run_recurring(session_factory, stop, interval_seconds=interval_seconds,
        scan=run_once, **options)
