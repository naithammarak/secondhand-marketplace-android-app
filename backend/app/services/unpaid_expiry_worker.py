"""Bounded, restartable scan of unpaid Order deadlines without HTTP traffic."""

from dataclasses import asdict, dataclass
import json
from datetime import datetime
import logging
from threading import Event
from typing import Callable

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models.order import Order
from app.services.order_expiry import expire_orders_in_transaction
from app.services.transaction_clock import database_now
from app.services.order_pricing import ORDER_WAITING_PAYMENT, as_utc, utcnow

log = logging.getLogger(__name__)


@dataclass
class ScanResult:
    scanned: int = 0
    eligible: int = 0
    cancelled: int = 0
    failed: int = 0
    skipped: int = 0
    batches: int = 0
    limit_reached: bool = False


def run_once(
    session_factory: Callable[[], Session],
    *,
    apply: bool = False,
    batch_size: int = 100,
    max_batches: int = 10,
    stop: Event | None = None,
    clock: Callable[[], datetime] = utcnow,
    progress=None,
) -> ScanResult:
    """Scan a fixed cutoff in deterministic pages; failed rows retry next run.

    Each Order is locked and committed independently. A failed row rolls back
    without holding the other rows hostage. SKIP LOCKED leaves a payment or
    other worker's in-flight Order for the next scan. The five-job runner supplies
    durable progress; standalone callers retain an in-memory traversal.
    """
    if not 1 <= batch_size <= 1000 or not 1 <= max_batches <= 1000:
        raise ValueError("batch_size and max_batches must each be between 1 and 1000")

    result = ScanResult()
    cutoff = clock()
    cursor: tuple[datetime, int] | None = (
        (progress.last_expires_at, progress.last_order_id)
        if progress is not None and progress.last_expires_at is not None else None
    )
    start = cursor
    wrapped = False
    while result.batches < max_batches:
        if stop is not None and stop.is_set():
            break
        query = select(Order.id, Order.expires_at).where(
            Order.status == ORDER_WAITING_PAYMENT,
            Order.paid_at.is_(None),
            Order.expires_at <= cutoff,
        )
        if cursor is not None:
            deadline, order_id = cursor
            query = query.where(or_(
                Order.expires_at > deadline,
                and_(Order.expires_at == deadline, Order.id > order_id),
            ))
        if wrapped:
            deadline, order_id = start
            query = query.where(or_(
                Order.expires_at < deadline,
                and_(Order.expires_at == deadline, Order.id <= order_id),
            ))
        query = query.order_by(Order.expires_at, Order.id).limit(batch_size)
        with session_factory() as db:
            candidates = db.execute(query).all()
            db.rollback()  # end the read transaction before locking any Order
        if not candidates:
            if start is not None and not wrapped:
                cursor, wrapped = None, True
                continue
            break
        result.batches += 1
        for order_id, deadline in candidates:
            if stop is not None and stop.is_set():
                break
            cursor = (deadline, order_id)
            if progress is not None:
                progress.last_expires_at, progress.last_order_id = cursor
            result.scanned += 1
            if not apply:
                result.eligible += 1  # snapshot estimate; no locks or writes
                continue
            with session_factory() as db:
                try:
                    order = db.scalar(
                        select(Order).where(Order.id == order_id).with_for_update(skip_locked=True)
                    )
                    now = database_now(db) if clock is utcnow else clock()
                    if (
                        order is None
                        or order.status != ORDER_WAITING_PAYMENT
                        or order.paid_at is not None
                        or as_utc(order.expires_at) > now
                    ):
                        result.skipped += 1
                        db.rollback()
                        continue
                    result.eligible += 1
                    changed = expire_orders_in_transaction(db, Order.id == order_id, now=now)
                    db.commit()
                    result.cancelled += changed
                except Exception as exc:
                    db.rollback()
                    result.failed += 1
                    log.error("unpaid expiry failed order_id=%s error_type=%s", order_id, type(exc).__name__)
        if len(candidates) < batch_size and start is None:
            break
    else:
        result.limit_reached = True
    if progress is not None:
        progress.scanned, progress.failed = result.scanned, result.failed
    return result


def run_recurring(
    session_factory: Callable[[], Session],
    stop: Event,
    *,
    interval_seconds: int = 300,
    scan: Callable | None = None,
    **scan_options,
) -> int:
    """Scan immediately at startup and every interval; SIGTERM can stop cleanly."""
    if interval_seconds < 1:
        raise ValueError("interval_seconds must be positive")
    failures = 0
    while not stop.is_set():
        result = (scan or run_once)(session_factory, stop=stop, **scan_options)
        if scan is not None:
            log.info("lifecycle scan %s", json.dumps(asdict(result), sort_keys=True))
        else:
            log.info(
                "unpaid expiry scanned=%s eligible=%s cancelled=%s failed=%s skipped=%s batches=%s limit_reached=%s",
                result.scanned, result.eligible, result.cancelled, result.failed,
                result.skipped, result.batches, result.limit_reached,
            )
        failures += result.failed
        stop.wait(interval_seconds)
    return failures
