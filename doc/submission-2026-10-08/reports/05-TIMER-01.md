# Task delivery report

- Task ID / owner: 05 / TIMER-01 / package B, backend.
- Status: **IMPLEMENTED_AND_TESTED** for package B backend; full release/runtime acceptance remains pending.
- Repo / branch: `naithammarak/secondhand-marketplace-android-app` / `feat/package-b-delivery-settlement`, existing [PR #124](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/124).
- Original B review checkpoint: `bc4f6c47303cc7005c5e2b5cb5ef0d8250a9284c`.
- A implementation source: `33f0eadd8c1739735434ee9f103a5f23398178ed`; PR #123 head: `94a26a0fbb7a0a82948d95de7db9af070707b770`.
- A integration merge: `76faba8a3fd939e7dad429f3351da583bd302cf0`; common ancestor `d98d4a0b4b5d0cbfdce842ac886ed0ffc0409b05`.
- Initial implementation SHA: `1e3d6a061be4f6fa8e875885dfd68586aa79b7cc`; latest correction source: `9e8474c8c1bbf8b28d82aba51e4f212497863539`. Use the current PR head including subsequent evidence.
- Migration predecessor/head: `714f11c84d53` → `a02f20261002`; **no B migration or competing head**.
- Date / timezone: 2 October 2026 / Asia/Bangkok.

## PR124 review corrections

The four paid-job scans now persist traversal progress in existing SYSTEM commands, rotate across bounded runs/process restarts and wrap for retries. A per-job PostgreSQL advisory transaction lock prevents competing cursor writes; business locks/transactions remain independent. Dry-run writes no cursor and scoped return retry does not move it. [Correction report](B-PR124-REVIEW-FIXES.md) proves broken-first/healthy-second fairness, Storage recovery, cursor contention and four fresh CLI processes with batch=1/max=1. Latest verification: 192 localhost PostgreSQL passes plus 626 default passes/263 skips. Earlier results below remain historical. No migration or runtime scheduler activation.

## What changed and why

Added `lifecycle_worker` and `python -m scripts.run_lifecycle_jobs`. The full runner reuses existing unpaid expiry and its recurring infrastructure, with immediate catch-up and default 300-second intervals. Each category has bounded ID pagination, per-Order SKIP LOCKED, independent transactions, fresh locked eligibility/time and structured applied/eligible/skipped/failed/batch counts. Failed candidates remain retryable and do not stop unrelated progress.

| Category | Guard and durable result |
|---|---|
| unpaid_expiry | Unpaid persisted expiry reached → CANCELLED/EXPIRED, reservation AVAILABLE via upstream service |
| receipt_release | Confirmed selected readable TO_BUYER proof +72h, no report, HELD → shared AUTO RELEASE / COMPLETED / SOLD |
| seller_no_ship | paid_at+72h, WAITING_SELLER_SHIP, no committed Shipment → shared full REFUND / CANCELLED Product |
| return_refund | Durable RETURNED_TO_SELLER + confirmed readable return proof + HELD → shared full REFUND |
| inspection_overdue | Center receipt +3 Monday–Friday Bangkok days, no final result → one immutable marker and history command |

Escalation is visible in Inspector detail and the private Admin overdue queue. It creates no result, decision, certificate or fund transition. Timely inbound shipment blocks no-ship refund; the Seller route independently rejects late shipping while jobs are down.

CLI defaults to dry-run, requires a dedicated named URL plus exact DB target, blocks accidental DATABASE_URL/remote targets and requires matching confirm-target to apply. `--retry-order-id` targets one durable return. Dry-run validates proof-dependent eligibility but writes no records. New writes reuse A's exact simulation guard, including dev alias and only `true` opt-in. Failures are logged without private URLs/reasons/credentials and make one-shot exit nonzero.

A Windows Task Scheduler XML template and PowerShell wrapper match this work environment; they run one-shot every five minutes, default to dry-run, retain exit status/logs and require approved paths/target/service-account environment. XML/PowerShell syntax was checked. No task was registered or enabled. F/task10 owns actual authorized runtime activation/monitoring.

## Verification performed

| Check / exact command from `backend` | Environment | Result | Evidence |
|---|---|---|---|
| `.venv/Scripts/python.exe -m pytest tests/test_finish_flow_postgres.py tests/test_inspection_flow_postgres.py -q --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-finish-inspection-tests.xml` | Separate owned PostgreSQL databases and private local image files; final API run at implementation SHA | 91 passed: 45 FINISH + 46 INSPECT/CERT API | [JUnit](B-finish-inspection-tests.xml) |
| `.venv/Scripts/python.exe -m pytest tests/test_orders_postgres.py tests/test_finish_foundation_postgres.py tests/test_unpaid_expiry_postgres.py -q -x --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-order-worker-tests.xml` | Owned PostgreSQL Order database | 77 passed | [JUnit](B-order-worker-tests.xml) |
| From repository root: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_finish_foundation_migration.py -q -x --tb=short --junitxml=doc/submission-2026-10-08/reports/B-migration-tests.xml` | Owned migration database; legacy source exported from original B checkpoint, without private environment files | 5 passed | [JUnit](B-migration-tests.xml) |
| `.venv/Scripts/python.exe -m pytest -q --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-default-tests.xml` | Default suite with synthetic local configuration; specialized PG URL variables unset | 627 passed, 243 skipped, 3 existing warnings | [JUnit](B-default-tests.xml) |

Total specialized PostgreSQL checks: 173. Skipped default tests are not counted as passes. Exact isolated setup, initial failures and fixes are recorded in [runbook](B-VERIFICATION-RUNBOOK.md) and [machine evidence](B-verification.json).

All five categories ran without HTTP traffic after real API fixture preparation. Tests cover dry-run zero writes, before/exact/after receipt/no-ship/overdue boundaries, three-working-day weekday/weekend policy calculations, two runners/processes, two AUTO workers, inspection escalation once, missing/corrupt Storage failure and subsequent recovery, partial scan stop preserving the first commit, Windows forced termination and fresh-process restart, CLI target safeguards and failure exit status. A return crash leaves RETURNED_TO_SELLER/HELD and is refunded without re-upload on restart. Structured Storage failure remains visible and retryable.

## Contract and safety checks

One settlement implementation and one schema chain. No HTTP force-release, client-side timer or environment/client test-clock override. Server clocks can be injected only by Python test callers; production HTTP/CLI expose no clock. Only small per-Order locks span at most three bounded Storage reads. Full scans permit 100 records ×10 batches per category by default; logs identify limit_reached for operators.

## Remaining work / exact blocker

Backend task05 is implemented/tested. Scheduled deployment configuration exists, but actual task10 registration, service-account configuration, monitoring/alert integration and shared five-minute runtime observation are NOT RUN. No shared access is needed to review/test this implementation. Legacy return snapshot repair and Android/shared Storage acceptance remain separate gates.

## Handoff

F/task10: use [runbook](B-VERIFICATION-RUNBOOK.md), source SHA above and head a02f20261002. Start with dry-run on the explicitly authorized target, then activate/monitor only after environment review. Validate last successful scan, failures, pending HELD rows and overdue queue; recover by restart or scoped return retry. PR124 is the existing review destination; no GitHub merge performed.
