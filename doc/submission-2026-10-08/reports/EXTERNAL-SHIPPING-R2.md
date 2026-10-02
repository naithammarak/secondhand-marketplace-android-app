# R2 — External transport, actual recipients and scoped Admin commands

- Task owner: existing A/B implementation session; R1–R4 only.
- Status: IMPLEMENTED_AND_TESTED locally; independent exact-head acceptance pending.
- PR: https://github.com/naithammarak/secondhand-marketplace-android-app/pull/130
- Branch: `codex/ab-external-shipping-2026-10-02`, based on PR129 `codex/bcd-integration-2026-10-02`.
- Upstream SHA: `b531bd1372c0d26b8492fa28ff29ab20a85d7578`.
- Verified implementation/test/document source commit: `832b1f94d1ed89dafeef69005422e00bba4daeb4`. This report is a documentation-only descendant. Exact final published head is supplied with the reviewer handoff and primary implementation coordination record; it is not a self-referential SHA.
- Migration predecessor/head: `c08f20261002` → `r01e20261002`, one head.
- Date: 2–3 October 2026, Asia/Bangkok (2 October UTC).

## What changed and why

Seller sends TO_CENTER with carrier/tracking and an immutable validated return-address snapshot. Authorized center Inspector actually receives through the retained `/inspections/{id}/receive` route without an external Courier account or shipping photo. Assigned Inspector then dispatches the server-derived TO_BUYER or TO_SELLER final leg using carrier/tracking only. Positive CONFIRM, REJECT, SYSTEM timeout and negative result select the eligible direction; client legs/destinations are forbidden. Private inspection evidence is still mandatory for final inspection.

Owning active Buyer can actually receive or report missing after accepted TO_BUYER dispatch even before a transport event. If a receipt deadline exists, the write is strictly before it using fresh DB time after locks. A persisted report holds funds and blocks later AUTO. Owning Seller confirms actual TO_SELLER receipt; it commits as RETURNED_TO_SELLER/HELD before a separate financial attempt. The replayable receipt response records stable physical facts; clients refetch delivery to see current settlement/pending state.

The new Admin-only `/admin/shipments/{id}/shipping-events` command requires explicitly enabled demo configuration. Identity/source/server time are durable, canonical replay/dedup never moves an event or restarts a timer. TO_CENTER event is not Inspector receipt, TO_SELLER event is not Seller receipt/refund, and only a trusted TO_BUYER event starts AUTO eligibility. Wrong actor/Order/leg, inactive/config-disabled, payload/key conflict and terminal/late event cases fail. No real carrier integration was added.

Scoped Admin return-review issues same-case evidence and reason/audit; confirm-return binds references to this Order and issuing Admin and derives recipient/financial cause on the server. Another case/Admin or injected amount fails. Existing audited Buyer non-receipt resolution remains distinct. Role-redacted views expose no cross-party private destination, identity or report text. External Courier assignment now explicitly returns409 `legacy_courier_only`; historical legacy proof/assignment APIs remain working.

Meaningful normal APIs verify PASS/MINOR sale, manual Buyer receipt without event, positive rejection/negative return/SYSTEM silence, Seller and Admin actual return, event/report/AUTO, immutable destination, replay, correct actors and public C/D redaction. A Seller-as-Buyer sale uses actual approved Seller capability and retains profile/policy/review eligibility; refunded Orders never review.

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
