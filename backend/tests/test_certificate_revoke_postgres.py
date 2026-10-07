"""CERT-REVOKE-01 on an empty, explicitly isolated local PostgreSQL database.

Certificates are issued through the real payment/shipping/inspection APIs. JWTs
and private image files are local test fixtures, not shared Auth/Storage proof.
"""
import os
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from threading import Barrier, Event

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.main import app
from app.models.certificate import Certificate
from app.models.fulfillment import FulfillmentCommand
from app.models.order import Escrow, Order
from app.models.user import User, UserRole, UserStatus
from app.services.transaction_clock import database_now
from tests.order_helpers import create_user, new_key
from tests.test_inspection_flow_postgres import completed_work, world  # noqa: F401
from tests.test_finish_foundation_postgres import refund

URL = os.getenv("CERT_REVOKE_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="CERT_REVOKE_TEST_DATABASE_URL must name an empty local test DB")
REASON = "Private Admin note: investigate evidence TEST-PRIVATE-09"


@pytest.fixture(scope="module")
def pg_engine():
    parsed = make_url(URL)
    assert parsed.get_backend_name() == "postgresql"
    assert parsed.host in {"localhost", "127.0.0.1", "::1"} and "test" in parsed.database
    assert URL != os.getenv("DATABASE_URL")
    engine = create_engine(URL, pool_size=12)
    with engine.connect() as db:
        assert not inspect(db).get_table_names(schema="public"), "Use an EMPTY disposable test database"
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = URL
    try:
        cfg = Config()
        cfg.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
        command.upgrade(cfg, "head")
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
    yield engine
    engine.dispose()


@pytest.fixture
def issued(world):
    order_id, work_id, _ = completed_work(world)
    with Session(world[1]) as db:
        cert = db.scalar(select(Certificate).where(Certificate.order_id == order_id))
        return {"id": cert.id, "order": order_id, "work": work_id, "token": cert.public_token}


def revoke(client, cert, headers, *, reason=REASON, key="cert-revoke-key-0001"):
    return client.post(f"/admin/certificates/{cert['id']}/revoke", json={"reason": reason},
                       headers={**headers, "Idempotency-Key": key})


def audits(db, cert):
    return list(db.scalars(select(FulfillmentCommand).where(
        FulfillmentCommand.action == "REVOKE_CERTIFICATE",
        FulfillmentCommand.resource_type == "CERTIFICATE",
        FulfillmentCommand.resource_id == cert["id"],
    )))


def snapshot(db):
    # Every persisted business record, including private evidence and settlement,
    # is compared byte-for-byte after the certificate-only command.
    tables = ["orders", "inspections", "inspection_evidence", "inspection_result_evidence",
              "buyer_inspection_decisions", "products", "shipments", "shipment_delivery_proofs",
              "shipment_confirmed_proofs", "payments", "payment_attempts", "receipts", "escrows",
              "order_settlements", "order_status_history", "delivery_resolutions"]
    return {name: db.execute(text(f"SELECT row_to_json(t)::text FROM {name} t ORDER BY row_to_json(t)::text")).scalars().all()
            for name in tables}


def test_authorization_idor_and_missing_ids(world, issued):
    client, engine, buyer, seller, inspector, other, _, _, courier, admin = world
    with Session(engine) as db:
        denied = [create_user(db, UserRole.ADMIN, status=status)[1]
                  for status in (UserStatus.SUSPENDED, UserStatus.CLOSED)]
        denied.append(create_user(db, None)[1])
    for headers in [buyer, seller, inspector, other, courier, *denied]:
        assert client.get("/admin/certificates", headers=headers).status_code == 403
        for ident in (issued["id"], 2147483647):
            assert client.get(f"/admin/certificates/{ident}", headers=headers).status_code == 403
            assert revoke(client, {"id": ident}, headers).status_code == 403
    for path in ("/admin/certificates", f"/admin/certificates/{issued['id']}"):
        assert client.get(path).status_code == 401
    assert revoke(client, issued, {}).status_code == 401
    assert revoke(client, {"id": 2147483647}, admin).status_code == 404
    assert client.get("/admin/certificates/2147483647", headers=admin).status_code == 404
    with Session(engine) as db:
        assert not audits(db, issued)
        assert db.get(Certificate, issued["id"]).status == "ISSUED"


def test_strict_invalid_bodies_and_keys_never_mutate(world, issued):
    client, engine, *_, admin = world
    url = f"/admin/certificates/{issued['id']}/revoke"
    bodies = [{}, None, [], "text", {"reason": None}, {"reason": 123}, {"reason": True},
              {"reason": []}, {"reason": {}}, {"reason": " " * 30}, {"reason": "a" * 9},
              {"reason": "a" * 1001}, {"reason": "\x00invalid-reason"},
              {"reason": "invalid-\ud800-reason"}, {"reason": "invalid-\udfff-reason"},
              {"reason": REASON, "actor_id": 1}, {"reason": REASON, "status": "ISSUED"}]
    for body in bodies:
        response = client.post(url, content=json.dumps(body, ensure_ascii=True),
                               headers={**admin, "Idempotency-Key": new_key(), "Content-Type": "application/json"})
        assert response.status_code == 422, (body, response.text)
        assert response.json()["detail"]["code"] == "validation_error"
        assert response.headers["cache-control"] == "no-store"
    assert client.post(url, content="{", headers={**admin, "Idempotency-Key": new_key()}).status_code == 422
    for key in [None, "short", "k" * 101, "bad key spaces", "bad:key:0123"]:
        headers = {**admin, **({"Idempotency-Key": key} if key else {})}
        assert client.post(url, json={"reason": REASON}, headers=headers).status_code == 422
    with Session(engine) as db:
        assert not audits(db, issued)
        assert db.get(Certificate, issued["id"]).status == "ISSUED"


@pytest.mark.parametrize("reason", ["a" * 10, "ก" * 1000, "😀" * 1000])
def test_reason_boundaries_and_trimmed_replay(world, issued, reason):
    client, engine, *_, admin = world
    first = revoke(client, issued, admin, reason=f"  \t{reason}\n ")
    assert first.status_code == 200, first.text
    replay = revoke(client, issued, admin, reason=reason)
    assert replay.status_code == 200 and replay.json() == first.json()
    assert replay.headers["Idempotent-Replayed"] == "true"
    with Session(engine) as db:
        rows = audits(db, issued)
        assert len(rows) == 1 and rows[0].result["audit"]["reason"] == reason


def test_one_audited_transition_replay_conflicts_and_append_only(world, issued):
    client, engine, *_, admin = world
    with Session(engine) as db:
        original = db.get(Certificate, issued["id"])
        original_snapshot = (original.order_id, original.inspection_id, original.result, original.issued_at,
                             original.certificate_no, original.public_token)
        _, second_admin = create_user(db, UserRole.ADMIN)
    first = revoke(client, issued, admin)
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "REVOKED" and not first.json()["can_revoke"]
    assert first.json()["revoked_at"] is not None
    replay = revoke(client, issued, admin)
    assert replay.json() == first.json() and replay.headers["Idempotent-Replayed"] == "true"
    changed = revoke(client, issued, admin, reason="A different private reason")
    assert changed.status_code == 409 and changed.json()["detail"]["code"] == "idempotency_key_reused"
    for headers, key in [(admin, "new-revoke-key-0002"), (second_admin, "cert-revoke-key-0001")]:
        response = revoke(client, issued, headers, key=key)
        assert response.status_code == 409 and response.json()["detail"]["code"] == "certificate_already_revoked"
    with Session(engine) as db:
        rows = audits(db, issued)
        assert len(rows) == 1
        row = rows[0]
        assert row.result["audit"] == {"reason": REASON, "from_status": "ISSUED", "to_status": "REVOKED"}
        cert = db.get(Certificate, issued["id"])
        assert cert.revoked_at == row.committed_at and cert.revoked_at >= cert.issued_at
        assert cert.revocation_reason == "ADMIN_REVOKED"
        assert row.actor_scope == f"USER:{row.actor_id}"
        assert db.get(User, row.actor_id).role == UserRole.ADMIN
        assert (cert.order_id, cert.inspection_id, cert.result, cert.issued_at, cert.certificate_no, cert.public_token) == original_snapshot
        for sql in ("UPDATE fulfillment_commands SET result='{}' WHERE id=:id", "DELETE FROM fulfillment_commands WHERE id=:id"):
            with pytest.raises(IntegrityError), db.begin_nested():
                db.execute(text(sql), {"id": row.id})
        db.get(User, row.actor_id).status = UserStatus.SUSPENDED
        db.commit()
    assert revoke(client, issued, admin).status_code == 403  # authorization also applies to replay


@pytest.mark.parametrize("mode", ["same-key", "different-keys", "changed-payload", "different-admins"])
def test_concurrent_revoke_serializes_one_transition(world, issued, mode):
    _, engine, *_, admin = world
    headers = [admin] * 5
    if mode == "different-admins":
        with Session(engine) as db:
            headers = [create_user(db, UserRole.ADMIN)[1] for _ in range(5)]
    barrier = Barrier(5)

    def request(index):
        with TestClient(app) as client:
            barrier.wait(timeout=10)
            return revoke(client, issued, headers[index],
                          key=f"parallel-revoke-{index if mode == 'different-keys' else 0}",
                          reason=f"Private reason number {index}" if mode == "changed-payload" else REASON)
    with ThreadPoolExecutor(max_workers=5) as pool:
        responses = list(pool.map(request, range(5)))
    successes = [r for r in responses if r.status_code == 200]
    assert len(successes) == (5 if mode == "same-key" else 1), [r.text for r in responses]
    assert sum(r.headers.get("Idempotent-Replayed") == "true" for r in responses) == (4 if mode == "same-key" else 0)
    assert all(r.status_code in {200, 409} for r in responses)
    assert all(r.json() == successes[0].json() for r in successes)
    for response in responses:
        if response.status_code == 409:
            assert response.json()["detail"]["code"] == ("idempotency_key_reused" if mode == "changed-payload" else "certificate_already_revoked")
    with Session(engine) as db:
        assert len(audits(db, issued)) == 1


@pytest.mark.parametrize("change", ["suspend", "role"])
def test_admin_permission_refreshed_after_certificate_lock(world, issued, change):
    client, engine, *_, admin = world
    actor_id = client.get("/auth/me", headers=admin).json()["id"]
    waiting = Event()

    def saw_lock(_conn, _cursor, statement, _params, _context, _many):
        if "FROM certificates" in statement and "FOR UPDATE" in statement:
            waiting.set()

    with Session(engine) as blocker:
        blocker.scalar(select(Certificate).where(Certificate.id == issued["id"]).with_for_update())
        event.listen(engine, "before_cursor_execute", saw_lock)
        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(revoke, client, issued, admin)
                try:
                    assert waiting.wait(10)
                    assert not future.done(), "Revoke must wait for the certificate row lock"
                    with Session(engine) as db:
                        actor = db.get(User, actor_id)
                        if change == "suspend":
                            actor.status = UserStatus.SUSPENDED
                        else:
                            actor.role = UserRole.BUYER
                        db.commit()
                finally:
                    blocker.rollback()
                assert future.result(timeout=10).status_code == 403
        finally:
            event.remove(engine, "before_cursor_execute", saw_lock)
    with Session(engine) as db:
        assert not audits(db, issued)
        assert db.get(Certificate, issued["id"]).status == "ISSUED"


def test_audit_failure_rolls_back_then_same_key_retries(world, issued):
    client, engine, *_, admin = world

    def fail_audit(_conn, _cursor, statement, _params, _context, _many):
        if statement.startswith("INSERT INTO fulfillment_commands"):
            raise RuntimeError("Injected audit persistence failure")

    event.listen(engine, "before_cursor_execute", fail_audit)
    try:
        with TestClient(app, raise_server_exceptions=False) as failing_client:
            assert revoke(failing_client, issued, admin).status_code == 500
    finally:
        event.remove(engine, "before_cursor_execute", fail_audit)
    with Session(engine) as db:
        cert = db.get(Certificate, issued["id"])
        assert cert.status == "ISSUED" and cert.revoked_at is None and cert.revocation_reason is None
        assert not audits(db, issued)
    assert revoke(client, issued, admin).status_code == 200


@pytest.mark.parametrize("state", ["HELD", "RELEASED", "REFUNDED"])
def test_original_business_records_and_money_remain_identical(world, issued, state):
    client, engine, buyer, *_, admin = world
    assert client.post(f"/orders/{issued['order']}/inspection/decision", json={"decision": "CONFIRM"}, headers=buyer).status_code == 200
    with Session(engine) as db:
        order = db.get(Order, issued["order"])
        if state != "HELD":
            # A's real terminal schema fixture, not B's settlement service acceptance.
            row = refund(db, order)
            if state == "RELEASED":
                row.kind, row.source, row.reason = "RELEASE", "AUTO_RECEIPT", "RECEIPT_TIMEOUT"
                row.seller_payout, row.buyer_refund = order.seller_payout, 0
                row.commission_amount = order.commission_fee
                row.inspection_amount, row.shipping_amount = order.inspection_fee, order.shipping_fee
                order.receipt_confirmed_at, order.receipt_confirmation_source = database_now(db), "AUTO"
                order.receipt_deadline_at = order.receipt_confirmed_at - timedelta(seconds=1)
                order.status = "COMPLETED"
            else:
                order.status = "REFUNDED"
            escrow = db.scalar(select(Escrow).where(Escrow.order_id == order.id))
            escrow.status, escrow.settled_at = state, row.settled_at
            db.add(row)
            db.commit()
        before = snapshot(db)
    original_receipt = client.get(f"/orders/{issued['order']}/receipt", headers=buyer).json()
    assert revoke(client, issued, admin).status_code == 200
    with Session(engine) as db:
        assert snapshot(db) == before
    assert client.get(f"/orders/{issued['order']}/receipt", headers=buyer).json() == original_receipt


def test_public_and_private_projections_cache_and_pii_omission(world, issued):
    client, _, buyer, _, inspector, *_, admin = world
    public = f"/certificates/{issued['token']}"
    assert client.get(public + "/json").json()["status"] == "ISSUED"
    assert client.get(public).headers["cache-control"] == "no-store"
    response = revoke(client, issued, admin)
    assert response.status_code == 200
    for path in (public, public + "/json"):
        response = client.get(path, headers={"If-None-Match": '"old-valid"', "If-Modified-Since": "Wed, 01 Oct 2025 00:00:00 GMT"})
        assert response.status_code == 200  # never 304 serving an old ISSUED body
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert response.headers["x-robots-tag"] == "noindex"
        for private in (REASON, "revocation_reason", "actor_id", "admin_id", "@example.test", "recipient_name", "object_key", "public_token"):
            assert private not in response.text
    assert client.get(public + "/json").json() == {
        key: response.json()[key] for key in ("certificate_no", "result", "issued_at", "status")}
    assert response.json()["status"] == "REVOKED"
    assert "ใบรับรองนี้ถูกเพิกถอนแล้ว" in client.get(public).text
    assert client.get(f"/orders/{issued['order']}/inspection", headers=buyer).json()["certificate"]["status"] == "REVOKED"
    assert client.get(f"/inspections/{issued['work']}", headers=inspector).json()["certificate"]["status"] == "REVOKED"
    for suffix in ("", "/json"):
        missing = client.get("/certificates/unknown-token-0000000000" + suffix)
        assert missing.status_code == 404 and missing.headers["cache-control"] == "no-store"
    for path in ("/admin/certificates", f"/admin/certificates/{issued['id']}"):
        response = client.get(path, headers=admin)
        assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
        assert REASON not in response.text and "actor_id" not in response.text


def test_bounded_list_pagination_and_filter(world, issued):
    client, _, *_, admin = world
    first = client.get("/admin/certificates?limit=1", headers=admin)
    assert first.status_code == 200 and len(first.json()["items"]) == 1
    assert first.json()["items"][0]["id"] == issued["id"]
    cursor = first.json()["next_before_id"]
    if cursor is not None:
        following = client.get(f"/admin/certificates?limit=1&before_id={cursor}", headers=admin).json()
        assert all(item["id"] < cursor for item in following["items"])
    for query in ("limit=0", "limit=51", "before_id=0", "before_id=9999999999999", "status=UNKNOWN"):
        assert client.get(f"/admin/certificates?{query}", headers=admin).status_code == 422
    for ident in (0, -1, "invalid", 9999999999999):
        assert client.get(f"/admin/certificates/{ident}", headers=admin).status_code == 422
        assert revoke(client, {"id": ident}, admin).status_code == 422
    assert revoke(client, issued, admin).status_code == 200
    assert all(item["status"] == "REVOKED" for item in client.get("/admin/certificates?status=REVOKED", headers=admin).json()["items"])
