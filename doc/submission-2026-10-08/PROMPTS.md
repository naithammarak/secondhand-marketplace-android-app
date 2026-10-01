# Copyable prompts for every task

Read README.md for dependencies; do not run all tasks against separate stale bases.

## 00-DOC-01-lead

[Task details](tasks/00-DOC-01-lead.md)

```text
You are the project lead for a secondhand marketplace Android prototype due Thursday 8 October 2026, Asia/Bangkok. Work in the existing secondhand-marketplace-android-app repository. Find the packet at doc/submission-2026-10-08, or the supplied submission-2026-10-08 folder. Read README.md, DOC-01-scope.md, PROFILE-REVIEWS-contract.md, FINISH-00-release-gates.md, QA-MATRIX.md and LEAD-WORK-REPORT.md.

DOC-01 was prepared on 1 October. Review this concrete scope rather than restarting requirements discovery. Keep the complete sale and return/refund journeys; the only requested optional additions are basic profile and seller reviews. Push/inbox, inspection ratings, review photos/tags, advanced filters, wallet and wider user administration are deferred as recorded. Teacher acceptance of this revision is not yet established.

Check the supplied SRS source/PDF and diagrams against the chosen rules. Fix concrete documentation inconsistencies in the current folder while preserving unrelated code and original historical documents. Keep task links, route mapping and requirement/test traceability complete. Verify generated artifacts and links. Do not claim implementation or device acceptance merely because the documents exist. Report completed lead work and the remaining release/teacher gates in LEAD-WORK-REPORT.md using templates/TASK-REPORT.md. Do not publish comments, merge PRs, alter shared data or invent test results.
```

## 01-INT-01-release-base

[Task details](tasks/01-INT-01-release-base.md)

```text
Implement INT-01 in the existing secondhand-marketplace-android-app repository. Deadline is 8 October 2026, Asia/Bangkok. Locate doc/submission-2026-10-08 (or the supplied packet folder). Read README.md, DOC-01-scope.md, FINISH-00-release-gates.md, RELEASE-DESIGN.md and manifests/baseline-2026-10-01.json. Apply repository AGENTS.md instructions; inspect branch, HEAD, status and local/remote state before edits. In mobile, read the exact Expo version documentation required by its AGENTS.md before writing code.

The baseline has substantial tracked/untracked UI and integration changes outside HEAD 939e4f763c8185e5478b1d4962e746b7a2321a8d. Preserve them. Inspect current PR heads/bases #108–120 and actual ancestry; do not blindly merge every PR. #115 is an earlier full-app candidate; #119 is catalog-only and #120 buyer-only without payment/Seller/Admin/INSPECT/CERT. Reuse applicable #117 persisted-checkout/idempotency fixes and #120 authenticated order fixes in the complete app, resolving overlapping changes explicitly. Do not release a restricted runtime as the complete marketplace. Synthetic catalog data may only target an isolated approved demo DB.

Create a safe integration candidate from the supplied latest working tree, using an isolated worktree/branch if the checkout has unrelated concurrent changes. Save a recoverable source diff and whitelist only nonsecret source files if needed; do not bundle .env, tokens, DB dumps or node_modules. If latest UI exists only in an unprovided session/worktree, record that exact missing input and continue the independent provenance/schema audit; do not silently replace it with an old branch.

Reconcile one Alembic migration head and route registrations, including certificate HTML/JSON and existing courier APIs. Confirm startup configuration uses the real PUBLIC_CERTIFICATE_BASE_URL variable and that app/API mode can browse, login, access orders, seller, inspector/admin/courier work and certificates. Add focused regression checks only for integrations changed here; use an isolated PostgreSQL DB, not a shared reset/stamp. Run relevant backend tests and mobile logic/component/type checks; document baseline failures separately.

Deliver a local release commit or precisely reproducible integration patch, upstream/source SHA inventory, migration head, test report, preserved UI diff inventory and doc/submission-2026-10-08/reports/01-INT-01.md using templates/TASK-REPORT.md. Populate the candidate fields of templates/RELEASE-MANIFEST.json in reports/release-manifest.json, leaving unverified fields null. Hand the exact base to tasks 02/07/09. Do not force-push, mass-merge, deploy shared migrations or claim device acceptance. Continue through implementation and verification rather than returning only a plan.

When task commits 02–10 are delivered, return as integration owner to combine them into the same candidate, reconcile hotspots/migrations, rerun affected integration checks, update provenance and freeze the source used by task 12. This is a follow-up phase of INT-01, not a new unrelated release branch.
```

## 02-FINISH-01-schema

[Task details](tasks/02-FINISH-01-schema.md)

```text
Implement task 02 on the exact release base delivered by INT-01. Locate doc/submission-2026-10-08 or the supplied packet. Read README.md, DOC-01-scope.md, FINISH-00-release-gates.md, references/FINISH-spec.md sections 3–6, references/FINISH-contract-decisions.md, references/FINISH-01-handoff.md and PROFILE-REVIEWS-contract.md for later migration coordination. Inspect the actual integrated models/migrations first; reuse the already-present COURIER role, Shipment and private proof storage. Do not duplicate existing tables or routes just because an older spec names them differently.

Add missing final Order/Escrow states and the durable data needed for RELEASE/REFUND, receipt/non-receipt, replay, selected proof binding and audit. Enforce unique Order/Escrow terminal settlement, matching Order/Payment/Escrow parties, Decimal allocations and one-time proof confirmation. A proof is private metadata for one shipment and assigned courier. Selected 1–3 readable proof objects become immutable when confirmation succeeds.

Reserve the durable inspection-overdue escalation marker required by task 05, reusing an existing equivalent or adding a nullable timestamp/unique audited marker in this coordinated migration. The job owner must not create a parallel migration head for the marker later.

Implement the smallest seller-owned validated return-address save/read needed before ship-to-center, snapshot it on the Order and prohibit changes after shipment starts. Choose the concrete route by reusing an existing equivalent if present; otherwise use PUT /orders/{id}/return-address for the owning active seller with the existing address shape, strict JSON and Idempotency-Key. Before shipment, the same canonical address may replay; changing address is allowed only before a committed inbound shipment. Do not accept arbitrary courier/buyer return destinations. Use existing validated recipient/phone/address fields; no secrets in fixtures. Preserve legacy paid Orders with missing return addresses explicitly and block shipping until a valid seller address exists; do not invent/backfill addresses.

Publish reports/API-MAPPING.md with final concrete routes, schema fields, return-address request/response/error examples and the common lock order. Reuse canonical POST /inspections/{id}/receive and existing courier route prefixes. Do not implement a parallel center-receipt mutation. Confirm with code that create/cancel/expire/ship paths can use Order→Shipment→Escrow→Product for existing Orders without deadlocks. Boundary writes use fresh DB wall-clock after lock and any I/O revalidation, as selected by DOC-01.

Verify one Alembic head, fresh install and upgrade from supported predecessors with paid/unpaid/proof/certificate rows in an isolated PostgreSQL DB. Use nested savepoints for expected IntegrityError tests. Prove unique/FK/check failures, data preservation and explicit unsafe downgrade refusal or safe downgrade where supported. Do not reset/stamp a shared DB. Deliver migration/model code, fixtures, API mapping and reports/02-FINISH-01.md with exact base/head and migration evidence. Coordinate migration order 02→07→08. Continue to working code and meaningful verification; report only actual blockers.
```

## 03-FINISH-02-delivery

[Task details](tasks/03-FINISH-02-delivery.md)

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement task 03 on the release base plus accepted task 02. Read the submission packet README.md, DOC-01-scope.md, FINISH-00-release-gates.md, references/FINISH-spec.md sections 3–6 and references/FINISH-02-handoff.md. Read reports/API-MAPPING.md from task 02 and existing courier/inspection code; reuse concrete routes, role and storage services. Preserve concurrent frontend work.

Implement assigned Inspector fulfillment creation derived from final inspection and immutable Buyer decision: PASS/MINOR_ISSUE plus CONFIRM creates TO_BUYER using the buyer Order snapshot; positive REJECT or FAKE/NOT_AS_DESCRIBED creates TO_SELLER using the frozen seller return snapshot. Never accept leg/destination from client, create both final directions, fabricate a positive decision for a negative result or route a return to a profile address changed later.

Extend existing Courier assigned queue/detail, Admin assignment and private upload/read/confirm commands for final legs. Require an active assigned Courier, 1–3 distinct server-bound JPEG/PNG proofs, real byte/type/size/hash checks, current-leg binding and private Storage readability at confirmation. Upload alone does not prove delivery. Freeze selected proof IDs and server UTC confirmation once, with Idempotency-Key/replay behavior from FINISH. Enforce role-specific projections; Courier sees only necessary current destination, Seller cannot inspect Buyer private delivery address/proofs, unrelated users cannot access object bytes/keys. Reuse center receive POST /inspections/{id}/receive.

Confirmed TO_BUYER sets DELIVERED_PENDING_BUYER and immutable deadline confirmation+72h. Confirmed TO_SELLER first commits RETURNED_TO_SELLER+HELD and history/replay records; then invokes the settlement interface from task 04 in a separate transaction. If settlement is unavailable/fails, preserve delivery and expose pending processing for the worker retry. Define the integration interface with task 04; do not make a second refund implementation or return a false REFUNDED response. Add the seller ship-to-center 72h no-ship guard under the shared Order lock, before creating a late shipment.

Test positive CONFIRM/REJECT and both negative results, alternate-leg races, assignments/IDOR, wrong/unreadable/foreign/excess proofs, changed-address attempts, same-key replay, duplicate confirmation and delivery-commit/refund-failure recovery in isolated PostgreSQL and a deterministic storage adapter. Actual shared Storage remains a runtime QA gate. Deliver code/API examples and reports/03-FINISH-02.md with base/head, proof authorization matrix and exact tests. Do not mutate shared data or claim Android acceptance. Finish implementation and verification, not just a design.
```

## 04-FINISH-03-04-settlement

[Task details](tasks/04-FINISH-03-04-settlement.md)

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement task 04 on INT-01 plus task 02, coordinating with task 03 for delivery hooks. Read the submission packet DOC-01-scope.md, FINISH-00-release-gates.md, QA-MATRIX.md, references/FINISH-spec.md sections 3–7, references/FINISH-03-handoff.md and FINISH-04-handoff.md, plus task 02 API-MAPPING.md. G0 deadline behavior is selected: use a fresh DB wall-clock after obtaining the Order lock and revalidating I/O; writes at/after deadline fail even if the HTTP request arrived earlier. Same-key committed replay remains readable. Do not reopen this as a product question.

Build one transactional settlement service with RELEASE and REFUND branches, existing schema/command replay and Order→Shipment→Escrow→Product lock order. Verify persisted paid Payment/Receipt, Escrow HELD, party/FK relationships, immutable pricing snapshots, delivery/inspection/decision guards, current proof readability and absence of conflicting final settlement. One Order/Escrow can receive RELEASE or REFUND exactly once, never both. No client amounts/recipients/states. Use Decimal; RELEASE held=seller payout+commission+inspection+shipping and matches original snapshots; REFUND returns the full held total with all other allocations zero. Preserve the successful original charge/receipt; refund has a separate immutable settlement. Product becomes SOLD on release, CANCELLED on refund; do not auto relist or add a wallet.

Implement owning active Buyer confirm-receipt and report-not-received, including approved Seller users buying an Order. Result acceptance is not receipt. Receipt atomically produces COMPLETED/RELEASED. A report before deadline produces DELIVERY_DISPUTED/HELD and blocks AUTO. Implement scoped audited Admin review/resolve with required reason and authorized same-case evidence references, producing RELEASE or REFUND once; do not add general unrestricted customer Order reads. Implement return-delivery, seller-no-ship and Admin full refund eligibility in the same service, and a return hook that can retry after durable delivery.

Extend Order delivery/history/terminal read models and action flags with correct role redaction and settlement summary. payment_status=REFUNDED derives from settlement; never rewrite the original successful Payment. Return readable replay references only to authorized actors. Reconcile old is_paid status comparisons that become wrong after terminal states.

Prove allocation examples held1350→payout1140 or refund1350, all eligibility/role errors, repeat/replay/key mismatch, rollback/failure injection, independent concurrent release-vs-refund and duplicate operations, report-vs-auto and exact deadline races, upstream cancel/expiry lock compatibility in isolated PostgreSQL. Do not assert shared/device acceptance from these tests. Deliver code and reports/04-FINISH-03-04.md including service interfaces for tasks 03/05, exact SHA and commands. Continue until both settlement branches and read APIs are implemented and verified.
```

## 05-TIMER-01-jobs

[Task details](tasks/05-TIMER-01-jobs.md)

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement task 05 in the combined release containing tasks 03 and 04. Read the submission packet DOC-01-scope.md, FINISH-00-release-gates.md, references/FINISH-spec.md section 7 and QA-MATRIX.md, and inspect existing unpaid_expiry_worker/order_expiry runner and runbook. Reuse existing scheduled infrastructure and the task 04 settlement service; do not introduce a second financial implementation, a public force-release API, or client-side jobs.

Deliver a bounded recurring runner targeting scans every 5 minutes: unpaid 30-minute expiry, eligible receipt release after confirmed readable TO_BUYER proof+72h with no timely missing report, seller no-ship full refund at paid_at+72h absent a committed timely center shipment, retry for durable RETURNED_TO_SELLER+HELD without settlement, and overdue inspection escalation after 3 working days from center receive. For this prototype working days are Monday–Friday Asia/Bangkok, excluding weekends without a public-holiday calendar. Escalation persists an observable Admin/workqueue marker once; it must not invent result/certificate/Buyer decision or release funds. Reuse an existing overdue marker if available.

Lock/re-read eligibility and fresh DB wall-clock at each guarded write; two runners must not duplicate outcomes. Storage failure/outage leaves HELD and a retry candidate; return delivery survives prior refund failure. The seller ship command enforces its deadline even while worker is down. Preserve successful same-key command replay after deadlines. Avoid holding broad DB locks while doing unbounded Storage calls; use bounded I/O and revalidation according to FINISH.

Provide safe CLI one-shot/dry-run options using the same services, deployment configuration (systemd/container scheduler matching actual environment), structured counts and failure signals, restart instructions and an isolated synthetic demo procedure. Do not automatically enable a runner against a shared/production DB merely because a sample env exists. Task 10 performs the configured runtime activation after environment authorization.

Verify all cases with no HTTP traffic, just-before/at/after deadlines, simultaneous runners, restart after partial progress, Storage unreadability, outage/recovery and repeated overdue scans in isolated PostgreSQL. Do not sleep 72 hours or weaken production guards: use injectable server clocks/test fixtures in the isolated environment. Deliver implementation, runbook and reports/05-TIMER-01.md with exact base/head and recovery evidence. Finish working scheduled code and relevant tests rather than only cron instructions.
```

## 06-FINISH-05-ui

[Task details](tasks/06-FINISH-05-ui.md)

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement task 06 in mobile of the actual complete release base. Read applicable AGENTS.md and the exact versioned Expo docs it requires before code. Read the submission packet DOC-01-scope.md, RELEASE-DESIGN.md, references/FINISH-spec.md, references/FINISH-api-fixtures.md, reports/API-MAPPING.md and reports for tasks 03/04. Preserve the newest UI/theme/navigation work already in the working tree. Do not replace it with a historical mock prototype or redesign the app again.

Wire real services/routes for owning Buyer delivery summary, receipt, non-receipt report, deadlines, history, settlement/refund references; Seller return-address save before center shipment, shipping/return progress and payout projection; Inspector outbound dispatch; Courier assigned queue/detail, camera/gallery proof upload and explicit selected-proof confirmation; minimal Admin courier assignment and scoped missing-delivery review/resolution. Reuse existing role entry/navigation and API client/token provider. Use concrete mapped courier routes rather than duplicating conceptual routes from older specs.

Keep result CONFIRM/REJECT distinct from physical receipt. Negative inspection results only return. Deadline starts at persisted Buyer delivery confirmation; client countdown is informational and cannot settle money. For durable return with failed settlement show pending refund, not REFUNDED. Show server-settled amounts and simulation labels. Server action flags/auth decide permissions; approved Seller can use Buyer actions on purchased Orders. No general user-admin dashboard is required.

For each mutation keep a stable idempotency key while retrying the same canonical payload, prevent accidental duplicate presses, refetch persisted state on ambiguous network failure, and suppress stale responses after logout/account change. Display useful loading/empty/error/retry states and readonly terminal outcomes; authorized proof access must not store raw private object keys or signed URLs in permanent caches/logs. Camera/image permissions and Android back/keyboard behavior must be usable.

Use existing tests and contract fixtures for both journeys, report-vs-auto boundary displays, role redaction, duplicate/retry/network failure, account switch and pending return retry. Run focused component/logic tests and typecheck from mobile; separate pre-existing baseline lint failures. Then perform API-backed browser smoke on the combined candidate if the environment is available. Browser/mocks do not establish actual Android/Auth/Storage acceptance. Deliver code plus reports/06-FINISH-05.md with routes wired, exact base/head, checks and remaining device steps. Continue through API wiring and verification, not preview-only UI.
```

## 07-PROFILE-01

[Task details](tasks/07-PROFILE-01.md)

```text
Implement PROFILE-01 in the current secondhand-marketplace-android-app release base. Locate the submission-2026-10-08 packet, read README.md, DOC-01-scope.md, PROFILE-REVIEWS-contract.md, RELEASE-DESIGN.md and FINISH-00-release-gates.md. Apply AGENTS.md; before mobile code read its required exact Expo version docs. Work through implementation and verification. The deadline is 8 October 2026; keep the minimal selected scope, not a new settings subsystem.

Inspect backend User/auth schemas and mobile auth-provider/profile-screen/consent-modal. Existing User has full_name, email, role and status; Google login for an existing user already should preserve full_name. Add GET /profile, PATCH /profile {full_name}, and POST /profile/policy-acknowledgement using the exact packet contract, existing verified identity/auth/error policies and private own-user projection. Only active users may write. Strict JSON must reject email/role/status/provider ID/address/phone injection. Persist policy version+DB acknowledgement time with paired-null fields; never invent legacy consent. Same-version retry keeps the first timestamp.

Coordinate the nullable migration after task 02 with its migration owner; publish one Alembic head, not an independent branch. Preserve existing /auth/me response consumers unless a compatible addition is necessary. Profile editing must not change Order buyer/seller address snapshots, verification details or role. Approved Seller retains Buyer capability; seller application uses the existing verified workflow, not a role picker.

Wire profile data/edit/save and readonly email/role/status to APIs, replacing fake fallback names with a truthful empty/loading state. Keep guest Login CTA and existing seller status/application CTA. Provide readable Thai prototype terms/privacy text explaining data purpose and private evidence access, recorded acknowledgement and how the demo administrator receives access/correction/deletion requests outside the app. Do not invent a public support address or promise implemented self-service export/delete. Remove the optional photo-reuse consent switch and unsupported privacy actions; acknowledgement is not a blanket reuse consent or a claim of legal certification. Preserve current theme/visual changes.

Test save→GET/reload/relogin, invalid/control/overlong names, cross-account access and field injection, inactive write rejection, acknowledgement replay/unsupported version, migration preservation, failed save and stale responses after account change. Run isolated PostgreSQL/API tests, focused mobile tests and typecheck. Deliver code, API examples and reports/07-PROFILE-01.md with base/head and migration chain. Use templates/TASK-REPORT.md; mark actual Android/login steps pending if not exercised. Do not mutate shared DB, force-push or claim unrun tests.
```

## 08-REVIEW-01

[Task details](tasks/08-REVIEW-01.md)

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement REVIEW-01 in the combined release containing task 04 settlement. Locate the submission packet and read DOC-01-scope.md, PROFILE-REVIEWS-contract.md, RELEASE-DESIGN.md, FINISH-00-release-gates.md and QA-MATRIX.md. Before mobile changes follow its AGENTS.md exact Expo documentation requirement. Preserve latest UI. If upstream settlement is not yet available, implement independently against the selected contract and fixtures, then explicitly mark final integration blocked by its missing base; do not fabricate completed Orders in normal API mode.

Create the minimal immutable review model/migration and APIs from PROFILE-REVIEWS-contract.md: unique review per Order; active actual Buyer of a COMPLETED+RELEASED Order may submit rating1–5 and optional comment≤1000. Derive buyer/seller/product from the locked Order, including Seller-role users acting as buyers. Refunded/cancelled/disputed/pending Orders cannot be reviewed. Strict payload rejects recipient, order state, product/inspection scores, tags and photos. Coordinate the migration after task 07 on the task 02 chain and keep one head.

Implement GET/POST /orders/{id}/review and public GET /sellers/{seller_id}/reviews pagination. Use existing Idempotency-Key format and replay semantics, canonical comment/rating and a DB unique constraint to prevent concurrent duplicate reviews. Public label is exactly 'ผู้ซื้อที่ยืนยันการซื้อ'; do not expose buyer/order IDs, real names, email, phone, addresses or inspector identity. Return real total/count/rounded average or null at zero plus distribution1..5; aggregate is over all reviews, not the page. Use a consistent read snapshot for aggregate/list.

Wire the existing /orders/[orderId]/review route and review-modal to persisted submit. Keep only seller stars and optional comment. Success navigates/refetches after the server response; network error retains form/key and does not pretend saved. Use server can_review and show existing submitted review. Wire seller-reviews-modal from product detail to the real public API, removing INITIAL_SELLER_REVIEWS, fixed4.8/count29/distributions from API mode. Provide honest zero-review/loading/error/pagination states and account-switch guards. Inspection rating, product score, tags/photos/replies/edit/delete are deferred.

Test eligibility/IDOR/inactive/field injection, bounds/Unicode safe text, duplicate concurrent requests and key reuse/replay, aggregates/pagination and public PII omission in isolated PostgreSQL. Test mobile successful submit, failed submit/retry, zero reviews, pagination and stale account response; run focused tests and typecheck. Deliver code, migration/API fixtures and reports/08-REVIEW-01.md using the template with exact upstream/head and evidence. Complete working APIs/UI rather than only a design or mock demo.
```

## 09-CERT-REVOKE-01-revocation

[Task details](tasks/09-CERT-REVOKE-01-revocation.md)

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement task 09 on the complete release base with CERT storage/public HTML/JSON. Read the submission packet DOC-01-scope.md, RELEASE-DESIGN.md, references/CERT-spec.md and FINISH-00-release-gates.md. Inspect the actual certificate model, inspection/public routes, audit/replay mechanism and Admin UI before edits. Follow mobile AGENTS.md if writing mobile code.

Existing schema/read displays support REVOKED but that is not a completed Admin revoke journey. Reuse certificate/audit columns rather than make new tables unnecessarily. Implement POST /admin/certificates/{id}/revoke for active Admin only, strict body {reason} trimmed10–1000 chars and existing Idempotency-Key semantics. Lock the certificate; one ISSUED→REVOKED write stores server revocation time, actor and private audited reason. Same committed key/payload replays without duplicate audit; changed payload/key conflicts appropriately. Do not alter final inspection snapshot, Buyer decision, Payment/Receipt/settlement, or automatically refund an Order because a certificate is revoked.

Provide a minimal authorized Admin entry from existing work/certificate context, detail and revoke confirmation with reason and error/retry states; add a bounded minimal certificate list only if needed to make the action reachable. Reuse existing public HTML/JSON/native revoked view with consistent status. Public revoked information may use a safe generic reason code/text; do not publish Admin private notes, actor/email, identity evidence or Order addresses. A revoked certificate cannot appear valid by a cached old response; apply appropriate public caching behavior.

Test authorization/IDOR, valid revoke and repeated/concurrent/key-mismatch attempts, invalid reason, immutable inspection/settlement fields, public HTML/JSON/native status and no private fields. Run focused backend/mobile tests and typecheck. Deliver code, API mapping and reports/09-CERT-REVOKE-01.md with exact head/evidence. Actual public HTTPS QR on another phone remains task 11. Do not add wider user administration or change certificate issue timing. Continue through a reachable working UI/API, not a seeded-row-only test.
```

## 10-ENV-01-runtime

[Task details](tasks/10-ENV-01-runtime.md)

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Prepare and validate the submission runtime for the current secondhand-marketplace-android-app candidate. Read the packet README.md, DOC-01-scope.md, FINISH-00-release-gates.md, QA-MATRIX.md, task 05 runner runbook and existing integration rollout docs. Inspect configuration by variable names and presence only; never print .env values, JWTs, cookies, database URLs containing credentials or service keys.

Make the complete API and Expo/Android app runnable with documented commands and environment examples. A phone cannot reach the host using 127.0.0.1; choose an already-authorized reachable HTTPS API/staging host for the final build, and document a LAN-only development alternative distinctly. PUBLIC_CERTIFICATE_BASE_URL must point to the actual externally reachable HTTPS certificate API origin, not a local Expo page or an https://localhost startup bypass. Configure CORS/auth redirect/scheme/package and Supabase Google/provider return paths from official current docs when needed. Keep service-role keys server-only; app env uses only public/anon values and API origin. Never copy credentials into the packet or mobile bundle.

Validate private identity/inspection/delivery Storage permissions, actual authenticated upload/read, expired/foreign access rejection and public certificate HTML/JSON/QR without login. Rehearse migrations with backup/restore on an isolated disposable PostgreSQL environment; produce exact one-head deployment/rollback steps and a non-destructive preflight for the shared target. Stage scheduler configuration and health/failed-run monitoring from task 05, including no-HTTP behavior and restart.

The user authorized preparing local work, not automatically resetting/stamping/migrating shared or production DBs, changing remote auth policies, or exposing a new public tunnel. Perform reversible local/isolated setup autonomously. For a final shared write/remote configuration not already authorized, first produce the concrete preflight, target/backup plan and exact command/config diff, then request only the necessary approval with its reason. Missing credentials or service access are actual blockers; finish independent scripts/docs/checks while they remain unavailable. Do not substitute mocks and call integration complete.

Deliver env examples, start/stop/health/runbook instructions, redacted runtime evidence and reports/10-ENV-01.md with deployed API SHA, migration head, reachable origin, worker command/schedule and explicitly unexercised gates. Do not interrupt unrelated running sessions. Continue through setup and authorized validation, not just a list of environment variables.
```

## 11-QA-01-release

[Task details](tasks/11-QA-01-release.md)

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Audit and test the combined submission candidate, implementing small in-scope fixes for defects you find rather than only reporting them. Locate the packet and read DOC-01-scope.md, QA-MATRIX.md, FINISH-00-release-gates.md, references/FINISH-spec.md acceptance matrix, all delivered task reports and reports/release-manifest.json. Inspect actual source/app/API revision, environment, migration and tests first. This is final integration QA, not another isolated PR review.

Run retained automated backend/PostgreSQL and mobile logic/component/type checks needed for the combined changes, using a disposable test DB. Exercise real API business journeys with distinct authorized Buyer/Seller/Inspector/Courier/Admin accounts: successful sale through RELEASE/payout/review, rejected or negative inspection through durable return/full REFUND/original receipt. Also exercise no-ship, receipt AUTO, timely missing-delivery/Admin resolution, worker no-HTTP restart/two-runner/retry, profile persistence, certificate revoke and private data denial. Use actual Storage and Google integration where available; identify which checks used deterministic adapters.

Use task 12 APK on a real Android device for both main journeys, Google login/return, camera/gallery proof upload, keyboard/back/navigation and profile/review reload. Open public QR in another phone/browser without login, including revoked and invalid cases. Use provided purpose-built tools, browser and adb if authorized/connected. Ask the device owner only for steps tooling cannot reach; give exact checklist and collect evidence. Do not label browser/Expo Web/device simulator results as real Android acceptance. Do not log tokens/PII or mutate an unapproved shared database. Seed only an isolated authorized synthetic demo target.

Record each QA-MATRIX case PASS/FAIL/BLOCKED/NOT_RUN with app/API SHA, migration head, environment, account roles, test command/evidence path and limitations. Fix reproducible local code defects, rerun affected checks and update SHA/artifact mapping. Coordinate rebuild/retest if the APK source changes. Existing issues #49/#50/#63/#65/#105/#106 and FINISH-06 need their own acceptance evidence; inspect the actual issue before claiming it closed. Do not create duplicate issues or close issues based solely on unit tests.

Deliver reports/11-QA-01.md, completed templates/TEST-REPORT.md, evidence index and explicit READY/NOT_READY verdict. READY requires every mandatory QA case and final APK alignment. If real login/storage/device/shared rollout is missing, keep those cases pending, list exact missing access/steps, and finish independent QA. Never invent screenshots/results or declare completion because time is short. Complete the authorized tests and fixes, not only a test plan.

Q01–Q26 are your technical release gate. When they pass, hand off TECHNICAL_READY_HANDOVER_PENDING to task 13; Q27 final handover and Q28 teacher scope disposition are checked by task 13/Lead after it produces the artifacts. Do not create a cycle by waiting for final slides before handing over the technical QA report. Overall READY still requires all mandatory cases, and must not be claimed while Q27/Q28 are pending.
```

## 12-APK-01-android

[Task details](tasks/12-APK-01-android.md)

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Produce the installable Android submission artifact from the combined complete-app candidate in secondhand-marketplace-android-app/mobile. Read AGENTS.md and required exact Expo version docs before code; read packet DOC-01-scope.md, RELEASE-DESIGN.md, QA-MATRIX.md and task 10 runtime report. Inspect app.json/app.config.js/eas.json, lockfile and installed toolchain. Use official current Expo/EAS/Android documentation for build configuration or signing behavior you need to verify.

Choose a preview/internal standalone APK with bundled JavaScript that starts without Metro/dev-server; do not hand over an Expo development client as the final installable app. Keep Android package com.kmutnb.secondhandmarketplace and existing secondhandmarketplace scheme unless an actual conflict demands a documented change. Display brand 2NDHAND consistently, select existing app icon/splash assets and correct version/build code. EXPO_PUBLIC_MOCK_MODE/catalog-only/buyer-only/visual-QA flags must not restrict the full submission app. Set the authorized reachable HTTPS API and public Supabase config; never put service keys/secrets into mobile env/artifacts. Fix camera/gallery permission descriptions for product/verification/delivery evidence and Android navigation/keyboard issues within scope.

Use existing authorized EAS login/build configuration or local Android toolchain as available, producing reproducible commands. Avoid adding dependencies or installing a large toolchain blindly; inspect bundled/local tools first. If credentials/signing/SDK/device connection are missing, complete the build configuration and deterministic preflight, then report the exact required user step; do not fabricate an APK. Cloud upload/build or shared credential changes require authorization if not already supplied.

Build, verify package/version, SHA256/size and JavaScript inclusion, then install and launch on a connected authorized real Android device using adb when available. Confirm cold start without Metro, guest catalog, real Google login return and task 11 main-flow checks against the reachable API. Share the APK through a local artifact link or authorized delivery channel, not a store publication. AAB/Play Store are not required for sideloading this course demo.

Deliver artifacts/android/ with actual APK, a hash/manifest and install/run instructions, reports/12-APK-01.md with source/API SHA, build environment and native evidence. Update reports/release-manifest.json only with proven fields. If code/environment changes after QA, rebuild and rerun affected native gates. Do not claim READY merely because the build job succeeded. Continue through an actual build and installation where access permits.
```

## 13-HANDOVER-01-demo-presentation

[Task details](tasks/13-HANDOVER-01-demo-presentation.md)

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Complete the submission handover for the actual tested release, working in the current project folder. Read the packet README.md, DOC-01-scope.md, SRS-SUBMISSION.md, diagrams, PRESENTATION-OUTLINE.md, QA-MATRIX.md, reports/11-QA-01.md, reports/12-APK-01.md and release-manifest.json. Use the presentation/PDF/document skills when creating their artifact types. Work autonomously on concrete files; do not stop at suggesting slide topics.

Prepare repeatable synthetic demo data/setup for a successful sale, rejected/negative return refund, unpaid expiry, no-ship refund, missing-delivery Admin resolution, certificate revocation, editable profile and reviews. Seed only an isolated explicitly chosen demo DB/storage namespace; require a guard against shared/production targets, avoid real identity/card/bank data, and use actual authenticated role mappings for real integration. Do not seed fake users or reviews into the shared catalog without authorization. Timer demos use isolated test clocks/aged fixtures through the same guarded services, never a public bypass endpoint.

Produce a clean submission directory containing final standalone APK/hash, setup/start/stop guide, Thai user guide for retained roles, aligned SRS source/PDF, rendered architecture/use-case/class/state/sequence diagrams, requirement-to-test report, release manifest, synthetic demo setup/runbook, PPTX or equivalent editable slides plus PDF export, a 7–10 minute Thai speaker/demo script and recording/rehearsal checklist. Reuse the prepared scope/docs/outline; update model/routes from actual release and proof, not from future promises. Clearly label payment/shipping/payout as persisted simulations and deferred requirements as future work. Preserve the original historical SRS.

Make slides explain problem, guest→Buyer→Seller UX, architecture, one-sale/one-refund journeys, public QR, profiles/reviews, roles/privacy/one-time settlement/timers, real test evidence and limitations. Include actual redacted Android screenshots and QR from the tested demo when available. If implementation is incomplete, deliver a clearly marked rehearsal draft and a precise blocker list; do not insert unrun PASS metrics or screenshots. Export/render and visually inspect deck/PDF/diagrams for clipped text and Thai font issues.

Capture a backup screen recording through an available authorized device/tool after the real demo succeeds. If tooling cannot operate the phone/presenter, prepare exact capture and rehearsal steps and request only the manual action. Verify the final submission directory links, APK hash, manifest SHA and guide commands against the actual release. Deliver reports/13-HANDOVER-01.md and a READY/NOT_READY gate summary. Teacher acknowledgement of revised scope and oral presentation are human steps; record their status rather than claiming them done.
```
