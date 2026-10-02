# R4 — Two fresh-clock windows and six restart-safe jobs

- Task owner: existing A/B implementation session; R1–R4 only.
- Status: IMPLEMENTED_AND_TESTED locally; independent exact-head acceptance pending.
- PR: https://github.com/naithammarak/secondhand-marketplace-android-app/pull/130
- Branch: `codex/ab-external-shipping-2026-10-02`, based on PR129 `codex/bcd-integration-2026-10-02`.
- Upstream SHA: `b531bd1372c0d26b8492fa28ff29ab20a85d7578`.
- Verified implementation/test/document source commit: `832b1f94d1ed89dafeef69005422e00bba4daeb4`. This report is a documentation-only descendant. Exact final published head is supplied with the reviewer handoff and primary implementation coordination record; it is not a self-referential SHA.
- Migration predecessor/head: `c08f20261002` → `r01e20261002`, one head.
- Date: 2–3 October 2026, Asia/Bangkok (2 October UTC).

## What changed and why

Positive final PASS/MINOR_ISSUE result, certificate and availability+72h commit atomically. Before the persisted result cutoff Buyer may CONFIRM/REJECT; at/after it new writes return409. SYSTEM timeout is separately audited and authorizes only TO_SELLER, never a fake Buyer decision, automatic acceptance, dispatch or money. Negative results need no positive-result timer.

The separate physical AUTO window starts only from a trusted TO_BUYER event's persisted server time+72h. Tracking/page-open alone creates no timer. Actual manual Buyer receipt/report is allowed after dispatch without that event; if a cutoff exists, at/after writes fail. A missing report blocks AUTO under both policies. Replays preserve committed results, actor authorization and applicable config.

The runner preserves unpaid expiry(ID5), receipt release(ID1), Seller no-ship(ID2), durable return retry(ID3), inspection-overdue escalation(ID4), and adds result timeout as ID6. Cursor ownership/progress, bounded batches, failed-first fairness, wrap/catch-up, stop/restart and dry-run purity remain. Inspection escalation is three Bangkok working days, not a positive-result timeout. A locked candidate may be skipped by both bounded scans and picked up on catch-up; one scan is not a promise of instant completion. No scheduler was activated.

Before/at/after decision and physical receipt/report cutoffs are tested separately. Three lock-wait tests start real independent PostgreSQL transactions, hold the Order row and observe the blocked request in pg_stat_activity. The test clock calls actual database_now/clock_timestamp plus a fixed offset so the existing immutable72h deadline is crossed after about2seconds; persisted history/timestamps are never shortened or rewritten. Clock sampling must happen after lock release and all three late requests fail409 without writes. This is a deterministic fresh wall-clock proof with a test offset, not a literal72h sleep.

Both opposing CONFIRM/timeout winner orders are held deterministically on independent connections; only one decision/SYSTEM outcome and final direction persists. Receipt/report and receipt/report-versus-two-AUTO workers retain one settlement or reported HELD, including SKIP LOCKED catch-up. Two workers, failed-first result scanning, read-only dry-run, stop/restart and durable item-only refund retries are verified without HTTP timeout endpoints.

## Safe runbook

Run from `backend` with the backend Python environment. Set `AB_OWNED_TEST_DATABASE_URL` privately to the owned localhost disposable database, never a shared credential in a report. Default is a bounded read-only dry run:

```sh
python -m scripts.run_lifecycle_jobs --url-env AB_OWNED_TEST_DATABASE_URL --target external_flow_test --environment local --batch-size 2 --max-batches 2
```

Executed on the owned target with exit0, all six job counters emitted, failed0. Dry-run purity with actual eligible candidates is separately asserted in the53-case suite; this CLI smoke is not a deployment/eligible-money proof.

Only after inspecting the same owned target/config, an explicitly applied local scan is:

```sh
APP_ENV=test FULFILLMENT_SIMULATION_ENABLED=true python -m scripts.run_lifecycle_jobs --url-env AB_OWNED_TEST_DATABASE_URL --target external_flow_test --environment local --batch-size 2 --max-batches 2 --apply --confirm-target external_flow_test
```

The following are documented available commands, not activated services. `--retry-order-id` restricts the scan to that durable return and does not move the normal cursor. Recurring invocation catches up after restart; Ctrl-C/SIGTERM stops between bounded work:

```sh
APP_ENV=test FULFILLMENT_SIMULATION_ENABLED=true python -m scripts.run_lifecycle_jobs --url-env AB_OWNED_TEST_DATABASE_URL --target external_flow_test --environment local --apply --confirm-target external_flow_test --retry-order-id 7
APP_ENV=test FULFILLMENT_SIMULATION_ENABLED=true python -m scripts.run_lifecycle_jobs --url-env AB_OWNED_TEST_DATABASE_URL --target external_flow_test --environment local --apply --confirm-target external_flow_test --repeat --interval-seconds 300 --batch-size 100 --max-batches 10
```

Target hostname/database identity and apply confirmation are guarded before app import. Remote targets require explicit `--allow-remote` and appropriate operator authorization; shared deployment is outside this delivery. CLI logs report structured counters/error types, not secrets.

## Verification and isolation

Executed commands/counts, test source hashes and target identities are in [verification JSON](EXTERNAL-SHIPPING-VERIFICATION.json). All commands run from `backend` using the existing project virtualenv Python. PostgreSQL16 is the exclusively owned disposable Podman container `ab-amendment-pg-20261002`, localhost port55452; no shared data, live servers or worker deployment changed. New tests use real PostgreSQL, normal FastAPI TestClient/API mutations, separate connections for races and synthetic auth/private files. They do not prove Google identity, deployed Storage, a carrier/payment provider or Android screens.

| Check | Result | Interpretation |
|---|---:|---|
| New external-policy API/constraints/races |53 passed|Normal three-leg journeys, money, C/D composition and negative checks; source `tests/test_external_shipping_postgres.py`|
| Legacy-source migration/rollback/RLS |3 passed|Exact PR129 source byte-verified before actual old API journeys; source `tests/test_external_shipping_migration.py`|
| Retained FINISH flows |45 passed|Legacy fixture explicitly creates LEGACY_V1; not evidence of a no-Courier new flow|
| Foundation + reviews PostgreSQL |71 passed|Includes synthetic terminal schema fixtures, distinct from normal journey evidence|
| Composed B/C/D prior-policy API |4 passed|Actual legacy sale/return/profile/review/revocation, current implementation regression|
| Default backend |627 passed,405 skipped|PostgreSQL-dependent cases skip without owned URLs; they are not counted as passing|
| Syntax/format |PASS|Changed Python compiled; `git diff --check`; six PlantUML sources check/rendered; editable SRS rendered and all7 final PDF pages reviewed|

Earlier expanded tests exposed a wrong expected404/403 and an unapproved Seller review fixture; both fixture expectations were corrected before the final53-case run. Courier assignment on external shipments was a real unhandled constraint error and now returns the explicit409. Existing Starlette/httpx/anyio deprecation and synthetic JWT-key warnings remain, with no test failures. Local logs stay under `/tmp`; failed assertion payloads/tokens are not published.

## Remaining work and downstream handoff

Independent review must PASS on the exact remote head; findings are corrected on PR130, then re-reviewed. No known R1–R4 implementation test failure remains at this delivery. This does not establish E UI integration, shared migration/bucket/RLS rollout, real scheduler activation, native Google/Android/HTTPS QR, APK or teacher/presentation acceptance. Those gates remain explicitly pending.

E consumes [the concrete API mapping](EXTERNAL-SHIPPING-API-MAPPING.md), authoritative read/action fields and strict errors; do not derive status, timers, recipients or money in the client. Existing C profile/review and D certificate revocation are preserved. Do not merge this stacked PR until its exact reviewed parent/ancestry and affected candidate integration have been verified by the owner. Historical review/acceptance/reference documents remain unchanged.
