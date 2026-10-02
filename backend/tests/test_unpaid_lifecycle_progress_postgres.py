"""Bounded unpaid traversal with a poison row, restarts and deadline ordering."""
from datetime import timedelta
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.models.fulfillment import FulfillmentCommand
from app.models.order import Order
from app.services import unpaid_expiry_worker
from app.services.lifecycle_progress import scan_cursor
from tests.order_helpers import create_product, order_body
from tests.test_finish_flow_postgres import pg_engine, isolate_rows, world, post, scan

pytestmark = pytest.mark.skipif(not os.getenv('FINISH_TEST_DATABASE_URL'), reason='owned local FINISH test database required')


def unpaid_pair(world):
    first = post(world, '/orders', world[2], order_body(world[6]))
    assert first.status_code == 201, first.text
    first_id = first.json()['id']
    with Session(world[1]) as db:
        product = create_product(db, db.get(Order, first_id).seller_id)
    second = post(world, '/orders', world[2], order_body(product))
    assert second.status_code == 201, second.text
    return first_id, second.json()['id']


def due_at(world, ids):
    with Session(world[1]) as db:
        return max(db.get(Order, i).expires_at for i in ids) + timedelta(seconds=1)


def snapshot(world):
    with world[1].connect() as db:
        tables = {
            name: db.execute(text(f'SELECT to_jsonb(t) FROM "{name}" t ORDER BY to_jsonb(t)::text')).scalars().all()
            for name in inspect(db).get_table_names()
        }
        sequences = db.execute(text('SELECT schemaname, sequencename, last_value FROM pg_sequences ORDER BY schemaname, sequencename')).all()
        return tables, sequences


@pytest.mark.parametrize('reverse_deadlines', [False, True])
def test_bounded_runs_pass_failed_row_then_wrap_for_recovery(world, monkeypatch, reverse_deadlines):
    first, second = unpaid_pair(world)
    if reverse_deadlines:
        # Deadline priority differs from ID priority; both remain valid snapshots.
        with world[1].begin() as db:
            db.execute(text("UPDATE orders SET created_at=created_at-interval '1 hour', expires_at=expires_at-interval '1 hour' WHERE id=:id"), {'id': second})
        first, second = second, first
    due = due_at(world, (first, second))
    expire = unpaid_expiry_worker.expire_orders_in_transaction

    def fail_first(db, *conditions, **kwargs):
        if conditions[0].right.value == first:
            raise RuntimeError('isolated persistent unpaid write failure')
        return expire(db, *conditions, **kwargs)

    monkeypatch.setattr(unpaid_expiry_worker, 'expire_orders_in_transaction', fail_first)
    options = dict(apply=True, clock=lambda: due, batch_size=1, max_batches=1)
    first_run = scan(world, **options).jobs['unpaid_expiry']
    second_run = scan(world, **options).jobs['unpaid_expiry']
    third_run = scan(world, **options).jobs['unpaid_expiry']
    assert (first_run.failed, second_run.applied, third_run.failed) == (1, 1, 1)
    with Session(world[1]) as db:
        assert db.get(Order, first).status == 'WAITING_PAYMENT'
        assert db.get(Order, second).status == 'CANCELLED'
        cursor = db.scalar(select(FulfillmentCommand).where(FulfillmentCommand.actor_scope == 'SYSTEM:lifecycle-cursor', FulfillmentCommand.resource_id == 5).order_by(FulfillmentCommand.id.desc()))
        assert cursor.result['last_order_id'] == first
        assert cursor.result['last_expires_at']
    before = snapshot(world)
    dry = scan(world, **{**options, 'apply': False}).jobs['unpaid_expiry']
    assert dry.scanned == dry.eligible == 1 and dry.applied == 0
    assert snapshot(world) == before
    monkeypatch.setattr(unpaid_expiry_worker, 'expire_orders_in_transaction', expire)
    assert scan(world, **options).jobs['unpaid_expiry'].applied == 1
    assert scan(world, **options).jobs['unpaid_expiry'].applied == 0
    for run in (first_run, second_run, third_run, dry):
        assert run.scanned == run.batches == 1


def test_unpaid_cursor_owner_skips_competitor_and_dry_run_is_pure(world):
    ids = unpaid_pair(world)
    due = due_at(world, ids)
    factory = lambda: Session(world[1], autoflush=False)
    with scan_cursor(factory, 5, apply=True) as owner:
        run = scan(world, apply=True, clock=lambda: due, batch_size=1, max_batches=1)
        assert run.jobs['unpaid_expiry'].scanned == 0
        assert owner.scanned == owner.last_order_id == 0
        before = snapshot(world)
        dry = scan(world, apply=False, clock=lambda: due, batch_size=1, max_batches=1)
        assert dry.jobs['unpaid_expiry'].eligible == 1
        assert snapshot(world) == before
    assert scan(world, apply=True, clock=lambda: due, batch_size=1, max_batches=1).jobs['unpaid_expiry'].applied == 1


def test_equal_deadline_cursor_wrap_visits_each_candidate_once(world, monkeypatch):
    ids = unpaid_pair(world)
    with world[1].begin() as db:
        db.execute(text('UPDATE orders SET created_at=(SELECT created_at FROM orders WHERE id=:first), expires_at=(SELECT expires_at FROM orders WHERE id=:first) WHERE id=:second'), {'first': ids[0], 'second': ids[1]})
    due = due_at(world, ids)
    visited = []

    def fail(db, *conditions, **kwargs):
        visited.append(conditions[0].right.value)
        raise RuntimeError('isolated unpaid outage')

    monkeypatch.setattr(unpaid_expiry_worker, 'expire_orders_in_transaction', fail)
    scan(world, apply=True, clock=lambda: due, batch_size=1, max_batches=1)
    visited.clear()
    result = scan(world, apply=True, clock=lambda: due, batch_size=1, max_batches=10).jobs['unpaid_expiry']
    assert visited == [ids[1], ids[0]]
    assert result.scanned == result.failed == 2


def test_unpaid_fairness_survives_fresh_cli_processes_and_repair(world):
    first, second = unpaid_pair(world)
    with world[1].begin() as db:
        db.execute(text("WITH sample AS (SELECT clock_timestamp() AS at) UPDATE orders SET created_at=sample.at-interval '31 minutes', expires_at=sample.at-interval '1 minute' FROM sample WHERE id IN (:first,:second)"), {'first': first, 'second': second})
        db.execute(text(f"""CREATE FUNCTION unpaid_poison_test() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.id={first} AND NEW.status='CANCELLED' THEN
          RAISE EXCEPTION 'isolated first unpaid write failure';
        END IF; RETURN NEW; END $$"""))
        db.execute(text('CREATE TRIGGER unpaid_poison_test BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION unpaid_poison_test()'))
    target = world[1].url.database
    url = world[1].url.render_as_string(hide_password=False)
    env = {**os.environ, 'UNPAID_PROGRESS_TEST_URL': url}
    command = [sys.executable, '-m', 'scripts.run_lifecycle_jobs', '--url-env', 'UNPAID_PROGRESS_TEST_URL',
               '--target', target, '--environment', 'local', '--apply', '--confirm-target', target,
               '--batch-size', '1', '--max-batches', '1']

    def invoke():
        run = subprocess.run(command, cwd=Path(__file__).resolve().parents[1], env=env, capture_output=True, text=True, timeout=20)
        assert url not in run.stdout + run.stderr
        summary = json.loads(next(l.split('lifecycle scan ', 1)[1] for l in run.stderr.splitlines() if 'lifecycle scan ' in l))
        job = summary['jobs']['unpaid_expiry']
        assert job['scanned'] <= 1
        assert run.returncode == int(job['failed'] != 0)
        return job

    try:
        runs = [invoke() for _ in range(3)]
        assert [run['failed'] for run in runs] == [1, 0, 1]
        assert sum(run['applied'] for run in runs) == 1
        with Session(world[1]) as db:
            assert db.get(Order, first).status == 'WAITING_PAYMENT'
            assert db.get(Order, second).status == 'CANCELLED'
    finally:
        with world[1].begin() as db:
            db.execute(text('DROP TRIGGER unpaid_poison_test ON orders'))
            db.execute(text('DROP FUNCTION unpaid_poison_test()'))
    # One candidate was already cancelled; repair must cancel only the remaining one.
    assert sum(invoke()['applied'] for _ in range(2)) == 1
    with Session(world[1]) as db:
        assert all(db.get(Order, i).status == 'CANCELLED' for i in (first, second))
