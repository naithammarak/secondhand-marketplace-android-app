# Submission readiness review - 30 September 2026

**Lead decision: REQUEST CHANGES for final submission.** The promised sale and return journeys are unfinished. A pre-FINISH candidate is ready for device QA, while final delivery, physical receipt, seller settlement and buyer refund still need implementation and acceptance.

This report covers the supplied diagrams, SRS, plan/spec/design documents, current remote GitHub status, main and candidate source trees, local work and existing QA evidence. It proposes work; it does not publish issues, approve/merge PRs, deploy, or change application code.

## 1. Verified snapshot

Reviewed on 30 September 2026, Asia/Bangkok. The teacher's deadline and rubric were not supplied; sequence below uses dependencies, not promised dates.

| Item | Observed state |
|---|---|
| App repository | [secondhand-marketplace-android-app](https://github.com/naithammarak/secondhand-marketplace-android-app) |
| Current remote main | `8254f8d224f62aa765f978f65f110139410a09ab` |
| Reviewed integration candidate | [PR #115](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/115), `f72a0e51debc32c59d6086f231a0f5fdddbad3a2`, OPEN / Draft, base CERT-04 branch |
| Candidate ancestry | Current #108, #109, #110, #111 and #112 heads are ancestors of #115. #113/#114 heads are not. Their equivalent work needs content review rather than automatic additional merges. |
| In main | #92 Order cancellation/expiry and #97 marketplace navigation/UI; Product and initial Order APIs exist |
| Outside main | Current #108-#115 heads; older #93/#94 heads are also outside main despite their MERGED labels |
| Main business limit | Order states: WAITING_PAYMENT / WAITING_SELLER_SHIP / CANCELLED; Escrow: HELD only |
| Candidate business limit | Adds center shipping, inspection, public certificate and one-time result decision; Order stops at RESULT_NOTIFIED; Escrow remains HELD only |
| Local checkout | `feat/marketplace-design-ui`, HEAD `939e4f763c8185e5478b1d4962e746b7a2321a8d`; 46 commits ahead of its tracking branch, 44 modified tracked files and 28 untracked entries at review |
| Local UI vs candidate | Local HEAD is not an ancestor of #115. Latest branding/screens and uncommitted work require a separate integration and review decision. |
| GitHub inventory | 58 issues: 30 OPEN / 28 CLOSED. 13 OPEN PRs. All 30 open issues have no GitHub assignee, although bodies contain role placeholders. |
| Remote approval/checks | #108 and #107 are BLOCKED / REVIEW_REQUIRED. #95/#81/#83 conflict with their bases. Every open PR returned an empty status-check list; #115 is Draft even though conflict-free. |

Machine-readable coordinates and all open issue/PR records: [review evidence](SUBMISSION-READINESS-EVIDENCE-2026-09-30.json). Refresh these coordinates before implementation or release.

## 2. What exists and what remains

| Area | Existing evidence | Remaining work |
|---|---|---|
| Google login / seller approval | Implementation in main; LOGIN and VERIFY issues closed. Candidate creates BUYER accounts and lets approved sellers retain buying. | Recheck real Google login and role/approval behavior on the final Android build. Align class diagram and role documentation. |
| Product | Upload, create/edit/cancel, catalog/search/detail code in main. #49 has mostly completed implementation checkboxes. | Real Seller-to-Buyer API/DB/Storage/device acceptance and closure review: #47/#49/#50 plus parent/contract issues. |
| Order/payment | Reservation, simulated payment, held Escrow, receipt, buyer/seller reads, cancellation and lazy expiry implemented. | Final-build acceptance, concurrency evidence and closure review. SELLER purchasing and independent unpaid worker are in #115, not main. |
| INSPECT | Backend #108 and mobile work in candidate; assigned center Courier proof before Inspector receipt, four results. | Merge/integration, real operator accounts/private Storage/device acceptance, #65 report. |
| CERT | Candidate has atomic qualifying certificate issue, public HTML, native JSON and persisted Buyer decision. | Public HTTPS QR from another phone without login, device decision flow, final acceptance #105/#106 and Admin revocation write flow. |
| FINISH | Spec, decision register, fixtures and FINISH-01...04 handoffs exist. | Implementation of final shipments, receipt/report, shared RELEASE/REFUND service, terminal states and UI; FINISH-01...06. |
| Courier | COURIER role, Shipment legs and proof foundations exist. | Existing API helpers/queue restrict work to TO_CENTER. Extend to TO_BUYER/TO_SELLER, immutable destinations and selected proof binding. |
| Timers | Candidate includes bounded unpaid-expiry runner, tested locally without HTTP traffic. | Deploy/monitor unpaid runner; implement receipt 72h release, seller no-ship refund and return-refund retry. Define inspection overdue escalation. |
| Design | HTML prototype, detailed design plan, Figma wireframe/splash files and local UI work exist. | Align business behavior with approved contracts, choose latest UI changes for release, and verify reachable screens on Android. Checked design boxes indicate prototype progress. |
| Teacher package | SRS and class/state sources exist. | Final aligned SRS/diagrams, release README/manual, evidence matrix, installable Android artifact, demo data, slides, recording and rehearsal. No deck or APK/AAB was found in the supplied workspace. |

### Existing QA evidence

The inspected [F3 report](../../doc/handoff/F3-qa-report.md) reports **307 backend + 305 mobile logic passes on #115's unchanged parent**, and **180 component passes + typecheck on exact head f72a0e5**. Backend/logic suites were not rerun after the mobile-only final commit. Verdict: READY FOR DEVICE QA.

That report explicitly leaves Android, real OAuth, private Supabase Storage, physical unauthenticated QR, combined shared migration and worker deployment unobserved. The current [Lead acceptance packet](backend-handoff-2026-09-29/LEAD-ACCEPTANCE.md) retains empty actual/evidence fields for those checks. This review read the reports; it did not rerun the application suites.

[PR #107](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/107) contains an earlier INSPECT-01 Supabase rollout report to revision f3c1a09d8b56, including reported restore and data preservation checks. It explicitly excludes later certificate migration and end-to-end API/Auth/Storage. It is historical evidence, not live confirmation that the combined candidate is deployed.

## 3. Contract and scope conflicts to resolve

Use [Issue #98](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/98), [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md), [CERT](CERT-spec.md) and the [FINISH decision register](finish-00-2026-09-29/FINISH-contract-decisions.md) for the already selected fulfillment behavior. The later design handoff lists proposals which conflict with those choices.

| Topic | Conflict observed | Submission action |
|---|---|---|
| Certificate timing | SRS FR-20 waits for Buyer acceptance; current CERT code and state/class rules issue atomically with PASS/MINOR_ISSUE. Design B12 still waits for CONFIRM. | Align SRS and design to atomic qualifying inspection issue. |
| 72-hour start/action | SRS NFR-10 and design result countdown refer to result notification/automatic result acceptance. Current contract starts after confirmed delivery proof to Buyer, with no automatic inspection decision. | Show separate result acceptance and physical receipt actions. Correct deadline text and prototype transitions. |
| Negative results | Design D5/B14 lets Buyer accept FAKE/NOT_AS_DESCRIBED and uses result timeouts. CERT/FINISH route these to return with no CONFIRM/certificate. | Apply the approved negative-result return rule to the release design. |
| Refund amount | Design D4/B11/B13 refunds item price only; #98/FINISH refund the full held Order total. | Use full simulated refund; keep original Payment/Receipt and a separate settlement record. |
| Release trigger | Design B13 releases at delivery; contract requires Buyer receipt or eligible 72-hour worker, with timely non-receipt report blocking AUTO. | Correct UI/prototype and implement server conditions. |
| Fees | SRS FR-24 deducts inspection fee from Seller; actual quote snapshots Buyer shipping 50 + inspection 100, Seller commission 5%. | Align SRS, slides and final amount displays with existing pricing. |
| Returned listing | Design B13 allows relisting; FINISH marks refunded Product CANCELLED and forbids automatic relist. | Remove automatic relist from the release journey. |
| Roles | Class diagram still says first-login role selection and disjoint Buyer/Seller capabilities; candidate uses BUYER first, approved Seller can buy. | Update class/role model and stale VERIFY/UX descriptions. |
| Payout destination | Class diagram uses Wallet; design describes bank transfer; real withdrawals/transfers are outside prototype. | Describe a persisted simulated seller payout. Freeze its ledger representation before FINISH schema work; do not claim a real bank transfer. |
| Prototype coverage | SRS prototype scope includes FR-03 profile, FR-08 broader filtering, FR-33 notifications, FR-37/38 reviews and FR-41 wider user management; newer backlog defers much of this. | Implement the retained minimum or obtain an accepted scope revision and update SRS/design/presentation together. These are unresolved requirements. |
| Image limits | SRS NFR-03 says 10 MB per image; candidate API and mobile enforce 5 MiB, up to 10 images. | Record the accepted limit consistently, or implement the larger requirement before claiming compliance. |
| Deadline races | #98 refers to request arrival; FINISH v1 uses a fresh DB clock after acquiring the Order lock. | Lead records one rule before receipt/report/worker implementation. Recommendation: locked DB eligibility check, with explicit boundary/race tests. |

Two concrete examples of unfinished local UI: the untracked Order review route's submit callback only navigates back; the consent modal handler dismisses the modal/selects BUYER without recording its photo-consent argument on the server. Neither establishes persisted reviews or consent.

FR-23 certificate revocation is retained in the SRS. Candidate schema/public views support REVOKED, but its registered API routes contain no Admin revoke command. A seeded revoked row or revoked-view test does not complete the Admin user journey.

The current state diagram already describes the agreed fulfillment behavior better than the SRS/design. Sequence diagrams referenced by the design handoff were not found under the supplied docs. Confirm whether separate course deliverables exist before marking diagrams complete.

## 4. Prioritized work and ownership

P0 = blocks the agreed sale/return submission. P1 = required acceptance, handover or retained-scope work. IDs below are planning IDs unless a GitHub issue is linked. Assign one named team member to each role.

| Priority / task | Primary owner | Dependency | Completion evidence |
|---|---|---|---|
| P0 DOC-01: freeze submission scope/contracts | Lead | Start now | Accepted FR/NFR scope table; corrected SRS/design/class rules; retained/deferred features explicit; deadline rule recorded. |
| P0 INT-01: freeze one source candidate | Lead + integration owner | Current PR review | Resolve #108 review gate; review #109 -> #110 -> #111 -> #112 -> #115 in dependency order; select/reconcile latest local UI, #113/#114/#95 equivalents; one final source SHA and reviewed migration graph. |
| P0 FINISH-00 [#98](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/98) | Lead | DOC-01 + source candidate | Refresh 29 Sep readiness using actual #115, contract/schema review, confirmed owner assignments and G0/G1/G2 disposition. An integrated candidate now exists; the old readiness table saying none exists is stale. |
| P0 Seller return address + COURIER-01 | DB1, reviewed by DB2 | Frozen schema/API base | Seller-owned immutable validated return snapshot captured at ship-to-center; destination/proof/assignment constraints; legacy missing destination returns an explicit error and holds funds. |
| P0 FINISH-01: schema/constraints | DB2 | FINISH-00 + DB1 coordination | Extend Order/Escrow, settlement/idempotency/history/resolution records; one terminal settlement per Order/Escrow; isolated migration/data preservation/constraint evidence. |
| P0 FINISH-02 + COURIER-02: final shipments | BE | FINISH-01 + addresses + CERT decision | Existing routes support all legs; server derives TO_BUYER or TO_SELLER; assigned Courier confirms 1-3 bound private proofs; no competing outbound directions. |
| P0 FINISH-03: receipt and RELEASE | BE | FINISH-02 + shared service contract | Buyer receipt/report and audited Admin resolution; atomic COMPLETED/RELEASED/SOLD; one payout, rollback/race proof. |
| P0 FINISH-04: REFUND | BE | Same service/schema as FINISH-03 | Return/no-ship/Admin full refund once; REFUNDED + Product CANCELLED; original Payment/Receipt preserved; retry after delivery commit. |
| P0 FINISH-05 + COURIER-03: app integration | FE1, FE2 supports result/receipt | Fixtures now; real API after BE | Real all-leg Courier capture; separate result/receipt buttons; proof/report/history/final amounts; refresh/session/account-switch behavior. |
| P0 TIMER-01: paid lifecycle jobs | BE; DB supports | FINISH-03/04 + shared locks | Receipt 72h release, seller no-ship refund and stuck return-refund retry; no-HTTP, restart, two-worker and outage/recovery evidence. Inspection over 3 working days escalates without inventing a result. |
| P1 Runtime and migration acceptance | DB1 + runtime owner; DB2 reviews | Selected combined candidate | Named target/operator, read current applied history, tested forward migration, backup/restore plan, deployed SHA/revision, private Storage and staff access, unpaid/FINISH scheduler and monitoring evidence. |
| P1 CERT revocation: proposed new issue | BE, FE2, QA1 | CERT schema/public page | Audited authorized Admin revoke action + UI; immutable reason/history; public QR shows invalid/revoked without private reason; repeat and permission checks. |
| P1 Retained profile/privacy/user-management scope | Lead assigns BE/FE/QA after DOC-01 | Scope decision | Minimum retained FR-03/NFR-05/FR-41 works and persists; consent/policy, profile and suspension behavior match documented scope. Optional export/avatar/full Admin tools require an explicit keep/defer decision. |
| P1 Notifications/reviews/filtering scope | Lead assigns owners after DOC-01 | Scope decision; reviews need terminal Order | Retained FR-08/33/37/38 works against real APIs, or accepted scope revision removes those promises. A refresh screen does not establish push delivery; review mock UI does not establish saved ratings. |
| P1 Combined QA: #50/#63/#65/#106 + FINISH-06 | QA1 API/DB; QA2 Android | One final source/build/environment | Sale, return and exception matrix pass with actual/evidence fields; no unresolved money duplication, authorization, privacy or state defects. Include retained NFR/device/usability measurements; label unmeasured targets. |
| P1 Issue/PR acceptance bookkeeping | Lead | Relevant evidence | Assign named owners; attach evidence and review each DoD; close only accepted work; disposition obsolete/conflicting #81/#83/#95/#96/#113/#114 after content comparison. |
| P1 DEMO-01...03: package/presentation | Lead + QA2 + presenters | Accepted release | Installable build, release SHA/tag/link, setup/user guide, demo datasets/accounts, final diagrams/report, slides, recording and successful rehearsal. |

Reuse the detailed [FINISH spec](FINISH-spec.md), [dependency briefs](finish-00-2026-09-29/FINISH-dependencies.md) and FINISH-01...04 handoffs. Only FINISH-00 has a published issue (#98); FINISH-01...06, COURIER/TIMER and the proposed revocation/packaging work need issue records or links to an existing equivalent.

The one BE role is a scheduling constraint. Coordinate final-shipment and settlement changes on one base/service; FE prepares fixtures/screens and QA prepares scenarios while BE/DB complete the dependencies.

## 5. Open issues: implementation vs acceptance

All issue numbers below are currently OPEN. An open issue does not prove absent code.

| Group | Existing issue numbers | Lead disposition |
|---|---|---|
| Product (5) | #41, #42, #47, #49, #50 | Parent/contract closure review; read/catalog code already exists. #49 still lacks API/device evidence; #50 integrated QA is outstanding. |
| Order (9) | #51, #53, #55, #57, #59, #61, #63, #66, #67 | Schema/API/UI already substantially in main. Review acceptance and current contracts; collect #63 final-build proof. |
| INSPECT (8) | #52, #54, #56, #58, #60, #62, #64, #65 | Backend/mobile implementation outside main; historical schema rollout exists. Integrate and run device/private Storage acceptance before parent closure. |
| CERT (7) | #100, #101, #102, #103, #104, #105, #106 | #109-#112/#115 supply implementation. Complete merge/live acceptance and #105/#106 evidence; track missing revocation separately. |
| FINISH (1) | #98 | Contract/readiness remains open. Publish missing implementation tasks and complete terminal business journeys. |
| Total | 30 | All need a named GitHub assignee and evidence-based disposition. |

LOGIN/VERIFY are recorded closed; their final-build regressions remain part of combined QA rather than reasons to restart those features.

## 6. Execution order

1. Lead freezes scope and resolves document conflicts; integration owner compares candidate with latest local UI; QA prepares final scenario/data list.
2. Review the pre-FINISH source chain, migration history and runtime target. Run pre-FINISH Android/OAuth/Storage/QR acceptance using the existing Lead packet.
3. DB1 completes return-address/all-leg prerequisites; DB2 publishes FINISH schema on the reviewed graph. FE works from existing fixtures; QA prepares deadline/race cases.
4. BE completes final shipments, shared RELEASE/REFUND service and jobs. FE integrates Courier/receipt/report/Admin paths as APIs become available.
5. QA runs both full journeys and failures on the frozen build/environment. Lead verifies outcomes and closes accepted issues.
6. Freeze release, complete teacher documents and slides, rehearse, record the backup demo and validate installation/startup instructions.

Do not bulk merge all open PRs. Some are older/equivalent work or optional demos, and #115 includes selected UI behavior without #113/#114 commit ancestry. Changes made after the reviewed candidate require affected checks again.

## 7. Teacher handover and presentation checklist

- [ ] One release manifest: source SHA/tag, Android build/version, API origin, DB revision, environment label, supported scope and test-report links.
- [ ] APK/internal distribution link usable on the teacher/demo device; install/cold launch/login checked. EAS configuration alone is not a build artifact.
- [ ] Project README with prerequisites, safe environment template, app/API startup, migration ownership, worker operation and synthetic seed instructions.
- [ ] Short user/operator guide for Guest, Buyer, approved Seller, Courier, Inspector and Admin.
- [ ] Final SRS, architecture/class/state diagrams and any course-required use-case/sequence/ER diagrams; label future-scope components.
- [ ] Requirement-to-test matrix with PASS/FAIL/BLOCKED/NOT RUN and exact build/environment; include known limitations.
- [ ] Distinct synthetic data for successful sale, return/refund, unpaid expiry, non-receipt report and certificate revocation.
- [ ] Successful live rehearsal of both promised journeys without manually inserting terminal states.
- [ ] Backup recording and screenshots from the same accepted release; reachable public HTTPS QR from a separate phone/browser.
- [ ] Presentation roles, timing and teacher Q&A rehearsal complete.

Suggested slide sequence: problem/users -> accepted prototype scope -> architecture -> data/state model -> successful sale -> return/refund -> certificate/public QR -> permissions/one-time settlement/timers -> test evidence -> limitations and future work. Match every claim to the actual release. Show payment/shipping as simulations.

Already outside the SRS prototype: auction, buyer/seller chat, wishlist, chatbot, advanced dispute/reporting, full dashboards/configuration, withdrawals, trust-score automation and inspection appeals. Real payment/shipping providers and production availability measurement also are not required by the agreed prototype. The conflicting profile/reviews/notification/Admin requirements in section 3 still need reconciliation.

**Final acceptance gate:** the accepted scope matches submitted documents; both promised business journeys pass on one Android/API/DB release; required timers and private/public access work; all critical defects are cleared; and another person can install/run the demo from the handover package.

## 8. Review sources and limits

Primary sources: [SRS](../requirment/Software%20Requirements%20Specification.pdf) (prototype scope and FR/NFR tables), [state diagram](../state-diagram/Order%20State%20Diagram.puml), [class diagram](../class-diagram/Class%20Diagram%20(Core).puml), [prototype backlog](GitHub_Prototype_Backlog.md), [design plan](../ux-ui-design/UI-REDESIGN-PLAN.md), [design handoff](../ux-ui-design/HANDOFF-HEAD-DEV.md), CERT/INSPECT/FINISH specs and 29 Sep handoff/readiness packets, main/candidate routes/models/services, current GitHub API records and F3/rollout reports.

Validation in this review: live issue/PR metadata, fetched remote main/branches, exact commit ancestry, static route/model comparison, SRS text and rendered FR page, Figma archive thumbnails and artifact inventory. Individual Figma canvas interactions and every HTML screen were not visually exercised. Existing QA results are attributed to their recorded revisions. Shared DB/Auth/Storage and real Android were not exercised here. Build/deck/manual absence means no artifact was found in this workspace; external team artifacts may exist.

Only this report and its evidence snapshot were created. Existing application files and historical documents were preserved.

