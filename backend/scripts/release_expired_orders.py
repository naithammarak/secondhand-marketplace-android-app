"""Scan unpaid Order deadlines once or every five minutes; dry-run by default.

Run from backend with an explicitly named URL variable and expected database:
python -m scripts.release_expired_orders --url-env ORDER_EXPIRY_DATABASE_URL \
    --target order_test --environment local [--apply] [--repeat]

The command never repairs orphan Product rows. See doc/orders/unpaid-expiry-runbook.md.
"""

import argparse
import logging
import os
import signal
from threading import Event

from sqlalchemy.engine import make_url


def target_url(args: argparse.Namespace, parser: argparse.ArgumentParser) -> str:
    if args.url_env == "DATABASE_URL":
        parser.error("use a dedicated URL variable, not DATABASE_URL")
    raw_url = os.getenv(args.url_env)
    if not raw_url:
        parser.error("the explicitly named URL variable is empty or unset")
    try:
        parsed = make_url(raw_url)
    except Exception:
        parser.error("the target URL is invalid")
    if parsed.get_backend_name() != "postgresql":
        parser.error("the target must be PostgreSQL")
    if parsed.database != args.target:
        parser.error("target database name does not match --target")
    if parsed.host not in {"localhost", "127.0.0.1", "::1"} and not args.allow_remote:
        parser.error("remote target requires --allow-remote")
    if args.apply and args.confirm_target != args.target:
        parser.error("--apply requires --confirm-target matching --target")
    return raw_url


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url-env", required=True, help="name of a dedicated URL environment variable")
    parser.add_argument("--target", required=True, help="expected database name")
    parser.add_argument("--environment", required=True, choices=("local", "staging", "production"))
    parser.add_argument("--allow-remote", action="store_true", help="acknowledge a non-local PostgreSQL host")
    parser.add_argument("--apply", action="store_true", help="commit eligible cancellations")
    parser.add_argument("--confirm-target", help="repeat the database name when applying")
    parser.add_argument("--repeat", action="store_true", help="scan immediately, then at each interval")
    parser.add_argument("--interval-seconds", type=int, default=300)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--max-batches", type=int, default=10)
    args = parser.parse_args(argv)
    url = target_url(args, parser)
    if not 1 <= args.interval_seconds <= 86400:
        parser.error("--interval-seconds must be between 1 and 86400")
    if not 1 <= args.batch_size <= 1000 or not 1 <= args.max_batches <= 1000:
        parser.error("batch size and max batches must each be between 1 and 1000")

    # app.database loads backend/.env at import time. Set this explicit target
    # first so it cannot silently choose a frontend or application DATABASE_URL.
    os.environ["DATABASE_URL"] = url
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.services.unpaid_expiry_worker import run_once, run_recurring

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logger = logging.getLogger(__name__)
    engine = create_engine(url, pool_pre_ping=True)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    stop = Event()
    if args.repeat:
        signal.signal(signal.SIGTERM, lambda *_: stop.set())
        signal.signal(signal.SIGINT, lambda *_: stop.set())
    try:
        options = dict(apply=args.apply, batch_size=args.batch_size, max_batches=args.max_batches)
        if args.repeat:
            logger.info(
                "unpaid expiry start environment=%s target=%s mode=%s interval_seconds=%s",
                args.environment, args.target, "apply" if args.apply else "dry-run", args.interval_seconds,
            )
            failures = run_recurring(factory, stop, interval_seconds=args.interval_seconds, **options)
            return 1 if failures else 0
        result = run_once(factory, **options)
        logger.info(
            "unpaid expiry environment=%s target=%s mode=%s scanned=%s eligible=%s cancelled=%s failed=%s skipped=%s batches=%s limit_reached=%s",
            args.environment, args.target, "apply" if args.apply else "dry-run",
            result.scanned, result.eligible, result.cancelled, result.failed,
            result.skipped, result.batches, result.limit_reached,
        )
        return 1 if result.failed else 0
    except Exception as exc:
        logger.error("unpaid expiry scan failed error_type=%s", type(exc).__name__)
        return 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
