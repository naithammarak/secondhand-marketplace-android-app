"""Actual FINISH HTTP/transactions against an empty owned PostgreSQL DB."""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from threading import Event
import time
import subprocess
import sys

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.fulfillment import DeliveryEvidenceAccess, DeliveryResolution, FulfillmentCommand, OrderSettlement, ShipmentConfirmedProof, OrderStatusHistory
from app.models.order import Order, Escrow, Payment, Receipt
from app.models.product import Product
from app.models.shipment import Shipment, ShipmentDeliveryProof
from app.models.user import User, UserRole, UserStatus
from app.services import inspection_storage
from app.services.order_settlement import settlement_service
from app.services.transaction_clock import database_now
from tests.order_helpers import new_key, VALID_ADDRESS, create_user, create_product, order_body
from tests.test_inspection_flow_postgres import world, completed_work, started_work, request_headers, image_bytes

URL = os.getenv("FINISH_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="owned FINISH_TEST_DATABASE_URL required")


@pytest.fixture(scope="module")
def pg_engine():
    parsed = make_url(URL)
    if parsed.get_backend_name() != "postgresql" or parsed.host not in {"127.0.0.1", "localhost", "::1"} or "test" not in parsed.database or URL == os.getenv("DATABASE_URL"):
        pytest.fail("FINISH database must be a separate owned local test database")
    engine = create_engine(URL)
    with engine.connect() as connection:
        if inspect(connection).get_table_names():
            pytest.fail("FINISH_TEST_DATABASE_URL must be empty")
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    old = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = URL
    try:
        command.upgrade(config, "head")
    finally:
        if old is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = old
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def isolate_rows(pg_engine):
    # Only the newly-created, empty, local database validated by pg_engine.
    # Preserve migrations; avoid mixing previous tests' private Storage roots.
    with pg_engine.begin() as connection:
        names = [name for name in inspect(connection).get_table_names() if name != "alembic_version"]
        quoted = ", ".join(connection.dialect.identifier_preparer.quote(name) for name in names)
        connection.execute(text(f"TRUNCATE {quoted} RESTART IDENTITY CASCADE"))


def post(world, url, actor, body, key=None):
    return world[0].post(url, json=body, headers={**actor, "Idempotency-Key": key or new_key()})


def dispatch(world, result="PASS", decision="CONFIRM"):
    client, engine, buyer, seller, inspector, other, product, courier_id, courier, admin = world
    order_id, work_id, _ = completed_work(world, result)
    if result in {"PASS", "MINOR_ISSUE"} and decision:
        answer = client.post(f"/orders/{order_id}/inspection/decision", json={"decision": decision}, headers=buyer)
        assert answer.status_code == 200, answer.text
    detail = client.get(f"/inspections/{work_id}", headers=inspector).json()
    assert detail["can_create_fulfillment"] == (result not in {"PASS", "MINOR_ISSUE"} or decision is not None)
    response = post(world, f"/orders/{order_id}/fulfillment", inspector,
                    {"carrier": "Demo", "tracking_number": "B-final"})
    if response.status_code == 201:
        detail = client.get(f"/inspections/{work_id}", headers=inspector).json()
        assert detail["can_create_fulfillment"] is False
        assert detail["fulfillment"]["id"] == response.json()["shipment"]["id"]
    return order_id, response


def proofs(world, shipment_id, count=1):
    client, engine, buyer, seller, inspector, other, product, courier_id, courier, admin = world
    assigned = post(world, f"/admin/shipments/{shipment_id}/assign-courier", admin, {"courier_id": courier_id})
    assert assigned.status_code == 200, assigned.text
    ids = []
    for i in range(count):
        uploaded = client.post(f"/courier/shipments/{shipment_id}/proofs",
            files={"file": ("photo.png", image_bytes(), "image/png")}, headers=request_headers(courier))
        assert uploaded.status_code == 201, uploaded.text
        ids.append(uploaded.json()["proof"]["id"])
    return ids


def delivered(world, result="PASS", decision="CONFIRM", count=1):
    order_id, response = dispatch(world, result, decision)
    assert response.status_code == 201, response.text
    shipment_id = response.json()["shipment"]["id"]
    ids = proofs(world, shipment_id, count)
    confirmed = post(world, f"/courier/shipments/{shipment_id}/confirm-delivery", world[8], {"proof_ids": ids})
    assert confirmed.status_code == 200, confirmed.text
    return order_id, shipment_id, ids, confirmed


def assert_terminal(world, order_id, kind):
    with Session(world[1]) as db:
        order = db.get(Order, order_id)
        escrow = db.scalar(select(Escrow).where(Escrow.order_id == order_id))
        rows = db.scalars(select(OrderSettlement).where(OrderSettlement.order_id == order_id)).all()
        assert len(rows) == 1
        row = rows[0]
        assert row.kind == kind and row.held_amount == Decimal("1350.00")
        assert order.status == ("COMPLETED" if kind == "RELEASE" else "REFUNDED")
        assert escrow.status == ("RELEASED" if kind == "RELEASE" else "REFUNDED")
        assert db.get(Product, order.product_id).status == ("SOLD" if kind == "RELEASE" else "CANCELLED")
        if kind == "RELEASE":
            assert (row.seller_payout, row.commission_amount, row.inspection_amount, row.shipping_amount, row.buyer_refund) == tuple(map(Decimal, ["1140", "60", "100", "50", "0"]))
        else:
            assert row.buyer_refund == Decimal("1350")
            assert row.seller_payout == row.commission_amount == row.inspection_amount == row.shipping_amount == 0


@pytest.mark.parametrize("result,decision,leg", [
    ("PASS", "CONFIRM", "TO_BUYER"), ("MINOR_ISSUE", "CONFIRM", "TO_BUYER"),
    ("PASS", "REJECT", "TO_SELLER"), ("MINOR_ISSUE", "REJECT", "TO_SELLER"),
    ("FAKE", None, "TO_SELLER"), ("NOT_AS_DESCRIBED", None, "TO_SELLER")])
def test_actual_sale_and_each_return_preserve_charge_and_destinations(world, result, decision, leg):
    order_id, shipment_id, ids, confirmed = delivered(world, result, decision, count=3)
    client, engine, buyer, seller, inspector, _, _, _, courier, _ = world
    original = client.get(f"/orders/{order_id}/receipt", headers=buyer).json()
    with Session(engine) as db:
        order, shipment = db.get(Order, order_id), db.get(Shipment, shipment_id)
        assert shipment.leg == leg
        assert db.scalar(select(func.count()).select_from(Shipment).where(Shipment.order_id == order_id, Shipment.leg != "TO_CENTER")) == 1
        assert db.scalar(select(func.count()).select_from(ShipmentConfirmedProof).where(ShipmentConfirmedProof.shipment_id == shipment_id)) == 3
        if leg == "TO_BUYER":
            assert order.receipt_deadline_at == shipment.courier_delivered_at + timedelta(hours=72)
            assert shipment.destination_address["recipient_name"] == order.ship_recipient_name
        else:
            assert shipment.destination_address == order.return_address
    if leg == "TO_BUYER":
        view = client.get(f"/orders/{order_id}/delivery", headers=buyer).json()
        assert view["can_confirm_receipt"] is True
        receipt = post(world, f"/orders/{order_id}/confirm-receipt", buyer, {})
        assert receipt.status_code == 200, receipt.text
    assert_terminal(world, order_id, "RELEASE" if leg == "TO_BUYER" else "REFUND")
    assert client.get(f"/orders/{order_id}/receipt", headers=buyer).json() == original
    assert client.put(f"/orders/{order_id}/return-address", json={**VALID_ADDRESS, "recipient_name": "Changed"}, headers=request_headers(seller)).status_code == 409


@pytest.mark.parametrize("bad", [None, {}, {"proof_ids": []}, {"proof_ids": [1,1]}, {"proof_ids": [True]}, {"proof_ids": ["1"]}, {"proof_ids": [1,2,3,4]}, {"proof_ids": [1], "leg": "TO_SELLER"}])
def test_strict_selector_on_existing_route(world, bad):
    order_id, response = dispatch(world)
    shipment_id = response.json()["shipment"]["id"]
    ids = proofs(world, shipment_id)
    response = post(world, f"/courier/shipments/{shipment_id}/confirm-delivery", world[8], bad)
    assert response.status_code == 422, response.text
    with Session(world[1]) as db:
        assert db.get(Shipment, shipment_id).courier_delivered_at is None
        assert db.get(Order, order_id).receipt_deadline_at is None


def test_selected_only_canonical_replay_key_mismatch_and_private_matrix(world):
    order_id, response = dispatch(world)
    shipment_id = response.json()["shipment"]["id"]
    ids = proofs(world, shipment_id, 3)
    client, engine, buyer, seller, inspector, other, _, _, courier, admin = world
    url = f"/courier/shipments/{shipment_id}/confirm-delivery"
    key = new_key()
    first = post(world, url, courier, {"proof_ids": [ids[2], ids[0]]}, key)
    same = post(world, url, courier, {"proof_ids": [ids[0], ids[2]]}, key)
    assert first.status_code == same.status_code == 200
    assert same.json() == first.json() and same.headers["Idempotent-Replayed"] == "true"
    assert post(world, url, courier, {"proof_ids": ids}, key).status_code == 409
    with Session(engine) as db:
        assert len(db.scalars(select(ShipmentConfirmedProof).where(ShipmentConfirmedProof.shipment_id == shipment_id)).all()) == 2
    for actor, expected in [(buyer,200),(seller,404),(inspector,200),(courier,200),(other,404),(admin,404)]:
        response = client.get(f"/shipment-delivery-proofs/{ids[0]}", headers=actor)
        assert response.status_code == expected
        assert response.headers["cache-control"] == "no-store"
    seller_view = client.get(f"/orders/{order_id}/delivery", headers=seller)
    assert "object_key" not in seller_view.text and "destination_address" not in seller_view.text
    assert next(s for s in seller_view.json()["shipments"] if s["leg"] == "TO_BUYER")["proofs"] == []
    assert client.get(f"/orders/{order_id}", headers=seller).json()["shipping_address"] is None
    assert client.get(f"/courier/shipments/{shipment_id}", headers=courier).json()["destination_address"] is None
    assert client.get(f"/orders/{order_id}/delivery", headers=other).status_code == 404
    assert client.get(f"/courier/shipments/{shipment_id}", headers=other).status_code == 403


def test_no_decision_cannot_dispatch_and_inspection_acceptance_is_not_receipt(world):
    order_id, response = dispatch(world, decision=None)
    assert response.status_code == 409
    assert post(world, f"/orders/{order_id}/confirm-receipt", world[2], {}).status_code == 409


def test_dispatch_race_and_duplicate_receipt(world):
    client, engine, buyer, _, inspector, *_ = world
    order_id, _, _ = completed_work(world)
    assert client.post(f"/orders/{order_id}/inspection/decision", json={"decision":"CONFIRM"}, headers=buyer).status_code == 200
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda _: post(world, f"/orders/{order_id}/fulfillment", inspector,
            {"carrier":"Demo", "tracking_number":"race"}), range(2)))
    assert sorted(r.status_code for r in responses) == [201,409]
    shipment_id = next(r for r in responses if r.status_code == 201).json()["shipment"]["id"]
    ids = proofs(world, shipment_id)
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda _: post(world, f"/courier/shipments/{shipment_id}/confirm-delivery", world[8], {"proof_ids":ids}), range(2)))
    assert sorted(r.status_code for r in responses) == [200,409]
    key = new_key()
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda _: post(world, f"/orders/{order_id}/confirm-receipt", buyer, {}, key), range(2)))
    assert [r.status_code for r in responses] == [200,200]
    assert sum(r.headers.get("Idempotent-Replayed") == "true" for r in responses) == 1
    assert_terminal(world, order_id, "RELEASE")


@pytest.mark.parametrize("kind", ["RELEASE", "REFUND"])
def test_timely_report_scoped_audit_resolution_replay_and_charge(world, kind):
    order_id, shipment_id, ids, _ = delivered(world)
    client, engine, buyer, seller, inspector, other, _, _, courier, admin = world
    original = client.get(f"/orders/{order_id}/receipt", headers=buyer).json()
    report = post(world, f"/orders/{order_id}/report-not-received", buyer, {"reason":"Parcel has not arrived"})
    assert report.status_code == 200, report.text
    refs = [f"delivery-report:{report.json()['report_id']}"]
    payload = {"resolution":kind,"reason":"Review confirms appropriate resolution","evidence_refs":refs}
    assert post(world, f"/admin/orders/{order_id}/resolve-delivery", admin, payload).status_code == 409
    review = post(world, f"/admin/orders/{order_id}/delivery-review", admin, {"reason":"Review missing parcel evidence"})
    assert review.status_code == 200, review.text
    private_url = review.json()["proofs"][-1]["url"]
    assert client.get(private_url, headers=admin).status_code == 200
    assert client.get(private_url, headers=other).status_code == 403
    assert post(world, f"/admin/orders/{order_id}/resolve-delivery", admin,
        {**payload,"evidence_refs":["delivery-report:999999"]}).status_code == 422
    key = new_key()
    result = post(world, f"/admin/orders/{order_id}/resolve-delivery", admin, payload, key)
    assert result.status_code == 200, result.text
    repeated = post(world, f"/admin/orders/{order_id}/resolve-delivery", admin, payload, key)
    assert repeated.json() == result.json() and repeated.headers["Idempotent-Replayed"] == "true"
    assert post(world, f"/admin/orders/{order_id}/resolve-delivery", admin,
        {**payload,"resolution":"REFUND" if kind == "RELEASE" else "RELEASE"}, key).status_code == 409
    assert_terminal(world, order_id, kind)
    assert client.get(f"/orders/{order_id}/receipt", headers=buyer).json() == original
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(DeliveryResolution).where(DeliveryResolution.order_id == order_id)) == 1


def test_return_delivery_survives_refund_failure_and_can_retry(world, monkeypatch):
    original = settlement_service.settle
    monkeypatch.setattr(settlement_service, "settle", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("injected")))
    order_id, shipment_id, ids, response = delivered(world, "FAKE", None)
    assert response.json()["settlement_status"] == "HELD"
    with Session(world[1]) as db:
        assert db.get(Order, order_id).status == "RETURNED_TO_SELLER"
        assert db.get(Shipment, shipment_id).courier_delivered_at is not None
        assert db.scalar(select(OrderSettlement).where(OrderSettlement.order_id == order_id)) is None
    monkeypatch.setattr(settlement_service, "settle", original)
    from app.services.order_settlement import attempt_return_refund
    assert attempt_return_refund(world[1], order_id)
    assert attempt_return_refund(world[1], order_id)
    assert_terminal(world, order_id, "REFUND")


def test_storage_failure_blocks_confirmation_and_receipt_until_recovery(world, monkeypatch):
    order_id, response = dispatch(world)
    shipment_id = response.json()["shipment"]["id"]
    ids = proofs(world, shipment_id)
    original = inspection_storage.download_object
    monkeypatch.setattr(inspection_storage, "download_object", lambda _: b"corrupt")
    confirm_url = f"/courier/shipments/{shipment_id}/confirm-delivery"
    assert post(world, confirm_url, world[8], {"proof_ids":ids}).status_code == 503
    monkeypatch.setattr(inspection_storage, "download_object", original)
    assert post(world, confirm_url, world[8], {"proof_ids":ids}).status_code == 200
    monkeypatch.setattr(inspection_storage, "download_object", lambda _: b"corrupt")
    key = new_key()
    assert post(world, f"/orders/{order_id}/confirm-receipt", world[2], {}, key).status_code == 503
    with Session(world[1]) as db:
        assert db.get(Order, order_id).receipt_confirmed_at is None
    monkeypatch.setattr(inspection_storage, "download_object", original)
    assert post(world, f"/orders/{order_id}/confirm-receipt", world[2], {}, key).status_code == 200
    assert_terminal(world, order_id, "RELEASE")


def test_admin_opposing_outcomes_have_one_winner_on_independent_connections(world):
    order_id, _, _, _ = delivered(world)
    report = post(world, f"/orders/{order_id}/report-not-received", world[2], {"reason":"Parcel missing at destination"})
    assert report.status_code == 200
    assert post(world, f"/admin/orders/{order_id}/delivery-review", world[9], {"reason":"Review missing parcel evidence"}).status_code == 200
    def resolve(kind):
        return post(world, f"/admin/orders/{order_id}/resolve-delivery", world[9], {
            "resolution":kind, "reason":"Reviewed case and evidence details",
            "evidence_refs":[f"delivery-report:{report.json()['report_id']}"]})
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(resolve, ["RELEASE", "REFUND"]))
    assert sorted(r.status_code for r in results) == [200,409], [r.text for r in results]
    assert_terminal(world, order_id, next(r for r in results if r.status_code == 200).json()["settlement"]["kind"])


def test_settlement_history_failure_rolls_every_fact_back(world, monkeypatch):
    order_id, _, _, _ = delivered(world)
    from app.services import finish_core
    original = finish_core.history
    monkeypatch.setattr(finish_core, "history", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("injected history failure")))
    with Session(world[1]) as db:
        buyer_id = db.get(Order, order_id).buyer_id
        with pytest.raises(RuntimeError):
            settlement_service.settle(db, order_id=order_id, kind="RELEASE", source="BUYER_RECEIPT",
                reason="RECEIPT_CONFIRMED", actor_id=buyer_id, idempotency_key="rollback-receipt-01")
        db.rollback()
        assert db.get(Order, order_id).receipt_confirmed_at is None
        assert db.scalar(select(OrderSettlement.id).where(OrderSettlement.order_id == order_id)) is None
        assert db.scalar(select(Escrow.status).where(Escrow.order_id == order_id)) == "HELD"
    monkeypatch.setattr(finish_core, "history", original)
    assert post(world, f"/orders/{order_id}/confirm-receipt", world[2], {}, "rollback-receipt-01").status_code == 200


def test_seller_as_buyer_and_inactive_replay_authority(world):
    order_id, _, _, _ = delivered(world)
    with Session(world[1]) as db:
        buyer_id = db.get(Order, order_id).buyer_id
        db.get(User, buyer_id).role = UserRole.SELLER
        db.commit()
    key = new_key()
    assert post(world, f"/orders/{order_id}/confirm-receipt", world[2], {}, key).status_code == 200
    with Session(world[1]) as db:
        db.get(User, buyer_id).status = UserStatus.SUSPENDED
        db.commit()
    assert post(world, f"/orders/{order_id}/confirm-receipt", world[2], {}, key).status_code == 403


def paid_unshipped(world):
    created = post(world, "/orders", world[2], order_body(world[6]))
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    paid = post(world, f"/orders/{order_id}/payments/simulate", world[2], {"outcome":"SUCCESS"})
    assert paid.status_code == 200, paid.text
    return order_id


def scan(world, **options):
    from app.services.lifecycle_worker import run_once
    return run_once(lambda: Session(world[1], autoflush=False), **options)


@pytest.mark.parametrize("delta", [-1, 0, 1])
def test_receipt_report_auto_exact_boundary(world, monkeypatch, delta):
    order_id, _, _, _ = delivered(world)
    with Session(world[1]) as db:
        order = db.get(Order, order_id)
        boundary = order.receipt_deadline_at
        buyer_id = order.buyer_id
    sample = boundary + timedelta(microseconds=delta)
    # Same isolated server clock is used by Buyer writes and the worker service.
    import app.services.order_settlement as module
    import app.api.finish as finish_api
    monkeypatch.setattr(module, "database_now", lambda db: sample)
    monkeypatch.setattr(finish_api, "database_now", lambda db: sample)
    if delta < 0:
        # Dry-run performs all release validation and leaves no fact behind.
        with Session(world[1]) as db:
            result = settlement_service.settle(db, order_id=order_id, kind="RELEASE", source="BUYER_RECEIPT",
                reason="RECEIPT_CONFIRMED", actor_id=buyer_id, idempotency_key=new_key(), dry_run=True)
            assert result.result["eligible"] is True
        report = post(world, f"/orders/{order_id}/report-not-received", world[2], {"reason":"Parcel has not arrived"})
        assert report.status_code == 200
        run = scan(world, apply=True, clock=lambda: boundary)
        with Session(world[1]) as db:
            assert db.get(Order, order_id).status == "DELIVERY_DISPUTED"
            assert db.scalar(select(OrderSettlement.id).where(OrderSettlement.order_id == order_id)) is None
    else:
        assert post(world, f"/orders/{order_id}/confirm-receipt", world[2], {}).status_code == 409
        assert post(world, f"/orders/{order_id}/report-not-received", world[2], {"reason":"Parcel has not arrived"}).status_code == 409
        run = scan(world, apply=True, clock=lambda: sample)
        assert run.jobs["receipt_release"].applied >= 1
        assert_terminal(world, order_id, "RELEASE")


@pytest.mark.parametrize("delta", [-1, 0, 1])
def test_no_ship_deadline_without_http_and_late_ship_guard(world, monkeypatch, delta):
    order_id = paid_unshipped(world)
    with Session(world[1]) as db:
        paid_at = db.get(Order, order_id).paid_at
    at = paid_at + timedelta(hours=72, microseconds=delta)
    # Separate server guard rejects late shipping even before the scheduler runs.
    if delta >= 0:
        import app.api.inspections as inspect_api
        assert world[0].put(f"/orders/{order_id}/return-address", json=VALID_ADDRESS,
            headers=request_headers(world[3])).status_code == 200
        monkeypatch.setattr(inspect_api, "database_now", lambda db: at)
        assert post(world, f"/orders/{order_id}/ship-to-center", world[3],
            {"carrier":"Demo","tracking_number":"late"}).json()["detail"]["code"] == "seller_shipping_deadline_passed"
    run = scan(world, apply=True, clock=lambda: at)
    with Session(world[1]) as db:
        state = db.get(Order, order_id).status
    assert state == ("WAITING_SELLER_SHIP" if delta < 0 else "REFUNDED")
    if delta >= 0:
        assert_terminal(world, order_id, "REFUND")


def test_all_five_jobs_dry_run_no_http_and_repeated_escalation(world, monkeypatch):
    # Prepare real API journeys; after preparation only the runner touches them.
    engine = world[1]
    original = settlement_service.settle
    monkeypatch.setattr(settlement_service, "settle", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("return crash")))
    returned, _, _, _ = delivered(world, "NOT_AS_DESCRIBED", None)
    monkeypatch.setattr(settlement_service, "settle", original)
    with Session(engine) as db:
        seller_id = db.get(Order, returned).seller_id
    def new_world():
        with Session(engine) as db:
            product = create_product(db, seller_id)
        return (*world[:6], product, *world[7:])
    buyer_delivery, _, _, _ = delivered(new_world(), "MINOR_ISSUE", "CONFIRM")
    noship = paid_unshipped(new_world())
    overdue, inspection_id = started_work(new_world())
    unpaid_world = new_world()
    response = post(unpaid_world, "/orders", world[2], order_body(unpaid_world[6]))
    assert response.status_code == 201
    unpaid = response.json()["id"]
    with Session(engine) as db:
        at = database_now(db) + timedelta(days=10)
        baseline = db.scalar(select(func.count()).select_from(FulfillmentCommand))
    dry = scan(world, clock=lambda: at)
    assert all(dry.jobs[job].eligible >= 1 for job in dry.jobs)
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(FulfillmentCommand)) == baseline
        assert db.get(Order, overdue).inspection_overdue_escalated_at is None
    run = scan(world, apply=True, clock=lambda: at, batch_size=2, max_batches=100)
    assert run.failed == 0
    assert all(run.jobs[job].applied >= 1 for job in run.jobs)
    assert_terminal(world, returned, "REFUND")
    assert_terminal(world, buyer_delivery, "RELEASE")
    assert_terminal(world, noship, "REFUND")
    again = scan(world, apply=True, clock=lambda: at)
    assert sum(j.applied for j in again.jobs.values()) == 0
    with Session(engine) as db:
        assert db.get(Order, unpaid).status == "CANCELLED"
        assert db.get(Order, overdue).status == "INSPECTING"
        from app.models.inspection import Inspection
        assert db.get(Inspection, inspection_id).result is None
        assert db.scalar(select(func.count()).select_from(OrderStatusHistory).where(
            OrderStatusHistory.order_id == overdue, OrderStatusHistory.event == "INSPECTION_OVERDUE")) == 1
    assert any(i["order_id"] == overdue for i in world[0].get("/admin/inspection-overdue", headers=world[9]).json()["items"])


def test_two_runners_outage_and_restart_return_without_reupload(world, monkeypatch):
    original_settle = settlement_service.settle
    monkeypatch.setattr(settlement_service, "settle", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("crash")))
    order_id, shipment_id, ids, _ = delivered(world, "FAKE", None)
    monkeypatch.setattr(settlement_service, "settle", original_settle)
    original_download = inspection_storage.download_object
    monkeypatch.setattr(inspection_storage, "download_object", lambda _: b"invalid")
    failed = scan(world, apply=True, retry_order_id=order_id)
    assert failed.jobs["return_refund"].failed == 1
    with Session(world[1]) as db:
        assert db.get(Order, order_id).status == "RETURNED_TO_SELLER"
    monkeypatch.setattr(inspection_storage, "download_object", original_download)
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: scan(world, apply=True, retry_order_id=order_id), range(2)))
    assert sum(r.jobs["return_refund"].applied for r in results) == 1
    assert sum(r.failed for r in results) == 0
    assert_terminal(world, order_id, "REFUND")
    with Session(world[1]) as db:
        assert len(db.scalars(select(ShipmentConfirmedProof).where(ShipmentConfirmedProof.shipment_id == shipment_id)).all()) == len(ids)


def test_historical_bodyless_replay_keeps_hash_and_proof_bindings(world):
    order_id, work_id = started_work(world)
    from app.models.inspection import InspectionIdempotency
    from app.api.orders import request_fingerprint
    with Session(world[1]) as db:
        shipment = db.scalar(select(Shipment).where(Shipment.order_id == order_id, Shipment.leg == "TO_CENTER"))
        ident, actor_id = shipment.id, shipment.courier_id
        bound = [p.proof_id for p in db.scalars(select(ShipmentConfirmedProof).where(ShipmentConfirmedProof.shipment_id == ident))]
        key = new_key()
        original = {"shipment_id":ident,"historical":True}
        db.add(InspectionIdempotency(order_id=order_id, actor_id=actor_id, operation="courier_confirm",
            idempotency_key=key, request_hash=request_fingerprint({}), response_status=200, response_body=original))
        db.commit()
    url = f"/courier/shipments/{ident}/confirm-delivery"
    response = world[0].post(url, headers={**world[8],"Idempotency-Key":key})
    assert response.status_code == 200 and response.json() == original
    assert post(world, url, world[8], {"proof_ids":bound}, key).json() == original
    assert post(world, url, world[8], {"proof_ids":[999999]}, key).status_code == 409
    with Session(world[1]) as db:
        row = db.scalar(select(InspectionIdempotency).where(InspectionIdempotency.idempotency_key == key))
        assert row.request_hash == request_fingerprint({})


@pytest.mark.parametrize("action", ["confirm-receipt", "report-not-received"])
def test_predeadline_arrival_waits_for_order_lock_and_rejects_after_db_deadline(world, monkeypatch, action):
    import app.api.fulfillment as fulfillment_api
    import app.api.inspections as inspect_api
    with Session(world[1]) as db:
        start = database_now(db)
    # Server clock seams prepare a compressed window while honoring DB invariants.
    monkeypatch.setattr(fulfillment_api, "database_now", lambda db: start - timedelta(hours=73))
    order_id, dispatched = dispatch(world)
    shipment_id = dispatched.json()["shipment"]["id"]
    ids = proofs(world, shipment_id)
    monkeypatch.setattr(inspect_api, "database_now", lambda db: database_now(db) - timedelta(hours=72) + timedelta(seconds=1))
    assert post(world, f"/courier/shipments/{shipment_id}/confirm-delivery", world[8], {"proof_ids":ids}).status_code == 200
    monkeypatch.setattr(inspect_api, "database_now", database_now)
    with Session(world[1]) as blocker:
        order = blocker.scalar(select(Order).where(Order.id == order_id).with_for_update())
        assert database_now(blocker) < order.receipt_deadline_at
        with ThreadPoolExecutor(2) as pool:
            payload = {} if action == "confirm-receipt" else {"reason":"Parcel has not arrived"}
            pending = pool.submit(post, world, f"/orders/{order_id}/{action}", world[2], payload)
            # Observe an actual independently blocked backend before releasing the lock.
            limit = time.monotonic() + 5
            waiting = False
            while time.monotonic() < limit:
                with world[1].connect() as probe:
                    waiting = probe.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()")) > 0
                if waiting:
                    break
                time.sleep(0.01)
            assert waiting
            while database_now(blocker) <= order.receipt_deadline_at:
                time.sleep(0.01)
            blocker.commit()
            late = pending.result(timeout=10)
    assert late.status_code == 409 and late.json()["detail"]["code"] == "receipt_deadline_passed"
    assert scan(world, apply=True).jobs["receipt_release"].applied >= 1
    assert_terminal(world, order_id, "RELEASE")


def test_full_cli_target_guard_two_processes_failure_signal_and_restart(world, monkeypatch):
    original = settlement_service.settle
    monkeypatch.setattr(settlement_service, "settle", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("crash")))
    order_id, shipment_id, ids, _ = delivered(world, "FAKE", None)
    monkeypatch.setattr(settlement_service, "settle", original)
    target = make_url(URL).database
    env = {**os.environ, "LIFECYCLE_TEST_DATABASE_URL": URL}
    env.pop("DATABASE_URL", None)
    command = [sys.executable, "-m", "scripts.run_lifecycle_jobs", "--url-env", "LIFECYCLE_TEST_DATABASE_URL",
        "--target", target, "--environment", "local", "--retry-order-id", str(order_id)]
    backend = Path(__file__).resolve().parents[1]
    def invoke(*extra):
        result = subprocess.run([*command,*extra], cwd=backend, env=env, capture_output=True, text=True, timeout=25)
        assert URL not in result.stdout + result.stderr
        return result
    dry = invoke()
    assert dry.returncode == 0 and '"eligible": 1' in dry.stderr
    assert invoke("--apply").returncode == 2
    assert invoke("--target", "wrong_test").returncode == 2
    assert invoke("--url-env", "DATABASE_URL").returncode == 2
    with Session(world[1]) as db:
        proof = db.get(ShipmentDeliveryProof, ids[0])
        path = Path(env["INSPECT_PRIVATE_STORAGE_DIR"]) / proof.object_key
    content = path.read_bytes()
    path.unlink()
    failed = invoke("--apply", "--confirm-target", target)
    assert failed.returncode == 1 and "storage_unavailable" in failed.stderr
    path.write_bytes(content)
    options = ["--apply","--confirm-target",target]
    processes = [subprocess.Popen([*command,*options], cwd=backend, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for _ in range(2)]
    try:
        outputs = [p.communicate(timeout=25) for p in processes]
        assert [p.returncode for p in processes] == [0,0]
        assert URL not in "".join(out+err for out,err in outputs)
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=10)
    assert_terminal(world, order_id, "REFUND")
    recurring = subprocess.Popen([*command,*options,"--repeat"], cwd=backend, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        assert "mode=apply" in recurring.stderr.readline()
        assert "lifecycle scan" in recurring.stderr.readline()
        recurring.terminate()
        _, errors = recurring.communicate(timeout=10)
        assert recurring.returncode == (1 if os.name == "nt" else 0)
        assert URL not in errors
    finally:
        if recurring.poll() is None:
            recurring.kill()
            recurring.communicate(timeout=10)
    assert invoke(*options).returncode == 0


def test_partial_scan_stop_and_restart_preserve_prior_commits(world, monkeypatch):
    original = settlement_service.settle
    monkeypatch.setattr(settlement_service, "settle", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("crash")))
    first, _, _, _ = delivered(world, "FAKE", None)
    with Session(world[1]) as db:
        product = create_product(db, db.get(Order, first).seller_id)
    second_world = (*world[:6], product, *world[7:])
    second, _, _, _ = delivered(second_world, "NOT_AS_DESCRIBED", None)
    stop = Event()
    def stop_after_first(*args, **kwargs):
        result = original(*args, **kwargs)
        stop.set()
        return result
    monkeypatch.setattr(settlement_service, "settle", stop_after_first)
    result = scan(world, apply=True, stop=stop)
    assert result.jobs["return_refund"].applied == 1
    with Session(world[1]) as db:
        assert db.get(Order, first).status == "REFUNDED"
        assert db.get(Order, second).status == "RETURNED_TO_SELLER"
    monkeypatch.setattr(settlement_service, "settle", original)
    assert scan(world, apply=True).jobs["return_refund"].applied == 1
    assert_terminal(world, first, "REFUND")
    assert_terminal(world, second, "REFUND")


def test_admin_refund_with_missing_object_and_auto_outage_recovery(world, monkeypatch):
    order_id, _, ids, _ = delivered(world)
    original = inspection_storage.download_object
    monkeypatch.setattr(inspection_storage, "download_object", lambda _: b"broken")
    with Session(world[1]) as db:
        deadline = db.get(Order, order_id).receipt_deadline_at
    assert scan(world, apply=True, clock=lambda: deadline).jobs["receipt_release"].failed == 1
    report = post(world, f"/orders/{order_id}/report-not-received", world[2], {"reason":"Parcel has not arrived"})
    assert report.status_code == 200
    review = post(world, f"/admin/orders/{order_id}/delivery-review", world[9], {"reason":"Review missing parcel evidence"})
    assert review.status_code == 200
    resolved = post(world, f"/admin/orders/{order_id}/resolve-delivery", world[9], {"resolution":"REFUND",
        "reason":"Report confirms missing delivery", "evidence_refs":[review.json()["report"]["reference"]]})
    assert resolved.status_code == 200, resolved.text
    assert_terminal(world, order_id, "REFUND")


def test_worker_simulation_gate_and_no_client_clock_or_amount(world, monkeypatch):
    order_id = paid_unshipped(world)
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(HTTPException) as exc:
        scan(world, apply=True)
    assert exc.value.status_code == 403
    monkeypatch.setenv("APP_ENV", "test")
    assert post(world, f"/orders/{order_id}/confirm-receipt", world[2], {"amount":"1.00"}).status_code == 422
    assert post(world, f"/orders/{order_id}/report-not-received", world[2], {"reason":"Parcel not here yet", "now":"2099-01-01"}).status_code == 422


def test_final_leg_assignment_foreign_proof_and_input_scope(world):
    order_id, response = dispatch(world)
    shipment_id = response.json()["shipment"]["id"]
    with Session(world[1]) as db:
        _, foreign_courier = create_user(db, UserRole.COURIER)
        _, foreign_inspector = create_user(db, UserRole.INSPECTOR)
        inbound_id = db.scalar(select(Shipment.id).where(Shipment.order_id == order_id, Shipment.leg == "TO_CENTER"))
        foreign_id = db.scalar(select(ShipmentDeliveryProof.id).where(ShipmentDeliveryProof.shipment_id == inbound_id))
    assert post(world, f"/orders/{order_id}/fulfillment", foreign_inspector, {"carrier":"Demo","tracking_number":"foreign"}).status_code == 404
    assert post(world, f"/orders/{order_id}/fulfillment", world[4], {"carrier":"Demo","tracking_number":"bad","leg":"TO_SELLER"}).status_code == 422
    ids = proofs(world, shipment_id)
    assert world[0].get(f"/courier/shipments/{shipment_id}", headers=foreign_courier).status_code == 404
    assert post(world, f"/courier/shipments/{shipment_id}/confirm-delivery", foreign_courier, {"proof_ids":ids}).status_code == 404
    assert post(world, f"/courier/shipments/{shipment_id}/confirm-delivery", world[8], {"proof_ids":[foreign_id]}).status_code == 409
    assert world[0].get(f"/shipment-delivery-proofs/{ids[0]}", headers=foreign_inspector).status_code == 404
    assert post(world, f"/orders/{order_id}/confirm-receipt", world[3], {}).status_code == 404


def test_receipt_report_race_has_one_durable_outcome(world):
    order_id, _, _, _ = delivered(world)
    def submit(action):
        return post(world, f"/orders/{order_id}/{action}", world[2],
            {} if action == "confirm-receipt" else {"reason":"Parcel has not arrived"})
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(submit, ["confirm-receipt", "report-not-received"]))
    assert sorted(r.status_code for r in results) == [200,409]
    with Session(world[1]) as db:
        order = db.get(Order, order_id)
        assert (order.receipt_confirmed_at is None) != (order.missing_reported_at is None)
        if order.missing_reported_at:
            assert order.status == "DELIVERY_DISPUTED"
            assert db.scalar(select(Escrow.status).where(Escrow.order_id == order_id)) == "HELD"
        else:
            assert order.status == "COMPLETED"


def test_replay_after_deadline_and_disabled_simulation_is_historical_read(world, monkeypatch):
    order_id, _, _, _ = delivered(world)
    key = new_key()
    first = post(world, f"/orders/{order_id}/confirm-receipt", world[2], {}, key)
    assert first.status_code == 200
    with Session(world[1]) as db:
        late = db.get(Order, order_id).receipt_deadline_at + timedelta(days=1)
    import app.services.order_settlement as module
    monkeypatch.setattr(module, "database_now", lambda db: late)
    monkeypatch.setenv("FULFILLMENT_SIMULATION_ENABLED", "false")
    replay = post(world, f"/orders/{order_id}/confirm-receipt", world[2], {}, key)
    assert replay.json() == first.json() and replay.headers["Idempotent-Replayed"] == "true"


def test_timely_inbound_prevents_no_ship_refund_and_shipping_replay_survives_deadline(world, monkeypatch):
    order_id, work_id = started_work(world)
    from app.models.inspection import InspectionIdempotency
    import app.api.inspections as module
    with Session(world[1]) as db:
        order = db.get(Order, order_id)
        late = order.paid_at + timedelta(hours=72)
        ship = db.scalar(select(Shipment).where(Shipment.order_id == order_id, Shipment.leg == "TO_CENTER"))
        cmd = db.scalar(select(InspectionIdempotency).where(InspectionIdempotency.order_id == order_id, InspectionIdempotency.operation == "ship"))
        key, payload = cmd.idempotency_key, {"carrier":ship.carrier,"tracking_number":ship.tracking_number}
    monkeypatch.setattr(module, "database_now", lambda db: late)
    replay = post(world, f"/orders/{order_id}/ship-to-center", world[3], payload, key)
    assert replay.status_code == 200 and replay.headers["Idempotent-Replayed"] == "true"
    assert scan(world, apply=True, clock=lambda: late).jobs["seller_no_ship"].applied == 0
    with Session(world[1]) as db:
        assert db.scalar(select(Escrow.status).where(Escrow.order_id == order_id)) == "HELD"


def test_inspection_three_working_days_boundary_and_two_scans(world):
    order_id, work_id = started_work(world)
    from app.services.finish_policy import inspection_due_at
    with Session(world[1]) as db:
        received = db.scalar(select(Shipment.received_at).where(Shipment.order_id == order_id, Shipment.leg == "TO_CENTER"))
    due = inspection_due_at(received)
    assert scan(world, apply=True, clock=lambda: due-timedelta(microseconds=1)).jobs["inspection_overdue"].applied == 0
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: scan(world, apply=True, clock=lambda: due), range(2)))
    assert sum(r.jobs["inspection_overdue"].applied for r in results) == 1
    assert scan(world, apply=True, clock=lambda: due+timedelta(microseconds=1)).jobs["inspection_overdue"].applied == 0


def test_two_auto_workers_and_late_buyer_commands_share_guard(world, monkeypatch):
    order_id, _, _, _ = delivered(world)
    with Session(world[1]) as db:
        due = db.get(Order, order_id).receipt_deadline_at
    import app.services.order_settlement as module
    import app.api.finish as finish_api
    monkeypatch.setattr(module, "database_now", lambda db: due)
    monkeypatch.setattr(finish_api, "database_now", lambda db: due)
    with ThreadPoolExecutor(4) as pool:
        runners = [pool.submit(scan, world, apply=True, clock=lambda: due) for _ in range(2)]
        receipt = pool.submit(post, world, f"/orders/{order_id}/confirm-receipt", world[2], {})
        report = pool.submit(post, world, f"/orders/{order_id}/report-not-received", world[2], {"reason":"Parcel has not arrived"})
        runs = [future.result(timeout=15) for future in runners]
        assert receipt.result(timeout=15).status_code == 409
        assert report.result(timeout=15).status_code == 409
    assert sum(r.jobs["receipt_release"].applied for r in runs) == 1
    assert_terminal(world, order_id, "RELEASE")
