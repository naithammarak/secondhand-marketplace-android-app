"""Run TASK-01 order/payment HTTP evidence on the explicitly configured local test database."""

from __future__ import annotations

import ipaddress
import json
import os
import secrets
import socket
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import jwt
import uvicorn
from dotenv import dotenv_values
from sqlalchemy import func, inspect, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from task01_demo import BACKEND_DIR, DemoConfigurationError, apply_demo_environment, demo_environment

sys.path.insert(0, str(BACKEND_DIR))


TEST_AUDIENCE = "authenticated"
REQUIRED_TABLES = {
    "users", "categories", "brands", "products", "orders", "payment_attempts",
    "payments", "escrows", "receipts",
}
ADDRESS = {
    "recipient_name": "ผู้ซื้อทดสอบ TASK-01",
    "phone": "0812345678",
    "address_line": "99/1 ถนนทดสอบ",
    "subdistrict": "แขวงทดสอบ",
    "district": "เขตทดสอบ",
    "province": "กรุงเทพมหานคร",
    "postal_code": "10110",
}


def _http(base_url: str, method: str, path: str, *, token: str | None = None,
          body: dict[str, Any] | None = None, idempotency_key: str | None = None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = "application/json"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    request = Request(
        f"{base_url}{path}",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = response.read()
            return response.status, json.loads(payload) if payload else None, dict(response.headers)
    except HTTPError as response:
        payload = response.read()
        try:
            data = json.loads(payload) if payload else None
        except json.JSONDecodeError:
            data = None
        return response.code, data, dict(response.headers)
    except (TimeoutError, URLError) as exc:
        raise RuntimeError("local TASK-01 HTTP smoke request failed") from exc


def _start_server(app):
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
    probe.close()
    server = uvicorn.Server(uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="error",
        access_log=False,
    ))
    thread = threading.Thread(target=server.run, name="task01-http-smoke-api", daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and not server.started and thread.is_alive():
        time.sleep(0.05)
    if not server.started:
        server.should_exit = True
        thread.join(timeout=2)
        raise RuntimeError("local TASK-01 API did not start; check the isolated database migration and HTTPS origin")
    return server, thread, f"http://127.0.0.1:{port}"


def _new_auth_token(user_uuid: uuid.UUID, secret: str, issuer: str) -> str:
    return jwt.encode(
        {
            "sub": str(user_uuid),
            "aud": TEST_AUDIENCE,
            "iss": issuer,
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=10)).timestamp()),
        },
        secret,
        algorithm="HS256",
    )


def _prepare_world(engine):
    from app.models.brand import Brand
    from app.models.category import Category
    from app.models.product import Product
    from app.models.user import User, UserRole, UserStatus

    buyer_uuid = uuid.uuid4()
    seller_uuid = uuid.uuid4()
    suffix = uuid.uuid4().hex
    with Session(engine) as db:
        buyer = User(
            supabase_user_id=buyer_uuid,
            full_name="TASK-01 HTTP buyer",
            email=f"task01-buyer-{suffix}@example.test",
            role=UserRole.BUYER,
            status=UserStatus.ACTIVE,
        )
        seller = User(
            supabase_user_id=seller_uuid,
            full_name="TASK-01 HTTP seller",
            email=f"task01-seller-{suffix}@example.test",
            role=UserRole.SELLER,
            status=UserStatus.ACTIVE,
        )
        category = Category(category_name=f"TASK-01 test {suffix}")
        brand = Brand(brand_name=f"TASK-01 test {suffix}")
        db.add_all([buyer, seller, category, brand])
        db.flush()
        product = Product(
            user_id=seller.id,
            category_id=category.id,
            brand_id=brand.id,
            product_name="TASK-01 simulated-payment item",
            description="Disposable local HTTP smoke fixture",
            size="M",
            condition="GOOD",
            price=Decimal("1200.00"),
            sale_type="FIXED_PRICE",
            status="AVAILABLE",
        )
        db.add(product)
        db.commit()
        product_id = product.id
    return buyer_uuid, product_id


def _assert_counts(engine, order_id: int, *, attempts: int, payments: int, escrows: int, receipts: int):
    from app.models.order import Escrow, Payment, PaymentAttempt, Receipt

    with Session(engine) as db:
        actual = {
            "attempts": db.scalar(select(func.count()).select_from(PaymentAttempt).where(PaymentAttempt.order_id == order_id)),
            "payments": db.scalar(select(func.count()).select_from(Payment).where(Payment.order_id == order_id)),
            "escrows": db.scalar(select(func.count()).select_from(Escrow).where(Escrow.order_id == order_id)),
            "receipts": db.scalar(select(func.count()).select_from(Receipt).where(Receipt.order_id == order_id)),
        }
    expected = {"attempts": attempts, "payments": payments, "escrows": escrows, "receipts": receipts}
    if actual != expected:
        raise AssertionError(f"TASK-01 payment row counts differ: expected {expected}, received {actual}")


def _assert_connected_to_validated_local_target(engine, database_url: str) -> None:
    expected = make_url(database_url)
    with engine.connect() as connection:
        info = connection.connection.driver_connection.info
        try:
            actual_host_is_loopback = ipaddress.ip_address(info.hostaddr).is_loopback
        except (TypeError, ValueError):
            actual_host_is_loopback = False
        actual_matches = (
            actual_host_is_loopback
            and info.port == (expected.port or 5432)
            and info.dbname == expected.database
        )
    if not actual_matches:
        raise SystemExit("The PostgreSQL connection did not match the validated local TASK-01 database target")


def _create_order(base_url: str, token: str, product_id: int) -> int:
    status, body, _ = _http(
        base_url,
        "POST",
        "/orders",
        token=token,
        idempotency_key=f"task01-order-{uuid.uuid4()}",
        body={"product_id": product_id, "shipping_address": ADDRESS},
    )
    if status != 201 or not isinstance(body, dict) or not isinstance(body.get("id"), int):
        raise AssertionError(f"TASK-01 order creation failed with HTTP {status}")
    return body["id"]


def run() -> None:
    try:
        dotenv_path = BACKEND_DIR / ".env"
        settings = demo_environment(os.environ, dotenv_values(dotenv_path))
    except DemoConfigurationError as exc:
        raise SystemExit(str(exc)) from exc
    apply_demo_environment(settings, dotenv_path)

    # These short-lived credentials exist only in this local smoke process; none are read or printed.
    test_secret = secrets.token_urlsafe(48)
    test_issuer = "https://task01-payment-smoke.test/auth/v1"
    os.environ.update({
        "SUPABASE_JWT_SECRET": test_secret,
        "SUPABASE_JWT_ISSUER": test_issuer,
        "SUPABASE_JWT_ALGORITHM": "HS256",
        "SUPABASE_JWT_AUDIENCE": TEST_AUDIENCE,
    })

    from app.database import engine
    from app.main import app

    if engine is None:
        raise SystemExit("TASK01 demo database did not initialize")
    _assert_connected_to_validated_local_target(engine, settings["DATABASE_URL"])
    tables = set(inspect(engine).get_table_names())
    missing = REQUIRED_TABLES - tables
    if missing:
        raise SystemExit("Run Alembic upgrade head on the isolated TASK01 test database before this smoke")

    buyer_uuid, product_id = _prepare_world(engine)
    buyer_token = _new_auth_token(buyer_uuid, test_secret, test_issuer)
    server, thread, base_url = _start_server(app)
    try:
        status, health, _ = _http(base_url, "GET", "/health")
        if status != 200 or health != {"status": "ok"}:
            raise AssertionError("local TASK-01 API health check failed")

        # The feature remains closed without its explicit setting and writes no attempt.
        order_id = _create_order(base_url, buyer_token, product_id)
        os.environ["PAYMENT_SIMULATION_ENABLED"] = "false"
        disabled_key = f"task01-payment-disabled-{uuid.uuid4()}"
        status, body, _ = _http(
            base_url, "POST", f"/orders/{order_id}/payments/simulate", token=buyer_token,
            idempotency_key=disabled_key, body={"outcome": "SUCCESS"},
        )
        if status != 403 or body.get("detail", {}).get("code") != "payment_simulation_disabled":
            raise AssertionError("disabled simulation did not return the expected 403")
        _assert_counts(engine, order_id, attempts=0, payments=0, escrows=0, receipts=0)

        os.environ["PAYMENT_SIMULATION_ENABLED"] = "true"
        success_key = f"task01-payment-success-{uuid.uuid4()}"
        status, payment, _ = _http(
            base_url, "POST", f"/orders/{order_id}/payments/simulate", token=buyer_token,
            idempotency_key=success_key, body={"outcome": "SUCCESS"},
        )
        if status != 200 or payment["attempt"]["outcome"] != "SUCCEEDED" or payment["order"]["payment_status"] != "PAID":
            raise AssertionError("success simulation did not return a server-backed PAID order")
        status, detail, _ = _http(base_url, "GET", f"/orders/{order_id}", token=buyer_token)
        if status != 200 or detail["payment_status"] != "PAID":
            raise AssertionError("order detail did not confirm PAID")
        status, receipt, _ = _http(base_url, "GET", f"/orders/{order_id}/receipt", token=buyer_token)
        if status != 200 or receipt["order_id"] != order_id or receipt["receipt_no"] != detail["receipt_no"]:
            raise AssertionError("receipt endpoint did not return the order's saved receipt")
        # A same-key replay returns the original result and creates no extra rows.
        status, replay, _ = _http(
            base_url, "POST", f"/orders/{order_id}/payments/simulate", token=buyer_token,
            idempotency_key=success_key, body={"outcome": "SUCCESS"},
        )
        if status != 200 or replay["attempt"]["id"] != payment["attempt"]["id"]:
            raise AssertionError("same-key payment replay did not return the original attempt")
        _assert_counts(engine, order_id, attempts=1, payments=1, escrows=1, receipts=1)

        # Create another unique product for a separate FAILED-then-SUCCESS attempt sequence.
        from app.models.brand import Brand
        from app.models.category import Category
        from app.models.product import Product
        from app.models.user import User
        with Session(engine) as db:
            seller = db.scalar(select(User).where(User.supabase_user_id != buyer_uuid).order_by(User.id.desc()))
            category = db.scalar(select(Category).order_by(Category.id.desc()))
            brand = db.scalar(select(Brand).order_by(Brand.id.desc()))
            product = Product(
                user_id=seller.id,
                category_id=category.id,
                brand_id=brand.id,
                product_name="TASK-01 failed-then-success item",
                description="Disposable local HTTP smoke fixture",
                size="M",
                condition="GOOD",
                price=Decimal("1400.00"),
                sale_type="FIXED_PRICE",
                status="AVAILABLE",
            )
            db.add(product)
            db.commit()
            second_product_id = product.id
        second_order_id = _create_order(base_url, buyer_token, second_product_id)

        # Mixed-case production values must keep simulation closed despite the true flag.
        os.environ["APP_ENV"] = " PrOd "
        prod_key = f"task01-payment-prod-guard-{uuid.uuid4()}"
        status, body, _ = _http(
            base_url, "POST", f"/orders/{second_order_id}/payments/simulate", token=buyer_token,
            idempotency_key=prod_key, body={"outcome": "SUCCESS"},
        )
        if status != 403 or body.get("detail", {}).get("code") != "payment_simulation_disabled":
            raise AssertionError("production environment did not keep simulation disabled")
        _assert_counts(engine, second_order_id, attempts=0, payments=0, escrows=0, receipts=0)

        os.environ["APP_ENV"] = "demo"
        failed_key = f"task01-payment-failed-{uuid.uuid4()}"
        status, failed, _ = _http(
            base_url, "POST", f"/orders/{second_order_id}/payments/simulate", token=buyer_token,
            idempotency_key=failed_key, body={"outcome": "FAILED"},
        )
        if status != 200 or failed["attempt"]["outcome"] != "FAILED" or failed["order"]["payment_status"] != "UNPAID":
            raise AssertionError("failed simulation did not preserve the unpaid state")
        status, failed_replay, _ = _http(
            base_url, "POST", f"/orders/{second_order_id}/payments/simulate", token=buyer_token,
            idempotency_key=failed_key, body={"outcome": "FAILED"},
        )
        if status != 200 or failed_replay["attempt"]["id"] != failed["attempt"]["id"]:
            raise AssertionError("same-key FAILED replay did not return the original attempt")
        success_key = f"task01-payment-after-failure-{uuid.uuid4()}"
        status, recovered, _ = _http(
            base_url, "POST", f"/orders/{second_order_id}/payments/simulate", token=buyer_token,
            idempotency_key=success_key, body={"outcome": "SUCCESS"},
        )
        if status != 200 or recovered["order"]["payment_status"] != "PAID":
            raise AssertionError("a new-key success after FAILED did not reach PAID")
        _assert_counts(engine, second_order_id, attempts=2, payments=1, escrows=1, receipts=1)
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        engine.dispose()

    print(
        "TASK-01 HTTP smoke passed: local health, create order, disabled and production 403 guards, "
        "success/PAID/receipt, same-key replay without duplicate payment rows, and FAILED then new-key SUCCESS."
    )


if __name__ == "__main__":
    run()
