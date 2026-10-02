# Task delivery report

- Task ID / owner: 03 / FINISH-02 + COURIER-02 / package B, backend.
- Status: **IMPLEMENTED_AND_TESTED** for package B backend; full release/runtime acceptance remains pending.
- Repo / branch: `naithammarak/secondhand-marketplace-android-app` / `feat/package-b-delivery-settlement`, existing [PR #124](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/124).
- Original B review checkpoint: `bc4f6c47303cc7005c5e2b5cb5ef0d8250a9284c`.
- A implementation source: `33f0eadd8c1739735434ee9f103a5f23398178ed`; PR #123 head: `94a26a0fbb7a0a82948d95de7db9af070707b770`.
- A integration merge: `76faba8a3fd939e7dad429f3351da583bd302cf0`; common ancestor `d98d4a0b4b5d0cbfdce842ac886ed0ffc0409b05`.
- Initial implementation SHA: `1e3d6a061be4f6fa8e875885dfd68586aa79b7cc`; latest correction source: `9e8474c8c1bbf8b28d82aba51e4f212497863539`. Use the current PR head including subsequent evidence.
- Migration predecessor/head: `714f11c84d53` → `a02f20261002`; **no B migration or competing head**.
- Date / timezone: 2 October 2026 / Asia/Bangkok.

## PR124 review corrections

Admin detail now exposes only persisted shipment ID/leg/status/Courier ID, allowing final-leg discovery from Admin APIs and assignment through the existing Shipment route. The TO_CENTER Order alias is preserved. Malformed Unicode validation returns safe 422 without business writes; valid Thai/emoji remain supported. [Correction report](B-PR124-REVIEW-FIXES.md) records all four findings, 19 new regressions, the unchanged reviewer file and 192 actual localhost PostgreSQL passes. Initial verification below is historical; current evidence is linked in that report. No central Supabase or shared Storage touched.

## What changed and why

Integrated A by a non-fast-forward merge; Git reported no conflicts. The B Windows worker restart regression and NUL validation fix remain present. Read A's latest code, Task02, API mapping and release manifest: the source/migration/input contracts are available. A still labels its independent review REVIEW_PENDING; this is a usable source handoff, not an accepted deployed release.

`POST /orders/{id}/fulfillment` lets only the assigned active Inspector derive one final leg from actual inspection/decision/certificate and Order snapshots. Positive CONFIRM dispatches TO_BUYER; positive REJECT or either negative result dispatches TO_SELLER. A missing positive decision, fabricated negative decision or missing frozen return address cannot dispatch. Exactly one outbound index and shared Order lock prevent contradictory directions. Return dispatch retains RESULT_NOTIFIED until proven physical return.

Extended existing Courier queue, detail, assignment, upload, private read and confirmation routes. New confirmations require strict `{proof_ids:[...]}` on **all three legs**. Only the selected 1–3 same-shipment/current-Courier JPEG/PNG objects are decoded, bounded, hash-checked and bound atomically. Current metadata/authorization are refreshed after I/O. Upload never confirms delivery. Inspector detail now provides persisted Buyer decision, final shipment, next action and `can_create_fulfillment`.

TO_BUYER confirmation sets DELIVERED_PENDING_BUYER and a deadline exactly 72 hours later. TO_SELLER confirmation commits delivery, selected proofs, command/history and RETURNED_TO_SELLER first; a separate session invokes the shared refund service. Its stable confirmation response records HELD at the delivery transaction, even when the subsequent refund succeeds; GET delivery supplies current state. Failure logs pending processing and preserves a worker retry candidate.

New selected commands use FulfillmentCommand with resource ORDER and shipment ID inside the canonical payload, as required by the history FK. A's earlier InspectionIdempotency bodyless TO_CENTER commands retain their original `{}` hashes/results/bindings: absent/empty bodies replay; an explicit identical frozen set also replays; a changed selected set conflicts. New bodyless commands fail 422. The existing mobile service and its sole caller now send the selected IDs; no mobile visual redesign was included.

## Verification performed

| Check / exact command from `backend` | Environment | Result | Evidence |
|---|---|---|---|
| `.venv/Scripts/python.exe -m pytest tests/test_finish_flow_postgres.py tests/test_inspection_flow_postgres.py -q --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-finish-inspection-tests.xml` | Separate owned PostgreSQL databases and private local image files; final API run at implementation SHA | 91 passed: 45 FINISH + 46 INSPECT/CERT API | [JUnit](B-finish-inspection-tests.xml) |
| `.venv/Scripts/python.exe -m pytest tests/test_orders_postgres.py tests/test_finish_foundation_postgres.py tests/test_unpaid_expiry_postgres.py -q -x --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-order-worker-tests.xml` | Owned PostgreSQL Order database | 77 passed | [JUnit](B-order-worker-tests.xml) |
| From repository root: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_finish_foundation_migration.py -q -x --tb=short --junitxml=doc/submission-2026-10-08/reports/B-migration-tests.xml` | Owned migration database; legacy source exported from original B checkpoint, without private environment files | 5 passed | [JUnit](B-migration-tests.xml) |
| `.venv/Scripts/python.exe -m pytest -q --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-default-tests.xml` | Default suite with synthetic local configuration; specialized PG URL variables unset | 627 passed, 243 skipped, 3 existing warnings | [JUnit](B-default-tests.xml) |

Total specialized PostgreSQL checks: 173. Skipped default tests are not counted as passes. Exact isolated setup, initial failures and fixes are recorded in [runbook](B-VERIFICATION-RUNBOOK.md) and [machine evidence](B-verification.json).

Task03 evidence includes six real journeys (PASS/MINOR_ISSUE CONFIRM/REJECT, FAKE, NOT_AS_DESCRIBED), 1/3 photos, strict malformed/duplicate/foreign selection, wrong assigned actors, dispatch/confirmation races, canonical replay, changed-key body conflicts, immutable addresses, readability failure/recovery and durable return followed by refund failure/retry.

## Contract and safety checks

| Actor | Courier proof access |
|---|---|
| Owning active Buyer, including Seller-as-Buyer | Relevant legs |
| Owning active Seller | TO_CENTER and TO_SELLER; no TO_BUYER proof or Buyer final address |
| Active assigned Courier / assigned Inspector | Their Shipment / Order work only |
| Admin | Selected proof through the audited same-case Admin URL; ordinary proof URL denied |
| Anonymous, inactive, unrelated, unassigned actors | Denied |

Courier destinations are exposed only while their assigned work is pending and are absent from delivered history. Seller final reads redact Buyer address/proofs. Private routes, including denial responses, use no-store. Canonical center receive remains `POST /inspections/{id}/receive`. A's Seller ship guard rejects at/after paid_at+72h, while successful old-key replay survives the deadline.

## Remaining work / exact blocker

No missing A model/mapping/source input blocks new-order backend implementation. A independent review, E final-leg/mobile controls and F/task10 shared activation are pending. Legacy in-flight Orders with no return snapshot require a separately reviewed audited repair; the ordinary API neither invents nor changes that frozen address. Android/real shared Storage/QR/Auth acceptance remains NOT RUN.

## Handoff

E uses [current API mapping](API-MAPPING.md) and [B contract handoff](B-CONTRACT-HANDOFF.md). Task04 owns the one settlement service; task05 retries durable returns. Implementation and tests are in PR124 for review; neither PR123 nor PR124 was merged on GitHub. No teammate recipient channel was supplied, so repository handoff is recorded without claiming direct messages.
