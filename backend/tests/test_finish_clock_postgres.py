"""Independent PostgreSQL deadline linearization proof, not settlement proof.

The test table only represents a guarded row; no substitute Order/Escrow schema
is created. Run exclusively against a disposable, empty local test database.
"""

from concurrent.futures import ThreadPoolExecutor
import os
from threading import Event
import time

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.services.finish_policy import before_deadline, database_now


URL = os.getenv("FINISH_CLOCK_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="Separate FINISH_CLOCK_TEST_DATABASE_URL required")


@pytest.fixture
def clock_engine():
    parsed = make_url(URL)
    if (parsed.get_backend_name() != "postgresql"
            or parsed.host not in {"127.0.0.1", "localhost", "::1"}
            or "test" not in (parsed.database or "").lower()
            or URL == os.getenv("DATABASE_URL")):
        pytest.fail("Clock test requires a distinct disposable local PostgreSQL database")
    engine = create_engine(URL)
    with engine.begin() as db:
        if inspect(db).get_table_names():
            pytest.fail("Clock test database must be empty")
        db.execute(text("CREATE TABLE finish_clock_probe (id int PRIMARY KEY, deadline timestamptz)"))
        db.execute(text("INSERT INTO finish_clock_probe VALUES (1, NULL)"))
    try:
        yield engine
    finally:
        with engine.begin() as db:
            db.execute(text("DROP TABLE finish_clock_probe"))
        engine.dispose()


def test_request_started_before_deadline_but_lock_acquired_after_deadline_is_late(clock_engine):
    started = Event()
    worker_pid = []

    def blocked_request():
        with Session(clock_engine) as db:
            old_clock = db.scalar(text("SELECT transaction_timestamp()"))
            worker_pid.append(db.scalar(text("SELECT pg_backend_pid()")))
            started.set()
            deadline = db.scalar(text("SELECT deadline FROM finish_clock_probe WHERE id = 1 FOR UPDATE"))
            fresh_clock = database_now(db)
            return old_clock, deadline, fresh_clock

    with clock_engine.connect() as holder, ThreadPoolExecutor(max_workers=1) as pool:
        transaction = holder.begin()
        holder.execute(text("SELECT id FROM finish_clock_probe WHERE id = 1 FOR UPDATE"))
        future = pool.submit(blocked_request)
        try:
            assert started.wait(5)
            end = time.monotonic() + 5
            with clock_engine.connect() as observer:
                while time.monotonic() < end:
                    wait_type = observer.scalar(text("SELECT wait_event_type FROM pg_stat_activity WHERE pid = :pid"), {"pid": worker_pid[0]})
                    observer.rollback()
                    if wait_type == "Lock":
                        break
                    time.sleep(0.01)
                else:
                    pytest.fail("Independent request did not actually block on the row lock")
            holder.execute(text("UPDATE finish_clock_probe SET deadline = clock_timestamp() WHERE id = 1"))
            transaction.commit()
        finally:
            if transaction.is_active:
                transaction.rollback()
        old_clock, deadline, fresh_clock = future.result(timeout=5)
    assert old_clock < deadline < fresh_clock
    assert before_deadline(old_clock, deadline)
    assert not before_deadline(fresh_clock, deadline)
