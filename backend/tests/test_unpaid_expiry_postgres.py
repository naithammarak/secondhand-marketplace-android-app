"""F2 worker checks against the disposable PostgreSQL Order test database."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event
import os
from pathlib import Path
import subprocess
import sys
import time

import pytest
from sqlalchemy import select
from sqlalchemy.engine import make_url

import app.api.orders as orders_api
import app.services.order_expiry as expiry
import app.services.unpaid_expiry_worker as worker
from app.models.order import Order, Payment
from app.models.product import Product
from app.services.order_pricing import utcnow
from tests.order_helpers import create_product
from tests.test_orders_postgres import PG_URL, Session, db, pg_engine, world, insert_order, pay, create_order, cancel


def held_order(db, world, *, product_id=None, deadline=None, key="f2-order"):
    product_id = product_id or world["product_id"]
    order = insert_order(db, world, product_id=product_id, key=key)
    order.expires_at = deadline or utcnow() - timedelta(minutes=1)
    db.get(Product, product_id).status = "RESERVED"
    db.commit()
    return order.id, product_id


def state(db, order_id, product_id):
    db.expire_all()
    order = db.get(Order, order_id)
    product = db.get(Product, product_id)
    return order.status, order.cancel_reason, product.status


def test_no_http_dry_run_boundary_batches_and_restart(db, world, Session):
    instant = utcnow()
    due_id, due_product = held_order(db, world, deadline=instant, key="f2-due")
    later_product = create_product(db, world["seller"])
    later_id, _ = held_order(
        db, world, product_id=later_product, deadline=instant + timedelta(microseconds=1), key="f2-later"
    )
    third_product = create_product(db, world["seller"])
    third_id, _ = held_order(
        db, world, product_id=third_product, deadline=instant - timedelta(minutes=1), key="f2-third"
    )
    fourth_product = create_product(db, world["seller"])
    fourth_id, _ = held_order(
        db, world, product_id=fourth_product, deadline=instant - timedelta(minutes=2), key="f2-fourth"
    )

    dry = worker.run_once(Session, batch_size=1, max_batches=2, clock=lambda: instant)
    assert (dry.scanned, dry.eligible, dry.cancelled, dry.batches, dry.limit_reached) == (2, 2, 0, 2, True)
    assert state(db, fourth_id, fourth_product) == ("WAITING_PAYMENT", None, "RESERVED")

    first = worker.run_once(Session, apply=True, batch_size=1, max_batches=2, clock=lambda: instant)
    assert (first.scanned, first.cancelled, first.failed, first.limit_reached) == (2, 2, 0, True)
    assert state(db, fourth_id, fourth_product) == ("CANCELLED", "EXPIRED", "AVAILABLE")
    second = worker.run_once(Session, apply=True, batch_size=1, max_batches=2, clock=lambda: instant)
    assert (second.scanned, second.cancelled, second.failed) == (1, 1, 0)
    assert state(db, due_id, due_product) == ("CANCELLED", "EXPIRED", "AVAILABLE")
    assert state(db, later_id, later_product) == ("WAITING_PAYMENT", None, "RESERVED")
    assert worker.run_once(Session, apply=True, clock=lambda: instant).cancelled == 0
    assert worker.run_once(
        Session, apply=True, clock=lambda: instant + timedelta(microseconds=1)
    ).cancelled == 1
    assert state(db, later_id, later_product) == ("CANCELLED", "EXPIRED", "AVAILABLE")


def test_release_never_frees_a_product_with_a_new_active_order(db, world, Session):
    old_id, product_id = held_order(db, world)
    assert worker.run_once(Session, apply=True).cancelled == 1
    assert state(db, old_id, product_id) == ("CANCELLED", "EXPIRED", "AVAILABLE")
    newer = insert_order(db, world, product_id=product_id, key="f2-new-owner")
    db.get(Product, product_id).status = "RESERVED"
    db.commit()
    expiry.release_reserved_products(db, [product_id])
    db.commit()
    assert state(db, newer.id, product_id) == ("WAITING_PAYMENT", None, "RESERVED")


def test_two_workers_only_one_cancels(db, world, Session, monkeypatch):
    order_id, product_id = held_order(db, world)
    locked, release = Event(), Event()
    original = worker.expire_orders_in_transaction

    def pause(db, *conditions, now):
        locked.set()
        assert release.wait(10)
        return original(db, *conditions, now=now)

    monkeypatch.setattr(worker, "expire_orders_in_transaction", pause)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(worker.run_once, Session, apply=True)
        assert locked.wait(10)
        second = pool.submit(worker.run_once, Session, apply=True)
        try:
            other = second.result(timeout=10)
            assert (other.cancelled, other.skipped) == (0, 1)
        finally:
            release.set()
        assert first.result(timeout=10).cancelled == 1
    assert state(db, order_id, product_id) == ("CANCELLED", "EXPIRED", "AVAILABLE")
    assert worker.run_once(Session, apply=True).cancelled == 0


def test_payment_lock_is_skipped_then_paid_order_is_preserved(db, world, Session, monkeypatch):
    order_id = create_order(world)
    locked, release = Event(), Event()
    original = orders_api.receipt_number

    def pause(order_id):
        locked.set()
        assert release.wait(10)
        return original(order_id)

    monkeypatch.setattr(orders_api, "receipt_number", pause)
    future = utcnow() + timedelta(hours=1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        payer = pool.submit(pay, order_id, world["a"])
        assert locked.wait(10)
        result = worker.run_once(Session, apply=True, clock=lambda: future)
        assert (result.cancelled, result.skipped) == (0, 1)
        release.set()
        assert payer.result(timeout=10).status_code == 200
    assert worker.run_once(Session, apply=True, clock=lambda: future).cancelled == 0
    assert state(db, order_id, world["product_id"])[0] == "WAITING_SELLER_SHIP"
    assert state(db, order_id, world["product_id"])[2] == "RESERVED"
    assert db.scalar(select(Payment.id).where(Payment.order_id == order_id)) is not None


def test_worker_lock_wins_over_late_payment(db, world, Session, monkeypatch):
    order_id, product_id = held_order(db, world)
    locked, release = Event(), Event()
    original = worker.expire_orders_in_transaction

    def pause(db, *conditions, now):
        locked.set()
        assert release.wait(10)
        return original(db, *conditions, now=now)

    monkeypatch.setattr(worker, "expire_orders_in_transaction", pause)
    with ThreadPoolExecutor(max_workers=2) as pool:
        sweep = pool.submit(worker.run_once, Session, apply=True)
        assert locked.wait(10)
        payer = pool.submit(pay, order_id, world["a"])
        try:
            time.sleep(0.1)
            assert not payer.done()
        finally:
            release.set()
        assert sweep.result(timeout=10).cancelled == 1
        assert payer.result(timeout=10).status_code == 409
    assert state(db, order_id, product_id) == ("CANCELLED", "EXPIRED", "AVAILABLE")
    assert db.scalar(select(Payment.id).where(Payment.order_id == order_id)) is None


def test_cancel_lock_wins_and_worker_does_not_overwrite_reason(db, world, Session, monkeypatch):
    order_id = create_order(world)
    locked, release = Event(), Event()
    original = orders_api.cancel_waiting_order

    def pause(db, order, reason, now):
        locked.set()
        assert release.wait(10)
        return original(db, order, reason, now)

    monkeypatch.setattr(orders_api, "cancel_waiting_order", pause)
    future = utcnow() + timedelta(hours=1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        canceller = pool.submit(cancel, order_id, world["a"])
        assert locked.wait(10)
        result = worker.run_once(Session, apply=True, clock=lambda: future)
        assert (result.cancelled, result.skipped) == (0, 1)
        release.set()
        assert canceller.result(timeout=10).status_code == 200
    assert state(db, order_id, world["product_id"]) == ("CANCELLED", "BUYER", "AVAILABLE")
    assert worker.run_once(Session, apply=True, clock=lambda: future).cancelled == 0


def test_failure_rolls_back_one_order_and_retries_after_restart(db, world, Session, monkeypatch, caplog):
    first_id, first_product = held_order(db, world, key="f2-fail")
    other_product = create_product(db, world["seller"])
    other_id, _ = held_order(db, world, product_id=other_product, key="f2-ok")
    original = expiry.release_reserved_products

    def fail_first(db, product_ids):
        if first_product in product_ids:
            raise RuntimeError("injected failure with private-marker")
        return original(db, product_ids)

    monkeypatch.setattr(expiry, "release_reserved_products", fail_first)
    with caplog.at_level("ERROR"):
        result = worker.run_once(Session, apply=True)
    assert (result.failed, result.cancelled) == (1, 1)
    assert "private-marker" not in caplog.text
    assert state(db, first_id, first_product) == ("WAITING_PAYMENT", None, "RESERVED")
    assert state(db, other_id, other_product) == ("CANCELLED", "EXPIRED", "AVAILABLE")

    monkeypatch.setattr(expiry, "release_reserved_products", original)
    assert worker.run_once(Session, apply=True).cancelled == 1
    assert state(db, first_id, first_product) == ("CANCELLED", "EXPIRED", "AVAILABLE")


def test_recurring_stops_without_waiting_for_another_cycle(monkeypatch):
    stop = Event()
    calls = []

    def once(*args, **kwargs):
        calls.append(1)
        stop.set()
        return worker.ScanResult()

    monkeypatch.setattr(worker, "run_once", once)
    assert worker.run_recurring(lambda: None, stop, interval_seconds=300) == 0
    assert calls == [1]


def test_cli_dry_run_apply_and_new_process_restart(db, world):
    order_id, product_id = held_order(db, world)
    target = make_url(PG_URL).database
    env = {**os.environ, "ORDER_EXPIRY_DATABASE_URL": PG_URL}
    env.pop("DATABASE_URL", None)
    command = [
        sys.executable, "-m", "scripts.release_expired_orders", "--url-env", "ORDER_EXPIRY_DATABASE_URL",
        "--target", target, "--environment", "local",
    ]

    def invoke(*extra):
        result = subprocess.run(
            [*command, *extra], cwd=Path(__file__).resolve().parents[1],
            env=env, text=True, capture_output=True, timeout=20,
        )
        assert PG_URL not in result.stdout + result.stderr
        return result

    dry = invoke()
    assert dry.returncode == 0 and "mode=dry-run" in dry.stderr and "cancelled=0" in dry.stderr
    assert state(db, order_id, product_id) == ("WAITING_PAYMENT", None, "RESERVED")
    denied = invoke("--apply")
    assert denied.returncode != 0 and "requires --confirm-target" in denied.stderr
    mismatch = invoke("--target", "wrong_test_database")
    assert mismatch.returncode != 0 and "does not match --target" in mismatch.stderr
    assert state(db, order_id, product_id) == ("WAITING_PAYMENT", None, "RESERVED")
    applied = invoke("--apply", "--confirm-target", target)
    assert applied.returncode == 0 and "cancelled=1" in applied.stderr
    assert state(db, order_id, product_id) == ("CANCELLED", "EXPIRED", "AVAILABLE")
    restarted = invoke("--apply", "--confirm-target", target)
    assert restarted.returncode == 0 and "cancelled=0" in restarted.stderr
    repeating = subprocess.Popen(
        [*command, "--apply", "--confirm-target", target, "--repeat"],
        cwd=Path(__file__).resolve().parents[1], env=env, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    try:
        assert "mode=apply" in repeating.stderr.readline()
        assert "scanned=0" in repeating.stderr.readline()  # immediate startup scan
        repeating.terminate()
        _, errors = repeating.communicate(timeout=10)
        assert repeating.returncode == 0
        assert PG_URL not in errors
    finally:
        if repeating.poll() is None:
            repeating.kill()
            repeating.communicate(timeout=10)
