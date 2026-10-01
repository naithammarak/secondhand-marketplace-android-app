# Package B isolated verification and integration runbook

**Current status:** preparatory contracts tested; accepted task02 missing.
Final settlement APIs and all-five-job runner are not available. Do not activate
the existing unpaid-only runner as if it were TIMER-01 completion. Task10 owns
authorized shared runtime activation after the combined implementation passes.

## Existing environment used

Windows, Python 3.13.5 in `backend/.venv`, PostgreSQL 18.6. A new disposable
cluster was initialized at a fresh temporary directory and bound exclusively
to `127.0.0.1:55482`, with synthetic local user `package_b_test` and databases
`package_b_order_test`, `package_b_inspect_test`, `package_b_clock_test`.
This does not use the server/database already running on port5432 or shared
Supabase. Private Storage in inspection tests uses a fresh pytest directory.

## Repeat the isolated checks on Windows

Run from repository root. Require an unused local port and a new cluster path.
The cluster uses trust authentication solely for these synthetic local tests.
Never point the test database variables at a shared or production database.

```powershell
$packageBPgBin = 'C:\Program Files\PostgreSQL\18\bin'
$packageBCluster = Join-Path ([IO.Path]::GetTempPath()) ('sa-package-b-pg-' + [guid]::NewGuid().ToString('N'))
& "$packageBPgBin\initdb.exe" -D $packageBCluster -U package_b_test -A trust -E UTF8 --no-locale
& "$packageBPgBin\pg_ctl.exe" -D $packageBCluster -l "$packageBCluster\server.log" -o '-h 127.0.0.1 -p 55482' -w start
& "$packageBPgBin\createdb.exe" -h 127.0.0.1 -p 55482 -U package_b_test package_b_order_test
& "$packageBPgBin\createdb.exe" -h 127.0.0.1 -p 55482 -U package_b_test package_b_inspect_test
& "$packageBPgBin\createdb.exe" -h 127.0.0.1 -p 55482 -U package_b_test package_b_clock_test
Set-Location backend
$env:PYTHONUTF8 = '1'
$env:PUBLIC_CERTIFICATE_BASE_URL = 'https://cert.example.test'
$env:ORDER_TEST_DATABASE_URL = 'postgresql+psycopg://package_b_test@127.0.0.1:55482/package_b_order_test'
$env:INSPECT_FLOW_TEST_DATABASE_URL = 'postgresql+psycopg://package_b_test@127.0.0.1:55482/package_b_inspect_test'
$env:FINISH_CLOCK_TEST_DATABASE_URL = 'postgresql+psycopg://package_b_test@127.0.0.1:55482/package_b_clock_test'
$env:DATABASE_URL = $env:ORDER_TEST_DATABASE_URL
```

Run the following commands from `backend`. Inspection tests require their
database to be empty; allocate a fresh inspection database for another run.
Order tests clear their disposable database; the clock test creates/drops only
its probe table and rejects an already populated database.

```powershell
& .venv/Scripts/python.exe -m pytest tests/test_finish_contract.py tests/test_finish_proofs.py tests/test_finish_fixtures.py tests/test_finish_clock_postgres.py -q --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-contract-tests.xml
& .venv/Scripts/python.exe -m pytest tests/test_orders_postgres.py tests/test_unpaid_expiry_postgres.py -q --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-order-worker-tests.xml
& .venv/Scripts/python.exe -m pytest tests/test_inspection_flow_postgres.py -q --tb=short
& .venv/Scripts/python.exe -m alembic heads
```

Observed: 132, 35 and 40 passed respectively; head `714f11c84d53`. Existing
Starlette/anyio deprecation warnings occurred. An initial regression run inherited
an invalid certificate origin from local configuration; explicitly setting the
synthetic HTTPS origin corrected that setup failure. The old process test
expected POSIX graceful SIGTERM on Windows; it now checks Windows forced exit
and a subsequent separate process's safe restart, while retaining POSIX checks.

Stop only the temporary cluster created above, after all test processes finish:

```powershell
& "$packageBPgBin\pg_ctl.exe" -D $packageBCluster -m fast -w stop
```

No shared cluster stop, recursive delete, production migration, signing secret,
real transfer or public Storage upload is required.

## Existing unpaid-only CLI

These commands exist and were exercised by the PostgreSQL suite. They process
unpaid expiry alone; they neither settle paid Orders nor escalate inspections.

```powershell
$env:ORDER_EXPIRY_DATABASE_URL = $env:ORDER_TEST_DATABASE_URL
& .venv/Scripts/python.exe -m scripts.release_expired_orders --url-env ORDER_EXPIRY_DATABASE_URL --target package_b_order_test --environment local
& .venv/Scripts/python.exe -m scripts.release_expired_orders --url-env ORDER_EXPIRY_DATABASE_URL --target package_b_order_test --environment local --apply --confirm-target package_b_order_test
```

Adding `--repeat --interval-seconds 300` performs an immediate startup scan and
then recurring scans every five minutes. It defaults to dry-run without
`--apply`; batches default to100, maximum10 batches per scan. Existing logs show
scanned/eligible/cancelled/failed/skipped/batches/limit_reached. One-shot failures
return nonzero. On Windows `terminate()` is abrupt; inspect failure signals and
restart with the same explicit target. No persistent Windows scheduled task or
service was registered during this work.

## Required final runner design after A/tasks03/04

Reuse the existing bounded recurring infrastructure, with per-Order locks and
independent transactions. Preserve deterministic scan order and SKIP LOCKED;
failed candidates retry on the next scan without starving other candidates.

| Category | Eligibility sampled/rechecked on server | Required persisted result |
|---|---|---|
| Unpaid expiry | Persisted `expires_at <= fresh DB clock`, unpaid | CANCELLED/EXPIRED and guarded reservation release |
| AUTO receipt | Delivered TO_BUYER, immutable selected readable proofs, deadline reached, no timely report, HELD, no settlement | Same service RELEASE; COMPLETED/SOLD; AUTO receipt atomic |
| Seller no-ship | `paid_at+72h` reached, WAITING_SELLER_SHIP, no inbound shipment, HELD, no settlement | Same service full REFUND; REFUNDED/CANCELLED |
| Return retry | Durable RETURNED_TO_SELLER, selected readable TO_SELLER proof, HELD, no settlement | Same service full REFUND, preserve delivery/history/replay |
| Inspection overdue | Center receive+3 Bangkok weekdays, inspection not final, no prior marker | One Admin/workqueue marker; no fabricated inspection result/decision/certificate/money change |

Target scans every300 seconds, immediate catch-up on restart, bounded Storage
I/O, fresh DB clock after locks and I/O revalidation. Proof outage/missing object
leaves HELD and a visible failure/retry candidate. Two processes must produce one
settlement or overdue marker. An existing inbound shipment, even inconsistent
legacy late data, fails safe against automatic no-ship refund and needs operator
review. Ship-to-center independently enforces its deadline while the worker is
down. Production must not accept a test/client clock override.

Planned shared financial guard: `FULFILLMENT_SIMULATION_ENABLED=false` by
default; `APP_ENV` allowlist `development|test|demo`. Unknown/production values
deny financial simulation even when enabled. The prepared predicate is not yet
wired into commands/workers; payment's older guard alone is insufficient.

Deployment configuration for the full runner, its actual CLI, durable failure
metadata and monitoring are **PENDING** the implemented task05 runner and the
authorized task10 target. Do not install a configuration pointing at a sample
`.env` or silently enable a partial worker. F must record process identity,
combined SHA, revision, interval/batch limits, environment and observed logs.

## Synthetic acceptance procedure still required

1. Receive the accepted A base/task02, verify ancestry and concrete mapping;
   keep one migration head. Reconcile all prepared contracts with actual names.
2. Using isolated PostgreSQL/local deterministic Storage, create paid Orders
   through actual APIs, save owning Seller return address, deliver TO_CENTER,
   receive/start/finalize inspection. Never patch a shared Order into final state.
3. PASS/MINOR_ISSUE CONFIRM: prove acceptance leaves HELD; dispatch TO_BUYER,
   confirm selected readable proof, verify deadline starts once; physical receipt
   produces one RELEASE with 1350→1140/60/100/50 and preserved original receipt.
4. Positive REJECT and each negative result: prove exactly one TO_SELLER frozen
   destination; return confirmation persists before intentionally failing refund;
   restart the worker and prove one full1350 refund without re-upload/relisting.
5. Test active/inactive/foreign Buyer, Seller-as-Buyer, Courier assignment,
   Inspector assignment, scoped Admin audit and cross-case evidence rejection;
   inspect JSON/bytes for redaction and no-store.
6. Use independent PostgreSQL sessions for release-vs-refund, duplicate release,
   duplicate refund, report-vs-AUTO, deadline waits and rollback injection. Assert
   actual settlement/command/history/receipt/audit row counts after each outcome.
7. Invoke all five scans with no HTTP traffic at just-before/at/after boundaries;
   test simultaneous runners, process crash/restart, Storage outage/recovery and
   repeated escalation. Use synthetic fixture clocks, not sleeps of72 hours.
8. Run final regression at the combined SHA and publish implemented03/04 commits
   to A/E/C before05 handoff. Keep Android/shared Storage/QR/Google and actual
   worker activation pending until observed separately at that release.
