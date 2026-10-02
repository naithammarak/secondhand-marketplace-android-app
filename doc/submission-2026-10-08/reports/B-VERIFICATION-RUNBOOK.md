# Package B verification and lifecycle runbook

Implementation source `1e3d6a061be4f6fa8e875885dfd68586aa79b7cc`; A source33f0ead/head94a26a0 integrated by76faba8. Task03–05 backend implemented/tested; one heada02f20261002. Independent review, E/C combined release, Android/shared services and task10 activation remain pending.

## Owned isolation

Windows, Python3.13.5, PostgreSQL18.6. A newly initialized temporary cluster bound exclusively to `127.0.0.1:55483`, synthetic user package_b_test. Separate empty databases for FINISH, INSPECT, Orders and migrations; trust auth only on this loopback test cluster. Private bytes used pytest temporary directories. No central Supabase or existing5432 connection/migration/reset/upload. The owned cluster is stopped after verification; artifacts remain local.

## Repeat setup

From repository root, choose an unused port and fresh directory/database names. FINISH/inspection require empty databases; Order/migration suites reset only their guarded disposable targets. Set variables before app import so backend/.env cannot choose the DB.

```powershell
$packageBPgBin = 'C:\Program Files\PostgreSQL\18\bin'
$packageBCluster = Join-Path ([IO.Path]::GetTempPath()) ('sa-b-finish-' + [guid]::NewGuid().ToString('N'))
& "$packageBPgBin\initdb.exe" -D $packageBCluster -U package_b_test -A trust -E UTF8 --no-locale
& "$packageBPgBin\pg_ctl.exe" -D $packageBCluster -l "$packageBCluster\server.log" -o '-h 127.0.0.1 -p 55483' -w start
& "$packageBPgBin\createdb.exe" -h 127.0.0.1 -p 55483 -U package_b_test package_b_finish_test
& "$packageBPgBin\createdb.exe" -h 127.0.0.1 -p 55483 -U package_b_test package_b_inspect_test
& "$packageBPgBin\createdb.exe" -h 127.0.0.1 -p 55483 -U package_b_test package_b_order_test
$env:PYTHONUTF8 = '1'
$env:DATABASE_URL = 'postgresql+psycopg://package_b_test@127.0.0.1:55483/package_b_order_test'
$env:FINISH_TEST_DATABASE_URL = 'postgresql+psycopg://package_b_test@127.0.0.1:55483/package_b_finish_test'
$env:INSPECT_FLOW_TEST_DATABASE_URL = 'postgresql+psycopg://package_b_test@127.0.0.1:55483/package_b_inspect_test'
$env:ORDER_TEST_DATABASE_URL = $env:DATABASE_URL
$env:PUBLIC_CERTIFICATE_BASE_URL = 'https://cert.example.test'
Set-Location backend
```

Run specialized checks from backend. Actual final API targets were package_b_finish_source_test/package_b_inspect_source_test; only names differ from the reusable sample.

```powershell
& .venv/Scripts/python.exe -m pytest tests/test_finish_flow_postgres.py tests/test_inspection_flow_postgres.py -q --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-finish-inspection-tests.xml
& .venv/Scripts/python.exe -m pytest tests/test_orders_postgres.py tests/test_finish_foundation_postgres.py tests/test_unpaid_expiry_postgres.py -q -x --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-order-worker-tests.xml
& .venv/Scripts/python.exe -m alembic heads
```

Observed91(45+46),77 and onea02f20261002 head. Allocate new empty FINISH/INSPECT databases for another API run. FINISH cleanup is confined to its already-validated owned database between tests, preventing another test's private Storage root contaminating a scan.

For default suite, unset specialized URL variables; keep DATABASE_URL synthetic/local. Executed `.venv/Scripts/python.exe -m pytest -q --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-default-tests.xml` →627passed/243skipped/3existing warnings. Specialized skipped cases are not counted as passes.

### Predecessor rehearsal

From repository root: export backend code only from bc4f6c47303cc7005c5e2b5cb5ef0d8250a9284c using `git archive --format=zip --output=<temporary-zip> <sha> backend`; expand into a fresh temporary directory. No .env/private configuration copied. Allocate package_b_migration_test; set FINISH_MIGRATION_TEST_DATABASE_URL to its loopback URL and FINISH_LEGACY_SOURCE to the exported backend directory. Execute:

```powershell
& backend/.venv/Scripts/python.exe -m pytest backend/tests/test_finish_foundation_migration.py -q -x --tb=short --junitxml=doc/submission-2026-10-08/reports/B-migration-tests.xml
```

Observed5passed: supported714f11c84d53/e8b2c490a713/d8b7c4e2910a preservation, preflight rollback and downgrade/RLS protections. No shared migration executed.

### Actual sale fixture for C/E

Allocate another empty FINISH_TEST_DATABASE_URL; keep DATABASE_URL distinct/local. From backend:

```powershell
& .venv/Scripts/python.exe -m pytest 'tests/test_finish_flow_postgres.py::test_actual_sale_and_each_return_preserve_charge_and_destinations[PASS-CONFIRM-TO_BUYER]' -q
```

This uses actual payment, Seller snapshot, center assignment/private proof/receive/start/result/certificate, Buyer CONFIRM, final leg/selected proof and physical receipt APIs. One test leaves actual COMPLETED/RELEASED/SOLD rows in that disposable DB; inspect joined Order/Escrow/OrderSettlement and1350→1140/60/100/50. Actors/proofs are synthetic pytest fixtures, not shared Auth/device fixtures. Another FINISH test resets that owned DB. Refund journey parameters cannot qualify for task08. Old contract-only JSON is not runtime eligibility evidence.

## Five-category CLI

Use a dedicated URL variable and exact approved DB target. Dry-run validates identical settlement/proof guards without ID allocation or business/audit writes. Apply requires APP_ENV dev/development/test/demo and exact FULFILLMENT_SIMULATION_ENABLED=true; production/unknown/disabled deny. HTTP/CLI expose no test clock.

```powershell
$env:LIFECYCLE_DATABASE_URL = $env:FINISH_TEST_DATABASE_URL
& .venv/Scripts/python.exe -m scripts.run_lifecycle_jobs --url-env LIFECYCLE_DATABASE_URL --target package_b_finish_test --environment local
& .venv/Scripts/python.exe -m scripts.run_lifecycle_jobs --url-env LIFECYCLE_DATABASE_URL --target package_b_finish_test --environment local --apply --confirm-target package_b_finish_test
```

`--repeat --interval-seconds 300` scans immediately then every5minutes. Defaults100records×10batches per category; bounded1–1000 each. `--retry-order-id <id>` restricts retry to one durable return. DATABASE_URL as the named target variable is denied; remote additionally needs --allow-remote, with authorization handled separately by task10.

Summaries include all five jobs' scanned/eligible/applied/failed/skipped/batches/limit_reached and totalfailed. One-shot failures return1; target argument errors return2. Safe failure logs show category/Order ID/code/type, without credentials, object paths or user reasons. Repeated scans share locks, stable keys and the unique ledger. Storage failures leave HELD and retryable candidates.

## Windows schedule and monitoring — not activated

[Wrapper](../../../backend/deploy/lifecycle-worker.ps1) and [Task XML](../../../backend/deploy/lifecycle-worker.task.xml) match this platform. Task10 replaces APPROVED path/database/account placeholders and configures dedicated environment/private Storage and protected log path under that account. Default is dry-run; explicit -Apply also requires the guard. Repetition5minutes, missed-start catch-up, single scheduled instance, one-shot exit status preserved. XML/PowerShell syntax passed; task registration/activation NOT RUN.

Before authorized apply, record source/migration, target name, mode/account, interval/batch limits and Storage adapter. Observe dry-run, then LastRunTime/LastTaskResult and summaries. Persist logs; alert on failures/nonzero exit or no successful scan within two intervals. Review limit_reached and pending HELD/RETURNED_TO_SELLER backlog. Private Admin overdue queue exposes escalation without inventing results.

Recovery: restart the owned process/task, inspect safe codes, restore private proof readability, invoke full scan or scoped return retry. Return delivery already committed before refund; do not re-upload/relist/edit snapshots/manually set REFUNDED. Windows TerminateProcess is abrupt: a fresh process resumes safely. Partial transactions roll back; earlier per-Order commits survive. POSIX SIGTERM retains graceful stop.

## Initial failures and fixes

- A's missing_report_id is String(36). B stores report command ID as a decimal string and validates references against that string. First focused Admin failure exposed this; reruns passed.
- Earlier incomplete test delivery used another pytest Storage root. Current FINISH fixture clears only its validated owned test DB between cases.
- Updated upstream Seller proof assertion to the specified inbound/return Courier scope, retaining denial of inspection images/TO_BUYER proofs.
- Initial typecheck used stale ignored .expo/types/router.d.ts. Regenerated through installed @expo/router-server getTypedRoutesDeclarationFile and expo-router/internal/testing requireContext over src/app. No tracked type relaxation/visual edit. Typecheck then passed; logic306/components214 passed.

Historical B-contract-tests.xml belongs to7918fc2/old55482 preparation. Current [machine evidence](B-verification.json), [final91 API JUnit](B-finish-inspection-tests.xml), [Order/worker JUnit](B-order-worker-tests.xml), [migration JUnit](B-migration-tests.xml) and [default JUnit](B-default-tests.xml) supersede BLOCKED integration claims. Standalone focused XMLs are intermediate successful runs.

Stop only the owned temporary cluster after its test processes finish:

```powershell
& "$packageBPgBin\pg_ctl.exe" -D $packageBCluster -m fast -w stop
```

No shared stop/reset, recursive deletion or persistent scheduler registration occurred. Android/Auth/shared Storage/QR, E/C acceptance and task10 activation remain NOT RUN. A independent review and legacy missing return snapshot repair remain separate pending items.
