# Project review and next-work plan — 26 September 2026

Status: planning review. Product choices supplied or delegated on 26 September 2026 are recorded in [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md); application code, GitHub issue state and shared environment were not changed.

## 1. Recommendation

The next work is **contract and integration reconciliation, followed by completion of the existing INSPECT work and the missing CERT/FINISH flows**. Do not restart Product or Order implementation just because their GitHub issues remain open.

Two tracks can proceed now:

1. **Acceptance:** QA verifies the merged Product and Order flows against the real integration environment and Android build, using existing issues #47/#49/#50 and #59/#61/#63/#66.
2. **Implementation readiness:** Lead resolves the document conflicts in DOC-01 and INSPECT-00 #54; BE/DB reconcile PR #92 with the INSPECT stack in INT-01. Then complete #93 → #94 → #95, CERT, and FINISH in dependency order.

The current application reaches order creation, simulated payment, and held escrow. The merged backend cannot yet complete either promised demo: delivery plus seller settlement, or return plus buyer refund.

Detailed issue-ready contracts and acceptance criteria are in [NEXT-WORK-SPEC-2026-09-26.md](NEXT-WORK-SPEC-2026-09-26.md), with the delivery/photo/automatic-deadline product contract in [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md). New IDs in those documents are **proposed planning IDs**, not existing GitHub issue numbers.

## 2. Verified baseline

| Item | Evidence on this review |
|---|---|
| Repository | [naithammarak/secondhand-marketplace-android-app](https://github.com/naithammarak/secondhand-marketplace-android-app) |
| Current remote main | `a936ccf8c10df308af3a7792c0ad633d53cf6d1b`, merge of PR #97 |
| Local checkout | `feat/marketplace-design-ui`, `b342523591b7f0b0a00d1ca0b74b6364cde33172` |
| Comparison | Local HEAD and fetched `origin/main` have identical tracked Git trees; tests below exercise that tracked baseline |
| Existing untracked work | `docs/features/UX-00-guest-first-marketplace-plan.md`, `docs/prototypes/` inside the repository; preserved |
| Issue inventory | 50 issues returned, 22 OPEN and 28 CLOSED; listing limit 200, so this snapshot was not truncated |
| PR inventory | 47 PRs returned, 8 OPEN, 35 MERGED, 4 CLOSED; listing limit 100 |
| Implemented runtime | Expo 57 / React Native 0.86.3, FastAPI, SQLAlchemy/Alembic, PostgreSQL/Supabase integration |
| Main Order model | Only `WAITING_PAYMENT`, `WAITING_SELLER_SHIP`; escrow only `HELD` |
| Main registered business APIs | Auth, verification/admin verification, product upload/write/read, orders; no INSPECT/CERT/FINISH router |

Source inventory: the 27-page SRS, both PlantUML sources, root `docs/project-plan/` and `docs/issue/`, repository contracts and QA documents, backend routes/models/migrations/tests, mobile routes/services/stores/tests, and live GitHub issue/PR metadata. The Figma archive thumbnail was inspected; individual canvas layers and interactions were not decoded. This is a requirements/architecture/delivery review, not a claim that every code path or Figma screen has been exhaustively audited.

The class diagram references a separate `Class_Diagram__Types_.puml` supporting-types diagram, but that file is absent from the supplied `docs` inventory. DOC-01 should add it or remove/update the reference so the submitted enum/type definitions can be reviewed alongside the core diagram.

## 3. Findings that change the next work

### P1 — The required end-to-end business flow stops at held payment

`backend/app/models/order.py:31–33` allows only two Order states and `HELD` escrow. `backend/app/main.py` registers no inspection, buyer-decision, settlement, refund, or public-certificate API. Main has no Shipment, Inspection, Certificate, ReceiptDecision, wallet/settlement ledger, or final-delivery models.

This is expected unfinished scope, not a newly reproduced production failure. It means another UI polish round will not complete the prototype. Finish the INSPECT stack, then CERT decisions/public QR and FINISH release/refund.

### P1 — PR #92 and #93 have an incompatible shared migration boundary

Verified by reading fetched PR heads:

- #92 adds `b41d7ce09f35` from `9446ec1a2c5d`, replacing `ck_orders_status` with `WAITING_PAYMENT`, `WAITING_SELLER_SHIP`, `CANCELLED`. Its chain continues through `a5f1c9d2e7b3` to `c93b7e5a1d84`.
- #93 adds `f3c1a09d8b56` from the **same parent**, replacing the **same CHECK** with the two old states plus `SHIPPING_TO_CENTER`, `RECEIVED_AT_CENTER`, `INSPECTING`, `RESULT_NOTIFIED`. It does not include `CANCELLED`.
- #94 adds certificate revision `c7e4b21a9d08` after `f3c1a09d8b56`.

Combining these unchanged produces divergent migration heads and conflicting constraint definitions. A no-op Alembic merge alone does not resolve which states are allowed. One branch can reject rows introduced by the other. This is a static integration finding; the combined migrations were not executed against any database in this review.

Also reconcile the diagram's `PAYMENT_EXPIRED` with #92's `CANCELLED` plus reason, and the partial unique index `status <> 'CANCELLED'`. If `PAYMENT_EXPIRED` is introduced without changing that index, expired orders still block a subsequent order for the product. See INT-01.

### P1 — The INSPECT stack is behind its own storage base

Current #93 head `323a8bb` is **not** an ancestor of #94 head `cf58e13`; #94 is an ancestor of #95 `b64687d`. The migration in #93 contains protections absent from #94: prevent moving a finalized inspection to another Order and prevent modifying any evidence belonging to a finalized inspection. Its PostgreSQL tests also contain newer preservation/immutability checks.

Synchronize the stack and retain these fixes before interpreting the earlier passing test counts as evidence for the integrated version. PR #95 additionally needs reconciliation with the newly merged marketplace navigation from #97.

### P1 — The public certificate endpoint in #94 is an interim API, not CERT completion

At `cf58e13`, `backend/app/api/inspections.py:391–397` returns JSON including `order.product_name`. The existing CERT spec requires a browser-readable HTML page and explicitly excludes user-entered product names. The model has no certificate status/revocation fields, and the branch has no buyer-decision mutation.

Its private buyer result endpoint also requires the Order still be `RESULT_NOTIFIED`; CERT/FINISH must preserve authorized historical result access after onward shipping/completion. Extend this existing implementation rather than creating a second certificate table or claiming CERT-01/02 are wholly absent everywhere.

### P1 — Acceptance sources describe different products

The SRS, class/state diagrams, reduced backlog, draft INSPECT/CERT contracts, and PR #92 disagree on certificate timing, timers, reception photos, fees, and scope. These change schema, authorization, and acceptance results. The user's 26 September choices resolve the product behavior for certificate timing, Courier photos, the 72-hour Buyer receipt deadline and simulated fees in [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md). DOC-01 must align submitted SRS/diagrams and team implementation contracts with it.

### P2 — GitHub status and the older plan lag merged code

PR #84 (Product reads), #90 (catalog integration), #91 (Product write/timeout fixes), #97 (marketplace UI), and #69 (Order checkout) are merged. The 23 September Product follow-up still describes #91 as waiting for review. #42 has a FINAL contract comment and every body checkbox checked, yet remains OPEN. #47 and the Order issues still show largely empty checklists despite implementation in main.

Refresh evidence and checklist links; do not reopen implementation from scratch or close device/DB criteria using mock tests.

### P2 — Guest-first design does not mean the proposed account model is implemented

Main now has public browsing, category chips, and a purchase/login return path. However, `POST /auth/role` still offers one-time role selection, `require_buyer()` still requires `BUYER`, and `/profile` renders the existing login/account screen. The untracked UX-00 plan proposes default Buyer signup, approval-based seller promotion, shop names, and Seller-as-Buyer capabilities; those backend changes are not in #97.

Preserve and track this as a separate UX-00 workstream if the team prioritizes it. Coordinate ownership-based buyer access across orders, payments, decisions, and inspection evidence if Seller buying is enabled. Do not announce the full new account flow as delivered.

## 4. Requirements coverage

“Merged” below means code exists in the reviewed main tree. It does not certify deployed services or physical-device behavior. SRS page numbers refer to PDF pages, not extracted-text line numbers.

| SRS requirement | Current coverage | Next work / disposition |
|---|---|---|
| FR-01/02 Google signup/login and roles | Implemented; Login issues closed | Retest real Android OAuth/deep-link and checkout return after #97; avoid rewriting Auth unless UX-00 is chosen |
| FR-03 Profile/account management | Display/logout/role selection; no general profile-update API | Reduced backlog defers advanced profile; basic editable fields and account-management coverage need an explicit scope decision |
| FR-04 Seller verification | Models, private upload service, Seller/Admin screens and APIs merged; Verify issues closed | Regression in shared acceptance; retain real private-Storage evidence |
| FR-05/06/07 Listing, fixed-price sale, edit/cancel | Implemented, #43–46/#48 closed | #50 proves upload → write → discover → update/cancel with same product ID |
| FR-08 Search/filter | Name and category implemented | Brand, price range, size, condition filters are not implemented in public query; reduced backlog defers complex filtering |
| FR-09 Product detail | Product/images/options implemented | Seller reviews/trust display not implemented; reconcile with reviews deferred and FR-47 already excluded by SRS |
| FR-10/11 Order and simulated payment | Implemented by #69 | Revalidate #53/#55/#57/#59/#63; keep real gateway integration outside prototype |
| FR-12 Escrow | Hold implemented; release/refund absent | FINISH-01/03/04; do not count HELD as lifecycle completion |
| FR-13/14 Tracking and history | Buyer/Seller order list/detail implemented, two states | Inspection and final-state history plus notification scope unresolved; extend without losing receipt/payment views |
| FR-15/16/17 Reception/inspection/evidence | Absent from main; #93–95 provide draft implementations | #54, #56, #58, #60, #62, #64, #65 after INT-01; Courier photo plus Inspector receipt is now required |
| FR-18 Notify inspection result | Draft API/mobile result reads in #94/#95 | Refresh-only reduced prototype versus notification requirement must be recorded |
| FR-19 Buyer accepts/rejects result | No decision API in main or inspected #94 | CERT-01 decision portion, CERT-04/05/06 |
| FR-20/21/22 Certificate/QR/public verification | Draft certificate issuance and JSON lookup in #94 | Resolve timing; finish HTML, QR, privacy and external-device scan |
| FR-23 Certificate revocation | Missing; CERT spec explicitly defers endpoint | Included by SRS prototype; add CERT-07 if SRS scope retained, or record approved deferral |
| FR-24 Release seller funds | Missing | FINISH-01/03 after Courier photo/proof plus Buyer receipt or 72-hour automatic release without a non-receipt report |
| FR-25 Refund | Missing | FINISH-01/04 after return delivery under reduced backlog/state diagram |
| FR-26 Receipt | Simulated receipt stored/read in main | Verify payment replay, persisted snapshot, and visibility in later states |
| FR-27–31 Auction | No implementation; explicitly excluded by SRS prototype | Future work; no current issue needed |
| FR-32 Chat | No implementation; explicitly excluded | Future work |
| FR-33 Notifications | No notification model/service/device-token API found in main | SRS includes; backlog defers push and uses Refresh. Clarify in-app notification versus push scope |
| FR-34/35 Chatbot/support handoff | Explicitly excluded | Future work |
| FR-36 Wishlist | Explicitly excluded | Future work; do not add merely because a design suggests it |
| FR-37/38 Product/seller and inspection reviews | Missing; frontend `review-*` files are **seller-verification review**, not buyer reviews | SRS includes; reduced backlog defers. Add REVIEW work only under the chosen release scope |
| FR-39/40 Disputes/reports | Explicitly excluded | Future work |
| FR-41 Admin user management | Seller approval exists; general account management/suspension UI/API absent | Define minimal suspension scope or approved reduction; role-assignment script is not full user management |
| FR-42 Admin Order/refund/dispute management | SRS prototype excludes; partial admin Order viewing proposed in #92 | Decide whether to retain optional admin portion without making it a hidden INSPECT dependency |
| FR-43–46 Fee administration/dashboards/master-data administration | SRS prototype excludes | Keep future work; static fee configuration and read-only category/brand options do not implement admin management |
| FR-47 Trust score | SRS prototype excludes | Do not require algorithm to close reduced Product scope; reconcile FR-09 display wording |
| FR-48 Withdrawal / FR-49 Appeal | SRS prototype excludes | Simulated seller settlement still required; no real withdrawals or appeals |

### Non-functional coverage

| NFR | Finding and required evidence |
|---|---|
| 01 Performance | No fresh 500-session/10,000-product or 4G ≤3-second evidence. Define dataset, operations, percentile and measurement method before a performance ticket is accepted |
| 02 Auction performance | Explicitly excluded with auction |
| 03 Images | API allows 10 images, **5 MiB** each; SRS says 10 MB. Backend re-encodes validated image bytes; picker uses quality 0.8. Re-encoding is not proof of the agreed compression/size outcome; resolve limit and test actual output |
| 04 Security | Auth/RBAC and private-storage code exist; local tests pass. HTTPS deployment, full critical-action audit coverage, and live RLS/Storage are unverified. Local-password hashing is inapplicable to Google-only Auth and should be clarified in SRS |
| 05 Privacy | No complete consent/privacy-rights flow demonstrated. `purge_at` is assigned submission time +90 days, while SRS p26 says retention during account lifetime then deletion within 90 days of closure; no complete purge worker found. Reconcile retention and document an operational process; this is a specification gap, not a legal-compliance opinion |
| 06 Device compatibility | Android 8+/5–7 inch requirement has no fresh build/device evidence in this review. Validate actual SDK minimum support and tested devices; passing JS tests is insufficient |
| 07 Thai/usability | Thai UI exists; ≤3-minute listing / ≤1-minute discovery have not been timed with new users |
| 08 Availability/backups | SRS explicitly excludes prototype measurement; environment/backup ownership still needed for deployment |
| 09 Scale | No 50,000-product/20,000-account evidence; catalogue indexes/pagination are implementation support, not proof |
| 10 SLA | Main has no timers. #92 implements lazy payment expiry/manual runner, but PR body explicitly says an automatic scheduled job is missing. The selected plan now fixes 72 hours after Courier-proven Buyer delivery for auto-release, seller 3-day no-ship refund, 30-minute unpaid expiry, and inspection escalation; implementation remains open |

## 5. Product decisions and document reconciliation

The reduced backlog explicitly claims to supersede older prototype scope. The user has now selected the delivery and money rules in [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md). The SRS PDF is still the older revision and needs an updated submission copy; a planning decision does not edit the PDF itself.

| ID | Conflict | Selected rule or remaining document work |
|---|---|---|
| D1 | SRS p12/p14 + original class diagram: certificate after acceptance; backlog/CERT/#94: on qualifying result | Issue atomically on PASS/MINOR_ISSUE; class/state diagram source updated, SRS PDF revision pending. Buyer accepts inspection separately, and receipt confirmation is a later event |
| D2 | SRS/state diagram timers versus backlog/INSPECT no timers; #92 partially implements 30-minute expiry | Scheduled worker: 30-minute unpaid expiry; 3-day seller no-ship full refund; 72-hour auto-release only after Courier-proven Buyer delivery with no timely non-receipt report. Late inspection/result decision escalates without inventing a result/decision |
| D3 | `PAYMENT_EXPIRED` versus `CANCELLED` reason; paid seller-no-ship cancellation versus #92's unpaid-only cancellation constraint | Unpaid expiry uses CANCELLED + EXPIRED; paid seller no-ship uses REFUNDED + reason. Reconcile migrations/index and state diagram |
| D4 | SRS requires receiving photos; INSPECT says optional | Assigned Courier photos and confirms every shipment leg, Inspector separately receives at center; add restricted COURIER operator capability |
| D5 | SRS FR-24 says deduct commission and inspection fee from seller; merged pricing charges buyer inspection fee and deducts only seller commission | Keep existing snapshot: Buyer pays 50.00 shipping + 100.00 inspection; Seller pays 5% commission. Refund original total in full; no second inspection fee deduction |
| D6 | Revocation/reviews/notifications/profile/admin included by SRS but reduced/deferred | Record included/deferred status per FR; deferred does not mean passed |
| D7 | SRS image size/technology differs from code | Publish 5 MiB or 10 MB policy, Expo instead of Flutter, and real device compatibility target |
| D8 | Current roles versus untracked UX-00 default-Buyer/seller-can-buy direction | Keep current role contract for immediate integration unless UX-00 is intentionally scheduled; its migration affects all owner/role checks |
| D9 | SRS private-data retention and consent versus current fields/processes | Define retention trigger, required consent record, request handling and responsible operator before using real personal documents |
| D10 | Existing Order/CERT contract has only inspection-result CONFIRM; Buyer receipt is absent | Add separate Buyer receipt confirmation and non-receipt report, with immutable Courier proof and exactly-once money transition |

## 6. Existing issues and PRs: what to do with them

Links use the [repository issue list](https://github.com/naithammarak/secondhand-marketplace-android-app/issues) and [PR list](https://github.com/naithammarak/secondhand-marketplace-android-app/pulls); numbers below were verified live.

| Existing issue(s) | Actual implementation position | Next action |
|---|---|---|
| #42 PRODUCT-00 | FINAL v1.0 in issue comment; all body checkboxes checked | Administrative review/closure after confirming contract version; no new Product contract implementation |
| #47 PRODUCT-05 | #84 merged; category extension #97 merged | Refresh checklist against current code and relevant tests/API evidence |
| #49 PRODUCT-07 | #88/#90/#97 merged; live Android evidence still unchecked | QA real catalog, images, navigation and checkout return |
| #50 PRODUCT-08 / #41 Product feature | Integrated code exists, end-to-end evidence missing | Keep open until required API/DB/Storage/device path is recorded |
| #51 ORDER-00 | `doc/orders/contract.md` exists, issue checklist stale | Reconcile reduced scope, fees, states, roles and #92 decisions |
| #53 ORDER-01, #55 ORDER-02, #57 ORDER-03 | Schema/create/pay code merged through #69 | Verify current PostgreSQL migration/constraint/race evidence; close only criteria actually proven |
| #66 ORDER-07 | List/detail API exists | Verify owner scoping/current API responses; extend states through INT-01 |
| #59 ORDER-04, #61 ORDER-05 | Checkout/payment/list/detail screens exist | Physical Android API-backed acceptance with current marketplace navigation |
| #63 ORDER-06 / #67 Order feature | Old QA report exists; report explicitly leaves mobile untested | Rerun acceptance at selected integrated SHA, including concurrency on isolated PostgreSQL |
| #54 INSPECT-00 | Draft Lead v1; one comment requests acceptance, no final sign-off found | First Lead task; resolve D1–D4 and record accepted revision |
| #56 INSPECT-01 | #93 draft implementation | INT-01, latest storage tests, DB1/DB2 review and named deployment operator |
| #58/#60 INSPECT-02/03 | #94 draft implementation | Sync #93 fixes, complete CERT interface and retain atomic issuance behavior |
| #62/#64 INSPECT-04/05 | #95 draft implementation | Rebase on reconciled stack/current UI, add/review screen-level tests and device path |
| #65 INSPECT-06 / #52 Inspect feature | Tests reported by PR authors; integrated device run pending | Four results, permissions, races, rollback, private evidence and Android acceptance |

These rows cover all 22 open issues. Login and Verify are closed on GitHub; their current integration behavior remains part of regression testing, not a reason to recreate their issues.

| Open PR | Current head / base | Disposition |
|---|---|---|
| #92 | `035ff48` → main; GitHub reports CONFLICTING, review required | Reconcile current main/UI and the migration/status overlap; split or explicitly scope optional Admin work |
| #93 | `323a8bb` → main; draft | Storage base for INSPECT; retain newer immutability fixes |
| #94 | `cf58e13` → `feat/inspect-01-storage`; draft | Sync latest #93, review incremental diff and CERT contract gaps |
| #95 | `b64687d` → `feat/inspect-02-03-api`; draft | Sync stack and current marketplace UI; real-device acceptance |
| #96 | `4cc3dd4` → `feat/inspect-mobile-flow`; draft | Optional isolated demo harness; demo identities do not prove Google OAuth/Supabase integration |
| #68 | `ec7b148` → main | Older INSPECT preparation; compare with #93 before proposing superseded closure |
| #81 | `57ee34a` → main | Older Product constraints; compare with merged #86, preserve any unique changes before closure |
| #83 | `a0380a5` → main | Older migration documentation/test PR; compare with #86 before closure |

The eight open PRs returned empty `statusCheckRollup` in this snapshot. No fresh CI evidence was available from that field. This does not invalidate author-reported tests, but they are not independently rerun PR-head checks here. Most of the inspected Order issues also have no assignee; assign actual people before marking work in progress.

## 7. Execution sequence

| Order | Work | Primary owner | Dependency / completion gate |
|---|---|---|---|
| 1A | DOC-01 + #54; reconcile #51/#42 | Lead, FE/BE/DB/QA reviewers | Align team contracts and submitted SRS to FULFILLMENT-00; name owners and publish final revision |
| 1B | #47/#49/#50 and #59/#61/#63/#66 acceptance | QA1/QA2, DB2, FE | Start now on current main; rerun affected flows after later integration |
| 2 | INT-01: #92/#93 migration and stack reconciliation; COURIER-01/02 core role/proof for TO_CENTER | BE + DB1, DB2 reviewer | One tested migration graph, latest #93 fixes and private Courier photo before Inspector receipt |
| 3 | Finish #56/#58/#60/#62/#64; COURIER-03 center screen; #65 | DB1, BE, FE1/FE2, QA | Coherent #93 → #94 → #95 stack, Courier proof at center, same contract version and device evidence |
| 4 | CERT-01 remaining decision/status schema, CERT-03/04/05/06; account for #94's CERT-02 work | DB1, BE, FE1/FE2, QA2 | Decision-once, safe public HTML/QR, private result history; qualifying result plus certificate atomic |
| 5 | FINISH-00/01…06 plus COURIER-02/03 outbound/return extension and TIMER-01 | Lead, DB1/DB2, BE, FE1, QA | Private photo on every delivery leg, separate Buyer receipt, worker after 72 hours, exactly-once release/refund, both terminal routes |
| 6 | DEMO-01…03 | DB2, QA1/QA2, Lead | Repeatable data, actual Android build, browser QR, two full scenarios and explicit limitations |

FE can prepare public-certificate presentation and final-status layouts while BE is occupied, using frozen response fixtures. DB2/QA can prepare isolated datasets and concurrency cases. Keep one primary BE implementation stream to avoid competing edits to the same Order model and API.

Schedule ORDER-08 automatic expiry alongside stage 2 and build TIMER-01 with FINISH; seller/inspection deadlines follow [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md). Do not let optional Admin FR-42, the local demo harness, or a full account-model redesign silently become prerequisites for basic inspection.

No duration or deadline is invented: delivery date and named team capacity were not supplied. The sequence is dependency-based.

## 8. Fresh verification and limits

Executed on local HEAD with the same tracked tree as remote main:

| Check | Result |
|---|---|
| Backend `.venv/bin/python -m pytest -q` | **350 passed, 32 skipped, 3 warnings**, 13.04 s |
| Mobile `npm run test:logic` | **271 passed** |
| Mobile `npm run test:components` | **110 passed**, 12 suites |
| Mobile `npm run typecheck` | Passed |
| Mobile `npm run lint` | Passed |
| Main-versus-local tracked tree comparison | Identical |
| GitHub state, PR bases/heads, issue comments | Queried live on 26 September 2026 |
| PR #92/#93/#94/#95 code relationships | Fetched and inspected without switching the working branch |

For backend tests, `DATABASE_URL`, `TEST_DATABASE_URL`, and `ORDER_TEST_DATABASE_URL` were explicitly empty to avoid the configured shared database. PostgreSQL migration/race suites and configured-service checks were not validated by this run. Tests using SQLite, fakes, or mocks are local behavior evidence only.

Not performed: shared/staging migrations, new isolated PostgreSQL integration runs, authenticated live mutations, real private-Storage access, live OAuth, Android tapping/screenshots, full Figma-layer review, performance/load tests, security penetration testing, or fresh tests on the open PR heads. Existing PR/doc results are attributed historical evidence, not fresh passes.

## 9. Source map

- [SRS](../requirment/Software%20Requirements%20Specification.pdf): prototype p5; technology/device p8; workflow p9–12; FR p13–17; NFR p18; retention p26.
- [Class diagram](../class-diagram/Class%20Diagram%20%28Core%29.puml), [Order state diagram](../state-diagram/Order%20State%20Diagram.puml).
- [Reduced backlog](GitHub_Prototype_Backlog.md), [INSPECT draft](INSPECT-spec.md), [CERT draft](CERT-spec.md), [older Product follow-up](PRODUCT-08-review-follow-up.md).
- [Merged Order contract](../../secondhand-marketplace-android-app/doc/orders/contract.md), [historical Order QA](../../secondhand-marketplace-android-app/doc/orders/qa-report.md).
- [Merged UI handoff](../../secondhand-marketplace-android-app/docs/features/UI-01-marketplace-design.md), [untracked UX-00 proposal](../../secondhand-marketplace-android-app/docs/features/UX-00-guest-first-marketplace-plan.md).
- [PRODUCT-00 #42](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/42), [INSPECT-00 #54](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/54).
- [PR #92](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/92), [#93](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/93), [#94](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/94), [#95](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/95), [#96](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/96), [#97](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/97).
