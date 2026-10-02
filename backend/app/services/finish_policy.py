"""FINISH eligibility/allocation rules reused by delivery, settlement and jobs.

These helpers do not persist state or grant authority. The integration must load
the accepted models under Order -> Shipment -> Escrow -> Product locks, refresh
authorization and selected proof metadata, then sample database_now after I/O.
Runtime simulation authorization uses A's fulfillment_guard.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session


Kind = Literal["RELEASE", "REFUND"]
BANGKOK = timezone(timedelta(hours=7), name="Asia/Bangkok")
WINDOW = timedelta(hours=72)
MAX_MONEY = Decimal("9999999999.99")
SOURCE_REASONS = {
    ("RELEASE", "BUYER_RECEIPT", "RECEIPT_CONFIRMED"),
    ("RELEASE", "AUTO_RECEIPT", "RECEIPT_TIMEOUT"),
    ("RELEASE", "ADMIN_RESOLUTION", "DELIVERY_REVIEW_RELEASE"),
    ("REFUND", "RETURN_DELIVERY", "BUYER_REJECTED_INSPECTION"),
    ("REFUND", "RETURN_DELIVERY", "INSPECTION_NOT_AS_DESCRIBED"),
    ("REFUND", "RETURN_DELIVERY", "INSPECTION_FAKE"),
    ("REFUND", "SELLER_NO_SHIP", "SELLER_NO_SHIP"),
    ("REFUND", "ADMIN_RESOLUTION", "DELIVERY_REVIEW_REFUND"),
}


class FinishPolicyError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("FINISH requires timezone-aware server timestamps")
    return value.astimezone(timezone.utc)


def database_now(db: Session) -> datetime:
    """Fresh PostgreSQL wall clock; caller owns the lock and transaction.

    Unlike transaction_timestamp()/now(), clock_timestamp() advances after a
    lock wait. This is deliberately not an injectable production env setting.
    """
    return utc(db.scalar(select(func.clock_timestamp())))


def final_leg(result: str | None, decision: str | None) -> str:
    if result in {"PASS", "MINOR_ISSUE"}:
        if decision == "CONFIRM":
            return "TO_BUYER"
        if decision == "REJECT":
            return "TO_SELLER"
        raise FinishPolicyError("decision_required")
    if result in {"FAKE", "NOT_AS_DESCRIBED"}:
        if decision is not None:
            raise FinishPolicyError("inspection_not_ready")
        return "TO_SELLER"
    raise FinishPolicyError("inspection_not_ready")


def return_reason(result: str | None, decision: str | None) -> str:
    if final_leg(result, decision) != "TO_SELLER":
        raise FinishPolicyError("invalid_state")
    return {
        "FAKE": "INSPECTION_FAKE",
        "NOT_AS_DESCRIBED": "INSPECTION_NOT_AS_DESCRIBED",
    }.get(result, "BUYER_REJECTED_INSPECTION")


def receipt_deadline(confirmed_at: datetime) -> datetime:
    """Input is persisted TO_BUYER confirmation, never inspection acceptance."""
    return utc(confirmed_at) + WINDOW


def before_deadline(now: datetime, deadline: datetime) -> bool:
    return utc(now) < utc(deadline)


def no_ship_due(now: datetime, paid_at: datetime | None, inbound_shipped_at: datetime | None) -> bool:
    # Any existing inbound shipment fails safe. A late/inconsistent legacy
    # shipment is an operator escalation, never a synthetic no-ship refund.
    return (paid_at is not None and inbound_shipped_at is None
            and utc(now) >= utc(paid_at) + WINDOW)


def inspection_due_at(received_at: datetime) -> datetime:
    """Three Monday-Friday days at the same Bangkok time, no holiday calendar."""
    target = utc(received_at).astimezone(BANGKOK)
    remaining = 3
    while remaining:
        target += timedelta(days=1)
        if target.weekday() < 5:
            remaining -= 1
    return target.astimezone(timezone.utc)


@dataclass(frozen=True)
class PricingSnapshot:
    currency: str
    item_price: Decimal
    shipping_fee: Decimal
    inspection_fee: Decimal
    commission_fee: Decimal
    seller_payout: Decimal
    total_amount: Decimal

    def validate(self) -> None:
        for amount in (self.item_price, self.shipping_fee, self.inspection_fee,
                       self.commission_fee, self.seller_payout, self.total_amount):
            if (not isinstance(amount, Decimal) or not amount.is_finite()
                    or amount < 0 or amount > MAX_MONEY
                    or amount != amount.quantize(Decimal("0.01"))):
                raise FinishPolicyError("pricing_snapshot_mismatch")
        if (self.currency != "THB" or self.total_amount <= 0
                or self.total_amount != self.item_price + self.shipping_fee + self.inspection_fee
                or self.seller_payout != self.item_price - self.commission_fee):
            raise FinishPolicyError("pricing_snapshot_mismatch")


@dataclass(frozen=True)
class Allocation:
    held_amount: Decimal
    seller_payout: Decimal
    buyer_refund: Decimal
    commission: Decimal
    inspection: Decimal
    shipping: Decimal


def allocation(snapshot: PricingSnapshot, held_amount: Decimal, kind: Kind) -> Allocation:
    """Copy persisted allocations; never recalculate commission at current rates."""
    snapshot.validate()
    if not isinstance(held_amount, Decimal) or held_amount != snapshot.total_amount:
        raise FinishPolicyError("pricing_snapshot_mismatch")
    zero = Decimal("0.00")
    if kind == "RELEASE":
        return Allocation(held_amount, snapshot.seller_payout, zero,
                          snapshot.commission_fee, snapshot.inspection_fee, snapshot.shipping_fee)
    if kind == "REFUND":
        return Allocation(held_amount, zero, held_amount, zero, zero, zero)
    raise FinishPolicyError("invalid_settlement_kind")


def validate_source_reason(kind: str, source: str, reason: str) -> None:
    if (kind, source, reason) not in SOURCE_REASONS:
        raise FinishPolicyError("invalid_settlement_source")


def simulation_allowed(environment: str | None, enabled: str | None) -> bool:
    return ((environment or "").strip().lower() in {"development", "dev", "test", "demo"}
            and (enabled or "").strip().lower() == "true")


def buyer_action_flags(*, role: str, active: bool, owns_order: bool,
                       status: str, escrow_status: str | None,
                       deadline: datetime | None, now: datetime,
                       reported: bool, settled: bool,
                       confirmed_buyer_delivery: bool) -> dict[str, bool]:
    allowed = (role in {"BUYER", "SELLER"} and active and owns_order
               and status == "DELIVERED_PENDING_BUYER" and escrow_status == "HELD"
               and deadline is not None and before_deadline(now, deadline)
               and not reported and not settled and confirmed_buyer_delivery)
    return {"can_confirm_receipt": allowed, "can_report_missing": allowed}


def proof_read_allowed(*, role: str, active: bool, leg: str,
                       owns_as_buyer: bool = False, owns_as_seller: bool = False,
                       assigned_courier: bool = False, assigned_inspector: bool = False,
                       audited_disputed_case: bool = False) -> bool:
    """Relationship inputs come from authorized DB rows, never client flags.

    An Admin case reference alone is insufficient; the scoped review/audit must
    already have been authorized and committed before bytes are returned.
    """
    if not active or leg not in {"TO_CENTER", "TO_BUYER", "TO_SELLER"}:
        return False
    if role in {"BUYER", "SELLER"} and owns_as_buyer:
        return True
    if role == "SELLER" and owns_as_seller:
        return leg in {"TO_CENTER", "TO_SELLER"}
    if role == "COURIER":
        return assigned_courier
    if role == "INSPECTOR":
        return assigned_inspector
    if role == "ADMIN":
        return audited_disputed_case
    return False
