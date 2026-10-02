"""One simulated RELEASE/REFUND service; its caller owns commit/rollback."""
import logging
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.orders import api_error
from app.models.fulfillment import DeliveryEvidenceAccess, DeliveryResolution, OrderSettlement, ShippingEvent
from app.models.order import Escrow, Order, Payment, PaymentAttempt, Receipt
from app.models.product import Product
from app.models.user import UserRole
from app.services import finish_core as core
from app.services.finish_policy import PricingSnapshot, allocation, return_reason, validate_source_reason, FinishPolicyError
from app.services.fulfillment_guard import require_fulfillment_simulation
from app.services.transaction_clock import database_now

log = logging.getLogger(__name__)


@dataclass
class SettlementOutcome:
    result: dict
    replayed: bool = False


def settlement_view(row, *, seller=False):
    if row is None:
        return None
    result = {"id": row.id, "kind": row.kind, "source": row.source, "reason": row.reason,
        "currency": row.currency, "settled_at": row.settled_at, "simulated": True,
        "fulfillment_policy": row.fulfillment_policy}
    if seller:
        result.update(seller_payout=f"{row.seller_payout:.2f}", commission_amount=f"{row.commission_amount:.2f}")
    else:
        result.update(held_amount=f"{row.held_amount:.2f}", buyer_refund=f"{row.buyer_refund:.2f}",
            retained_inspection_amount=f"{row.inspection_amount:.2f}", retained_shipping_amount=f"{row.shipping_amount:.2f}")
    return result


def validate_evidence(db, order, admin_id, refs):
    if not refs:
        raise api_error(422, "invalid_evidence_reference", "Same-case evidence required")
    audits = list(db.scalars(select(DeliveryEvidenceAccess).where(
        DeliveryEvidenceAccess.order_id == order.id, DeliveryEvidenceAccess.admin_id == admin_id)))
    if not audits:
        raise api_error(409, "delivery_review_required", "Review this case before resolving it")
    for ref in refs:
        prefix, ident = ref.split(":")
        ident = int(ident)
        allowed = False
        if prefix == "delivery-report":
            allowed = str(ident) == order.missing_report_id
        elif prefix == "delivery-audit":
            allowed = any(a.id == ident for a in audits)
        elif prefix == "delivery-proof":
            from app.models.fulfillment import ShipmentConfirmedProof
            from app.models.shipment import Shipment
            allowed = db.scalar(select(ShipmentConfirmedProof.proof_id).join(Shipment,
                Shipment.id == ShipmentConfirmedProof.shipment_id).where(
                Shipment.order_id == order.id, ShipmentConfirmedProof.proof_id == ident)) is not None
        if not allowed:
            raise api_error(422, "invalid_evidence_reference", "Evidence must be issued for this case")


class OrderSettlementService:
    def settle(self, db: Session, *, order_id, kind, source, reason,
               actor_id=None, worker_name=None, idempotency_key,
               admin_reason=None, evidence_refs=(), clock=None, dry_run=False) -> SettlementOutcome:
        # clock is a server test seam; HTTP/CLI never accept a client/env clock.
        try:
            validate_source_reason(kind, source, reason)
        except FinishPolicyError as exc:
            raise api_error(409, exc.code, "Invalid settlement source") from exc
        order = core.locked_order(db, order_id)
        if source == "BUYER_RECEIPT":
            if worker_name is not None:
                raise api_error(403, "actor_not_authorized", "Buyer command required")
            core.buyer_actor(db, order, actor_id)
        elif source == "ADMIN_RESOLUTION":
            if worker_name is not None:
                raise api_error(403, "actor_not_authorized", "Admin command required")
            core.fresh_actor(db, actor_id, {UserRole.ADMIN})
            if (not admin_reason or not 10 <= len(admin_reason.strip()) <= 1000
                    or "\x00" in admin_reason):
                raise api_error(422, "validation_error", "Admin reason required")
        elif (actor_id is not None or worker_name not in {"lifecycle", "return-delivery"}
              or (worker_name == "return-delivery" and source != "RETURN_DELIVERY")):
            raise api_error(403, "actor_not_authorized", "Named lifecycle worker required")
        scope = f"USER:{actor_id}" if actor_id is not None else f"SYSTEM:{worker_name}"
        action = "SETTLE_" + source
        payload = {"kind": kind, "source": source, "reason": reason,
                   "admin_reason": admin_reason, "evidence_refs": sorted(evidence_refs)}
        old = core.replay(db, order.id, scope, action, idempotency_key, payload)
        if old:
            return SettlementOutcome(old.result, True)
        if not dry_run:
            require_fulfillment_simulation()
        if db.scalar(select(OrderSettlement.id).where(OrderSettlement.order_id == order.id)):
            raise api_error(409, "already_settled", "Order already has a terminal settlement")
        shipments = core.shipments_locked(db, order.id)
        escrow = db.scalar(select(Escrow).where(Escrow.order_id == order.id).with_for_update()
                           .execution_options(populate_existing=True))
        product = db.scalar(select(Product).where(Product.id == order.product_id).with_for_update()
                            .execution_options(populate_existing=True))
        payment = db.scalar(select(Payment).where(Payment.order_id == order.id))
        receipt = db.scalar(select(Receipt).where(Receipt.order_id == order.id))
        attempt = db.get(PaymentAttempt, payment.attempt_id) if payment else None
        if (order.paid_at is None or escrow is None or escrow.status != "HELD"
                or product is None or product.status != "RESERVED" or product.user_id != order.seller_id
                or payment is None or receipt is None or attempt is None or attempt.outcome != "SUCCEEDED"
                or (escrow.order_id, escrow.payment_id, escrow.amount) != (order.id, payment.id, order.total_amount)
                or (payment.order_id, payment.amount, attempt.order_id, attempt.amount) !=
                   (order.id, order.total_amount, order.id, order.total_amount)
                or (receipt.order_id, receipt.payment_id, receipt.total_amount, receipt.currency,
                    receipt.item_price, receipt.shipping_fee, receipt.inspection_fee) !=
                   (order.id, payment.id, order.total_amount, order.currency,
                    order.item_price, order.shipping_fee, order.inspection_fee)):
            raise api_error(409, "financial_snapshot_mismatch", "Matching successful charge, receipt and held escrow required")
        snapshot = PricingSnapshot(order.currency, order.item_price, order.shipping_fee,
            order.inspection_fee, order.commission_fee, order.seller_payout, order.total_amount)
        try:
            amounts = allocation(snapshot, escrow.amount, kind, item_only=(order.fulfillment_policy == "EXTERNAL_V2"
                and kind == "REFUND" and source == "RETURN_DELIVERY" and reason in {"BUYER_REJECTED_INSPECTION", "RESULT_DECISION_TIMEOUT"}))
        except FinishPolicyError as exc:
            raise api_error(409, exc.code, "Saved financial snapshot invalid") from exc
        outbound = next((s for s in shipments if s.leg != "TO_CENTER"), None)
        if source == "SELLER_NO_SHIP":
            if order.status != "WAITING_SELLER_SHIP" or shipments:
                raise api_error(409, "invalid_state", "No committed shipment permitted for no-ship refund")
        else:
            work, decision, leg = core.final_inputs(db, order, shipments)
            external = order.fulfillment_policy == "EXTERNAL_V2"
            if outbound is None or outbound.leg != leg or (not external and outbound.status != "DELIVERED"):
                raise api_error(409, "delivery_proof_required", "Matching final dispatch/delivery required")
            if source == "RETURN_DELIVERY":
                selected_decision = decision.decision if decision else "TIMEOUT" if order.result_timed_out_at is not None else None
                if order.status != "RETURNED_TO_SELLER" or leg != "TO_SELLER" or reason != return_reason(work.result, selected_decision):
                    raise api_error(409, "invalid_state", "Confirmed correct return required")
                if external:
                    if outbound.received_at is None or outbound.recipient_source not in {"SELLER", "ADMIN"} or outbound.recipient_command_id is None:
                        raise api_error(409, "return_receipt_required", "Actual Seller/Admin return receipt required")
                else:
                    core.verify_confirmed(db, outbound)
            elif source == "ADMIN_RESOLUTION":
                if order.status != "DELIVERY_DISPUTED" or order.missing_reported_at is None or leg != "TO_BUYER":
                    raise api_error(409, "delivery_case_required", "Disputed Buyer delivery required")
                validate_evidence(db, order, actor_id, evidence_refs)
                if kind == "RELEASE" and not external:
                    core.verify_confirmed(db, outbound)
            else:
                allowed_states = {"SHIPPING_TO_BUYER", "DELIVERED_PENDING_BUYER"} if external and source == "BUYER_RECEIPT" else {"DELIVERED_PENDING_BUYER"}
                if order.status not in allowed_states or leg != "TO_BUYER" or order.missing_reported_at is not None or order.receipt_confirmed_at is not None:
                    raise api_error(409, "invalid_state", "Undisputed Buyer dispatch required")
                if external:
                    if source == "AUTO_RECEIPT":
                        event = db.scalar(select(ShippingEvent).where(ShippingEvent.shipment_id == outbound.id,
                            ShippingEvent.leg == "TO_BUYER", ShippingEvent.source == "ADMIN_DEMO"))
                        if event is None or order.receipt_deadline_at != event.confirmed_at + timedelta(hours=72):
                            raise api_error(409, "trusted_delivery_required", "AUTO requires a trusted delivered event")
                else:
                    if order.receipt_deadline_at != outbound.courier_delivered_at + timedelta(hours=72):
                        raise api_error(409, "invalid_state", "Persisted delivery deadline required")
                    core.verify_confirmed(db, outbound)
        # Revalidate actor after Storage I/O; clock is sampled only after all locks/I/O.
        if source == "BUYER_RECEIPT":
            core.buyer_actor(db, order, actor_id)
        elif source == "ADMIN_RESOLUTION":
            core.fresh_actor(db, actor_id, {UserRole.ADMIN})
        at = clock() if clock else database_now(db)
        if source == "BUYER_RECEIPT" and order.receipt_deadline_at is not None and at >= order.receipt_deadline_at:
            raise api_error(409, "receipt_deadline_passed", "Physical receipt deadline passed")
        if source == "AUTO_RECEIPT" and (order.receipt_deadline_at is None or at < order.receipt_deadline_at):
            raise api_error(409, "receipt_not_due", "Receipt release is not due")
        if source == "SELLER_NO_SHIP" and at < order.paid_at + timedelta(hours=72):
            raise api_error(409, "seller_shipping_not_due", "Seller shipping deadline not reached")
        if dry_run:
            return SettlementOutcome({"order_id": order.id, "kind": kind, "eligible": True})
        previous = order.status
        order.status = "COMPLETED" if kind == "RELEASE" else "REFUNDED"
        escrow.status = "RELEASED" if kind == "RELEASE" else "REFUNDED"
        escrow.settled_at = at
        product.status = "SOLD" if kind == "RELEASE" else "CANCELLED"
        if source in {"BUYER_RECEIPT", "AUTO_RECEIPT"}:
            order.receipt_confirmed_at = at
            order.receipt_confirmation_source = "BUYER" if source == "BUYER_RECEIPT" else "AUTO"
        # Command must precede the terminal record; every fact rolls back together.
        result = {"order_id": order.id, "order_status": order.status,
                  "receipt_confirmed_at": order.receipt_confirmed_at,
                  "receipt_confirmation_source": order.receipt_confirmation_source}
        # Allocate the DB ID before storing the immutable result.
        from sqlalchemy import func
        settlement_id = db.scalar(select(func.nextval("order_settlements_id_seq")))
        row = OrderSettlement(id=settlement_id, fulfillment_policy=order.fulfillment_policy, order_id=order.id, escrow_id=escrow.id,
            payment_id=payment.id, seller_id=order.seller_id, buyer_id=order.buyer_id,
            kind=kind, source=source, reason=reason, currency=order.currency,
            held_amount=amounts.held_amount, seller_payout=amounts.seller_payout,
            buyer_refund=amounts.buyer_refund, commission_amount=amounts.commission,
            inspection_amount=amounts.inspection, shipping_amount=amounts.shipping, settled_at=at)
        result["settlement"] = settlement_view(row)
        if source == "ADMIN_RESOLUTION":
            result["resolution"] = {"kind": kind, "reason": admin_reason, "evidence_refs": sorted(evidence_refs)}
        cmd = core.command(db, order.id, scope, actor_id, action, idempotency_key, payload, result, at)
        row.command_id = cmd.id
        if order.fulfillment_policy == "EXTERNAL_V2" and source == "BUYER_RECEIPT":
            outbound.status = "DELIVERED"
            outbound.received_at, outbound.received_by = at, actor_id
            outbound.recipient_source, outbound.recipient_command_id = "BUYER", cmd.id
        db.add(row)
        db.flush()
        if source == "ADMIN_RESOLUTION":
            db.add(DeliveryResolution(order_id=order.id, settlement_id=row.id, admin_id=actor_id,
                kind=kind, reason=admin_reason, evidence_references=sorted(evidence_refs), resolved_at=at))
        core.history(db, order, cmd, previous, "SETTLEMENT_" + kind, source, at)
        db.flush()
        return SettlementOutcome(cmd.result)


settlement_service = OrderSettlementService()


def attempt_return_refund(bind, order_id):
    """Independent transaction after a durable return; any failure stays retryable."""
    with Session(bind) as db:
        try:
            from app.models.inspection import Inspection
            from app.models.buyer_inspection_decision import BuyerInspectionDecision
            work = db.scalar(select(Inspection).where(Inspection.order_id == order_id))
            decision = db.scalar(select(BuyerInspectionDecision).where(BuyerInspectionDecision.order_id == order_id))
            order = db.get(Order, order_id)
            reason = return_reason(work.result, decision.decision if decision else "TIMEOUT" if order.result_timed_out_at is not None else None)
            settlement_service.settle(db, order_id=order_id, kind="REFUND", source="RETURN_DELIVERY",
                reason=reason, worker_name="return-delivery", idempotency_key=f"return-refund-{order_id}")
            db.commit()
            return True
        except Exception as exc:
            db.rollback()
            log.error("return refund pending order_id=%s error_type=%s", order_id, type(exc).__name__)
            return False
