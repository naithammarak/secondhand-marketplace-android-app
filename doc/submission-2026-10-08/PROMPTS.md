# Current task prompts — versioned external-shipping amendment

Read [shipping amendment](changes/EXTERNAL-SHIPPING-03.md), [refund decision](changes/REFUND-DECISION-02.md) and [scope](coordination/AB-AMENDMENT-SCOPE.md) first. Task02–06 use the amended policy. Backend R1–R4 is PR130; E/shared/native acceptance is separate.


## 00 / DOC-01 — Lead scope and planning

Source and acceptance: [00-DOC-01-lead.md](tasks/00-DOC-01-lead.md).

```text
You are the project lead for a secondhand marketplace Android prototype due Thursday 8 October 2026, Asia/Bangkok. Work in the existing secondhand-marketplace-android-app repository. Find the packet at doc/submission-2026-10-08, or the supplied submission-2026-10-08 folder. Read README.md, DOC-01-scope.md, PROFILE-REVIEWS-contract.md, FINISH-00-release-gates.md, QA-MATRIX.md and LEAD-WORK-REPORT.md.

DOC-01 was prepared on 1 October. Review this concrete scope rather than restarting requirements discovery. Keep the complete sale and return/refund journeys; the only requested optional additions are basic profile and seller reviews. Push/inbox, inspection ratings, review photos/tags, advanced filters, wallet and wider user administration are deferred as recorded. Teacher acceptance of this revision is not yet established.

Check the supplied SRS source/PDF and diagrams against the chosen rules. Fix concrete documentation inconsistencies in the current folder while preserving unrelated code and original historical documents. Keep task links, route mapping and requirement/test traceability complete. Verify generated artifacts and links. Do not claim implementation or device acceptance merely because the documents exist. Report completed lead work and the remaining release/teacher gates in LEAD-WORK-REPORT.md using templates/TASK-REPORT.md. Do not publish comments, merge PRs, alter shared data or invent test results.
```


## 01 / INT-01 — One complete release base

Source and acceptance: [01-INT-01-release-base.md](tasks/01-INT-01-release-base.md).

```text
Implement INT-01 in the existing secondhand-marketplace-android-app repository. Deadline is 8 October 2026, Asia/Bangkok. Locate doc/submission-2026-10-08 (or the supplied packet folder). Read README.md, DOC-01-scope.md, FINISH-00-release-gates.md, RELEASE-DESIGN.md and manifests/baseline-2026-10-01.json. Apply repository AGENTS.md instructions; inspect branch, HEAD, status and local/remote state before edits. In mobile, read the exact Expo version documentation required by its AGENTS.md before writing code.

The baseline has substantial tracked/untracked UI and integration changes outside HEAD 939e4f763c8185e5478b1d4962e746b7a2321a8d. Preserve them. Inspect current PR heads/bases #108–120 and actual ancestry; do not blindly merge every PR. #115 is an earlier full-app candidate; #119 is catalog-only and #120 buyer-only without payment/Seller/Admin/INSPECT/CERT. Reuse applicable #117 persisted-checkout/idempotency fixes and #120 authenticated order fixes in the complete app, resolving overlapping changes explicitly. Do not release a restricted runtime as the complete marketplace. Synthetic catalog data may only target an isolated approved demo DB.

Create a safe integration candidate from the supplied latest working tree, using an isolated worktree/branch if the checkout has unrelated concurrent changes. Save a recoverable source diff and whitelist only nonsecret source files if needed; do not bundle .env, tokens, DB dumps or node_modules. If latest UI exists only in an unprovided session/worktree, record that exact missing input and continue the independent provenance/schema audit; do not silently replace it with an old branch.

Reconcile one Alembic migration head and route registrations, including certificate HTML/JSON and existing courier APIs. Confirm startup configuration uses the real PUBLIC_CERTIFICATE_BASE_URL variable and that app/API mode can browse, login, access orders, seller, inspector/admin/courier work and certificates. Add focused regression checks only for integrations changed here; use an isolated PostgreSQL DB, not a shared reset/stamp. Run relevant backend tests and mobile logic/component/type checks; document baseline failures separately.

Deliver a local release commit or precisely reproducible integration patch, upstream/source SHA inventory, migration head, test report, preserved UI diff inventory and doc/submission-2026-10-08/reports/01-INT-01.md using templates/TASK-REPORT.md. Populate the candidate fields of templates/RELEASE-MANIFEST.json in reports/release-manifest.json, leaving unverified fields null. Hand the exact base to tasks 02/07/09. Do not force-push, mass-merge, deploy shared migrations or claim device acceptance. Continue through implementation and verification rather than returning only a plan.

When task commits 02–10 are delivered, return as integration owner to combine them into the same candidate, reconcile hotspots/migrations, rerun affected integration checks, update provenance and freeze the source used by task 12. This is a follow-up phase of INT-01, not a new unrelated release branch.
```


## 02 / FINISH-01 — Versioned external-shipping schema

Source and acceptance: [02-FINISH-01-schema.md](tasks/02-FINISH-01-schema.md).

```text
The context packet is doc/submission-2026-10-08 in the repository.

Continue R1 on PR130, codex/ab-external-shipping-2026-10-02, based on reviewed PR129 b531bd1372c0d26b8492fa28ff29ab20a85d7578. Read changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md, coordination/AB-AMENDMENT-SCOPE.md and reports/EXTERNAL-SHIPPING-API-MAPPING.md before older references. Preserve historical accepted A/B/C/D migrations and branch history.

Use the one existing model/settlement/command architecture. All existing Orders retain LEGACY_V1; new server-created Orders snapshot EXTERNAL_V2. Clients cannot select policy, money, parties or deadlines. Persist atomic positive result availability+72h, separate SYSTEM timeout outcome, actual recipient source/command and trusted transport event source/identity/leg/server time. Preserve immutable Payment/Receipt, old Courier/proof evidence and one settlement; do not create a second ledger. Migration r01e20261002 descends from c08f20261002. Test owned PostgreSQL actual legacy journeys, fresh install, constraints/default-deny access, safe legacy-only downgrade/re-upgrade and explicit unsafe-new-data refusal without rewriting history.

Return address remains owning Seller validated/frozen before TO_CENTER. Keep Order→Shipment→Escrow→Product locks as applicable. Keep active scope/SRS/requirements/QA/diagrams consistent with new policy and historical references clearly qualified. Deliver reports/EXTERNAL-SHIPPING-R1.md and concrete API mapping for E; report exact source/head and commands, not shared/device acceptance.
```


## 03 / FINISH-02 — External transport and actual recipient receipt

Source and acceptance: [03-FINISH-02-delivery.md](tasks/03-FINISH-02-delivery.md).

```text
The context packet is doc/submission-2026-10-08 in the repository.

Continue R2 on the same PR130 branch after R1. Read changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md, coordination/AB-AMENDMENT-SCOPE.md and reports/EXTERNAL-SHIPPING-API-MAPPING.md. New-policy flow does not require Courier accounts/photos; preserve old Courier routes and records only for legacy Orders.

Seller sends TO_CENTER with carrier/tracking and frozen return address. Authorized center Inspector confirms actual receipt through canonical POST /inspections/{id}/receive; assigned Inspector dispatches only server-derived TO_BUYER after CONFIRM or TO_SELLER after REJECT/SYSTEM timeout/negative result. Never accept leg/destination from client. Positive result and certificate are atomic; timeout never fabricates a Buyer decision or physical dispatch.

Implement minimum authenticated active-Admin explicitly configured demo shipping events with immutable source/identity/leg/server time, dedup/replay/audit. Transport DELIVERED differs from recipient receipt: center events do not receive inspection, return events do not refund, Buyer events start only the independent AUTO receipt+72h clock. Actual owning Buyer receipt/report work after authorized dispatch even with no carrier event, subject to an existing deadline; report blocks later AUTO. Actual Seller or scoped audited Admin confirms return with required same-case reason/evidence. Commit return durably before the same settlement service attempts refund separately; failure stays pending for the retry job.

Enforce role redaction, private legacy proof/inspection access, wrong actor/leg/event rejection, source/deadline immutability, normal API journeys, lock-wait boundaries and opposing action races on owned PostgreSQL. Deliver reports/EXTERNAL-SHIPPING-R2.md and concrete E requests/action flags. Preserve unrelated UI/live servers/shared DB; do not claim real carrier or Android acceptance.
```


## 04 / FINISH-03/04 — Cause-aware exactly-once settlement

Source and acceptance: [04-FINISH-03-04-settlement.md](tasks/04-FINISH-03-04-settlement.md).

```text
The context packet is doc/submission-2026-10-08 in the repository.

Continue R3 on the same PR130 branch. Read changes/REFUND-DECISION-02.md, changes/EXTERNAL-SHIPPING-03.md, coordination/AB-AMENDMENT-SCOPE.md and reports/EXTERNAL-SHIPPING-API-MAPPING.md before historical full-refund text.

Use one existing locked settlement service and original immutable financial snapshots. New-policy positive-result Buyer REJECT or SYSTEM result timeout requires actual Seller/scoped audited Admin return receipt before item-only refund: held1350=Buyer1200+retained inspection100+shipping50, Seller payout/commission0. Never deduct fees again to refund1050 or add return fees. Negative-result/no-ship/audited non-receipt and all legacy refunds retain full policy1350. RELEASE keeps payout1140+commission60+inspection100+shipping50 and the 5% item commission.

Keep Order→Shipment→Escrow→Product locks, unique terminal settlement, command replay/financial tuples/rollback guards. Preserve original successful Payment/Receipt byte-for-byte; returned Product becomes CANCELLED, never auto-relisted. Actual return commits first; failed independent financial attempt remains RETURNED_TO_SELLER/HELD and retries using the same persisted policy/cause once. Carrier return event or result timeout alone cannot refund. Timely missing report blocks AUTO and enables only audited same-case Admin resolution, with no client amounts/recipients.

Expose role-redacted original charge/refund quote/retained fees/settlement cause/reference and pending flags. Prove normal API sale and rejection/timeout/negative/no-ship/Admin journeys, invalid-conserving allocations, rollback/retry, receipt/report/AUTO races and C review/D revoke regression on owned PostgreSQL. Deliver reports/EXTERNAL-SHIPPING-R3.md and focused evidence; keep shared/device gates separate.
```


## 05 / TIMER-01 — Six durable no-HTTP lifecycle jobs

Source and acceptance: [05-TIMER-01-jobs.md](tasks/05-TIMER-01-jobs.md).

```text
The context packet is doc/submission-2026-10-08 in the repository.

Continue R4 on the same PR130 branch. Read changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md, coordination/AB-AMENDMENT-SCOPE.md and reports/EXTERNAL-SHIPPING-R4.md. Reuse the one existing guarded settlement service, CLI, bounded scan ownership and progress infrastructure.

Keep unpaid30min, receipt release, Seller no-ship72h full refund, durable return-refund retry and inspection3workingdays escalation unchanged by policy where appropriate. Add result-timeout as sixth bounded job with cursorID6; preserve paid progress IDs1–4 and unpaidID5. Positive atomic availability+72h with no decision/outbound authorizes only SYSTEM timeout return; no invented Buyer REJECT/CONFIRM, shipment or money. New AUTO requires trusted TO_BUYER delivery event+72h and no report; tracking alone never starts AUTO. Legacy proof checks remain.

Re-read eligibility under shared locks and sample fresh DB wall clock after locks/I/O. Test no HTTP, before/at/after both deadlines, opposing CONFIRM/timeout and receipt/report/AUTO, independent workers, failed-first fairness, stop/restart, dry-run purity and durable retry using persisted policy. Locked rows may be skipped by bounded scans and picked up by catch-up; do not count a scan as guaranteed instant completion.

Provide existing safe CLI/dry-run/retry/restart commands and structured result/failure counts. Do not activate scheduler or migrate shared DB. Runtime activation remains task10 and native/UI task06 is separate. Deliver reports/EXTERNAL-SHIPPING-R4.md with actual command paths and exact source/evidence.
```


## 06 / FINISH-05 — External-shipping API integration in existing UI

Source and acceptance: [06-FINISH-05-ui.md](tasks/06-FINISH-05-ui.md).

```text
The context packet is doc/submission-2026-10-08 in the repository.

Implement E/R5 separately after the exact R1–R4 candidate is independently accepted. Locate doc/submission-2026-10-08 in the repository. Read applicable AGENTS.md and exact Expo docs before editing mobile. Read DOC-01-scope.md, RELEASE-DESIGN.md, changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md and reports/EXTERNAL-SHIPPING-API-MAPPING.md. Preserve latest visual/navigation work; no new Courier workspace or redesign.

Wire actual Buyer result can_decide/deadline/timeout separately from physical receipt/report flags. Inspector canonical center receipt and final carrier/tracking dispatch, Seller frozen return address and actual confirm-return, Buyer delivery/receipt/report, scoped Admin demo shipping event and return exception/non-receipt resolution use mapped existing/new routes. New shipping requires no Courier account/photo; old legacy records stay readable under their own policy. Tracking alone does not start AUTO. Result silence authorizes return, never auto accepts, dispatches or refunds.

Render original charged1350, positive reject/timeout refund1200 with retained100/50, negative/no-ship/Admin full refunds1350, sale payout1140/commission60 using server values. Distinguish transport-delivered from recipient-received and durable return pending from settled refund. Refetch after ambiguous mutation/retry; stable idempotency keys, account-switch stale guards, disabled duplicate buttons and authorized no-store private images remain. C review requires completed RELEASE; refunded Orders cannot review. Public D revoked status never exposes private reason.

Run relevant mobile component/logic/typecheck and API-backed smoke, then actual Android/Auth/Storage/QR checks separately. Browser/mocks and backend local PASS are not full release acceptance. Deliver reports/06-FINISH-05.md, routes/action fields wired, exact heads and pending native/runtime gates. R1–R4 backend implementation must not wait for this visual/UI work.
```


## 07 / PROFILE-01 — Persisted basic profile

Source and acceptance: [07-PROFILE-01.md](tasks/07-PROFILE-01.md).

```text
Implement PROFILE-01 in the current secondhand-marketplace-android-app release base. Locate the submission-2026-10-08 packet, read README.md, DOC-01-scope.md, PROFILE-REVIEWS-contract.md, RELEASE-DESIGN.md and FINISH-00-release-gates.md. Apply AGENTS.md; before mobile code read its required exact Expo version docs. Work through implementation and verification. The deadline is 8 October 2026; keep the minimal selected scope, not a new settings subsystem.

Inspect backend User/auth schemas and mobile auth-provider/profile-screen/consent-modal. Existing User has full_name, email, role and status; Google login for an existing user already should preserve full_name. Add GET /profile, PATCH /profile {full_name}, and POST /profile/policy-acknowledgement using the exact packet contract, existing verified identity/auth/error policies and private own-user projection. Only active users may write. Strict JSON must reject email/role/status/provider ID/address/phone injection. Persist policy version+DB acknowledgement time with paired-null fields; never invent legacy consent. Same-version retry keeps the first timestamp.

Coordinate the nullable migration after task 02 with its migration owner; publish one Alembic head, not an independent branch. Preserve existing /auth/me response consumers unless a compatible addition is necessary. Profile editing must not change Order buyer/seller address snapshots, verification details or role. Approved Seller retains Buyer capability; seller application uses the existing verified workflow, not a role picker.

Wire profile data/edit/save and readonly email/role/status to APIs, replacing fake fallback names with a truthful empty/loading state. Keep guest Login CTA and existing seller status/application CTA. Provide readable Thai prototype terms/privacy text explaining data purpose and private evidence access, recorded acknowledgement and how the demo administrator receives access/correction/deletion requests outside the app. Do not invent a public support address or promise implemented self-service export/delete. Remove the optional photo-reuse consent switch and unsupported privacy actions; acknowledgement is not a blanket reuse consent or a claim of legal certification. Preserve current theme/visual changes.

Test save→GET/reload/relogin, invalid/control/overlong names, cross-account access and field injection, inactive write rejection, acknowledgement replay/unsupported version, migration preservation, failed save and stale responses after account change. Run isolated PostgreSQL/API tests, focused mobile tests and typecheck. Deliver code, API examples and reports/07-PROFILE-01.md with base/head and migration chain. Use templates/TASK-REPORT.md; mark actual Android/login steps pending if not exercised. Do not mutate shared DB, force-push or claim unrun tests.
```


## 08 / REVIEW-01 — Persisted seller reviews

Source and acceptance: [08-REVIEW-01.md](tasks/08-REVIEW-01.md).

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement REVIEW-01 in the combined release containing task 04 settlement. Locate the submission packet and read DOC-01-scope.md, PROFILE-REVIEWS-contract.md, RELEASE-DESIGN.md, FINISH-00-release-gates.md and QA-MATRIX.md. Before mobile changes follow its AGENTS.md exact Expo documentation requirement. Preserve latest UI. If upstream settlement is not yet available, implement independently against the selected contract and fixtures, then explicitly mark final integration blocked by its missing base; do not fabricate completed Orders in normal API mode.

Create the minimal immutable review model/migration and APIs from PROFILE-REVIEWS-contract.md: unique review per Order; active actual Buyer of a COMPLETED+RELEASED Order may submit rating1–5 and optional comment≤1000. Derive buyer/seller/product from the locked Order, including Seller-role users acting as buyers. Refunded/cancelled/disputed/pending Orders cannot be reviewed. Strict payload rejects recipient, order state, product/inspection scores, tags and photos. Coordinate the migration after task 07 on the task 02 chain and keep one head.

Implement GET/POST /orders/{id}/review and public GET /sellers/{seller_id}/reviews pagination. Use existing Idempotency-Key format and replay semantics, canonical comment/rating and a DB unique constraint to prevent concurrent duplicate reviews. Public label is exactly 'ผู้ซื้อที่ยืนยันการซื้อ'; do not expose buyer/order IDs, real names, email, phone, addresses or inspector identity. Return real total/count/rounded average or null at zero plus distribution1..5; aggregate is over all reviews, not the page. Use a consistent read snapshot for aggregate/list.

Wire the existing /orders/[orderId]/review route and review-modal to persisted submit. Keep only seller stars and optional comment. Success navigates/refetches after the server response; network error retains form/key and does not pretend saved. Use server can_review and show existing submitted review. Wire seller-reviews-modal from product detail to the real public API, removing INITIAL_SELLER_REVIEWS, fixed4.8/count29/distributions from API mode. Provide honest zero-review/loading/error/pagination states and account-switch guards. Inspection rating, product score, tags/photos/replies/edit/delete are deferred.

Test eligibility/IDOR/inactive/field injection, bounds/Unicode safe text, duplicate concurrent requests and key reuse/replay, aggregates/pagination and public PII omission in isolated PostgreSQL. Test mobile successful submit, failed submit/retry, zero reviews, pagination and stale account response; run focused tests and typecheck. Deliver code, migration/API fixtures and reports/08-REVIEW-01.md using the template with exact upstream/head and evidence. Complete working APIs/UI rather than only a design or mock demo.
```


## 09 / CERT-REVOKE-01 — Minimal Admin revocation

Source and acceptance: [09-CERT-REVOKE-01-revocation.md](tasks/09-CERT-REVOKE-01-revocation.md).

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement task 09 on the complete release base with CERT storage/public HTML/JSON. Read the submission packet DOC-01-scope.md, RELEASE-DESIGN.md, references/CERT-spec.md and FINISH-00-release-gates.md. Inspect the actual certificate model, inspection/public routes, audit/replay mechanism and Admin UI before edits. Follow mobile AGENTS.md if writing mobile code.

Existing schema/read displays support REVOKED but that is not a completed Admin revoke journey. Reuse certificate/audit columns rather than make new tables unnecessarily. Implement POST /admin/certificates/{id}/revoke for active Admin only, strict body {reason} trimmed10–1000 chars and existing Idempotency-Key semantics. Lock the certificate; one ISSUED→REVOKED write stores server revocation time, actor and private audited reason. Same committed key/payload replays without duplicate audit; changed payload/key conflicts appropriately. Do not alter final inspection snapshot, Buyer decision, Payment/Receipt/settlement, or automatically refund an Order because a certificate is revoked.

Provide a minimal authorized Admin entry from existing work/certificate context, detail and revoke confirmation with reason and error/retry states; add a bounded minimal certificate list only if needed to make the action reachable. Reuse existing public HTML/JSON/native revoked view with consistent status. Public revoked information may use a safe generic reason code/text; do not publish Admin private notes, actor/email, identity evidence or Order addresses. A revoked certificate cannot appear valid by a cached old response; apply appropriate public caching behavior.

Test authorization/IDOR, valid revoke and repeated/concurrent/key-mismatch attempts, invalid reason, immutable inspection/settlement fields, public HTML/JSON/native status and no private fields. Run focused backend/mobile tests and typecheck. Deliver code, API mapping and reports/09-CERT-REVOKE-01.md with exact head/evidence. Actual public HTTPS QR on another phone remains task 11. Do not add wider user administration or change certificate issue timing. Continue through a reachable working UI/API, not a seeded-row-only test.
```


## 10 / ENV-01 — Reachable full API, Auth, private Storage and runner

Source and acceptance: [10-ENV-01-runtime.md](tasks/10-ENV-01-runtime.md).

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Prepare and validate the submission runtime for the current secondhand-marketplace-android-app candidate. Read the packet README.md, DOC-01-scope.md, FINISH-00-release-gates.md, QA-MATRIX.md, task 05 runner runbook and existing integration rollout docs. Inspect configuration by variable names and presence only; never print .env values, JWTs, cookies, database URLs containing credentials or service keys.

Make the complete API and Expo/Android app runnable with documented commands and environment examples. A phone cannot reach the host using 127.0.0.1; choose an already-authorized reachable HTTPS API/staging host for the final build, and document a LAN-only development alternative distinctly. PUBLIC_CERTIFICATE_BASE_URL must point to the actual externally reachable HTTPS certificate API origin, not a local Expo page or an https://localhost startup bypass. Configure CORS/auth redirect/scheme/package and Supabase Google/provider return paths from official current docs when needed. Keep service-role keys server-only; app env uses only public/anon values and API origin. Never copy credentials into the packet or mobile bundle.

Validate private identity/inspection/delivery Storage permissions, actual authenticated upload/read, expired/foreign access rejection and public certificate HTML/JSON/QR without login. Rehearse migrations with backup/restore on an isolated disposable PostgreSQL environment; produce exact one-head deployment/rollback steps and a non-destructive preflight for the shared target. Stage scheduler configuration and health/failed-run monitoring from task 05, including no-HTTP behavior and restart.

The user authorized preparing local work, not automatically resetting/stamping/migrating shared or production DBs, changing remote auth policies, or exposing a new public tunnel. Perform reversible local/isolated setup autonomously. For a final shared write/remote configuration not already authorized, first produce the concrete preflight, target/backup plan and exact command/config diff, then request only the necessary approval with its reason. Missing credentials or service access are actual blockers; finish independent scripts/docs/checks while they remain unavailable. Do not substitute mocks and call integration complete.

Deliver env examples, start/stop/health/runbook instructions, redacted runtime evidence and reports/10-ENV-01.md with deployed API SHA, migration head, reachable origin, worker command/schedule and explicitly unexercised gates. Do not interrupt unrelated running sessions. Continue through setup and authorized validation, not just a list of environment variables.
```


## 11 / QA-01 + FINISH-06 — Evidence on the combined release

Source and acceptance: [11-QA-01-release.md](tasks/11-QA-01-release.md).

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Audit and test the combined submission candidate, implementing small in-scope fixes for defects you find rather than only reporting them. Locate the packet and read DOC-01-scope.md, QA-MATRIX.md, FINISH-00-release-gates.md, changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md, reports/EXTERNAL-SHIPPING-API-MAPPING.md and versioned-policy acceptance before historical FINISH references, all delivered task reports and reports/release-manifest.json. Inspect actual source/app/API revision, environment, migration and tests first. This is final integration QA, not another isolated PR review.

Run retained automated backend/PostgreSQL and mobile logic/component/type checks needed for the combined changes, using a disposable test DB. Exercise real API business journeys with distinct authorized Buyer/Seller/Inspector/Admin accounts without a new Courier account/photo; legacy Courier scenarios remain separate: successful sale through RELEASE/payout/review, positive rejection and result silence through actual Seller/Admin durable return/item-only1200 refund with retained100/50, and negative result full1350 refund/original receipt. Also exercise no-ship, both independent72h deadlines and receipt AUTO, timely missing-delivery/Admin resolution, worker no-HTTP restart/two-runner/retry, profile persistence, certificate revoke and private data denial. Use actual Storage and Google integration where available; identify which checks used deterministic adapters.

Use task 12 APK on a real Android device for both main journeys, Google login/return, camera/gallery inspection/product upload and retained legacy proof access, keyboard/back/navigation and profile/review reload. Open public QR in another phone/browser without login, including revoked and invalid cases. Use provided purpose-built tools, browser and adb if authorized/connected. Ask the device owner only for steps tooling cannot reach; give exact checklist and collect evidence. Do not label browser/Expo Web/device simulator results as real Android acceptance. Do not log tokens/PII or mutate an unapproved shared database. Seed only an isolated authorized synthetic demo target.

Record each QA-MATRIX case PASS/FAIL/BLOCKED/NOT_RUN with app/API SHA, migration head, environment, account roles, test command/evidence path and limitations. Fix reproducible local code defects, rerun affected checks and update SHA/artifact mapping. Coordinate rebuild/retest if the APK source changes. Existing issues #49/#50/#63/#65/#105/#106 and FINISH-06 need their own acceptance evidence; inspect the actual issue before claiming it closed. Do not create duplicate issues or close issues based solely on unit tests.

Deliver reports/11-QA-01.md, completed templates/TEST-REPORT.md, evidence index and explicit READY/NOT_READY verdict. READY requires every mandatory QA case and final APK alignment. If real login/storage/device/shared rollout is missing, keep those cases pending, list exact missing access/steps, and finish independent QA. Never invent screenshots/results or declare completion because time is short. Complete the authorized tests and fixes, not only a test plan.

Q01–Q26 are your technical release gate. When they pass, hand off TECHNICAL_READY_HANDOVER_PENDING to task 13; Q27 final handover and Q28 teacher scope disposition are checked by task 13/Lead after it produces the artifacts. Do not create a cycle by waiting for final slides before handing over the technical QA report. Overall READY still requires all mandatory cases, and must not be claimed while Q27/Q28 are pending.
```


## 12 / APK-01 — Installable Android release

Source and acceptance: [12-APK-01-android.md](tasks/12-APK-01-android.md).

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Produce the installable Android submission artifact from the combined complete-app candidate in secondhand-marketplace-android-app/mobile. Read AGENTS.md and required exact Expo version docs before code; read packet DOC-01-scope.md, RELEASE-DESIGN.md, QA-MATRIX.md and task 10 runtime report. Inspect app.json/app.config.js/eas.json, lockfile and installed toolchain. Use official current Expo/EAS/Android documentation for build configuration or signing behavior you need to verify.

Choose a preview/internal standalone APK with bundled JavaScript that starts without Metro/dev-server; do not hand over an Expo development client as the final installable app. Keep Android package com.kmutnb.secondhandmarketplace and existing secondhandmarketplace scheme unless an actual conflict demands a documented change. Display brand 2NDHAND consistently, select existing app icon/splash assets and correct version/build code. EXPO_PUBLIC_MOCK_MODE/catalog-only/buyer-only/visual-QA flags must not restrict the full submission app. Set the authorized reachable HTTPS API and public Supabase config; never put service keys/secrets into mobile env/artifacts. Fix camera/gallery permission descriptions for product/verification/delivery evidence and Android navigation/keyboard issues within scope.

Use existing authorized EAS login/build configuration or local Android toolchain as available, producing reproducible commands. Avoid adding dependencies or installing a large toolchain blindly; inspect bundled/local tools first. If credentials/signing/SDK/device connection are missing, complete the build configuration and deterministic preflight, then report the exact required user step; do not fabricate an APK. Cloud upload/build or shared credential changes require authorization if not already supplied.

Build, verify package/version, SHA256/size and JavaScript inclusion, then install and launch on a connected authorized real Android device using adb when available. Confirm cold start without Metro, guest catalog, real Google login return and task 11 main-flow checks against the reachable API. Share the APK through a local artifact link or authorized delivery channel, not a store publication. AAB/Play Store are not required for sideloading this course demo.

Deliver artifacts/android/ with actual APK, a hash/manifest and install/run instructions, reports/12-APK-01.md with source/API SHA, build environment and native evidence. Update reports/release-manifest.json only with proven fields. If code/environment changes after QA, rebuild and rerun affected native gates. Do not claim READY merely because the build job succeeded. Continue through an actual build and installation where access permits.
```


## 13 / HANDOVER-01 — Final demo, documents and presentation

Source and acceptance: [13-HANDOVER-01-demo-presentation.md](tasks/13-HANDOVER-01-demo-presentation.md).

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Complete the submission handover for the actual tested release, working in the current project folder. Read the packet README.md, DOC-01-scope.md, SRS-SUBMISSION.md, diagrams, PRESENTATION-OUTLINE.md, QA-MATRIX.md, reports/11-QA-01.md, reports/12-APK-01.md and release-manifest.json. Read changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md and reports/EXTERNAL-SHIPPING-API-MAPPING.md before historical references. Use the presentation/PDF/document skills when creating their artifact types. Work autonomously on concrete files; do not stop at suggesting slide topics.

Prepare repeatable synthetic demo data/setup for a successful sale, positive rejection/result silence actual-return item-only refund1200 retaining100/50, and negative full1350 return refund, unpaid expiry, no-ship refund, missing-delivery Admin resolution, certificate revocation, editable profile and reviews. Seed only an isolated explicitly chosen demo DB/storage namespace; require a guard against shared/production targets, avoid real identity/card/bank data, and use actual authenticated role mappings for real integration. Do not seed fake users or reviews into the shared catalog without authorization. Timer demos use isolated test clocks/aged fixtures through the same guarded services, never a public bypass endpoint.

Produce a clean submission directory containing final standalone APK/hash, setup/start/stop guide, Thai user guide for retained roles, aligned SRS source/PDF, rendered architecture/use-case/class/state/sequence diagrams, requirement-to-test report, release manifest, synthetic demo setup/runbook, PPTX or equivalent editable slides plus PDF export, a 7–10 minute Thai speaker/demo script and recording/rehearsal checklist. Reuse the prepared scope/docs/outline; update model/routes from actual release and proof, not from future promises. Clearly label payment/shipping/payout as persisted simulations and deferred requirements as future work. Preserve the original historical SRS.

Make slides explain problem, guest→Buyer→Seller UX, architecture, one-sale/one-refund journeys, public QR, profiles/reviews, roles/privacy/one-time settlement/timers, real test evidence and limitations. Include actual redacted Android screenshots and QR from the tested demo when available. If implementation is incomplete, deliver a clearly marked rehearsal draft and a precise blocker list; do not insert unrun PASS metrics or screenshots. Export/render and visually inspect deck/PDF/diagrams for clipped text and Thai font issues.

Capture a backup screen recording through an available authorized device/tool after the real demo succeeds. If tooling cannot operate the phone/presenter, prepare exact capture and rehearsal steps and request only the manual action. Verify the final submission directory links, APK hash, manifest SHA and guide commands against the actual release. Deliver reports/13-HANDOVER-01.md and a READY/NOT_READY gate summary. Teacher acknowledgement of revised scope and oral presentation are human steps; record their status rather than claiming them done.
```
