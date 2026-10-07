"""Synthetic CERT-01 fixtures; preview by default, dedicated local test DB only."""

import argparse
import os
import secrets

from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models import BuyerInspectionDecision, Certificate, Inspection, Order
from scripts.seed_inspections import preview as preview_inspections, seed as seed_inspections

DECISIONS = {"result-pass": ("CONFIRM", None), "result-minor-issue": ("REJECT", "Synthetic buyer declines minor issue")}


def seed(session, namespace, *, apply=True):
    """Reuse paid synthetic Orders; preserve all existing team/fixture records."""
    inspections = seed_inspections(session, namespace) if apply else preview_inspections(session, namespace)
    report = []
    for key, order_id, state in inspections:
        if state == "conflict":
            raise RuntimeError(f"inspection fixture conflict: {key}")
        if key not in DECISIONS:
            report.append((key, order_id, state))
            continue
        decision, reason = DECISIONS[key]
        order = session.get(Order, order_id) if order_id is not None else None
        work = session.scalar(select(Inspection).where(Inspection.order_id == order_id)) if order else None
        cert = session.scalar(select(Certificate).where(Certificate.order_id == order_id)) if order else None
        choice = session.scalar(select(BuyerInspectionDecision).where(BuyerInspectionDecision.order_id == order_id)) if order else None
        if cert and (cert.inspection_id != work.id or cert.result != work.result or cert.status != "ISSUED"):
            raise RuntimeError(f"certificate fixture conflict: {key}; use a new namespace")
        if choice and (choice.inspection_id != work.id or choice.buyer_id != order.buyer_id or choice.decision != decision or choice.reason != reason):
            raise RuntimeError(f"decision fixture conflict: {key}; use a new namespace")
        missing = cert is None or choice is None
        if apply:
            if cert is None:
                cert = Certificate(
                    order_id=order.id, inspection_id=work.id, result=work.result,
                    certificate_no="CERT-TEST-" + secrets.token_hex(12).upper(),
                    public_token=secrets.token_urlsafe(32),
                )
                session.add(cert)
                session.flush()
            if choice is None:
                session.add(BuyerInspectionDecision(
                    order_id=order.id, inspection_id=work.id, buyer_id=order.buyer_id,
                    decision=decision, reason=reason,
                ))
                session.flush()
        report.append((key, order_id, ("created" if apply else "would-create") if missing else "already-present"))
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
    if args.database_url == os.getenv("DATABASE_URL"):
        parser.error("target must differ from the application's DATABASE_URL")
    if not args.namespace or len(args.namespace) > 40 or not all(c.isalnum() or c in "-_" for c in args.namespace):
        parser.error("namespace must be 1-40 alphanumeric, hyphen or underscore characters")
    engine = create_engine(args.database_url)
    try:
        with Session(engine) as session:
            for key, order_id, state in seed(session, args.namespace, apply=args.apply):
                print(f"{key}: order_id={order_id} {state}")
            if args.apply:
                session.commit()
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
