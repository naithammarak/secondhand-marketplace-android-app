# Task delivery report

- Task ID / owner: 05 / TIMER-01 / package B, backend.
- Status: **BLOCKED** for all-five-job integration; deadline policy and existing unpaid worker recovery verified.
- Repo / branch: `naithammarak/SA-Project` / `feat/package-b-delivery-settlement`.
- Upstream SHA: inspected preparatory parent `d98d4a0b4b5d0cbfdce842ac886ed0ffc0409b05`; accepted A/task02 and implemented tasks03/04 missing.
- Delivered SHAs: policy/fixture/test preparation `7918fc26a40df7eb316850482309600d9051d325`; worker process regression `0b219f262ec670369b22053c8bbbc4654b1cb809`.
- Migration predecessor/head: existing `714f11c84d53`; overdue marker must come from A/task02; no B migration.
- Date / timezone: 2 October 2026 / Asia/Bangkok.

## What changed and why

Inspected the existing `unpaid_expiry_worker`, transactional `order_expiry`,
`scripts.release_expired_orders` CLI and runbook. Prepared reusable server rules
for receipt/no-ship72h deadlines, fresh DB wall clock and three Monday–Friday
Bangkok working days, excluding weekends without a holiday calendar. No
automatic inspection decision/certificate/fund change is added.

Corrected `backend/tests/test_unpaid_expiry_postgres.py` to distinguish POSIX
SIGTERM from Windows `TerminateProcess`, and verify another process safely
restarts afterward with no duplicate cancellation. Production worker code was
not altered. The [runbook](B-VERIFICATION-RUNBOOK.md) gives the actual unpaid-only
CLI, isolated cluster/check commands, pending five-category eligibility and
recovery acceptance procedure. It does not claim a full TIMER runner exists.

## Verification performed

| Check / exact command | Environment / DB isolation | Result / count | Evidence path |
|---|---|---|---|
| `.venv/Scripts/python.exe -m pytest tests/test_orders_postgres.py tests/test_unpaid_expiry_postgres.py -q --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-order-worker-tests.xml` | Synthetic local cluster55482, real independent DB connections/processes | 35 passed; 9 existing unpaid-worker tests included | [B-order-worker-tests.xml](B-order-worker-tests.xml) |
| `.venv/Scripts/python.exe -m pytest tests/test_finish_contract.py tests/test_finish_proofs.py tests/test_finish_fixtures.py tests/test_finish_clock_postgres.py -q --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-contract-tests.xml` | Independent policies/proof faults plus real clock/lock probe | 132 passed; exact receipt/no-ship boundaries and all weekday starts checked | [B-contract-tests.xml](B-contract-tests.xml) |
| `.venv/Scripts/python.exe -m alembic heads` | Existing static graph | One `714f11c84d53` head | [verification record](B-verification.json) |

Existing unpaid tests prove no-HTTP dry-run/bounded scans, two workers yielding
one cancellation, payment/cancel lock compatibility, failure rollback/retry,
recurring stop, CLI target safeguards, new-process restart and Windows forced-
termination recovery. Final paid settlement jobs and persisted overdue marker
were **NOT RUN**, since required models/services are absent.

Initial environment failures from an invalid local certificate origin were
resolved using the synthetic HTTPS test origin. The Windows-specific old exit
assertion was a baseline test portability failure; it now passes with a
post-termination restart assertion. Existing dependency warnings remain.

## Contract and safety checks

- Reuse existing per-Order transaction/SKIP LOCKED/bounded recurring infrastructure; do not implement another financial service or lazy GET settlement.
- Full runner must call the same task04 RELEASE/REFUND service for AUTO, return retry and seller no-ship. Only unpaid expiry and pure deadline helpers currently exist.
- Buyer/report writes require fresh DB clock strictly before deadline; AUTO requires at/after, still-readable confirmed proof and no report. Successful committed same-key replay remains readable after deadlines.
- Any committed center shipment prevents automatic no-ship refund; late legacy inbound data requires operator review. Seller ship write must enforce the deadline even without a worker.
- Return delivery is independently durable, HELD and retryable; Storage outage must not turn pending processing into success.
- Three working days preserve Bangkok local time: Friday2Oct10:00 → Wednesday7Oct10:00. Escalation marker must persist once, without result/decision/certificate/settlement invention.
- No full scheduler deployed, Windows persistent task registered, shared runtime enabled, shared DB changed or client job introduced. Full-runner CLI/deployment/monitoring config remains pending rather than an executable nonexistent command.

## Remaining work / exact blocker

A's accepted task02 mapping/models and B's actual tasks03/04 implementation are
missing. There is no terminal settlement service, durable selected final-leg
proof binding or reserved overdue marker to scan/write safely. Four additional
categories cannot be implemented against this schema without violating the
user's instruction to reuse A's models and avoid replacement infrastructure.

After upstream integration: implement actual five-category runner, dry-run/
one-shot/manual-retry CLI, bounded per-Order revalidation, persistent escalation,
structured failure monitoring and deployment configuration matching authorized
task10 runtime. Prove all categories without HTTP, before/at/after deadlines,
simultaneous runners, interrupted partial progress, Storage outage/recovery and
repeated escalation with actual PostgreSQL records. Do not substitute current
unpaid-only tests or contract fixtures for these checks.

## Handoff

- A: supply accepted upstream and durable marker mapping; retain one migration chain.
- Tasks03/04: shared transaction protocol in `finish_interfaces.py`; no worker-specific financial branch allowed.
- F/task10: [isolated runbook](B-VERIFICATION-RUNBOOK.md) and this explicit pending status. Do not activate the unpaid-only runner as full TIMER-01.
- E/C: final API/settlement/review acceptance remains pending; observed worker outage must display HELD/pending processing.
- Combined release retest and actual Android/shared Storage/schedule activation are separate required acceptance gates.
