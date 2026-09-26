"""Repeatable INSPECT-01 fixtures for a dedicated local PostgreSQL test database.

Preview: python -m scripts.seed_inspections --database-url URL --namespace inspect01-v1
Apply:   python -m scripts.seed_inspections --database-url URL --namespace inspect01-v1 --apply
"""

import argparse
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models.brand import Brand
from app.models.category import Category
from app.models.inspection import Inspection, InspectionEvidence, InspectionResultEvidence
from app.models.order import Escrow, Order, Payment, PaymentAttempt, Receipt
from app.models.product import Product
from app.models.shipment import Shipment, ShipmentDeliveryProof
from app.models.user import User, UserRole


SCENARIOS = (
    ("waiting-seller-ship", "WAITING_SELLER_SHIP", None),
    ("shipping-to-center", "SHIPPING_TO_CENTER", None),
    ("received-at-center", "RECEIVED_AT_CENTER", None),
    ("inspecting", "INSPECTING", None),
    ("result-pass", "RESULT_NOTIFIED", "PASS"),
    ("result-minor-issue", "RESULT_NOTIFIED", "MINOR_ISSUE"),
    ("result-not-as-described", "RESULT_NOTIFIED", "NOT_AS_DESCRIBED"),
    ("result-fake", "RESULT_NOTIFIED", "FAKE"),
)
BASE_TIME = datetime(2026, 9, 23, 10, 0, tzinfo=timezone.utc)


def _uuid(namespace, label):
    return uuid5(NAMESPACE_URL, f"inspect01:{namespace}:{label}")


def _one(session, model, **values):
    row = session.scalar(select(model).filter_by(**values))
    if row is None:
        row = model(**values)
        session.add(row)
        session.flush()
    return row


def _user(session, namespace, role):
    identity = _uuid(namespace, role.lower())
    user = session.scalar(select(User).where(User.supabase_user_id == identity))
    if user is None:
        user = User(
            supabase_user_id=identity,
            full_name=f"Synthetic INSPECT-01 {role}",
            email=f"{identity}@example.test",
            role=UserRole(role),
        )
        session.add(user)
        session.flush()
    elif user.role != UserRole(role) or user.email != f"{identity}@example.test":
        raise RuntimeError(f"fixture user conflict: {role}")
    return user


def _scenario_matches(session, order, namespace, key, status, result):
    if order.status != status or order.product_name != f"Synthetic item {namespace}_{key}":
        return False
    payment = session.scalar(select(Payment).where(Payment.order_id == order.id))
    escrow = session.scalar(select(Escrow).where(Escrow.order_id == order.id))
    receipt = session.scalar(select(Receipt).where(Receipt.order_id == order.id))
    if payment is None or escrow is None or escrow.status != "HELD" or receipt is None:
        return False
    inspection = session.scalar(select(Inspection).where(Inspection.order_id == order.id))
    shipment = session.scalar(select(Shipment).where(Shipment.order_id == order.id))
    expected_work = status != "WAITING_SELLER_SHIP"
    if (inspection is not None) != expected_work or (shipment is not None) != expected_work:
        return False
    if not expected_work:
        return True
    expected_received = status in {"RECEIVED_AT_CENTER", "INSPECTING", "RESULT_NOTIFIED"}
    expected_started = status in {"INSPECTING", "RESULT_NOTIFIED"}
    courier = session.scalar(select(User).where(User.supabase_user_id == _uuid(namespace, "courier")))
    proofs = session.scalars(select(ShipmentDeliveryProof).where(ShipmentDeliveryProof.shipment_id == shipment.id)).all()
    if (
        inspection.result != result or (inspection.started_at is not None) != expected_started
        or (inspection.inspector_id is not None) != expected_started
        or (inspection.inspected_at is not None) != (result is not None)
        or shipment.status != ("DELIVERED" if expected_received else "IN_TRANSIT")
        or (shipment.received_at is not None) != expected_received
        or shipment.courier_id != courier.id
        or (shipment.courier_delivered_at is not None) != expected_received
        or len(proofs) != (1 if expected_received else 0)
        or (proofs and proofs[0].uploaded_by != courier.id)
        or shipment.carrier != "Synthetic Carrier"
        or shipment.tracking_number != f"I01-{_uuid(namespace, key).hex[:16]}"
    ):
        return False
    evidence = session.scalars(select(InspectionEvidence).where(InspectionEvidence.inspection_id == inspection.id)).all()
    links = session.scalars(select(InspectionResultEvidence).where(InspectionResultEvidence.inspection_id == inspection.id)).all()
    expected_count = 1 if result else 0
    return (
        len(evidence) == expected_count
        and len(links) == expected_count
        and (not links or links[0].evidence_id == evidence[0].id)
    )


def seed(session, namespace):
    """Create all scenarios atomically; refuse to rewrite a changed fixture."""
    session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:namespace))"), {"namespace": f"inspect01:{namespace}"})
    buyer = _user(session, namespace, "BUYER")
    seller = _user(session, namespace, "SELLER")
    inspector = _user(session, namespace, "INSPECTOR")
    courier = _user(session, namespace, "COURIER")
    category = _one(session, Category, category_name=f"INSPECT-01 {namespace}")
    brand = _one(session, Brand, brand_name=f"INSPECT-01 {namespace}")
    report = []

    for index, (key, status, result) in enumerate(SCENARIOS):
        fixture_key = f"{namespace}_{key}"
        existing = session.scalar(
            select(Order).where(Order.buyer_id == buyer.id, Order.idempotency_key == fixture_key)
        )
        if existing is not None:
            if not _scenario_matches(session, existing, namespace, key, status, result):
                raise RuntimeError(f"fixture conflict: {fixture_key}; use a new namespace")
            report.append((key, existing.id, "already-present"))
            continue

        product = Product(
            user_id=seller.id, category_id=category.id, brand_id=brand.id,
            product_name=f"Synthetic item {fixture_key}", description="INSPECT-01 fixture item",
            size="M", condition="GOOD", price=Decimal("1200.00"),
            sale_type="FIXED_PRICE", status="RESERVED",
        )
        session.add(product)
        session.flush()
        order = Order(
            buyer_id=buyer.id, seller_id=seller.id, product_id=product.id,
            status=status, product_name=product.product_name,
            product_condition="GOOD", product_size="M", currency="THB",
            item_price=Decimal("1200.00"), shipping_fee=Decimal("50.00"),
            inspection_fee=Decimal("100.00"), commission_fee=Decimal("60.00"),
            total_amount=Decimal("1350.00"), seller_payout=Decimal("1140.00"),
            ship_recipient_name="Synthetic Buyer", ship_phone="0812345678",
            ship_address_line="Synthetic street", ship_subdistrict="Synthetic subdistrict",
            ship_district="Synthetic district", ship_province="Synthetic province",
            ship_postal_code="10110", idempotency_key=fixture_key,
            request_hash="0" * 64, paid_at=BASE_TIME,
            expires_at=BASE_TIME + timedelta(minutes=30),
        )
        session.add(order)
        session.flush()
        attempt = PaymentAttempt(
            order_id=order.id, outcome="SUCCEEDED", amount=order.total_amount,
            idempotency_key=f"fixturepay_{index}_{namespace}", request_hash="0" * 64,
        )
        session.add(attempt)
        session.flush()
        payment = Payment(order_id=order.id, attempt_id=attempt.id, amount=order.total_amount)
        session.add(payment)
        session.flush()
        session.add(Escrow(order_id=order.id, payment_id=payment.id, amount=order.total_amount, status="HELD"))
        session.add(Receipt(
            order_id=order.id, payment_id=payment.id, receipt_no=f"I01-{_uuid(namespace, key).hex[:20]}",
            product_name=order.product_name, currency="THB", item_price=order.item_price,
            shipping_fee=order.shipping_fee, inspection_fee=order.inspection_fee,
            total_amount=order.total_amount,
        ))
        if status != "WAITING_SELLER_SHIP":
            received = status in {"RECEIVED_AT_CENTER", "INSPECTING", "RESULT_NOTIFIED"}
            started = status in {"INSPECTING", "RESULT_NOTIFIED"}
            shipment = Shipment(
                order_id=order.id, leg="TO_CENTER", status="IN_TRANSIT",
                carrier="Synthetic Carrier", tracking_number=f"I01-{_uuid(namespace, key).hex[:16]}",
                shipped_at=BASE_TIME,
                courier_id=courier.id,
            )
            inspection = Inspection(
                order_id=order.id, inspector_id=inspector.id if started else None,
                started_at=BASE_TIME + timedelta(hours=2) if started else None,
            )
            session.add_all([shipment, inspection])
            session.flush()
            if received:
                session.add(ShipmentDeliveryProof(
                    shipment_id=shipment.id, sort_order=0,
                    object_key=f"fixtures/inspect01/{namespace}/{key}/courier.jpg",
                    mime_type="image/jpeg", size_bytes=1, sha256="b" * 64,
                    uploaded_by=courier.id, uploaded_at=BASE_TIME + timedelta(minutes=30),
                ))
                session.flush()
                shipment.courier_delivered_at = BASE_TIME + timedelta(minutes=45)
                session.flush()
                shipment.status = "DELIVERED"
                shipment.received_at = BASE_TIME + timedelta(hours=1)
                shipment.received_by = inspector.id
                session.flush()
            if result:
                evidence = InspectionEvidence(
                    inspection_id=inspection.id,
                    object_key=f"fixtures/inspect01/{namespace}/{key}/image.jpg",
                    mime_type="image/jpeg", size_bytes=1, sha256="a" * 64,
                    uploaded_by=inspector.id, uploaded_at=BASE_TIME + timedelta(hours=2),
                )
                session.add(evidence)
                session.flush()
                session.add(InspectionResultEvidence(inspection_id=inspection.id, evidence_id=evidence.id))
                session.flush()
                inspection.result = result
                inspection.summary = f"Synthetic inspection result for {key}; item matches fixture snapshot."
                inspection.inspected_at = BASE_TIME + timedelta(hours=3)
        report.append((key, order.id, "created"))
    session.flush()
    return report


def preview(session, namespace):
    """Read-only preview; it does not consume IDs or advance sequences."""
    identity = _uuid(namespace, "buyer")
    buyer = session.scalar(select(User).where(User.supabase_user_id == identity))
    report = []
    for key, status, result in SCENARIOS:
        fixture_key = f"{namespace}_{key}"
        order = None if buyer is None else session.scalar(
            select(Order).where(Order.buyer_id == buyer.id, Order.idempotency_key == fixture_key)
        )
        if order is None:
            report.append((key, None, "would-create"))
            continue
        if not _scenario_matches(session, order, namespace, key, status, result):
            report.append((key, order.id, "conflict"))
        else:
            report.append((key, order.id, "already-present"))
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    target = make_url(args.database_url)
    if target.get_backend_name() != "postgresql" or target.host not in {"localhost", "127.0.0.1", "::1"} or "test" not in (target.database or "").lower():
        parser.error("requires a dedicated local PostgreSQL database with 'test' in its name")
    if not args.namespace or len(args.namespace) > 40 or not all(c.isalnum() or c in "-_" for c in args.namespace):
        parser.error("namespace must be 1-40 alphanumeric, hyphen or underscore characters")
    if args.database_url == os.getenv("DATABASE_URL"):
        parser.error("target must differ from the application's DATABASE_URL")
    engine = create_engine(args.database_url)
    try:
        with Session(engine) as session:
            report = seed(session, args.namespace) if args.apply else preview(session, args.namespace)
            for key, order_id, state in report:
                print(f"{key}: order_id={order_id} {state}")
            if args.apply:
                session.commit()
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
