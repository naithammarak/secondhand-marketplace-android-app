"""Bounded-worker command: silence authorizes return, never physical or money facts."""
from sqlalchemy import select

from app.api.orders import api_error
from app.models.buyer_inspection_decision import BuyerInspectionDecision
from app.models.certificate import Certificate
from app.models.inspection import Inspection
from app.models.order import Escrow
from app.services import finish_core as core
from app.services.fulfillment_guard import require_fulfillment_simulation
from app.services.transaction_clock import database_now


def record_result_timeout(db, order_id, *, clock=None, dry_run=False):
    order = core.locked_order(db, order_id)
    if not dry_run:
        require_fulfillment_simulation()
    key = f"result-timeout-{order.id}"
    old = core.replay(db, order.id, "SYSTEM:lifecycle", "RESULT_DECISION_TIMEOUT", key, {})
    if old:
        return old.result, True
    shipments = core.shipments_locked(db, order.id)
    work = db.scalar(select(Inspection).where(Inspection.order_id == order.id))
    decision = db.scalar(select(BuyerInspectionDecision.id).where(BuyerInspectionDecision.order_id == order.id))
    cert = db.scalar(select(Certificate).where(Certificate.order_id == order.id))
    escrow = db.scalar(select(Escrow).where(Escrow.order_id == order.id).with_for_update())
    if (order.fulfillment_policy != "EXTERNAL_V2" or order.status != "RESULT_NOTIFIED"
            or work is None or work.result not in {"PASS", "MINOR_ISSUE"}
            or cert is None or cert.inspection_id != work.id or cert.result != work.result
            or order.result_available_at != work.inspected_at or order.result_decision_deadline_at is None
            or order.result_timed_out_at is not None or decision is not None
            or any(s.leg != "TO_CENTER" for s in shipments) or escrow is None or escrow.status != "HELD"):
        raise api_error(409, "result_timeout_not_eligible", "Undecided positive result with no outbound leg required")
    at = clock() if clock else database_now(db)
    if at < order.result_decision_deadline_at:
        raise api_error(409, "result_timeout_not_due", "Result decision deadline not reached")
    result = {"order_id": order.id, "outcome": "TIMEOUT_RETURN", "result_timed_out_at": at,
              "authorized_leg": "TO_SELLER", "simulated": True}
    if dry_run:
        return result, False
    cmd = core.command(db, order.id, "SYSTEM:lifecycle", None, "RESULT_DECISION_TIMEOUT", key, {}, result, at)
    order.result_timed_out_at = at
    core.history(db, order, cmd, order.status, "RESULT_DECISION_TIMEOUT", "SYSTEM", at)
    db.flush()
    return cmd.result, False
