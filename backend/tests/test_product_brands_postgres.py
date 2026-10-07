"""Optional concurrency checks against a disposable, loopback PostgreSQL only."""

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema, DropSchema

from app.models.brand import Brand
from app.services.product_brands import resolve_product_brand


@pytest.fixture
def isolated_engine():
    value = os.getenv("F_BRAND_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set F_BRAND_TEST_DATABASE_URL to the disposable f_brand_test database")
    url = make_url(value)
    assert url.get_backend_name() == "postgresql"
    assert url.host in {"127.0.0.1", "localhost"}
    assert url.database == "f_brand_test", "Never run this suite against the team database"
    schema = f"f_brand_{uuid4().hex}"
    engine = create_engine(url, connect_args={"options": "-c lock_timeout=5000 -c statement_timeout=10000"})
    with engine.begin() as connection:
        connection.execute(CreateSchema(schema))
    test_engine = engine.execution_options(schema_translate_map={None: schema})
    try:
        Brand.__table__.create(test_engine)
        yield test_engine
    finally:
        with engine.begin() as connection:
            connection.execute(DropSchema(schema, cascade=True))
        engine.dispose()


@pytest.mark.parametrize("names", [
    ["Local Brand", "local brand", "LOCAL BRAND", " Local Brand ", "local BRAND", "LOCAL brand"],
    ["İstanbul", "İSTANBUL", "İstanBul", " İstanbul ", "İSTanbul", "İsTANBUL"],
])
def test_simultaneous_sellers_reuse_one_brand(isolated_engine, names):
    barrier = Barrier(len(names))

    def save(name):
        with Session(isolated_engine) as db:
            barrier.wait(timeout=5)
            brand = resolve_product_brand(db, brand_name=name)
            brand_id = brand.id
            db.commit()
            return brand_id

    with ThreadPoolExecutor(max_workers=len(names)) as executor:
        ids = list(executor.map(save, names))
    assert len(set(ids)) == 1
    with Session(isolated_engine) as db:
        assert db.scalar(select(func.count()).select_from(Brand)) == 1


def test_rollback_releases_brand_lock_and_does_not_leave_a_row(isolated_engine):
    with Session(isolated_engine) as db:
        resolve_product_brand(db, brand_name="Rollback Brand")
        db.rollback()
    # A different connection must be able to acquire the transaction lock.
    def save():
        with Session(isolated_engine) as db:
            brand = resolve_product_brand(db, brand_name="rollback brand")
            db.commit()
            return brand.brand_name
    with ThreadPoolExecutor(max_workers=1) as executor:
        assert executor.submit(save).result(timeout=5) == "rollback brand"
    with Session(isolated_engine) as db:
        assert db.scalar(select(func.count()).select_from(Brand)) == 1
