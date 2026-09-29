# Unpaid Order expiry worker (F2)

This command cancels due `WAITING_PAYMENT` Orders and releases their reserved Products without an HTTP request. It uses the same expiry service as the Order and catalog APIs. It does not repair orphan Products, issue refunds, or settle Escrow.

## Before enabling

1. Deploy the existing Order schema, including `orders.expires_at` and `ix_orders_waiting_expires_at`. F2 adds no migration.
2. Give the worker an explicitly configured PostgreSQL URL with permission to read/update Orders and Products. Keep the URL in a secret store, not a command argument or log.
3. Confirm the target database name and environment. Start with a dry-run against the intended target, then compare counts and a sample of due Orders. Do not use the frontend checkout's `.env`.
4. Arrange a supervisor that restarts the process after a nonzero exit. A restart scans immediately.

From `backend/`, using a **disposable example** database:

```sh
export ORDER_EXPIRY_DATABASE_URL='postgresql+psycopg://postgres:f2_test_only@127.0.0.1:55441/f2_expiry_test'
python -m scripts.release_expired_orders \
  --url-env ORDER_EXPIRY_DATABASE_URL --target f2_expiry_test --environment local
python -m scripts.release_expired_orders \
  --url-env ORDER_EXPIRY_DATABASE_URL --target f2_expiry_test --environment local \
  --apply --confirm-target f2_expiry_test
python -m scripts.release_expired_orders \
  --url-env ORDER_EXPIRY_DATABASE_URL --target f2_expiry_test --environment local \
  --apply --confirm-target f2_expiry_test --repeat
```

For a remote database, use `--environment staging` or `--environment production` as appropriate and add `--allow-remote`. The exact database name must match both `--target` and, for writes, `--confirm-target`. The command rejects `DATABASE_URL` as its URL variable and never prints the URL or password. Dry-run is the default even in repeat mode.

`--repeat` scans immediately at startup and then every 300 seconds. SIGTERM or SIGINT finishes the current Order and exits cleanly. For a scheduler instead of a long-running process, omit `--repeat` and schedule one `--apply` run every five minutes. Do not run both deployment forms unless intentionally sharing the workload.

Each scan reads at most ten batches of 100 candidates by default (`--max-batches`, `--batch-size`). If `limit_reached=true`, another pass may be needed; tune the limits or let the next cycle continue. The scan uses a fixed startup cutoff and orders candidates by deadline then ID. It skips Orders locked by payment, cancellation, or another worker; those remain eligible for a later scan. It rechecks status, `paid_at`, and deadline under the Order lock before a conditional update. Cancellation and Product release commit together. A failed Order rolls back by itself while later candidates proceed.

## Monitoring and recovery

Each scan reports `scanned`, `eligible`, `cancelled`, `failed`, `skipped`, `batches`, and `limit_reached`. Dry-run `eligible` is a snapshot estimate. Row failures log the Order ID and error class, without private Order details or exception text. A single-run exits nonzero when any row fails or the scan cannot run; recurring mode continues to retry on later cycles and returns nonzero when stopped if any cycle failed. Alert on failures, repeated `limit_reached`, or a growing backlog of due `WAITING_PAYMENT` Orders.

Fix the underlying database or code fault, then run the command again. Any rolled-back Order remains `WAITING_PAYMENT` and will be selected on restart. A Product that is `RESERVED` without an active Order is **not** automatically repaired; investigate it separately before any manual correction.

The service helper `expire_orders_in_transaction` does not commit. The worker owns one transaction per Order; the legacy API helper `sweep_expired_orders` calls the same mutation helper and keeps its existing commit/rollback boundary. Never call that API helper while holding a row lock that must survive its commit.

## Integration gate

L3 should review the target, credentials, scheduler/supervisor, alerting, backup/restore readiness, migration head, and a staging dry-run/apply before enabling it for the team. Local PostgreSQL tests do not establish shared database or deployment acceptance.
