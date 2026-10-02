"""PR124 regressions through real HTTP and independent localhost PG processes."""
import json
import os
from pathlib import Path
import subprocess
import sys

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.main import app
from app.models.fulfillment import FulfillmentCommand, OrderSettlement
from app.models.order import Order
from app.models.shipment import ShipmentDeliveryProof
from app.services.lifecycle_progress import scan_cursor
from app.services.order_settlement import settlement_service
from tests.test_finish_flow_postgres import (
    pg_engine, isolate_rows, world, dispatch, delivered, scan, post,
    completed_work, create_product, request_headers, assert_terminal,
)

pytestmark = pytest.mark.skipif(not os.getenv("FINISH_TEST_DATABASE_URL"),
                               reason="owned FINISH_TEST_DATABASE_URL required")


def next_world(world, order_id):
    with Session(world[1]) as db:
        product = create_product(db, db.get(Order, order_id).seller_id)
    return (*world[:6], product, *world[7:])


def business_snapshot(world):
    # These fixed table names contain the business/audit facts the requests may
    # otherwise mutate. Do not just test a single status or response flag.
    tables = ("orders", "shipments", "payments", "receipts", "escrows",
              "fulfillment_commands", "order_status_history", "inspection_idempotency")
    with world[1].connect() as db:
        return {table: db.execute(text(f"SELECT to_jsonb(t) FROM {table} t ORDER BY id")).scalars().all()
                for table in tables}


@pytest.mark.parametrize("result,decision,leg,status", [
    ("PASS", "CONFIRM", "TO_BUYER", "SHIPPING_TO_BUYER"),
    ("FAKE", None, "TO_SELLER", "RESULT_NOTIFIED"),
])
def test_admin_discovers_and_assigns_final_leg_using_only_admin_reads(world, result, decision, leg, status):
    dispatch(world, result, decision)  # Deliberately discard Inspector IDs.
    client, admin = world[0], world[9]
    page = client.get(f"/admin/orders?status={status}", headers=admin)
    assert page.status_code == 200, page.text
    assert len(page.json()["items"]) == 1
    order_id = page.json()["items"][0]["id"]
    detail = client.get(f"/admin/orders/{order_id}", headers=admin)
    assert detail.status_code == 200, detail.text
    shipments = detail.json()["shipments"]
    assert {row["leg"] for row in shipments} == {"TO_CENTER", leg}
    assert all(set(row) == {"id", "leg", "status", "courier_id"} for row in shipments)
    final = next(row for row in shipments if row["leg"] == leg)
    assert final["status"] == "IN_TRANSIT" and final["courier_id"] is None
    for actor in (world[2], world[3], world[4], world[8]):
        assert client.get(f"/admin/orders/{order_id}", headers=actor).status_code == 403
    # The legacy Order alias still targets the already delivered inbound leg.
    inbound = post(world, f"/admin/orders/{order_id}/assign-courier", admin, {"courier_id": world[7]})
    assert inbound.status_code == 409 and inbound.json()["detail"]["code"] == "assignment_locked"
    assigned = post(world, f"/admin/shipments/{final['id']}/assign-courier", admin, {"courier_id": world[7]})
    assert assigned.status_code == 200 and assigned.json()["shipment_id"] == final["id"]
    updated = client.get(f"/admin/orders/{order_id}", headers=admin).json()
    assert next(row for row in updated["shipments"] if row["id"] == final["id"])["courier_id"] == world[7]
    assert client.get(f"/courier/shipments/{final['id']}", headers=world[8]).status_code == 200


@pytest.mark.parametrize("field", ["reason", "carrier", "tracking_number"])
@pytest.mark.parametrize("invalid", ["\ud800", "\udfff", "\x00"])
def test_invalid_unicode_is_422_without_business_writes(world, field, invalid):
    if field == "reason":
        order_id, _, _, _ = delivered(world)
        url, actor = f"/orders/{order_id}/report-not-received", world[2]
        body = {"reason": f"Missing parcel {invalid} please investigate"}
    else:
        order_id, _, _ = completed_work(world)
        assert world[0].post(f"/orders/{order_id}/inspection/decision", json={"decision": "CONFIRM"}, headers=world[2]).status_code == 200
        url, actor = f"/orders/{order_id}/fulfillment", world[4]
        body = {"carrier": "Demo", "tracking_number": "B-final", field: f"Parcel {invalid} demo"}
    before = business_snapshot(world)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(url, content=json.dumps(body),
            headers={**request_headers(actor), "Content-Type": "application/json"})
    assert response.status_code == 422, response.text
    errors = response.json()["detail"]
    assert any(error["loc"] == ["body", field] for error in errors)
    assert all("input" not in error for error in errors)
    assert business_snapshot(world) == before


def test_surrogate_in_unknown_field_location_returns_safe_422(world):
    order_id, _, _, _ = delivered(world)
    before = business_snapshot(world)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(f"/orders/{order_id}/report-not-received",
            content=json.dumps({"reason": "Parcel is missing please investigate", "bad\ud800": "x"}),
            headers={**request_headers(world[2]), "Content-Type": "application/json"})
    assert response.status_code == 422 and response.json()["detail"]
    assert business_snapshot(world) == before


def test_valid_thai_and_emoji_are_preserved(world):
    order_id, _, _ = completed_work(world)
    assert world[0].post(f"/orders/{order_id}/inspection/decision", json={"decision": "CONFIRM"}, headers=world[2]).status_code == 200
    carrier, tracking = "ขนส่งทดสอบ 🚚", "พัสดุ-ทดสอบ-📦"
    dispatched = post(world, f"/orders/{order_id}/fulfillment", world[4],
                      {"carrier": carrier, "tracking_number": tracking})
    assert dispatched.status_code == 201, dispatched.text
    from tests.test_finish_flow_postgres import proofs
    shipment_id = dispatched.json()["shipment"]["id"]
    proof_ids = proofs(world, shipment_id)
    assert post(world, f"/courier/shipments/{shipment_id}/confirm-delivery", world[8], {"proof_ids": proof_ids}).status_code == 200
    reason = "ยังไม่ได้รับพัสดุ กรุณาตรวจสอบการจัดส่ง 📦"
    assert post(world, f"/orders/{order_id}/report-not-received", world[2], {"reason": reason}).status_code == 200
    from app.models.shipment import Shipment
    with Session(world[1]) as db:
        shipment = db.get(Shipment, shipment_id)
        assert (shipment.carrier, shipment.tracking_number) == (carrier, tracking)
        assert db.get(Order, order_id).missing_report_reason == reason


@pytest.mark.parametrize("outcome", ["RETURN_REFUND", "ADMIN_REFUND", "RELEASE"])
def test_admin_payment_projection_matches_buyer_and_preserves_charge(world, outcome):
    if outcome == "RETURN_REFUND":
        order_id, _ = dispatch(world, "FAKE", None)
    else:
        order_id, _ = dispatch(world)
    from tests.test_finish_flow_postgres import proofs
    # Read identifiers through the Admin API, as an actual Admin would.
    detail = world[0].get(f"/admin/orders/{order_id}", headers=world[9]).json()
    shipment_id = next(row["id"] for row in detail["shipments"] if row["leg"] != "TO_CENTER")
    before = world[0].get(f"/orders/{order_id}/receipt", headers=world[2]).json()
    paid_at = detail["paid_at"]
    with world[1].connect() as db:
        payment = db.execute(text("SELECT to_jsonb(p) FROM payments p WHERE order_id=:id"), {"id": order_id}).scalar_one()
    ids = proofs(world, shipment_id)
    assert post(world, f"/courier/shipments/{shipment_id}/confirm-delivery", world[8], {"proof_ids": ids}).status_code == 200
    if outcome == "RELEASE":
        assert post(world, f"/orders/{order_id}/confirm-receipt", world[2], {}).status_code == 200
    elif outcome == "ADMIN_REFUND":
        report = post(world, f"/orders/{order_id}/report-not-received", world[2], {"reason": "Parcel missing at destination"})
        assert report.status_code == 200
        assert post(world, f"/admin/orders/{order_id}/delivery-review", world[9], {"reason": "Review missing parcel evidence"}).status_code == 200
        assert post(world, f"/admin/orders/{order_id}/resolve-delivery", world[9], {
            "resolution": "REFUND", "reason": "Reviewed missing parcel evidence",
            "evidence_refs": [f"delivery-report:{report.json()['report_id']}"]}).status_code == 200
    expected = "PAID" if outcome == "RELEASE" else "REFUNDED"
    buyer = world[0].get(f"/orders/{order_id}", headers=world[2]).json()
    admin = world[0].get(f"/admin/orders/{order_id}", headers=world[9]).json()
    item = next(item for item in world[0].get("/admin/orders", headers=world[9]).json()["items"] if item["id"] == order_id)
    assert buyer["payment_status"] == admin["payment_status"] == item["payment_status"] == expected
    assert admin["status"] == item["status"] == buyer["status"]
    assert admin["paid_at"] == item["paid_at"] == paid_at
    assert world[0].get(f"/orders/{order_id}/receipt", headers=world[2]).json() == before
    with world[1].connect() as db:
        assert db.execute(text("SELECT to_jsonb(p) FROM payments p WHERE order_id=:id"), {"id": order_id}).scalar_one() == payment


def test_failing_first_candidate_rotates_and_recovers_with_bounded_scans(world):
    first, _, first_ids, _ = delivered(world)
    second, _, _, _ = delivered(next_world(world, first))
    with Session(world[1]) as db:
        due = max(db.get(Order, first).receipt_deadline_at, db.get(Order, second).receipt_deadline_at)
        proof = db.get(ShipmentDeliveryProof, first_ids[0])
        path = Path(os.environ["INSPECT_PRIVATE_STORAGE_DIR"]) / proof.object_key
    original = path.read_bytes()
    path.write_bytes(b"damaged local synthetic proof")
    options = dict(apply=True, clock=lambda: due, batch_size=1, max_batches=1)
    first_run = scan(world, **options)
    assert first_run.jobs["receipt_release"].failed == 1
    second_run = scan(world, **options)
    assert second_run.jobs["receipt_release"].applied == 1
    assert_terminal(world, second, "RELEASE")
    with Session(world[1]) as db:
        assert db.get(Order, first).status == "DELIVERED_PENDING_BUYER"
        commands = db.scalar(select(func.count()).select_from(FulfillmentCommand))
    # Dry-run uses next position but must not allocate any journal rows.
    assert scan(world, **{**options, "apply": False}).jobs["receipt_release"].failed == 1
    with Session(world[1]) as db:
        assert db.scalar(select(func.count()).select_from(FulfillmentCommand)) == commands
    third_run = scan(world, **options)
    assert third_run.jobs["receipt_release"].failed == 1
    path.write_bytes(original)
    recovered = scan(world, **options)
    assert recovered.jobs["receipt_release"].applied == 1
    assert_terminal(world, first, "RELEASE")
    for run in (first_run, second_run, third_run, recovered):
        assert all(job.scanned <= 1 and job.batches <= 1 for job in run.jobs.values())


def test_cursor_lock_skips_competing_scan_without_moving_progress(world):
    first, _, _, _ = delivered(world)
    with Session(world[1]) as db:
        due = db.get(Order, first).receipt_deadline_at
    factory = lambda: Session(world[1], autoflush=False)
    with scan_cursor(factory, 1, apply=True) as progress:
        assert progress.last_order_id == 0
        run = scan(world, apply=True, clock=lambda: due, batch_size=1, max_batches=1)
        assert run.jobs["receipt_release"].scanned == 0
        assert progress.last_order_id == 0
    assert scan(world, apply=True, clock=lambda: due, batch_size=1, max_batches=1).jobs["receipt_release"].applied == 1
    assert_terminal(world, first, "RELEASE")


def test_bounded_fairness_survives_fresh_cli_processes_and_storage_recovery(world, monkeypatch):
    settle = settlement_service.settle
    def unavailable(*args, **kwargs):
        raise RuntimeError("synthetic refund outage")
    monkeypatch.setattr(settlement_service, "settle", unavailable)
    first, _, ids, _ = delivered(world, "FAKE", None)
    second, _, _, _ = delivered(next_world(world, first), "NOT_AS_DESCRIBED", None)
    monkeypatch.setattr(settlement_service, "settle", settle)
    with Session(world[1]) as db:
        proof = db.get(ShipmentDeliveryProof, ids[0])
        path = Path(os.environ["INSPECT_PRIVATE_STORAGE_DIR"]) / proof.object_key
    original = path.read_bytes()
    path.write_bytes(b"damaged local synthetic proof")
    url = world[1].url.render_as_string(hide_password=False)
    target = make_url(url).database
    env = {**os.environ, "PR124_LIFECYCLE_TEST_URL": url}
    command = [sys.executable, "-m", "scripts.run_lifecycle_jobs", "--url-env", "PR124_LIFECYCLE_TEST_URL",
               "--target", target, "--environment", "local", "--apply", "--confirm-target", target,
               "--batch-size", "1", "--max-batches", "1"]
    def invoke():
        result = subprocess.run(command, cwd=Path(__file__).resolve().parents[1], env=env,
                                capture_output=True, text=True, timeout=25)
        assert url not in result.stdout + result.stderr
        summary = next(line.split("lifecycle scan ", 1)[1] for line in result.stderr.splitlines() if "lifecycle scan " in line)
        job = json.loads(summary)["jobs"]["return_refund"]
        assert job["scanned"] <= 1 and job["batches"] <= 1
        return result.returncode, job
    code, first_job = invoke()
    assert code == 1 and first_job["failed"] == 1
    code, healthy_job = invoke()
    assert code == 0 and healthy_job["applied"] == 1
    assert_terminal(world, second, "REFUND")
    code, retried_job = invoke()
    assert code == 1 and retried_job["failed"] == 1
    path.write_bytes(original)
    code, recovered_job = invoke()
    assert code == 0 and recovered_job["applied"] == 1
    assert_terminal(world, first, "REFUND")
    with Session(world[1]) as db:
        checkpoints = list(db.scalars(select(FulfillmentCommand).where(
            FulfillmentCommand.resource_type == "LIFECYCLE_JOB", FulfillmentCommand.resource_id == 3)))
        assert [row.result["last_order_id"] for row in checkpoints] == [first, second, first, first]
        assert db.scalar(select(func.count()).select_from(OrderSettlement)) == 2
