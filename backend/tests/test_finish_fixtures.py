"""Check synthetic downstream examples conserve amounts and redact seller views."""

from datetime import datetime
from decimal import Decimal
import json
from pathlib import Path

from app.services.finish_policy import receipt_deadline


FIXTURES = json.loads((Path(__file__).resolve().parents[1] / "test-data" / "finish-contract.v1.json").read_text(encoding="utf-8"))


def test_examples_are_explicitly_not_api_or_review_eligibility_evidence():
    assert FIXTURES["fixture_status"] == "CONTRACT_ONLY_NOT_LIVE"
    assert FIXTURES["upstream_integration"] == "PENDING_PACKAGE_A_TASK02"
    returned = FIXTURES["return_delivery_refund_pending"]
    assert (returned["order_status"], returned["settlement_status"], returned["settlement"]) == (
        "RETURNED_TO_SELLER", "HELD", None)


def test_example_deadline_origin_and_money_conservation():
    pending = FIXTURES["buyer_pending_delivery"]
    confirmed = datetime.fromisoformat(pending["shipments"][0]["courier_delivered_at"])
    assert receipt_deadline(confirmed) == datetime.fromisoformat(pending["receipt_deadline_at"])
    for kind, values in FIXTURES["allocations"].items():
        amounts = {key: Decimal(value) for key, value in values.items()}
        assert amounts.pop("held_amount") == sum(amounts.values())
        assert values["seller_payout"] == ("1140.00" if kind == "RELEASE" else "0.00")


def test_seller_examples_do_not_expose_buyer_address_or_proof():
    progress = FIXTURES["seller_buyer_delivery_progress"]
    assert progress["shipments"][0]["proofs"] == []
    assert not progress["can_confirm_receipt"] and not progress["can_report_missing"]
    for key in ("seller_buyer_delivery_progress", "seller_release_summary", "seller_refund_summary"):
        encoded = json.dumps(FIXTURES[key])
        for private_field in ("object_key", "recipient_name", "phone", "address_line", "evidence_refs", "admin_reason"):
            assert private_field not in encoded
    assert "amount" not in FIXTURES["seller_release_summary"]
    assert FIXTURES["seller_refund_summary"]["seller_payout"] == "0.00"
