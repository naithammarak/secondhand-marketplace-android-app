# R3 — Cause-aware item refund, conserved money and durable retry

- Task owner: existing A/B implementation session; R1–R4 only.
- Status: IMPLEMENTED_AND_TESTED locally; independent exact-head acceptance pending.
- PR: https://github.com/naithammarak/secondhand-marketplace-android-app/pull/130
- Branch: `codex/ab-external-shipping-2026-10-02`, based on PR129 `codex/bcd-integration-2026-10-02`.
- Upstream SHA: `b531bd1372c0d26b8492fa28ff29ab20a85d7578`.
- Verified implementation/test/document source commit: `4e4db6a297bdfbe7c914388f938fc98e65d2234d`. This report is a documentation-only descendant. Exact final published head is supplied with the reviewer handoff and primary implementation coordination record; it is not a self-referential SHA.
- Migration predecessor/head: `c08f20261002` → `r01e20261002`, one head.
- Date: 2–3 October 2026, Asia/Bangkok (2 October UTC).

## What changed and why

The existing single guarded settlement service derives allocation from immutable Order policy/price/fees and actual cause. New-policy positive-result REJECT or SYSTEM result timeout refunds the item snapshot only after actual Seller/scoped Admin return receipt. Example held1350 = Buyer1200 + retained inspection100 + shipping50, Seller payout0 and commission0. It neither subtracts fees again to1050 nor adds a return charge. Negative inspection, Seller no-ship, audited Buyer non-receipt and legacy returns keep full1350 with all other allocations0. Normal RELEASE keeps item1200 → Seller1140 + commission60 plus original inspection100/shipping50.

One transaction writes immutable settlement/terminal escrow/order/product facts. Original successful Payment/Receipt remain unchanged; Product stays CANCELLED after refund, not automatically relisted. A durable actual return commits first; a later failed refund remains RETURNED_TO_SELLER/HELD with pending processing. An authorized retry/worker uses the same persisted policy/cause and commits exactly one refund without retaining fees twice. A carrier event cannot substitute actual return or independently settle money.

Tests exercise these terminal results through normal new APIs. They compare original Receipt before/after, require no refund review and one settlement per Order/Escrow. A deliberately failing allocator tests conserving but invalid allocations1050/200/100,1350/0/0,1200/99/51: PostgreSQL rejects them and rolls back the entire financial command while actual receipt remains durable. Restoring the existing allocator then retries to1200 exactly once. A simulated financial outage likewise preserves physical receipt and succeeds on retry; scoped Admin exception and SYSTEM return source retain the same cause.

Independent opposing decision/timeout and receipt/report/AUTO workers produce one direction/terminal outcome or DISPUTED/HELD. Existing legacy FINISH suite covers original RELEASE-versus-REFUND/retry/proof paths. Synthetic foundation/review fixtures are reported separately and are not presented as proof of normal API acceptance. Old positive-rejection refunds remain1350 after migration, safe downgrade/re-upgrade preserves them byte-for-field, and an actual new item-only refund refuses unsafe downgrade without losing history.

## Verification and isolation

Executed commands/counts, test source hashes and target identities are in [verification JSON](EXTERNAL-SHIPPING-VERIFICATION.json). All commands run from `backend` using the existing project virtualenv Python. PostgreSQL16 is the exclusively owned disposable Podman container `ab-amendment-pg-20261002`, localhost port55452; no shared data, live servers or worker deployment changed. New tests use real PostgreSQL, normal FastAPI TestClient/API mutations, separate connections for races and synthetic auth/private files. They do not prove Google identity, deployed Storage, a carrier/payment provider or Android screens.

| Check | Result | Interpretation |
|---|---:|---|
| New external-policy API/constraints/races |54 passed|Normal three-leg journeys, money, C/D composition and negative checks; source `tests/test_external_shipping_postgres.py`|
| Legacy-source migration/rollback/RLS |3 passed|Exact PR129 source byte-verified before actual old API journeys; source `tests/test_external_shipping_migration.py`|
| Retained FINISH flows |45 passed|Legacy fixture explicitly creates LEGACY_V1; not evidence of a no-Courier new flow|
| Foundation + reviews PostgreSQL |71 passed|Includes synthetic terminal schema fixtures, distinct from normal journey evidence|
| Composed B/C/D prior-policy API |4 passed|Actual legacy sale/return/profile/review/revocation, current implementation regression|
| Default backend |627 passed,406 skipped|PostgreSQL-dependent cases skip without owned URLs; they are not counted as passing|
| Syntax/format |PASS|Changed Python compiled; `git diff --check`; six PlantUML sources check/rendered; editable SRS rendered and all7 final PDF pages reviewed|

Earlier expanded tests exposed a wrong expected404/403 and an unapproved Seller review fixture; both fixture expectations were corrected before the final54-case run. Courier assignment on external shipments was a real unhandled constraint error and now returns the explicit409. A further first-publication NULL-deadline fault-injection test reproduced a schema gap: PostgreSQL CHECK allowed UNKNOWN. The unmerged new revision now explicitly requires a nonnull deadline (matching the model); failure rolls back result, window and certificate, and the same key can retry. The54 API,3 migration and default suites were rerun after this fix. Legacy45, foundation/review71 and composed4 results were carried forward from implementation832b1f9 because this additional guard affects only the new positive-window tuple and legacy-only fixture behavior is unchanged. Existing Starlette/httpx/anyio deprecation and synthetic JWT-key warnings remain, with no test failures. Local logs stay under `/tmp`; failed assertion payloads/tokens are not published.

## Remaining work and downstream handoff

Independent review must PASS on the exact remote head; findings are corrected on PR130, then re-reviewed. No known R1–R4 implementation test failure remains at this delivery. This does not establish E UI integration, shared migration/bucket/RLS rollout, real scheduler activation, native Google/Android/HTTPS QR, APK or teacher/presentation acceptance. Those gates remain explicitly pending.

E consumes [the concrete API mapping](EXTERNAL-SHIPPING-API-MAPPING.md), authoritative read/action fields and strict errors; do not derive status, timers, recipients or money in the client. Existing C profile/review and D certificate revocation are preserved. Do not merge this stacked PR until its exact reviewed parent/ancestry and affected candidate integration have been verified by the owner. Historical review/acceptance/reference documents remain unchanged.
