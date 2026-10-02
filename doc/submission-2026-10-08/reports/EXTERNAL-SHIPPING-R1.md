# R1 — Versioned schema, migration and authoritative documentation

- Task owner: existing A/B implementation session; R1–R4 only.
- Status: IMPLEMENTED_AND_TESTED locally; independent exact-head acceptance pending.
- PR: https://github.com/naithammarak/secondhand-marketplace-android-app/pull/130
- Branch: `codex/ab-external-shipping-2026-10-02`, based on PR129 `codex/bcd-integration-2026-10-02`.
- Upstream SHA: `b531bd1372c0d26b8492fa28ff29ab20a85d7578`.
- Verified implementation/test/document source commit: `832b1f94d1ed89dafeef69005422e00bba4daeb4`. This report is a documentation-only descendant. Exact final published head is supplied with the reviewer handoff and primary implementation coordination record; it is not a self-referential SHA.
- Migration predecessor/head: `c08f20261002` → `r01e20261002`, one head.
- Date: 2–3 October 2026, Asia/Bangkok (2 October UTC).

## What changed and why

Every Order created by the amended server persists EXTERNAL_V2. Upgrade marks all pre-existing Orders LEGACY_V1, including unpaid, paid/in-flight and terminal history. Immutable policy is carried to shipments and settlement; strict creation bodies reject client policy/money/party/deadline injection. The additive revision freezes its own DDL rather than importing mutable application policy.

New Order fields persist atomic positive result availability/deadline and SYSTEM timeout. Shipment recipient fields and the append-only `shipping_events` table separate actual recipient confirmation from explicitly configured Admin demo transport events. Existing Courier/proof tables and legacy constraints remain. New event provenance is bound to active Admin, USER actor scope, same Order/Shipment/leg/command/time and a unique source/event identity. Financial constraints check exact policy/cause allocations as well as conservation and one immutable settlement; deferred cross-row guards validate positive window/certificate, timeout and actual recipient facts.

The legacy migration test verifies every extracted tracked backend file byte-for-byte against PR129 (excluding every `.env*` file), then uses that actual old server code to produce positive rejection/full1350 refund, sale release/review/revocation, paid and unpaid Orders. It snapshots every existing table field. Upgrade preserves every old field and relationship; downgrade to c08 restores the exact prior snapshot; re-upgrade restores the upgraded snapshot. This exercises real historical operations, not a newly seeded terminal result. Fresh installs are also exercised by the new-policy/schema fixtures.

Unsafe downgrade refuses if new-policy Orders/events exist and leaves data/revision unchanged. A normal new-policy item1200 refund with retained100/50 is separately tested for downgrade refusal with charge, original Receipt, event, command and settlement history preserved. No silent full-refund conversion or loss of evidence is allowed.

Direct negative cases use nested savepoints for invalid immutable policy/window/destination/provenance/recipient facts. Shipping event RLS is enabled with no direct-client permissions/default deny. An actual persisted privileged event is invisible to anon/authenticated even after SELECT grants; direct client INSERT remains denied. These grants affect only the owned test DB.

Active DOC-01, SRS, requirements59IDs, release design/gates, QA28cases, task02–06/11/13 prompts and A/B/E packets now agree with the amendment. All six diagram sources plus rendered SVG/PNG and the editable SRS/PDF are updated; historical specifications/checkpoint evidence stay qualified. PDF layout uses a single page template and splittable tables, with all7 final pages visually reviewed. [API mapping](EXTERNAL-SHIPPING-API-MAPPING.md) gives E exact routes, actors, bodies, projections, errors and both timer contracts.

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
