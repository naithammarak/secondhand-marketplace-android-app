# TASK-01 simulated payment implementation handoff

## Delivered

- Checkout now treats payment success as confirmed only when the shared order-detail store reports `PAID` for the captured buyer and order. It rechecks the store after every awaited operation, preserves an uncertain attempt's idempotency key through `retryUncertain()`, and ignores callbacks after account/product changes or unmount.
- Handled service failures no longer navigate to a receipt. The checkout presents the order's server-backed payment/error state, including disabled simulation, failure, expiry, and unknown status. Removed the client-only expiry countdown and local force-expiry/failure state.
- The payment illustration is labeled as a demo and intentionally is not a valid QR. The backend remains closed by default and refuses production environments; normalized prod spellings are covered.
- Added an opt-in local API launcher, isolated HTTP smoke, runbook, and the TASK-01 specification. The launcher requires a separate loopback PostgreSQL test database, rejects routing query options, checks the configured application target, and validates the reserved HTTPS `.test` certificate origin before enabling simulation.

## Verification evidence

All commands ran against this TASK-01 worktree. The isolated database was a newly created Podman container named `task01-simulated-payment-test`, database `task01_payment_test`, bound only to `127.0.0.1:55441`.

| Check | Result |
|---|---|
| `cd mobile && npm test` | Passed: 305 logic tests; 29 component suites and 208 component tests. |
| `cd mobile && npm run typecheck` | Passed. |
| `cd mobile && npx eslint src/components/checkout-screen.tsx component-tests/checkout-screen.test.tsx` | Passed. |
| `cd backend && python -m pytest tests/test_task01_demo.py tests/test_orders_api.py tests/test_certificate_urls.py tests/test_main.py -q` | Passed: 114 tests; two existing Starlette/httpx deprecation warnings. |
| `cd backend && python -m py_compile scripts/task01_demo.py scripts/task01_payment_http_smoke.py` | Passed. |
| `cd backend && python -m alembic heads` | `714f11c84d53 (head)`; migration upgrade was applied to the isolated TASK-01 database. No migration was added by TASK-01. |
| `TASK01_DEMO_DATABASE_URL=… python scripts/task01_payment_http_smoke.py` | Passed using real local HTTP and the isolated database: health, order creation, disabled and production 403s, success, PAID detail and receipt, same-key replay without duplicate rows, and FAILED followed by a new-key SUCCESS. The smoke creates synthetic rows and does not truncate or delete data. |
| `curl --fail --silent http://127.0.0.1:8765/health` | Passed: `{"status":"ok"}`. |

The mobile full suite also emits existing React `act(...)` console warnings from shared splash/motion components; there were no test failures.

## Local demo state and runbook

The isolated API is currently running at `http://127.0.0.1:8765` (shell session 88915, process PID 598949). The isolated database container is still running on loopback port 55441. The Expo app is not running. The original checkout's API/Expo processes on ports 8001/8081 and the other test container were left untouched.

Follow [the demo runbook](../orders/task01-simulated-payment-demo-runbook.md) to restart the API, run Expo on port 8090, or configure a physical Android device to use the computer's LAN address. The phone cannot use `127.0.0.1` to reach the API. Authentication/device acceptance is not claimed; the HTTP smoke uses short-lived synthetic credentials created in-process.

The reserved `.test` HTTPS certificate origin only verifies local startup configuration. It does not establish that an external certificate link, PromptPay QR, or bank payment works. No real banking or money movement is involved.
