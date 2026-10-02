"""Six lifecycle jobs; dry-run by default and explicit PostgreSQL target required."""
import argparse
from dataclasses import asdict
import json
import logging
import os
import signal
from threading import Event
from scripts.release_expired_orders import target_url


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url-env", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--environment", required=True, choices=("local", "staging", "production"))
    parser.add_argument("--allow-remote", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-target")
    parser.add_argument("--repeat", action="store_true")
    parser.add_argument("--interval-seconds", type=int, default=300)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--max-batches", type=int, default=10)
    parser.add_argument("--retry-order-id", type=int, help="restrict manual retry to one durable return")
    args = parser.parse_args(argv)
    url = target_url(args, parser)
    if not 1 <= args.interval_seconds <= 86400 or not 1 <= args.batch_size <= 1000 or not 1 <= args.max_batches <= 1000:
        parser.error("invalid interval/batch limits")
    if args.retry_order_id is not None and args.retry_order_id < 1:
        parser.error("retry Order ID must be positive")
    # Set before any app import: backend/.env cannot choose the DB target.
    os.environ["DATABASE_URL"] = url
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.services.lifecycle_worker import run_once, run_recurring
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    log = logging.getLogger(__name__)
    engine = create_engine(url, pool_pre_ping=True)
    factory = sessionmaker(bind=engine, autoflush=False)
    stop = Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    options = dict(apply=args.apply, batch_size=args.batch_size, max_batches=args.max_batches,
                   retry_order_id=args.retry_order_id)
    try:
        log.info("lifecycle start environment=%s target=%s mode=%s interval_seconds=%s",
            args.environment, args.target, "apply" if args.apply else "dry-run", args.interval_seconds)
        if args.repeat:
            return int(bool(run_recurring(factory, stop, interval_seconds=args.interval_seconds, **options)))
        result = run_once(factory, **options)
        log.info("lifecycle scan %s", json.dumps(asdict(result), sort_keys=True))
        return int(bool(result.failed))
    except Exception as exc:
        log.error("lifecycle scan failed error_type=%s", type(exc).__name__)
        return 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
