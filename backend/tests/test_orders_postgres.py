"""ORDER-01/02/03 บน PostgreSQL แยก: migration, constraint และคำขอพร้อมกัน

รันเฉพาะเมื่อกำหนด ORDER_TEST_DATABASE_URL ไปยังฐานข้อมูลทดสอบที่ทิ้งได้ เช่น

    docker run -d --name sa-order-test-pg -e POSTGRES_PASSWORD=order_test_only \
        -e POSTGRES_DB=order_test -p 55432:5432 postgres:16-alpine
    ORDER_TEST_DATABASE_URL=postgresql+psycopg://postgres:order_test_only@localhost:55432/order_test

ชุดนี้ลบ schema public ของฐานข้อมูลนั้นทั้งหมด จึงยอมรันเฉพาะ host ในเครื่องและชื่อฐานข้อมูลที่มีคำว่า test
ห้ามชี้ไปที่ฐานข้อมูลกลาง (Supabase)
"""

import os
import threading
import time
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

import app.api.orders as orders_module
from app.database import get_db
from app.main import app
from app.models.order import Escrow, Order, Payment, PaymentAttempt, Receipt
from app.models.product import Product
from app.models.user import UserRole
from app.services.order_pricing import payment_deadline, utcnow
from tests.order_helpers import (
    VALID_ADDRESS,
    create_product,
    create_user,
    new_key,
    order_body,
    patch_auth,
)

PG_URL = os.getenv("ORDER_TEST_DATABASE_URL")
BACKEND_DIR = Path(__file__).resolve().parents[1]
BASE_REVISION = "d5c9e2a71b40"
ORDER_TABLES = ("orders", "payment_attempts", "payments", "escrows", "receipts")

pytestmark = pytest.mark.skipif(
    not PG_URL, reason="ORDER_TEST_DATABASE_URL is not set (isolated PostgreSQL required)"
)


def assert_isolated_database(url: str) -> None:
    parsed = make_url(url)
    if parsed.get_backend_name() != "postgresql":
        raise RuntimeError("ORDER_TEST_DATABASE_URL must be PostgreSQL")
    if parsed.host not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("refusing to run destructive tests against a non-local database")
    if "test" not in (parsed.database or ""):
        raise RuntimeError("refusing to run: database name must contain 'test'")


def run_alembic(action: str, revision: str) -> None:
    from alembic import command
    from alembic.config import Config

    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = PG_URL
    try:
        config = Config(str(BACKEND_DIR / "alembic.ini"))
        getattr(command, action)(config, revision)
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous


@pytest.fixture(scope="module")
def pg_engine():
    assert_isolated_database(PG_URL)
    engine = create_engine(PG_URL, pool_size=20, max_overflow=10)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    run_alembic("upgrade", "head")
    yield engine
    engine.dispose()


@pytest.fixture
def Session(pg_engine, monkeypatch):
    patch_auth(monkeypatch)
    monkeypatch.setenv("PAYMENT_SIMULATION_ENABLED", "true")
    monkeypatch.delenv("APP_ENV", raising=False)
    with pg_engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE receipts, escrows, payments, payment_attempts, orders, products, "
                "brands, categories, verifications, users RESTART IDENTITY CASCADE"
            )
        )
    factory = sessionmaker(bind=pg_engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield factory
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def db(Session):
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def world(db):
    buyer_a, a = create_user(db, UserRole.BUYER, name="Buyer A")
    buyer_b, b = create_user(db, UserRole.BUYER, name="Buyer B")
    seller, seller_h = create_user(db, UserRole.SELLER, name="Seller Owner")
    product_id = create_product(db, seller)
    return {"buyer_a": buyer_a, "a": a, "buyer_b": buyer_b, "b": b, "seller": seller,
            "seller_h": seller_h, "product_id": product_id}


def count(db, model, **filters):
    db.expire_all()
    query = select(func.count()).select_from(model)
    for column, value in filters.items():
        query = query.where(getattr(model, column) == value)
    return db.scalar(query)


def post_order(headers, body, key=None):
    with TestClient(app) as client:
        return client.post("/orders", json=body, headers={**headers, "Idempotency-Key": key or new_key()})


def pay(order_id, headers, outcome="SUCCESS", key=None):
    with TestClient(app) as client:
        return client.post(
            f"/orders/{order_id}/payments/simulate",
            json={"outcome": outcome},
            headers={**headers, "Idempotency-Key": key or new_key()},
        )


def cancel(order_id, headers):
    with TestClient(app) as client:
        return client.post(f"/orders/{order_id}/cancel", headers=headers)


def run_parallel(calls):
    """ปล่อยทุกคำขอพร้อมกันด้วย barrier แล้วคืนผลตามลำดับ"""
    barrier = threading.Barrier(len(calls))
    results = [None] * len(calls)

    def worker(index, call):
        barrier.wait()
        results[index] = call()

    threads = [threading.Thread(target=worker, args=(i, call)) for i, call in enumerate(calls)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    return results


def insert_order(db, world, product_id=None, key="manual-key-0001", total=Decimal("1350.00")):
    order = Order(
        buyer_id=world["buyer_a"],
        seller_id=world["seller"],
        product_id=product_id or world["product_id"],
        status="WAITING_PAYMENT",
        product_name="x",
        product_condition="x",
        product_size="x",
        currency="THB",
        item_price=Decimal("1200.00"),
        shipping_fee=Decimal("50.00"),
        inspection_fee=Decimal("100.00"),
        commission_fee=Decimal("60.00"),
        total_amount=total,
        seller_payout=Decimal("1140.00"),
        expires_at=payment_deadline(utcnow()),
        **{f"ship_{k}": v for k, v in {**VALID_ADDRESS, "phone": "0812345678"}.items()},
        idempotency_key=key,
        request_hash="0" * 64,
    )
    db.add(order)
    db.commit()
    return order


# ------------------------------------------------------------------ migration


def test_migration_downgrade_and_upgrade_round_trip(pg_engine):
    def tables():
        with pg_engine.connect() as connection:
            return set(
                connection.execute(
                    text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
                ).scalars()
            )

    assert set(ORDER_TABLES) <= tables()
    # downgrade ปฏิเสธการทำงานเมื่อมี Order สถานะ CANCELLED อยู่ จึงล้างข้อมูลก่อนตรวจ schema
    with pg_engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE receipts, escrows, payments, payment_attempts, orders "
                "RESTART IDENTITY CASCADE"
            )
        )
    run_alembic("downgrade", BASE_REVISION)
    remaining = tables()
    assert not (set(ORDER_TABLES) & remaining)
    assert {"users", "products", "verifications"} <= remaining  # ตารางเดิมไม่ถูกแตะ
    run_alembic("upgrade", "head")
    assert set(ORDER_TABLES) <= tables()

    with pg_engine.connect() as connection:
        rls = dict(
            connection.execute(
                text(
                    "SELECT relname, relrowsecurity FROM pg_class "
                    "WHERE relname = ANY(:names) AND relkind = 'r'"
                ),
                {"names": list(ORDER_TABLES)},
            ).all()
        )
        assert rls == {name: True for name in ORDER_TABLES}
        money_types = set(
            connection.execute(
                text(
                    "SELECT data_type || '(' || numeric_precision || ',' || numeric_scale || ')' "
                    "FROM information_schema.columns WHERE table_name = 'orders' "
                    "AND column_name IN ('item_price','shipping_fee','inspection_fee',"
                    "'commission_fee','total_amount','seller_payout')"
                )
            ).scalars()
        )
        assert money_types == {"numeric(12,2)"}


# ------------------------------------------------------------------ constraints


def test_product_can_have_only_one_active_order(db, world):
    insert_order(db, world, key="manual-key-0001")
    with pytest.raises(IntegrityError):
        insert_order(db, world, key="manual-key-0002")
    db.rollback()


def test_order_checks_reject_bad_money_and_self_purchase(db, world):
    with pytest.raises(IntegrityError):
        insert_order(db, world, total=Decimal("1.00"))  # total ไม่ตรงสูตร
    db.rollback()
    with pytest.raises(IntegrityError):
        insert_order(db, {**world, "seller": world["buyer_a"]})  # buyer = seller
    db.rollback()
    assert count(db, Order) == 0


def test_idempotency_key_unique_per_buyer(db, world):
    other = create_product(db, world["seller"], name="อีกชิ้น")
    insert_order(db, world, key="same-key-123")
    with pytest.raises(IntegrityError):
        insert_order(db, world, product_id=other, key="same-key-123")
    db.rollback()


def test_money_rows_are_unique_per_order_and_match_order_total(db, world):
    order = insert_order(db, world)
    first = PaymentAttempt(order_id=order.id, outcome="SUCCEEDED", amount=Decimal("1350.00"),
                           idempotency_key="attempt-key-1", request_hash="0" * 64)
    second = PaymentAttempt(order_id=order.id, outcome="SUCCEEDED", amount=Decimal("1350.00"),
                            idempotency_key="attempt-key-2", request_hash="0" * 64)
    db.add_all([first, second])
    db.commit()

    payment = Payment(order_id=order.id, attempt_id=first.id, amount=Decimal("1350.00"))
    db.add(payment)
    db.commit()

    for row in (
        Payment(order_id=order.id, attempt_id=second.id, amount=Decimal("1350.00")),
        PaymentAttempt(order_id=order.id, outcome="FAILED", amount=Decimal("1350.00"),
                       idempotency_key="attempt-key-1", request_hash="0" * 64),
        PaymentAttempt(order_id=order.id, outcome="FAILED", amount=Decimal("1.00"),
                       idempotency_key="attempt-key-9", request_hash="0" * 64),
    ):
        db.add(row)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    db.add(Escrow(order_id=order.id, payment_id=payment.id, amount=Decimal("1350.00"), status="HELD"))
    db.commit()
    for row in (
        Escrow(order_id=order.id, payment_id=payment.id, amount=Decimal("1350.00"), status="HELD"),
        Escrow(order_id=order.id, payment_id=payment.id, amount=Decimal("99.00"), status="HELD"),
    ):
        db.add(row)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    receipt_fields = dict(product_name="x", currency="THB", item_price=Decimal("1200.00"),
                          shipping_fee=Decimal("50.00"), inspection_fee=Decimal("100.00"))
    db.add(Receipt(order_id=order.id, payment_id=payment.id, receipt_no="RC-A",
                   total_amount=Decimal("1350.00"), **receipt_fields))
    db.commit()
    db.add(Receipt(order_id=order.id, payment_id=payment.id, receipt_no="RC-B",
                   total_amount=Decimal("1350.00"), **receipt_fields))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    assert count(db, Payment) == 1
    assert count(db, Escrow) == 1
    assert count(db, Receipt) == 1


# ------------------------------------------------------------------ create races (ORDER-02)


def test_two_buyers_racing_have_exactly_one_winner_deterministic(world, db, monkeypatch):
    """A จองแล้วค้าง transaction ไว้ B ต้องรอ row lock แล้วแพ้ด้วย 409"""
    reserved = threading.Event()
    release = threading.Event()
    real = orders_module.calculate_amounts
    first_call = threading.Lock()
    state = {"blocked": False}

    def slow_calculate(price):
        with first_call:
            should_block = not state["blocked"]
            state["blocked"] = True
        if should_block:
            reserved.set()
            release.wait(timeout=30)
        return real(price)

    monkeypatch.setattr(orders_module, "calculate_amounts", slow_calculate)
    results = {}
    thread_a = threading.Thread(
        target=lambda: results.__setitem__("a", post_order(world["a"], order_body(world["product_id"])))
    )
    thread_a.start()
    assert reserved.wait(timeout=30)

    thread_b = threading.Thread(
        target=lambda: results.__setitem__("b", post_order(world["b"], order_body(world["product_id"])))
    )
    thread_b.start()
    time.sleep(1.0)
    assert thread_b.is_alive(), "B must be waiting on A's row lock"
    release.set()
    thread_a.join(timeout=30)
    thread_b.join(timeout=30)

    assert results["a"].status_code == 201
    assert results["b"].status_code == 409
    assert results["b"].json()["detail"]["code"] == "product_unavailable"
    assert count(db, Order, product_id=world["product_id"]) == 1
    db.expire_all()
    assert db.get(Product, world["product_id"]).status == "RESERVED"


def test_parallel_create_stress_single_winner_per_product(world, db):
    for round_index in range(15):
        product_id = create_product(db, world["seller"], name=f"แข่ง {round_index}")
        results = run_parallel(
            [
                lambda: post_order(world["a"], order_body(product_id)),
                lambda: post_order(world["b"], order_body(product_id)),
            ]
        )
        codes = sorted(response.status_code for response in results)
        assert codes == [201, 409], [response.text for response in results]
        assert count(db, Order, product_id=product_id) == 1


def test_parallel_same_key_creates_one_order(world, db):
    key = new_key()
    results = run_parallel(
        [lambda: post_order(world["a"], order_body(world["product_id"]), key=key) for _ in range(5)]
    )
    assert {response.status_code for response in results} == {201}
    assert len({response.json()["id"] for response in results}) == 1
    assert count(db, Order) == 1


# ------------------------------------------------------------------ pay races (ORDER-03)


def create_order(world):
    response = post_order(world["a"], order_body(world["product_id"]))
    assert response.status_code == 201
    return response.json()["id"]


def block_first_success(monkeypatch):
    """ให้คำขอจ่ายสำเร็จคำขอแรกค้างไว้ขณะถือ row lock ของ Order"""
    locked = threading.Event()
    release = threading.Event()
    real = orders_module.receipt_number
    guard = threading.Lock()
    state = {"blocked": False}

    def slow_receipt_number(order_id):
        with guard:
            should_block = not state["blocked"]
            state["blocked"] = True
        if should_block:
            locked.set()
            release.wait(timeout=30)
        return real(order_id)

    monkeypatch.setattr(orders_module, "receipt_number", slow_receipt_number)
    return locked, release


@pytest.mark.parametrize("second_outcome", ["SUCCESS", "FAILED"])
def test_racing_payment_never_duplicates_or_downgrades(world, db, monkeypatch, second_outcome):
    order_id = create_order(world)
    locked, release = block_first_success(monkeypatch)
    results = {}
    first = threading.Thread(target=lambda: results.__setitem__("first", pay(order_id, world["a"])))
    first.start()
    assert locked.wait(timeout=30)
    second = threading.Thread(
        target=lambda: results.__setitem__("second", pay(order_id, world["a"], second_outcome))
    )
    second.start()
    time.sleep(1.0)
    assert second.is_alive(), "second request must wait for the order row lock"
    release.set()
    first.join(timeout=30)
    second.join(timeout=30)

    assert results["first"].status_code == 200
    assert results["second"].status_code == 409
    assert results["second"].json()["detail"]["code"] == "order_already_paid"
    db.expire_all()
    assert db.get(Order, order_id).status == "WAITING_SELLER_SHIP"
    assert count(db, PaymentAttempt, order_id=order_id) == 1
    assert count(db, Payment, order_id=order_id) == 1
    assert count(db, Escrow, order_id=order_id) == 1
    assert count(db, Receipt, order_id=order_id) == 1


def test_racing_same_key_returns_the_same_attempt(world, db, monkeypatch):
    order_id = create_order(world)
    locked, release = block_first_success(monkeypatch)
    key = new_key()
    results = {}
    first = threading.Thread(target=lambda: results.__setitem__("first", pay(order_id, world["a"], key=key)))
    first.start()
    assert locked.wait(timeout=30)
    second = threading.Thread(target=lambda: results.__setitem__("second", pay(order_id, world["a"], key=key)))
    second.start()
    time.sleep(0.5)
    release.set()
    first.join(timeout=30)
    second.join(timeout=30)

    assert results["first"].status_code == results["second"].status_code == 200
    assert results["first"].json()["attempt"]["id"] == results["second"].json()["attempt"]["id"]
    assert results["second"].headers.get("Idempotent-Replayed") == "true"
    assert count(db, PaymentAttempt) == 1
    assert count(db, Payment) == 1


def test_parallel_payment_stress(world, db):
    for round_index in range(8):
        product_id = create_product(db, world["seller"], name=f"จ่าย {round_index}")
        order_id = post_order(world["a"], order_body(product_id)).json()["id"]
        outcomes = ["SUCCESS", "FAILED", "SUCCESS", "SUCCESS", "FAILED", "SUCCESS"]
        results = run_parallel([lambda o=o: pay(order_id, world["a"], o) for o in outcomes])
        succeeded = [
            r for r in results
            if r.status_code == 200 and r.json()["attempt"]["outcome"] == "SUCCEEDED"
        ]
        assert len(succeeded) == 1, [r.text for r in results]
        assert all(r.status_code in (200, 409) for r in results)
        db.expire_all()
        assert db.get(Order, order_id).status == "WAITING_SELLER_SHIP"
        assert count(db, Payment, order_id=order_id) == 1
        assert count(db, Escrow, order_id=order_id) == 1
        assert count(db, Receipt, order_id=order_id) == 1
        assert count(db, PaymentAttempt, order_id=order_id, outcome="SUCCEEDED") == 1


# ------------------------------------------------------------------ ยกเลิก/หมดเวลา (ORDER-08)


def set_cancelled(db, order_id, reason="EXPIRED"):
    db.execute(
        text(
            "UPDATE orders SET status = 'CANCELLED', cancel_reason = :reason, "
            "cancelled_at = now() WHERE id = :id"
        ),
        {"id": order_id, "reason": reason},
    )
    db.commit()


def test_cancelled_order_frees_the_product_slot(db, world):
    first = insert_order(db, world, key="manual-key-0001")
    set_cancelled(db, first.id)

    # partial unique index ใช้เงื่อนไข status <> 'CANCELLED' สินค้าจึงว่างให้ Order ใหม่ได้
    second = insert_order(db, world, key="manual-key-0002")
    assert second.id != first.id
    assert count(db, Order) == 2


def test_cancel_fields_must_match_status(db, world):
    order = insert_order(db, world, key="manual-key-0003")

    with pytest.raises(IntegrityError):
        # ยกเลิกโดยไม่มีเหตุผลและเวลา ถูกปฏิเสธที่ฐานข้อมูล
        db.execute(text("UPDATE orders SET status = 'CANCELLED' WHERE id = :id"), {"id": order.id})
        db.commit()
    db.rollback()

    with pytest.raises(IntegrityError):
        # เหตุผลนอกรายการที่ตกลงไว้
        set_cancelled(db, order.id, reason="SOMETHING_ELSE")
    db.rollback()

    with pytest.raises(IntegrityError):
        # ยังไม่ยกเลิกแต่มีเหตุผลติดมา
        db.execute(
            text("UPDATE orders SET cancel_reason = 'BUYER' WHERE id = :id"), {"id": order.id}
        )
        db.commit()
    db.rollback()

    db.expire_all()
    assert db.get(Order, order.id).status == "WAITING_PAYMENT"


def test_paid_order_cannot_be_marked_cancelled(db, world):
    order = insert_order(db, world, key="manual-key-0004")
    db.execute(text("UPDATE orders SET paid_at = now() WHERE id = :id"), {"id": order.id})
    db.commit()

    with pytest.raises(IntegrityError):
        set_cancelled(db, order.id, reason="BUYER")
    db.rollback()


def test_racing_cancel_never_beats_successful_payment(world, db, monkeypatch):
    order_id = create_order(world)
    locked, release = block_first_success(monkeypatch)
    results = {}
    payer = threading.Thread(target=lambda: results.__setitem__("pay", pay(order_id, world["a"])))
    payer.start()
    assert locked.wait(timeout=30)
    canceller = threading.Thread(
        target=lambda: results.__setitem__("cancel", cancel(order_id, world["a"]))
    )
    canceller.start()
    time.sleep(1.0)
    assert canceller.is_alive(), "cancel request must wait for the order row lock"
    release.set()
    payer.join(timeout=30)
    canceller.join(timeout=30)

    assert results["pay"].status_code == 200
    assert results["cancel"].status_code == 409
    assert results["cancel"].json()["detail"]["code"] == "order_already_paid"

    db.expire_all()
    assert db.get(Order, order_id).status == "WAITING_SELLER_SHIP"
    assert count(db, Payment, order_id=order_id) == 1
    assert count(db, Escrow, order_id=order_id) == 1
    assert count(db, Receipt, order_id=order_id) == 1
    # สินค้าที่จ่ายเงินแล้วต้องไม่ถูกปล่อยคืน
    assert db.get(Product, world["product_id"]).status == "RESERVED"
