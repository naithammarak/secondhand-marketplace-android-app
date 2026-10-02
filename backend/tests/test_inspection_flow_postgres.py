"""Real PostgreSQL end-to-end INSPECT API flow; never touches a shared DB."""

import os
import json
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from uuid import UUID

import jwt
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, event, inspect, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.api import inspections as inspect_api
from app.database import get_db
from app.main import app
from app.models.certificate import Certificate
from app.models.buyer_inspection_decision import BuyerInspectionDecision
from app.models.inspection import Inspection, InspectionEvidence, InspectionIdempotency, InspectionResultEvidence
from app.models.order import Escrow, Order, Payment
from app.models.shipment import Shipment, ShipmentDeliveryProof
from app.models.fulfillment import ShipmentConfirmedProof
from app.models.user import User, UserRole, UserStatus
from tests.order_helpers import VALID_ADDRESS, create_product, create_user, new_key, order_body, patch_auth


URL = os.getenv("INSPECT_FLOW_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="INSPECT_FLOW_TEST_DATABASE_URL is not set")


@pytest.fixture(scope="module")
def pg_engine():
    parsed = make_url(URL)
    if parsed.get_backend_name() != "postgresql" or parsed.host not in {"localhost", "127.0.0.1", "::1"} or "test" not in (parsed.database or "").lower() or URL == os.getenv("DATABASE_URL"):
        pytest.fail("INSPECT_FLOW_TEST_DATABASE_URL must be a separate local PostgreSQL test database")
    engine = create_engine(URL)
    with engine.connect() as connection:
        if inspect(connection).get_table_names(schema="public"):
            pytest.fail("INSPECT_FLOW_TEST_DATABASE_URL must be empty")
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


@pytest.fixture
def world(pg_engine, monkeypatch, tmp_path):
    patch_auth(monkeypatch)
    monkeypatch.setenv("PAYMENT_SIMULATION_ENABLED", "true")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("FULFILLMENT_SIMULATION_ENABLED", "true")
    monkeypatch.setenv("PUBLIC_CERTIFICATE_BASE_URL", "https://cert.example.test")
    monkeypatch.setenv("INSPECT_PRIVATE_STORAGE_DIR", str(tmp_path / "private-inspection-images"))

    def override_db():
        with Session(pg_engine) as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    with Session(pg_engine) as session:
        buyer, buyer_h = create_user(session, UserRole.BUYER)
        seller, seller_h = create_user(session, UserRole.SELLER)
        _, inspector_h = create_user(session, UserRole.INSPECTOR)
        courier_id, courier_h = create_user(session, UserRole.COURIER)
        _, admin_h = create_user(session, UserRole.ADMIN)
        _, other_h = create_user(session, UserRole.BUYER)
        product_id = create_product(session, seller)
    with TestClient(app) as client:
        yield client, pg_engine, buyer_h, seller_h, inspector_h, other_h, product_id, courier_id, courier_h, admin_h
    app.dependency_overrides.pop(get_db, None)


def request_headers(auth):
    return {**auth, "Idempotency-Key": new_key()}


def image_bytes():
    output = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(output, format="PNG")
    return output.getvalue()


def test_admin_courier_picker_is_private_and_excludes_inactive_accounts(world):
    client, engine, buyer, seller, inspector, other, product, courier_id, courier, admin = world
    with Session(engine) as db:
        inactive_id, _ = create_user(db, UserRole.COURIER)
        inactive = db.get(User, inactive_id)
        inactive.status = UserStatus.SUSPENDED
        db.commit()
    for headers in [buyer, seller, inspector, courier]:
        assert client.get('/admin/couriers', headers=headers).status_code == 403
    response = client.get('/admin/couriers?limit=100', headers=admin)
    assert response.status_code == 200
    body = response.json()
    ids = {item['id'] for item in body['items']}
    assert courier_id in ids and inactive_id not in ids
    assert all(set(item) == {'id', 'name'} for item in body['items'])
    assert client.get('/admin/couriers?limit=1&offset=1', headers=admin).json()['offset'] == 1


def completed_work(world, result="PASS"):
    client, _, _, _, inspector, _, _, _, _, _ = world
    order_id, work_id = started_work(world)
    uploaded = client.post(f"/inspections/{work_id}/evidence", files={"file": ("photo.png", image_bytes(), "image/png")}, headers=request_headers(inspector))
    assert uploaded.status_code == 201, uploaded.text
    photo_id = uploaded.json()["evidence"]["id"]
    saved = client.post(f"/inspections/{work_id}/result", json={"result": result, "summary": "The expert inspected this item and recorded the final result.", "evidence_ids": [photo_id]}, headers=request_headers(inspector))
    assert saved.status_code == 200, saved.text
    return order_id, work_id, photo_id


def started_work(world):
    client, _, buyer, seller, inspector, other, product, courier_id, courier, admin = world
    created = client.post("/orders", json=order_body(product), headers=request_headers(buyer))
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    paid = client.post(f"/orders/{order_id}/payments/simulate", json={"outcome": "SUCCESS"}, headers=request_headers(buyer))
    assert paid.status_code == 200, paid.text
    assert client.get(f"/orders/{order_id}/inspection-progress", headers=other).status_code == 404
    assert client.put(f"/orders/{order_id}/return-address", json=VALID_ADDRESS, headers=request_headers(seller)).status_code == 200
    ship_key = new_key()
    shipment = client.post(f"/orders/{order_id}/ship-to-center", json={"carrier": "Demo Express", "tracking_number": "DEMO-42"}, headers={**seller, "Idempotency-Key": ship_key})
    assert shipment.status_code == 200, shipment.text
    assert shipment.json()["order_status"] == "SHIPPING_TO_CENTER"
    again = client.post(f"/orders/{order_id}/ship-to-center", json={"carrier": "Demo Express", "tracking_number": "DEMO-42"}, headers={**seller, "Idempotency-Key": ship_key})
    assert again.status_code == 200 and again.headers["Idempotent-Replayed"] == "true"
    assert client.get(f"/orders/{order_id}/inspection-progress", headers=buyer).json()["order_status"] == "SHIPPING_TO_CENTER"
    queue = client.get("/inspections", headers=inspector)
    assert queue.status_code == 200, queue.text
    work_id = next(item["id"] for item in queue.json()["items"] if item["order_id"] == order_id)
    assert client.get(f"/inspections/{work_id}", headers=other).status_code == 403
    assert client.post(f"/inspections/{work_id}/start", headers=request_headers(inspector)).status_code == 409
    admin_queue = client.get("/admin/orders?status=SHIPPING_TO_CENTER", headers=admin)
    assert admin_queue.status_code == 200, admin_queue.text
    assert any(item["id"] == order_id for item in admin_queue.json()["items"])
    assert client.post(f"/inspections/{work_id}/receive", json={}, headers=request_headers(inspector)).status_code == 409
    assign_url = f"/admin/orders/{order_id}/assign-courier"
    assert client.post(assign_url, json={"courier_id": courier_id}, headers=request_headers(seller)).status_code == 403
    assigned = client.post(assign_url, json={"courier_id": courier_id}, headers=request_headers(admin))
    assert assigned.status_code == 200, assigned.text
    shipment_id = assigned.json()["shipment_id"]
    assert client.post(f"/courier/shipments/{shipment_id}/confirm-delivery", json={"proof_ids": [999999]}, headers=request_headers(courier)).status_code == 409
    assert client.post(f"/courier/shipments/{shipment_id}/proofs", files={"file": ("photo.png", image_bytes(), "image/png")}, headers=request_headers(other)).status_code == 403
    uploaded = client.post(f"/courier/shipments/{shipment_id}/proofs", files={"file": ("photo.png", image_bytes(), "image/png")}, headers=request_headers(courier))
    assert uploaded.status_code == 201, uploaded.text
    proof_id = uploaded.json()["proof"]["id"]
    assert client.get(f"/shipment-delivery-proofs/{proof_id}", headers=other).status_code == 404
    assert client.get(f"/shipment-delivery-proofs/{proof_id}", headers=buyer).status_code == 200
    confirmed = client.post(f"/courier/shipments/{shipment_id}/confirm-delivery", json={"proof_ids": [proof_id]}, headers=request_headers(courier))
    assert confirmed.status_code == 200, confirmed.text
    received = client.post(f"/inspections/{work_id}/receive", json={}, headers=request_headers(inspector))
    assert received.status_code == 200 and received.json()["order_status"] == "RECEIVED_AT_CENTER", received.text
    assert client.post(f"/inspections/{work_id}/evidence", files={"file": ("photo.png", image_bytes(), "image/png")}, headers=request_headers(inspector)).status_code == 403
    assert client.post(f"/inspections/{work_id}/result", json={"result": "PASS", "summary": "Valid but too early result", "evidence_ids": [1]}, headers=request_headers(inspector)).status_code == 403
    started = client.post(f"/inspections/{work_id}/start", json={}, headers=request_headers(inspector))
    assert started.status_code == 200 and started.json()["order_status"] == "INSPECTING", started.text
    return order_id, work_id


def review_shipment(session, source, courier_id, *, delivered=False):
    """Independent order/shipment with real FKs for courier regression checks."""
    values = {column.name: getattr(source, column.name) for column in Order.__table__.columns if column.name != "id"}
    values.update(product_id=create_product(session, source.seller_id),
                  idempotency_key=new_key(), status="SHIPPING_TO_CENTER")
    order = Order(**values)
    session.add(order)
    session.flush()
    timestamp = inspect_api.now()
    shipment = Shipment(order_id=order.id, courier_id=courier_id, leg="TO_CENTER",
                        carrier="Test courier", tracking_number=new_key(), shipped_at=timestamp,
                        status="IN_TRANSIT")
    session.add(shipment)
    session.flush()
    if delivered:
        session.add(ShipmentDeliveryProof(shipment_id=shipment.id, sort_order=0,
                    object_key=f"courier/test/{new_key()}.png", mime_type="image/png",
                    size_bytes=10, sha256="0" * 64, uploaded_by=courier_id, uploaded_at=timestamp))
        session.flush()
        shipment.status = "DELIVERED"
        shipment.courier_delivered_at = timestamp
        shipment.received_at = timestamp
        shipment.received_by = courier_id
        session.flush()
        proof = session.query(ShipmentDeliveryProof).filter_by(shipment_id=shipment.id).one()
        session.add(ShipmentConfirmedProof(proof_id=proof.id, shipment_id=shipment.id, courier_id=courier_id, confirmed_at=timestamp))
    return shipment.id


def test_courier_queue_preserves_old_pending_and_paginates(world):
    client, engine, _, _, _, _, _, courier_id, courier, _ = world
    order_id, _ = started_work(world)
    with Session(engine) as session:
        source = session.get(Order, order_id)
        old_pending = review_shipment(session, source, courier_id)
        history = [review_shipment(session, source, courier_id, delivered=True) for _ in range(100)]
        session.commit()
    pending = client.get("/courier/shipments", headers=courier)
    assert pending.status_code == 200
    assert [item["id"] for item in pending.json()["items"]] == [old_pending]
    first = client.get("/courier/shipments?scope=all&limit=100", headers=courier).json()
    assert [item["id"] for item in first["items"]] == list(reversed(history))
    assert first["has_more"] and first["next_offset"] == 100
    second = client.get("/courier/shipments?scope=all&offset=100&limit=100", headers=courier).json()
    assert old_pending in [item["id"] for item in second["items"]]
    assert not second["has_more"] and second["next_offset"] is None
    past = client.get("/courier/shipments?scope=history", headers=courier).json()
    assert old_pending not in [item["id"] for item in past["items"]]
    # More than 100 pending jobs remain reachable, with no duplicates on a fixed dataset.
    with Session(engine) as session:
        source = session.get(Order, order_id)
        pending_ids = [review_shipment(session, source, courier_id) for _ in range(100)]
        _, outsider = create_user(session, UserRole.COURIER)
        session.commit()
    first = client.get("/courier/shipments", headers=courier).json()
    second = client.get("/courier/shipments?offset=100&limit=100", headers=courier).json()
    assert [item["id"] for item in first["items"] + second["items"]] == list(reversed(pending_ids)) + [old_pending]
    assert client.get("/courier/shipments?offset=9999", headers=courier).json()["items"] == []
    assert client.get("/courier/shipments?scope=all", headers=outsider).json()["items"] == []
    for query in ("limit=101", "limit=0", "offset=-1", "scope=invalid"):
        assert client.get(f"/courier/shipments?{query}", headers=courier).status_code == 422


@pytest.mark.parametrize("cleanup_fails", [False, True])
def test_courier_upload_response_failure_cleans_or_logs_object(world, monkeypatch, caplog, cleanup_fails):
    from fastapi import HTTPException

    client, engine, _, _, _, _, _, courier_id, courier, _ = world
    order_id, _ = started_work(world)
    with Session(engine) as session:
        shipment_id = review_shipment(session, session.get(Order, order_id), courier_id)
        session.commit()
    storage = inspect_api.inspection_storage
    real_upload = storage.upload_object
    paths = []

    def write_then_timeout(path, content, mime):
        real_upload(path, content, mime)
        paths.append(path)
        raise HTTPException(503, detail={"code": "storage_unavailable"})

    monkeypatch.setattr(storage, "upload_object", write_then_timeout)
    if cleanup_fails:
        real_unlink = Path.unlink

        def fail_cleanup(path, *args, **kwargs):
            if path == storage._local_path(paths[-1]):
                raise OSError("Simulated delete outage")
            return real_unlink(path, *args, **kwargs)

        monkeypatch.setattr(Path, "unlink", fail_cleanup)
    headers = request_headers(courier)
    for _ in range(2):
        result = client.post(f"/courier/shipments/{shipment_id}/proofs",
                             files={"file": ("photo.png", image_bytes(), "image/png")}, headers=headers)
        assert result.status_code == 503
    with Session(engine) as session:
        assert session.query(ShipmentDeliveryProof).filter_by(shipment_id=shipment_id).count() == 0
        assert session.query(InspectionIdempotency).filter_by(idempotency_key=headers["Idempotency-Key"]).count() == 0
    assert len(paths) == 2
    for path in paths:
        assert storage._local_path(path).exists() is cleanup_fails
        if cleanup_fails:
            assert path in caplog.text and "requires cleanup" in caplog.text


@pytest.mark.parametrize("result", ["PASS", "MINOR_ISSUE", "NOT_AS_DESCRIBED", "FAKE"])
def test_seller_inspector_buyer_flow(world, result):
    client, engine, buyer, seller, inspector, other, _, _, _, _ = world
    order_id, work_id = started_work(world)
    image_key = new_key()
    uploaded = client.post(f"/inspections/{work_id}/evidence", files={"file": ("photo.png", image_bytes(), "image/png")}, headers={**inspector, "Idempotency-Key": image_key})
    assert uploaded.status_code == 201, uploaded.text
    photo_id = uploaded.json()["evidence"]["id"]
    replay = client.post(f"/inspections/{work_id}/evidence", files={"file": ("photo.png", image_bytes(), "image/png")}, headers={**inspector, "Idempotency-Key": image_key})
    assert replay.status_code == 201 and replay.headers["Idempotent-Replayed"] == "true", replay.text
    assert client.get(f"/inspection-evidence/{photo_id}", headers=buyer).status_code == 404
    payload = {"result": result, "summary": "The item was inspected against its Order snapshot.", "evidence_ids": [photo_id]}
    result_key = new_key()
    saved = client.post(f"/inspections/{work_id}/result", json=payload, headers={**inspector, "Idempotency-Key": result_key, "Host": "attacker.test"})
    assert saved.status_code == 200 and saved.json()["result"] == result, saved.text
    assert saved.json()["order_status"] == "RESULT_NOTIFIED"
    repeated = client.post(f"/inspections/{work_id}/result", json=payload, headers={**inspector, "Idempotency-Key": result_key})
    assert repeated.status_code == 200 and repeated.headers["Idempotent-Replayed"] == "true", repeated.text
    assert client.post(f"/inspections/{work_id}/result", json=payload, headers=request_headers(inspector)).status_code == 409
    buyer_view = client.get(f"/orders/{order_id}/inspection", headers=buyer)
    assert buyer_view.status_code == 200 and buyer_view.json()["result"] == result, buyer_view.text
    assert [item["id"] for item in buyer_view.json()["evidence"]] == [photo_id]
    assert client.get(f"/orders/{order_id}/inspection", headers=other).status_code == 404
    assert client.get(f"/orders/{order_id}/inspection", headers=seller).status_code == 403
    photo = client.get(f"/inspection-evidence/{photo_id}", headers=buyer)
    assert photo.status_code == 200 and photo.headers["Cache-Control"] == "no-store" and photo.content
    assert client.get(f"/inspection-evidence/{photo_id}", headers=other).status_code == 404
    positive = result in {"PASS", "MINOR_ISSUE"}
    assert bool(buyer_view.json()["certificate"]) is positive
    assert buyer_view.json()["evidence"] == [{
        "id": photo_id, "mime_type": "image/png", "size_bytes": len(image_bytes()),
        "url": f"/inspection-evidence/{photo_id}", "expires_at": None,
    }]
    assert buyer_view.json()["next_action"] == ("WAIT_BUYER_DECISION" if positive else "RETURN_TO_SELLER")
    if positive:
        assert buyer_view.json()["certificate"]["status"] == "ISSUED"
        assert buyer_view.json()["certificate"]["issued_at"]
        assert buyer_view.json()["certificate"]["public_url"].startswith("https://cert.example.test/certificates/")
        token = buyer_view.json()["certificate"]["public_url"].rsplit("/", 1)[-1]
        public = client.get(f"/certificates/{token}")
        assert public.status_code == 200
        assert public.headers["content-type"].startswith("text/html")
        assert public.headers["cache-control"] == "no-store"
        assert public.headers["referrer-policy"] == "no-referrer"
        assert public.headers["x-robots-tag"] == "noindex"
        assert buyer_view.json()["certificate"]["certificate_no"] in public.text
        assert result in public.text
        assert token not in public.text
        assert "The item was inspected against its Order snapshot." not in public.text
        assert "<script" not in public.text and "<img" not in public.text
        assert "storage/v1/object" not in public.text
        machine = client.get(f"/certificates/{token}/json")
        assert machine.status_code == 200
        assert machine.headers["content-type"].startswith("application/json")
        assert machine.headers["cache-control"] == "no-store"
        assert set(machine.json()) == {"certificate_no", "result", "issued_at", "status"}
        assert machine.json()["certificate_no"] == buyer_view.json()["certificate"]["certificate_no"]
    with Session(engine) as session:
        assert session.scalar(select(Order).where(Order.id == order_id)).status == "RESULT_NOTIFIED"
        recorded = session.scalar(select(Inspection).where(Inspection.id == work_id))
        assert recorded.result == result
        assert session.query(InspectionResultEvidence).filter_by(inspection_id=work_id).count() == 1
        assert session.query(InspectionEvidence).filter_by(inspection_id=work_id).count() == 1
        assert (session.query(Certificate).filter_by(order_id=order_id).count() == 1) is positive
        if positive:
            certificate = session.query(Certificate).filter_by(order_id=order_id).one()
            assert certificate.inspection_id == work_id
            assert certificate.result == recorded.result
            assert certificate.status == "ISSUED"
            assert certificate.issued_at is not None
            assert certificate.public_token not in {str(order_id), certificate.certificate_no}
            assert len(certificate.public_token) >= 22  # >= 128 bits after URL-safe encoding.


def test_public_certificate_missing_and_revoked(world):
    client, engine, _, _, inspector, _, _, _, _, _ = world
    missing = client.get("/certificates/not-a-real-public-token")
    assert missing.status_code == 404
    assert missing.headers["content-type"].startswith("text/html")
    assert missing.headers["cache-control"] == "no-store"
    assert missing.headers["referrer-policy"] == "no-referrer"
    assert missing.headers["x-robots-tag"] == "noindex"
    assert "not-a-real-public-token" not in missing.text
    assert "ไม่พบใบรับรอง" in missing.text
    missing_json = client.get("/certificates/not-a-real-public-token/json")
    assert missing_json.status_code == 404
    assert missing_json.json()["detail"]["code"] == "certificate_not_found"
    assert missing_json.headers["cache-control"] == "no-store"
    assert missing_json.headers["referrer-policy"] == "no-referrer"

    order_id, work_id = started_work(world)
    uploaded = client.post(
        f"/inspections/{work_id}/evidence",
        files={"file": ("photo.png", image_bytes(), "image/png")},
        headers=request_headers(inspector),
    )
    assert uploaded.status_code == 201, uploaded.text
    saved = client.post(
        f"/inspections/{work_id}/result",
        json={"result": "PASS", "summary": "Private inspection note", "evidence_ids": [uploaded.json()["evidence"]["id"]]},
        headers=request_headers(inspector),
    )
    assert saved.status_code == 200, saved.text
    with Session(engine) as session:
        cert = session.scalar(select(Certificate).where(Certificate.order_id == order_id))
        token = cert.public_token
        cert.status = "REVOKED"
        cert.revoked_at = cert.issued_at
        cert.revocation_reason = "Private revocation reason"
        session.commit()

    revoked = client.get(f"/certificates/{token}")
    assert revoked.status_code == 200
    assert "เพิกถอนแล้ว" in revoked.text
    assert "ไม่สามารถใช้ยืนยันผลตรวจได้" in revoked.text
    assert "ใช้งานได้</span>" not in revoked.text
    assert "Private revocation reason" not in revoked.text
    assert "Private inspection note" not in revoked.text
    assert revoked.headers["cache-control"] == "no-store"
    assert client.get(f"/certificates/{token}/json").json()["status"] == "REVOKED"


def test_certificate_failure_rolls_back_and_same_key_can_retry(world, monkeypatch):
    client, engine, buyer, _, inspector, _, _, _, _, _ = world
    order_id, work_id = started_work(world)
    uploaded = client.post(f"/inspections/{work_id}/evidence", files={"file": ("photo.png", image_bytes(), "image/png")}, headers=request_headers(inspector))
    photo_id = uploaded.json()["evidence"]["id"]
    payload = {"result": "PASS", "summary": "The item matches the original Order snapshot.", "evidence_ids": [photo_id]}
    key = new_key()
    original = inspect_api.issue_certificate
    monkeypatch.setattr(inspect_api, "issue_certificate", lambda *args: (_ for _ in ()).throw(RuntimeError("certificate offline")))
    failed = client.post(f"/inspections/{work_id}/result", json=payload, headers={**inspector, "Idempotency-Key": key})
    assert failed.status_code == 503 and failed.json()["detail"]["code"] == "certificate_unavailable", failed.text
    with Session(engine) as session:
        assert session.get(Order, order_id).status == "INSPECTING"
        assert session.get(Inspection, work_id).result is None
        assert session.query(InspectionResultEvidence).filter_by(inspection_id=work_id).count() == 0
        assert session.query(Certificate).filter_by(order_id=order_id).count() == 0
    monkeypatch.setattr(inspect_api, "issue_certificate", original)
    retried = client.post(f"/inspections/{work_id}/result", json=payload, headers={**inspector, "Idempotency-Key": key})
    assert retried.status_code == 200 and retried.json()["certificate"] is not None, retried.text


@pytest.mark.parametrize("failure", ["token", "insert", "url"])
def test_certificate_creation_failure_rolls_back_everything(world, monkeypatch, failure):
    client, engine, _, _, inspector, _, _, _, _, _ = world
    order_id, work_id = started_work(world)
    uploaded = client.post(
        f"/inspections/{work_id}/evidence",
        files={"file": ("photo.png", image_bytes(), "image/png")},
        headers=request_headers(inspector),
    )
    photo_id = uploaded.json()["evidence"]["id"]
    payload = {"result": "PASS", "summary": "The item matches the original Order snapshot.", "evidence_ids": [photo_id]}
    key = new_key()

    def reject_certificate_insert(_conn, _cursor, statement, _params, _context, _many):
        if statement.lstrip().lower().startswith("insert into certificates"):
            raise RuntimeError("synthetic certificate insert failure")

    with monkeypatch.context() as patch:
        if failure == "token":
            patch.setattr(inspect_api.secrets, "token_urlsafe", lambda _bytes: (_ for _ in ()).throw(RuntimeError("token unavailable")))
        elif failure == "url":
            patch.setenv("PUBLIC_CERTIFICATE_BASE_URL", "https://cert.example.test/untrusted-path")
        else:
            event.listen(engine, "before_cursor_execute", reject_certificate_insert)
        try:
            failed = client.post(f"/inspections/{work_id}/result", json=payload, headers={**inspector, "Idempotency-Key": key})
        finally:
            if failure == "insert":
                event.remove(engine, "before_cursor_execute", reject_certificate_insert)

    assert failed.status_code == 503 and failed.json()["detail"]["code"] == "certificate_unavailable", failed.text
    with Session(engine) as session:
        assert session.get(Order, order_id).status == "INSPECTING"
        recorded = session.get(Inspection, work_id)
        assert recorded.result is None and recorded.summary is None and recorded.inspected_at is None
        assert session.query(InspectionResultEvidence).filter_by(inspection_id=work_id).count() == 0
        assert session.query(Certificate).filter_by(order_id=order_id).count() == 0

    retry = client.post(f"/inspections/{work_id}/result", json=payload, headers={**inspector, "Idempotency-Key": key})
    assert retry.status_code == 200 and retry.json()["certificate"]["status"] == "ISSUED", retry.text
    with Session(engine) as session:
        assert session.get(Order, order_id).status == "RESULT_NOTIFIED"
        assert session.query(Certificate).filter_by(order_id=order_id).count() == 1


def test_concurrent_different_results_cannot_change_final_result(world):
    client, engine, _, _, inspector, _, _, _, _, _ = world
    order_id, work_id = started_work(world)
    uploaded = client.post(f"/inspections/{work_id}/evidence", files={"file": ("photo.png", image_bytes(), "image/png")}, headers=request_headers(inspector))
    photo_id = uploaded.json()["evidence"]["id"]

    def submit(result):
        return client.post(
            f"/inspections/{work_id}/result",
            json={"result": result, "summary": "Final result submitted once per inspection.", "evidence_ids": [photo_id]},
            headers=request_headers(inspector),
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(submit, ["PASS", "FAKE"]))
    assert sorted(item.status_code for item in responses) == [200, 409], [item.text for item in responses]
    accepted_result = next(item.json()["result"] for item in responses if item.status_code == 200)
    with Session(engine) as session:
        assert session.get(Order, order_id).status == "RESULT_NOTIFIED"
        assert session.get(Inspection, work_id).result == accepted_result
        certs = session.query(Certificate).filter_by(order_id=order_id).all()
        assert len(certs) == (1 if accepted_result == "PASS" else 0)
        assert not certs or certs[0].result == accepted_result


def test_result_rejects_evidence_from_another_inspection(world):
    client, engine, buyer, seller, inspector, _, _, _, _, _ = world
    first_order, first_work = started_work(world)
    uploaded = client.post(f"/inspections/{first_work}/evidence", files={"file": ("first.png", image_bytes(), "image/png")}, headers=request_headers(inspector))
    assert uploaded.status_code == 201, uploaded.text
    foreign_evidence_id = uploaded.json()["evidence"]["id"]
    with Session(engine) as session:
        other_product = create_product(session, session.get(Order, first_order).seller_id)
    second_world = (*world[:6], other_product, *world[7:])
    second_order, second_work = started_work(second_world)
    submitted = client.post(f"/inspections/{second_work}/result", json={"result": "PASS", "summary": "This image belongs to another inspection.", "evidence_ids": [foreign_evidence_id]}, headers=request_headers(inspector))
    assert submitted.status_code == 422, submitted.text
    with Session(engine) as session:
        assert session.get(Inspection, second_work).result is None
        assert session.get(Order, second_order).status == "INSPECTING"
        assert session.query(Certificate).filter_by(order_id=second_order).count() == 0


def test_seller_revoked_after_auth_cannot_ship(world, monkeypatch):
    client, engine, buyer, seller, _, _, product, _, _, _ = world
    created = client.post("/orders", json=order_body(product), headers=request_headers(buyer))
    order_id = created.json()["id"]
    assert client.post(f"/orders/{order_id}/payments/simulate", json={"outcome": "SUCCESS"}, headers=request_headers(buyer)).status_code == 200
    with Session(engine) as session:
        seller_id = session.get(Order, order_id).seller_id
    original = inspect_api.load_order_for

    def revoke_after_order_lock(*args, **kwargs):
        result = original(*args, **kwargs)
        with Session(engine) as session:
            session.get(User, seller_id).status = UserStatus.SUSPENDED
            session.commit()
        return result

    monkeypatch.setattr(inspect_api, "load_order_for", revoke_after_order_lock)
    denied = client.post(f"/orders/{order_id}/ship-to-center", json={"carrier": "Demo", "tracking_number": "T-1"}, headers=request_headers(seller))
    assert denied.status_code == 403, denied.text
    with Session(engine) as session:
        assert session.query(Shipment).filter_by(order_id=order_id).count() == 0
        assert session.get(Order, order_id).status == "WAITING_SELLER_SHIP"


def test_inspector_revoked_after_auth_cannot_upload(world, monkeypatch):
    client, engine, _, _, inspector, _, _, _, _, _ = world
    order_id, work_id = started_work(world)
    with Session(engine) as session:
        inspector_id = session.get(Inspection, work_id).inspector_id
    original = inspect_api._order

    def revoke_after_order_lock(db, locked_order_id):
        order = original(db, locked_order_id)
        with Session(engine) as session:
            session.get(User, inspector_id).status = UserStatus.SUSPENDED
            session.commit()
        return order

    monkeypatch.setattr(inspect_api, "_order", revoke_after_order_lock)
    denied = client.post(f"/inspections/{work_id}/evidence", files={"file": ("photo.png", image_bytes(), "image/png")}, headers=request_headers(inspector))
    assert denied.status_code == 403, denied.text
    with Session(engine) as session:
        assert session.query(InspectionEvidence).filter_by(inspection_id=work_id).count() == 0
        assert session.get(Order, order_id).status == "INSPECTING"


def test_other_inspector_cannot_read_assigned_courier_proof(world):
    client, engine, _, _, assigned_inspector, _, _, _, _, _ = world
    order_id, work_id = started_work(world)
    with Session(engine) as session:
        shipment_id = session.query(Shipment).filter_by(order_id=order_id, leg="TO_CENTER").one().id
        proof_id = session.query(ShipmentDeliveryProof).filter_by(shipment_id=shipment_id).one().id
        _, other_inspector = create_user(session, UserRole.INSPECTOR)
    assert client.get(f"/inspections/{work_id}", headers=other_inspector).status_code == 404
    assert client.get(f"/shipment-delivery-proofs/{proof_id}", headers=other_inspector).status_code == 404
    assert client.get(f"/shipment-delivery-proofs/{proof_id}", headers=assigned_inspector).status_code == 200


def test_admin_revoked_after_auth_cannot_assign_courier(world, monkeypatch):
    client, engine, buyer, seller, _, _, product, courier_id, _, admin = world
    created = client.post("/orders", json=order_body(product), headers=request_headers(buyer))
    order_id = created.json()["id"]
    assert client.post(f"/orders/{order_id}/payments/simulate", json={"outcome": "SUCCESS"}, headers=request_headers(buyer)).status_code == 200
    assert client.put(f"/orders/{order_id}/return-address", json=VALID_ADDRESS, headers=request_headers(seller)).status_code == 200
    assert client.post(f"/orders/{order_id}/ship-to-center", json={"carrier": "Demo", "tracking_number": "ADMIN-1"}, headers=request_headers(seller)).status_code == 200
    with Session(engine) as session:
        admin_id = session.query(User).filter_by(role=UserRole.ADMIN).order_by(User.id.desc()).first().id
    original = inspect_api._order

    def revoke_after_order_lock(db, locked_order_id):
        order = original(db, locked_order_id)
        with Session(engine) as session:
            session.get(User, admin_id).status = UserStatus.SUSPENDED
            session.commit()
        return order

    monkeypatch.setattr(inspect_api, "_order", revoke_after_order_lock)
    denied = client.post(f"/admin/orders/{order_id}/assign-courier", json={"courier_id": courier_id}, headers=request_headers(admin))
    assert denied.status_code == 403, denied.text
    with Session(engine) as session:
        shipment = session.query(Shipment).filter_by(order_id=order_id, leg="TO_CENTER").one()
        assert shipment.courier_id is None


def test_concurrent_ship_creates_one_shipment(world):
    client, engine, buyer, seller, _, _, product, _, _, _ = world
    created = client.post("/orders", json=order_body(product), headers=request_headers(buyer))
    order_id = created.json()["id"]
    assert client.post(f"/orders/{order_id}/payments/simulate", json={"outcome": "SUCCESS"}, headers=request_headers(buyer)).status_code == 200

    assert client.put(f"/orders/{order_id}/return-address", json=VALID_ADDRESS, headers=request_headers(seller)).status_code == 200
    def submit(_):
        return client.post(f"/orders/{order_id}/ship-to-center", json={"carrier": "Demo Express", "tracking_number": "DEMO-42"}, headers=request_headers(seller)).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(submit, range(2))) == [200, 409]
    with Session(engine) as session:
        assert session.query(Shipment).filter_by(order_id=order_id).count() == 1
        assert session.query(Inspection).filter_by(order_id=order_id).count() == 1


def test_concurrent_result_replay_has_one_certificate(world):
    client, engine, _, _, inspector, _, _, _, _, _ = world
    order_id, work_id = started_work(world)
    uploaded = client.post(f"/inspections/{work_id}/evidence", files={"file": ("photo.png", image_bytes(), "image/png")}, headers=request_headers(inspector))
    photo_id = uploaded.json()["evidence"]["id"]
    payload = {"result": "MINOR_ISSUE", "summary": "Minor wear, otherwise matching the Order snapshot.", "evidence_ids": [photo_id]}
    key = new_key()

    def submit(_):
        return client.post(f"/inspections/{work_id}/result", json=payload, headers={**inspector, "Idempotency-Key": key})

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(submit, range(2)))
    assert [item.status_code for item in responses] == [200, 200], [item.text for item in responses]
    assert sorted(item.headers.get("Idempotent-Replayed", "false") for item in responses) == ["false", "true"]
    with Session(engine) as session:
        assert session.query(Certificate).filter_by(order_id=order_id).count() == 1
        assert session.query(InspectionResultEvidence).filter_by(inspection_id=work_id).count() == 1


def test_courier_proof_limits_replay_and_storage_failure(world, tmp_path):
    client, engine, buyer, seller, inspector, other, product, courier_id, courier, admin = world
    created = client.post("/orders", json=order_body(product), headers=request_headers(buyer))
    order_id = created.json()["id"]
    assert client.post(f"/orders/{order_id}/payments/simulate", json={"outcome": "SUCCESS"}, headers=request_headers(buyer)).status_code == 200
    assert client.put(f"/orders/{order_id}/return-address", json=VALID_ADDRESS, headers=request_headers(seller)).status_code == 200
    assert client.post(f"/orders/{order_id}/ship-to-center", json={"carrier": "Demo", "tracking_number": "C-123"}, headers=request_headers(seller)).status_code == 200
    with Session(engine) as session:
        shipment_id = session.query(Shipment).filter_by(order_id=order_id, leg="TO_CENTER").one().id
        work_id = session.query(Inspection).filter_by(order_id=order_id).one().id
    assert client.post(f"/courier/shipments/{shipment_id}/proofs", files={"file": ("p.png", image_bytes(), "image/png")}, headers=request_headers(courier)).status_code == 404
    assign_key = new_key()
    assign_url = f"/admin/shipments/{shipment_id}/assign-courier"
    assigned = client.post(assign_url, json={"courier_id": courier_id}, headers={**admin, "Idempotency-Key": assign_key})
    assert assigned.status_code == 200, assigned.text
    repeated = client.post(assign_url, json={"courier_id": courier_id}, headers={**admin, "Idempotency-Key": assign_key})
    assert repeated.status_code == 200 and repeated.headers["Idempotent-Replayed"] == "true"
    with Session(engine) as session:
        session.get(User, courier_id).status = UserStatus.SUSPENDED
        session.commit()
    assert client.post(f"/courier/shipments/{shipment_id}/proofs", files={"file": ("p.png", image_bytes(), "image/png")}, headers=request_headers(courier)).status_code == 403
    with Session(engine) as session:
        session.get(User, courier_id).status = UserStatus.ACTIVE
        session.commit()
    assert client.post(f"/courier/shipments/{shipment_id}/proofs", files={"file": ("p.webp", b"fake", "image/webp")}, headers=request_headers(courier)).status_code == 415
    proof_ids = []
    for index in range(2):
        key = new_key()
        url = f"/courier/shipments/{shipment_id}/proofs"
        proof = client.post(url, files={"file": ("p.png", image_bytes(), "image/png")}, headers={**courier, "Idempotency-Key": key})
        assert proof.status_code == 201, proof.text
        proof_ids.append(proof.json()["proof"]["id"])
        replay = client.post(url, files={"file": ("p.png", image_bytes(), "image/png")}, headers={**courier, "Idempotency-Key": key})
        assert replay.status_code == 201 and replay.headers["Idempotent-Replayed"] == "true"
    def race_upload(_):
        return client.post(f"/courier/shipments/{shipment_id}/proofs", files={"file": ("p.png", image_bytes(), "image/png")}, headers=request_headers(courier))
    with ThreadPoolExecutor(max_workers=2) as pool:
        raced = list(pool.map(race_upload, range(2)))
    assert sorted(item.status_code for item in raced) == [201, 409], [item.text for item in raced]
    proof_ids.append(next(item for item in raced if item.status_code == 201).json()["proof"]["id"])
    assert client.post(f"/courier/shipments/{shipment_id}/proofs", files={"file": ("p.png", image_bytes(), "image/png")}, headers=request_headers(courier)).status_code == 409
    assert client.post(assign_url, json={"courier_id": courier_id}, headers=request_headers(admin)).status_code == 409
    with Session(engine) as session:
        proof = session.get(ShipmentDeliveryProof, proof_ids[0])
        stored_path = tmp_path / "private-inspection-images" / proof.object_key
    original = stored_path.read_bytes()
    stored_path.write_bytes(b"corrupted")
    confirm_url = f"/courier/shipments/{shipment_id}/confirm-delivery"
    assert client.post(confirm_url, json={"proof_ids": proof_ids}, headers=request_headers(courier)).status_code == 503
    assert client.post(f"/inspections/{work_id}/receive", json={}, headers=request_headers(inspector)).status_code == 409
    stored_path.write_bytes(original)
    confirmed = client.post(confirm_url, json={"proof_ids": proof_ids}, headers=request_headers(courier))
    assert confirmed.status_code == 200, confirmed.text
    assert client.post(confirm_url, json={"proof_ids": proof_ids}, headers=request_headers(courier)).status_code == 409
    with Session(engine) as session:
        assert session.query(ShipmentDeliveryProof).filter_by(shipment_id=shipment_id).count() == 3
        assert session.get(Shipment, shipment_id).courier_delivered_at is not None


@pytest.mark.parametrize("result,answer,reason,next_action", [
    ("PASS", "CONFIRM", None, "SHIP_TO_BUYER"),
    ("MINOR_ISSUE", "REJECT", "  สภาพไม่ตรงที่คาด  ", "RETURN_TO_SELLER"),
    ("PASS", "REJECT", "   ", "RETURN_TO_SELLER"),
])
def test_buyer_decision_once_and_identical_replay(world, result, answer, reason, next_action):
    client, engine, buyer, _, _, _, _, _, _, _ = world
    order_id, _, photo_id = completed_work(world, result)
    url = f"/orders/{order_id}/inspection"
    initial = client.get(url, headers=buyer)
    assert initial.status_code == 200 and initial.headers["cache-control"] == "no-store", initial.text
    assert initial.json()["can_decide"] is True and initial.json()["decision"] is None
    assert initial.json()["evidence"] == [{
        "id": photo_id, "mime_type": "image/png", "size_bytes": len(image_bytes()),
        "url": f"/inspection-evidence/{photo_id}", "expires_at": None,
    }]
    assert initial.json()["next_action"] == "WAIT_BUYER_DECISION"
    payload = {"decision": answer, "reason": reason}
    recorded = client.post(f"{url}/decision", json=payload, headers=buyer)
    assert recorded.status_code == 200 and recorded.headers["cache-control"] == "no-store", recorded.text
    normalized_reason = (reason.strip() or None) if reason is not None else None
    assert recorded.json()["decision"]["reason"] == normalized_reason
    assert recorded.json()["next_action"] == next_action
    repeated = client.post(f"{url}/decision", json={"decision": answer, "reason": normalized_reason}, headers=buyer)
    assert repeated.status_code == 200 and repeated.json() == recorded.json(), repeated.text
    opposite = client.post(f"{url}/decision", json={"decision": "REJECT" if answer == "CONFIRM" else "CONFIRM"}, headers=buyer)
    assert opposite.status_code == 409 and opposite.json()["detail"]["code"] == "decision_already_recorded"
    if answer == "REJECT":
        changed = client.post(f"{url}/decision", json={"decision": "REJECT", "reason": "different"}, headers=buyer)
        assert changed.status_code == 409 and changed.json()["detail"]["code"] == "decision_already_recorded"
    after = client.get(url, headers=buyer)
    assert after.status_code == 200 and after.json()["can_decide"] is False
    assert after.json()["decision"] == recorded.json()["decision"] and after.json()["next_action"] == next_action
    with Session(engine) as session:
        assert session.query(BuyerInspectionDecision).filter_by(order_id=order_id).count() == 1
        assert session.get(Order, order_id).status == "RESULT_NOTIFIED"
        assert session.query(Shipment).filter_by(order_id=order_id).count() == 1
        assert session.query(Escrow).filter_by(order_id=order_id).one().status == "HELD"


@pytest.mark.parametrize("promote_before_purchase", [True, False])
def test_seller_as_buyer_keeps_private_inspection_and_one_time_decision(world, promote_before_purchase):
    client, engine, buyer, seller, _, other, _, _, _, admin = world
    with Session(engine) as session:
        subject = UUID(jwt.decode(buyer["Authorization"].split()[1], options={"verify_signature": False})["sub"])
        buyer_id = session.scalar(select(User.id).where(User.supabase_user_id == subject))
        if promote_before_purchase:
            session.get(User, buyer_id).role = UserRole.SELLER
            session.commit()
    order_id, work_id = started_work(world)
    if not promote_before_purchase:
        with Session(engine) as session:
            session.get(User, buyer_id).role = UserRole.SELLER
            session.commit()
    with Session(engine) as session:
        assert session.get(Order, order_id).buyer_id == buyer_id
        shipment = session.scalar(select(Shipment).where(Shipment.order_id == order_id))
        proof_id = session.scalar(select(ShipmentDeliveryProof.id).where(ShipmentDeliveryProof.shipment_id == shipment.id))
    uploaded = client.post(f"/inspections/{work_id}/evidence", files={"file": ("photo.png", image_bytes(), "image/png")}, headers=request_headers(world[4]))
    assert uploaded.status_code == 201, uploaded.text
    selected_id = uploaded.json()["evidence"]["id"]
    unselected = client.post(f"/inspections/{work_id}/evidence", files={"file": ("other.png", image_bytes(), "image/png")}, headers=request_headers(world[4]))
    assert unselected.status_code == 201, unselected.text
    unselected_id = unselected.json()["evidence"]["id"]
    saved = client.post(f"/inspections/{work_id}/result", json={"result": "PASS", "summary": "The expert inspected this item and recorded the final result.", "evidence_ids": [selected_id]}, headers=request_headers(world[4]))
    assert saved.status_code == 200, saved.text
    url = f"/orders/{order_id}/inspection"
    view = client.get(url, headers=buyer)
    assert view.status_code == 200 and view.json()["can_decide"] is True, view.text
    assert view.json()["evidence"] == [{
        "id": selected_id, "mime_type": "image/png", "size_bytes": len(image_bytes()),
        "url": f"/inspection-evidence/{selected_id}", "expires_at": None,
    }]
    for path in (f"/inspection-evidence/{selected_id}", f"/shipment-delivery-proofs/{proof_id}"):
        response = client.get(path, headers=buyer)
        assert response.status_code == 200 and response.headers["cache-control"] == "no-store" and response.content
        # FINISH now lets the owning Seller read inbound/return Courier proofs.
        # Inspection photos and TO_BUYER proofs retain their separate privacy scopes.
        denied_actors = (seller, other, admin) if path.startswith("/inspection-evidence/") else (other, admin)
        if path.startswith("/shipment-delivery-proofs/"):
            assert client.get(path, headers=seller).status_code == 200
        for denied in denied_actors:
            assert client.get(path, headers=denied).status_code == 404
    assert client.get(f"/inspection-evidence/{unselected_id}", headers=buyer).status_code == 404
    assert client.get(f"/orders/{order_id}", headers=buyer).status_code == 200
    assert any(item["id"] == order_id for item in client.get("/orders?role=buyer", headers=buyer).json()["items"])
    confirmed = client.post(f"{url}/decision", json={"decision": "CONFIRM"}, headers=buyer)
    assert confirmed.status_code == 200 and confirmed.json()["next_action"] == "SHIP_TO_BUYER", confirmed.text
    assert client.post(f"{url}/decision", json={"decision": "CONFIRM"}, headers=buyer).json() == confirmed.json()
    conflict = client.post(f"{url}/decision", json={"decision": "REJECT"}, headers=buyer)
    assert conflict.status_code == 409 and conflict.json()["detail"]["code"] == "decision_already_recorded"
    with Session(engine) as session:
        assert session.query(BuyerInspectionDecision).filter_by(order_id=order_id).count() == 1
        assert session.query(Payment).filter_by(order_id=order_id).count() == 1
        assert session.query(Shipment).filter_by(order_id=order_id).count() == 1
        assert session.query(Escrow).filter_by(order_id=order_id).one().status == "HELD"


@pytest.mark.parametrize("new_role,new_status", [
    (UserRole.ADMIN, UserStatus.ACTIVE),
    (UserRole.SELLER, UserStatus.SUSPENDED),
])
def test_seller_buyer_permission_is_refreshed_after_order_lock(world, monkeypatch, new_role, new_status):
    client, engine, buyer, _, _, _, _, _, _, _ = world
    order_id, _, _ = completed_work(world)
    with Session(engine) as session:
        buyer_id = session.get(Order, order_id).buyer_id
        session.get(User, buyer_id).role = UserRole.SELLER
        session.commit()
    original = inspect_api.load_order_for

    def change_after_lock(db, requested_order_id, actor, lock=False):
        order, role = original(db, requested_order_id, actor, lock=lock)
        with Session(engine) as other_session:
            user = other_session.get(User, buyer_id)
            user.role, user.status = new_role, new_status
            other_session.commit()
        return order, role

    monkeypatch.setattr(inspect_api, "load_order_for", change_after_lock)
    denied = client.post(f"/orders/{order_id}/inspection/decision", json={"decision": "CONFIRM"}, headers=buyer)
    assert denied.status_code == 403 and denied.json()["detail"]["code"] == "account_inactive", denied.text
    with Session(engine) as session:
        assert session.query(BuyerInspectionDecision).filter_by(order_id=order_id).count() == 0


def test_buyer_promoted_during_decision_still_has_order_buyer_access(world, monkeypatch):
    client, engine, buyer, _, _, _, _, _, _, _ = world
    order_id, _, _ = completed_work(world)
    buyer_id = None
    with Session(engine) as session:
        buyer_id = session.get(Order, order_id).buyer_id
    original = inspect_api.load_order_for

    def promote_after_lock(db, requested_order_id, actor, lock=False):
        order, role = original(db, requested_order_id, actor, lock=lock)
        with Session(engine) as other_session:
            other_session.get(User, buyer_id).role = UserRole.SELLER
            other_session.commit()
        return order, role

    monkeypatch.setattr(inspect_api, "load_order_for", promote_after_lock)
    recorded = client.post(f"/orders/{order_id}/inspection/decision", json={"decision": "CONFIRM"}, headers=buyer)
    assert recorded.status_code == 200, recorded.text
    with Session(engine) as session:
        assert session.get(User, buyer_id).role == UserRole.SELLER
        assert session.query(BuyerInspectionDecision).filter_by(order_id=order_id).count() == 1


def test_promoted_owner_can_read_negative_result_without_decision(world):
    client, engine, buyer, _, _, _, _, _, _, _ = world
    order_id, _, photo_id = completed_work(world, "FAKE")
    with Session(engine) as session:
        session.get(User, session.get(Order, order_id).buyer_id).role = UserRole.SELLER
        session.commit()
    url = f"/orders/{order_id}/inspection"
    view = client.get(url, headers=buyer)
    assert view.status_code == 200 and view.json()["result"] == "FAKE" and view.json()["certificate"] is None
    assert view.json()["can_decide"] is False and view.json()["next_action"] == "RETURN_TO_SELLER"
    assert client.get(f"/inspection-evidence/{photo_id}", headers=buyer).status_code == 200
    denied = client.post(f"{url}/decision", json={"decision": "CONFIRM"}, headers=buyer)
    assert denied.status_code == 409 and denied.json()["detail"]["code"] == "decision_not_allowed"


def test_promoted_owner_inactive_read_policy_and_replay_denial(world):
    client, engine, buyer, _, _, _, _, _, _, _ = world
    order_id, _, photo_id = completed_work(world)
    with Session(engine) as session:
        owner = session.get(User, session.get(Order, order_id).buyer_id)
        owner.role = UserRole.SELLER
        proof_id = session.scalar(select(ShipmentDeliveryProof.id).join(Shipment, ShipmentDeliveryProof.shipment_id == Shipment.id).where(Shipment.order_id == order_id))
        session.commit()
    url = f"/orders/{order_id}/inspection"
    recorded = client.post(f"{url}/decision", json={"decision": "REJECT", "reason": "Changed my mind"}, headers=buyer)
    assert recorded.status_code == 200, recorded.text
    with Session(engine) as session:
        session.get(User, session.get(Order, order_id).buyer_id).status = UserStatus.SUSPENDED
        session.commit()
    view = client.get(url, headers=buyer)
    assert view.status_code == 200 and view.json()["can_decide"] is False
    assert view.json()["decision"] == recorded.json()["decision"]
    assert client.get(f"/inspection-evidence/{photo_id}", headers=buyer).status_code == 200
    assert client.get(f"/shipment-delivery-proofs/{proof_id}", headers=buyer).status_code == 404
    replay = client.post(f"{url}/decision", json={"decision": "REJECT", "reason": "Changed my mind"}, headers=buyer)
    assert replay.status_code == 403 and replay.json()["detail"]["code"] == "account_inactive"
    with Session(engine) as session:
        assert session.query(BuyerInspectionDecision).filter_by(order_id=order_id).count() == 1


def test_promoted_owner_staff_role_loses_buyer_private_access(world):
    client, engine, buyer, _, _, _, _, _, _, _ = world
    order_id, _, photo_id = completed_work(world)
    with Session(engine) as session:
        session.get(User, session.get(Order, order_id).buyer_id).role = UserRole.COURIER
        session.commit()
    url = f"/orders/{order_id}/inspection"
    assert client.get(url, headers=buyer).status_code == 404
    assert client.get(f"/inspection-evidence/{photo_id}", headers=buyer).status_code == 404
    denied = client.post(f"{url}/decision", json={"decision": "CONFIRM"}, headers=buyer)
    assert denied.status_code == 404
    with Session(engine) as session:
        assert session.query(BuyerInspectionDecision).filter_by(order_id=order_id).count() == 0


def test_promoted_seller_buyer_concurrent_decisions_record_once(world):
    client, engine, buyer, _, _, _, _, _, _, _ = world
    order_id, _, _ = completed_work(world)
    with Session(engine) as session:
        session.get(User, session.get(Order, order_id).buyer_id).role = UserRole.SELLER
        session.commit()
    url = f"/orders/{order_id}/inspection/decision"
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda answer: client.post(url, json={"decision": answer}, headers=buyer), ["CONFIRM", "REJECT"]))
    assert sorted(response.status_code for response in responses) == [200, 409], [response.text for response in responses]
    with Session(engine) as session:
        assert session.query(BuyerInspectionDecision).filter_by(order_id=order_id).count() == 1
        assert session.query(Payment).filter_by(order_id=order_id).count() == 1
        assert session.query(Escrow).filter_by(order_id=order_id).one().status == "HELD"


@pytest.mark.parametrize("result", ["FAKE", "NOT_AS_DESCRIBED"])
def test_negative_result_is_readable_but_cannot_be_decided(world, result):
    client, engine, buyer, _, _, _, _, _, _, _ = world
    order_id, _, _ = completed_work(world, result)
    url = f"/orders/{order_id}/inspection"
    view = client.get(url, headers=buyer)
    assert view.status_code == 200 and view.json()["certificate"] is None
    assert view.json()["can_decide"] is False and view.json()["next_action"] == "RETURN_TO_SELLER"
    rejected = client.post(f"{url}/decision", json={"decision": "CONFIRM"}, headers=buyer)
    assert rejected.status_code == 409 and rejected.json()["detail"]["code"] == "decision_not_allowed"
    with Session(engine) as session:
        assert session.query(BuyerInspectionDecision).filter_by(order_id=order_id).count() == 0


def test_decision_permissions_read_after_suspension_and_validation(world):
    client, engine, buyer, seller, inspector, other, _, _, _, admin = world
    order_id, work_id = started_work(world)
    url = f"/orders/{order_id}/inspection"
    waiting = client.get(url, headers=buyer)
    assert waiting.status_code == 404 and waiting.json()["detail"]["code"] == "inspection_not_ready"
    assert waiting.headers["cache-control"] == "no-store"
    assert client.post(f"{url}/decision", json={"decision": "CONFIRM"}, headers=buyer).json()["detail"]["code"] == "inspection_not_ready"
    uploaded = client.post(f"/inspections/{work_id}/evidence", files={"file": ("photo.png", image_bytes(), "image/png")}, headers=request_headers(inspector))
    photo_id = uploaded.json()["evidence"]["id"]
    assert client.post(f"/inspections/{work_id}/result", json={"result": "PASS", "summary": "A valid expert inspection result was recorded.", "evidence_ids": [photo_id]}, headers=request_headers(inspector)).status_code == 200
    for method, suffix in [(client.get, ""), (lambda path, headers: client.post(path, json={"decision": "CONFIRM"}, headers=headers), "/decision")]:
        assert method(url + suffix, headers=other).status_code == 404
        assert method(url + suffix, headers=admin).status_code == 404
        assert method(url + suffix, headers=inspector).status_code == 404
        assert method(url + suffix, headers=seller).status_code == 403
        assert method(url + suffix, headers={}).status_code == 401
    for body in [{"decision": "MAYBE"}, {"decision": "CONFIRM", "reason": ""},
                 {"decision": "REJECT", "reason": "x" * 501}, {"decision": "REJECT", "next_action": "SHIP_TO_BUYER"}]:
        invalid = client.post(f"{url}/decision", json=body, headers=buyer)
        assert invalid.status_code == 422 and invalid.json()["detail"]["code"] == "validation_error", invalid.text
        assert invalid.headers["cache-control"] == "no-store"
    with Session(engine) as session:
        session.get(User, session.get(Order, order_id).buyer_id).status = UserStatus.SUSPENDED
        session.commit()
    assert client.get(url, headers=buyer).status_code == 200
    inactive = client.post(f"{url}/decision", json={"decision": "CONFIRM"}, headers=buyer)
    assert inactive.status_code == 403 and inactive.json()["detail"]["code"] == "account_inactive"


def test_missing_certificate_fails_closed_and_concurrent_decisions_choose_once(world, monkeypatch):
    client, engine, buyer, _, _, _, _, _, _, _ = world
    order_id, _, _ = completed_work(world)
    url = f"/orders/{order_id}/inspection"
    original = inspect_api._certificate
    monkeypatch.setattr(inspect_api, "_certificate", lambda *_: None)
    assert client.get(url, headers=buyer).json()["detail"]["code"] == "inspection_not_ready"
    assert client.post(f"{url}/decision", json={"decision": "CONFIRM"}, headers=buyer).json()["detail"]["code"] == "inspection_not_ready"
    monkeypatch.setattr(inspect_api, "_certificate", original)

    def decide(answer):
        return client.post(f"{url}/decision", json={"decision": answer}, headers=buyer)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(decide, ["CONFIRM", "REJECT"]))
    assert sorted(item.status_code for item in responses) == [200, 409], [item.text for item in responses]
    winner = next(item for item in responses if item.status_code == 200).json()
    assert winner["next_action"] == ("SHIP_TO_BUYER" if winner["decision"]["decision"] == "CONFIRM" else "RETURN_TO_SELLER")
    with Session(engine) as session:
        assert session.query(BuyerInspectionDecision).filter_by(order_id=order_id).count() == 1


def test_buyer_suspended_after_auth_cannot_decide(world, monkeypatch):
    client, engine, buyer, _, _, _, _, _, _, _ = world
    order_id, _, _ = completed_work(world)
    original = inspect_api.load_order_for

    def suspend_after_auth(db, requested_order_id, actor, lock=False):
        order, role = original(db, requested_order_id, actor, lock=lock)
        with Session(engine) as other_session:
            other_session.get(User, actor.id).status = UserStatus.SUSPENDED
            other_session.commit()
        return order, role

    monkeypatch.setattr(inspect_api, "load_order_for", suspend_after_auth)
    denied = client.post(f"/orders/{order_id}/inspection/decision", json={"decision": "CONFIRM"}, headers=buyer)
    assert denied.status_code == 403 and denied.json()["detail"]["code"] == "account_inactive", denied.text
    with Session(engine) as session:
        assert session.query(BuyerInspectionDecision).filter_by(order_id=order_id).count() == 0


def test_revoked_certificate_cannot_be_decided(world):
    client, engine, buyer, _, _, _, _, _, _, _ = world
    order_id, _, _ = completed_work(world)
    with Session(engine) as session:
        cert = session.scalar(select(Certificate).where(Certificate.order_id == order_id))
        cert.status = "REVOKED"
        cert.revoked_at = cert.issued_at
        cert.revocation_reason = "Certificate revoked for test"
        session.commit()
    url = f"/orders/{order_id}/inspection"
    view = client.get(url, headers=buyer)
    assert view.status_code == 200 and view.json()["certificate"]["status"] == "REVOKED"
    assert view.json()["can_decide"] is False
    denied = client.post(f"{url}/decision", json={"decision": "CONFIRM"}, headers=buyer)
    assert denied.status_code == 409 and denied.json()["detail"]["code"] == "decision_not_allowed"

@pytest.mark.parametrize("reason", ["reason\u0000text", "reason\ud800text", "reason\udffftext"], ids=["nul", "high-surrogate", "low-surrogate"])
def test_decision_unstorable_reason_returns_field_error(world, reason):
    client, engine, buyer, *_ = world
    order_id, _, _ = completed_work(world)
    url = f"/orders/{order_id}/inspection/decision"
    response = client.post(url, content=json.dumps({"decision": "REJECT", "reason": reason}),
                           headers={**buyer, "Content-Type": "application/json"})
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "validation_error"
    assert "reason" in response.json()["detail"]["fields"]
    assert response.headers["cache-control"] == "no-store"
    with Session(engine) as session:
        assert session.query(BuyerInspectionDecision).filter_by(order_id=order_id).count() == 0
    # Valid Unicode, including a non-BMP character, can still be saved after correction.
    corrected = client.post(url, json={"decision": "REJECT", "reason": "  ไม่ตรงตามที่ต้องการ 📦  "}, headers=buyer)
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["decision"]["reason"] == "ไม่ตรงตามที่ต้องการ 📦"


@pytest.mark.parametrize("prefix", ["", "/api", "/gateway/api"])
def test_inspection_error_no_store_under_root_path(world, prefix):
    _, _, buyer, *_ = world
    order_id, _ = started_work(world)
    with TestClient(app, root_path=prefix) as client:
        url = f"{prefix}/orders/{order_id}/inspection"
        responses = [
            (client.get(url), 401, None),
            (client.get(url, headers=buyer), 404, "inspection_not_ready"),
            (client.post(f"{url}/decision", json={"decision": "MAYBE"}, headers=buyer), 422, "validation_error"),
            (client.post(f"{url}/decision", json={"decision": "CONFIRM"}), 401, None),
            (client.post(f"{url}/decision", json={"decision": "CONFIRM"}, headers=buyer), 409, "inspection_not_ready"),
        ]
        for response, status, code in responses:
            assert response.status_code == status, response.text
            assert response.headers.get("cache-control") == "no-store"
            if code:
                assert response.json()["detail"]["code"] == code
