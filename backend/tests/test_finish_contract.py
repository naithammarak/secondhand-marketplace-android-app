"""Independent FINISH contract tests; no claim of implemented HTTP settlement."""

from dataclasses import replace
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from itertools import product

import pytest
from pydantic import ValidationError

from app.schemas.finish import (
    ConfirmDeliveryRequest, ConfirmReceiptRequest, DeliveryReviewRequest,
    FulfillmentRequest, ReportNotReceivedRequest, ResolveDeliveryRequest,
)
from app.services.finish_policy import (
    SOURCE_REASONS, FinishPolicyError, PricingSnapshot, allocation,
    before_deadline, buyer_action_flags, final_leg, inspection_due_at,
    no_ship_due, proof_read_allowed, receipt_deadline, return_reason,
    simulation_allowed, validate_source_reason,
)


INSTANT = datetime(2026, 10, 2, 3, tzinfo=timezone.utc)


@pytest.fixture
def price():
    return PricingSnapshot("THB", *(Decimal(value) for value in
                           ("1200.00", "50.00", "100.00", "60.00", "1140.00", "1350.00")))


@pytest.mark.parametrize("result,decision,leg", [
    ("PASS", "CONFIRM", "TO_BUYER"), ("MINOR_ISSUE", "CONFIRM", "TO_BUYER"),
    ("PASS", "REJECT", "TO_SELLER"), ("MINOR_ISSUE", "REJECT", "TO_SELLER"),
    ("FAKE", None, "TO_SELLER"), ("NOT_AS_DESCRIBED", None, "TO_SELLER"),
])
def test_only_server_derived_final_leg(result, decision, leg):
    assert final_leg(result, decision) == leg


@pytest.mark.parametrize("result,decision,code", [
    ("PASS", None, "decision_required"), ("MINOR_ISSUE", None, "decision_required"),
    (None, "CONFIRM", "inspection_not_ready"), ("UNKNOWN", None, "inspection_not_ready"),
    ("FAKE", "CONFIRM", "inspection_not_ready"), ("NOT_AS_DESCRIBED", "REJECT", "inspection_not_ready"),
])
def test_missing_or_fabricated_decisions_fail(result, decision, code):
    with pytest.raises(FinishPolicyError, match=code):
        final_leg(result, decision)


@pytest.mark.parametrize("result,decision,reason", [
    ("PASS", "REJECT", "BUYER_REJECTED_INSPECTION"),
    ("MINOR_ISSUE", "REJECT", "BUYER_REJECTED_INSPECTION"),
    ("FAKE", None, "INSPECTION_FAKE"),
    ("NOT_AS_DESCRIBED", None, "INSPECTION_NOT_AS_DESCRIBED"),
])
def test_exact_return_reason(result, decision, reason):
    assert return_reason(result, decision) == reason


def test_release_and_full_refund_conserve_original_snapshot(price):
    release = allocation(price, Decimal("1350.00"), "RELEASE")
    assert (release.seller_payout, release.commission, release.inspection, release.shipping) == (
        Decimal("1140.00"), Decimal("60.00"), Decimal("100.00"), Decimal("50.00"))
    assert release.buyer_refund == 0
    refund = allocation(price, Decimal("1350.00"), "REFUND")
    assert refund.buyer_refund == refund.held_amount == Decimal("1350.00")
    assert refund.seller_payout == refund.commission == refund.inspection == refund.shipping == 0


def test_release_uses_saved_commission_even_if_rate_changed(price):
    changed_snapshot = replace(price, commission_fee=Decimal("72.00"), seller_payout=Decimal("1128.00"))
    assert allocation(changed_snapshot, Decimal("1350.00"), "RELEASE").seller_payout == Decimal("1128.00")


@pytest.mark.parametrize("field,value", [
    ("total_amount", Decimal("1200.00")), ("commission_fee", Decimal("61.00")),
    ("seller_payout", Decimal("1140.001")), ("shipping_fee", Decimal("-1")),
    ("item_price", 1200.0), ("item_price", Decimal("NaN")),
    ("item_price", Decimal("Infinity")), ("total_amount", Decimal("10000000000.00")),
    ("currency", "USD"),
])
def test_bad_pricing_fails_before_any_financial_write(price, field, value):
    with pytest.raises(FinishPolicyError, match="pricing_snapshot_mismatch"):
        allocation(replace(price, **{field: value}), Decimal("1350.00"), "RELEASE")


def test_held_mismatch_and_unknown_kind(price):
    with pytest.raises(FinishPolicyError):
        allocation(price, Decimal("1350.01"), "REFUND")
    with pytest.raises(FinishPolicyError):
        allocation(price, Decimal("1350.00"), "UNKNOWN")


@pytest.mark.parametrize("kind,source,reason", sorted(SOURCE_REASONS))
def test_exact_source_reason_pairs(kind, source, reason):
    validate_source_reason(kind, source, reason)
    opposite = "REFUND" if kind == "RELEASE" else "RELEASE"
    with pytest.raises(FinishPolicyError):
        validate_source_reason(opposite, source, reason)


@pytest.mark.parametrize("offset,open_window", [(-1, True), (0, False), (1, False)])
def test_receipt_deadline_is_strict_at_microsecond_boundary(offset, open_window):
    deadline = receipt_deadline(INSTANT)
    assert deadline == INSTANT + timedelta(hours=72)
    assert before_deadline(deadline + timedelta(microseconds=offset), deadline) is open_window


def test_never_accept_naive_or_client_clock():
    with pytest.raises(ValueError, match="timezone-aware"):
        receipt_deadline(datetime(2026, 10, 2))


@pytest.mark.parametrize("offset,due", [(-1, False), (0, True), (1, True)])
def test_seller_no_ship_boundary_and_committed_shipment_exclusion(offset, due):
    now = INSTANT + timedelta(hours=72, microseconds=offset)
    assert no_ship_due(now, INSTANT, None) is due
    assert not no_ship_due(now, INSTANT, INSTANT + timedelta(hours=1))
    assert not no_ship_due(now, INSTANT, INSTANT + timedelta(hours=73))
    assert not no_ship_due(now, None, None)


@pytest.mark.parametrize("start_day,expected_day", [(2, 7), (3, 7), (4, 7), (5, 8), (6, 9), (7, 12), (8, 13)])
def test_inspection_working_days_preserve_bangkok_time(start_day, expected_day):
    received = INSTANT.replace(day=start_day)
    assert inspection_due_at(received) == INSTANT.replace(day=expected_day)


def test_inspection_uses_bangkok_day_across_utc_midnight():
    # Thursday 22:00 UTC is Friday 05:00 in Bangkok; three workdays -> Wednesday.
    received = datetime(2026, 10, 1, 22, tzinfo=timezone.utc)
    assert inspection_due_at(received) == datetime(2026, 10, 6, 22, tzinfo=timezone.utc)


@pytest.mark.parametrize("environment,enabled,allowed", [
    ("development", "true", True), ("test", "1", True), ("demo", "yes", True),
    (" DEMO ", "TRUE", True), ("production", "true", False), ("prod", "true", False),
    ("staging", "true", False), (None, "true", False), ("", "true", False),
    ("test", None, False), ("test", "false", False),
])
def test_simulation_rejects_unknown_and_production(environment, enabled, allowed):
    assert simulation_allowed(environment, enabled) is allowed


def valid_flags(**changes):
    values = dict(role="BUYER", active=True, owns_order=True, status="DELIVERED_PENDING_BUYER",
                  escrow_status="HELD", deadline=receipt_deadline(INSTANT), now=INSTANT,
                  reported=False, settled=False, confirmed_buyer_delivery=True)
    return buyer_action_flags(**(values | changes))


def test_owning_approved_seller_can_receive_as_buyer():
    assert all(valid_flags(role="SELLER").values())


@pytest.mark.parametrize("changes", [
    {"role": "ADMIN"}, {"role": "COURIER"}, {"role": "INSPECTOR"}, {"role": "UNKNOWN"},
    {"active": False}, {"owns_order": False}, {"status": "RESULT_NOTIFIED"},
    {"status": "DELIVERY_DISPUTED"}, {"status": "COMPLETED"}, {"status": "REFUNDED"},
    {"escrow_status": "RELEASED"}, {"deadline": None}, {"now": receipt_deadline(INSTANT)},
    {"reported": True}, {"settled": True}, {"confirmed_buyer_delivery": False},
])
def test_action_flags_fail_closed(changes):
    assert not any(valid_flags(**changes).values())


@pytest.mark.parametrize("leg", ["TO_CENTER", "TO_BUYER", "TO_SELLER"])
def test_proof_authorization_relationships(leg):
    assert proof_read_allowed(role="BUYER", active=True, leg=leg, owns_as_buyer=True)
    assert proof_read_allowed(role="SELLER", active=True, leg=leg, owns_as_buyer=True)
    assert proof_read_allowed(role="SELLER", active=True, leg=leg, owns_as_seller=True) is (leg != "TO_BUYER")
    assert proof_read_allowed(role="COURIER", active=True, leg=leg, assigned_courier=True)
    assert proof_read_allowed(role="INSPECTOR", active=True, leg=leg, assigned_inspector=True)
    assert proof_read_allowed(role="ADMIN", active=True, leg=leg, audited_disputed_case=True)
    for role, active in product(["BUYER", "SELLER", "COURIER", "INSPECTOR", "ADMIN", "ANON"], [False, True]):
        assert not proof_read_allowed(role=role, active=active, leg=leg)


@pytest.mark.parametrize("body", [[], [1, 1], [1, 2, 3, 4], [True], ["1"], [0], [-1]])
def test_selected_proofs_are_strict_bounded_distinct_ids(body):
    with pytest.raises(ValidationError):
        ConfirmDeliveryRequest(proof_ids=body)


def test_selected_ids_and_case_refs_have_canonical_replay_order():
    assert ConfirmDeliveryRequest(proof_ids=[3, 1, 2]).model_dump() == {"proof_ids": [1, 2, 3]}
    assert ResolveDeliveryRequest(resolution="REFUND", reason="  Report confirms missing parcel  ",
                                  evidence_refs=["delivery-proof:21", "delivery-report:42"]).model_dump() == {
        "resolution": "REFUND", "reason": "Report confirms missing parcel",
        "evidence_refs": ["delivery-proof:21", "delivery-report:42"]}


@pytest.mark.parametrize("reference", ["https://example.test/photo", "private/key.jpg", "delivery-report:0", "delivery-report:-1"])
def test_arbitrary_evidence_references_rejected(reference):
    with pytest.raises(ValidationError):
        ResolveDeliveryRequest(resolution="REFUND", reason="Valid admin reason", evidence_refs=[reference])


@pytest.mark.parametrize("model,body", [
    (FulfillmentRequest, {"carrier": "Demo", "tracking_number": "42"}),
    (ConfirmDeliveryRequest, {"proof_ids": [21]}), (ConfirmReceiptRequest, {}),
    (ReportNotReceivedRequest, {"reason": "Parcel has not arrived"}),
    (DeliveryReviewRequest, {"reason": "Review missing parcel"}),
    (ResolveDeliveryRequest, {"resolution": "REFUND", "reason": "Valid admin reason", "evidence_refs": ["delivery-report:42"]}),
])
def test_commands_forbid_client_money_state_party_destination_and_time(model, body):
    for field in ["amount", "recipient_id", "buyer_id", "seller_id", "status", "leg", "destination", "confirmed_at"]:
        with pytest.raises(ValidationError):
            model.model_validate(body | {field: "forbidden"})


@pytest.mark.parametrize("model", [ReportNotReceivedRequest, DeliveryReviewRequest])
@pytest.mark.parametrize("reason", ["  short  ", " " * 50, "x" * 1001, 123])
def test_reason_is_required_trimmed_text(model, reason):
    with pytest.raises(ValidationError):
        model(reason=reason)
