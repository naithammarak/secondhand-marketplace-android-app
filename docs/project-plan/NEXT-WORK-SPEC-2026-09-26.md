# Next-work specification — integration, CERT and FINISH

Date: 26 September 2026. Baseline: main `a936ccf`; open PR heads are recorded in [the project review](PROJECT-REVIEW-2026-09-26.md).

**Status:** issue-ready planning draft. Existing behavior is labelled VERIFIED; existing document rules are labelled DOCUMENTED. Product choices about certificate timing, courier proof, 72-hour receipt and simulated fees were supplied or delegated by the user on 26 September 2026 and are specified in [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md). API/table shapes remain proposed until FE/BE/DB/QA align on the same revision. The SRS PDF still needs a revised submission copy.

## 1. Delivery objective and issue map

Deliver two API-backed Android scenarios with persisted business state:

1. Approved seller lists → buyer pays simulated payment → seller sends to center with courier photo → inspector receives/inspects → qualifying result/QR → buyer accepts the **inspection result** → courier photographs delivery to Buyer → Buyer confirms **receipt**, or 72 hours pass without a missing-delivery report → exactly one seller settlement.
2. Paid order → inspection fails, or buyer rejects a qualifying result → courier photographs return to Seller → exactly one full buyer refund, no seller settlement.

Payment/shipping providers remain simulated. State transitions, authorization, private evidence, amounts, idempotency and database records must be real. Refresh can stand in for push only under the explicitly accepted reduced scope.

| Planning ID | Action | Existing GitHub relationship |
|---|---|---|
| DOC-01 | New Lead issue: reconcile SRS/backlog/diagrams and freeze release contract | Coordinate #42, #51, #54; do not duplicate their feature contracts |
| INT-01 | New BE/DB issue: reconcile Order/INSPECT migrations and stacked PRs | PR #92/#93/#94/#95; #53/#56/#58/#60 |
| PRODUCT-08 / ORDER-06 / INSPECT-06 | Continue current acceptance tasks | #50 / #63 / #65; no duplicate QA issues |
| CERT-00 | Proposed decision/contract gate, or checklist under DOC-01 | CERT has a local spec but no matching issue in the fetched inventory |
| CERT-01…06 | Create remaining work from existing CERT spec, narrowed below | Reuse #94's certificate schema/issuance; avoid duplicate implementation |
| FINISH-00 | New Lead issue: terminal states, financial allocations, refund policy and operator rights | Prerequisite for FINISH-01…06 |
| FINISH-01…06 | Create the delivery/settlement/refund work already named in backlog | Detailed proposed implementation below |
| COURIER-01 | New DB1 issue: restricted courier role, assignment and private proof schema; DB2 reviews migration | Core TO_CENTER proof precedes INSPECT-02 acceptance |
| COURIER-02 | New BE issue: assignment, photo upload/confirmation and authorization | TO_CENTER API precedes INSPECT-02; TO_BUYER/TO_SELLER extend it in FINISH |
| COURIER-03 | New FE1 issue: assigned Courier queue, photo capture and confirmation | Android/API acceptance alongside INSPECT-06 and FINISH-06 |
| TIMER-01 | New BE/DB issue: recurring UTC worker for delivery receipt auto-release and other selected deadlines | Must run with no API traffic and reuse FINISH settlement service |
| ORDER-08 | Track automatic unpaid expiry | Existing PR #92 uses this ID, but no matching issue was found |
| DEMO-01…03 | Create when integrated flow is ready | Reuse backlog definitions; #96 is optional demo tooling |

Assign verified team members when publishing issues; role placeholders below are not GitHub usernames. This review creates files only, not remote issues or comments.

## 2. DOC-01 — Freeze one release contract

**Owner:** Lead. **Reviewers:** BE, DB1/DB2, FE1/FE2, QA1/QA2. **Priority:** P1. **Can start:** now.

### Deliverables

- A versioned decision table linking each affected SRS FR/NFR, exact current rule, chosen release rule, rationale, owner and follow-up issue.
- Update the authoritative prototype scope and both diagrams to match the accepted rule. Preserve a revision history rather than rewriting the meaning of historical test evidence.
- Record a final INSPECT-00 revision in #54 after concrete team review; #54 currently remains a draft.
- Align Order contract #51 with actual pricing, ownership, receipt access, expiry and cancellation behavior.

### Product decisions to apply and document

| Topic | DOCUMENTED / VERIFIED | Chosen rule for this plan |
|---|---|---|
| Certificate timing | Backlog/CERT and #94 issue with qualifying inspection; SRS PDF still waits for acceptance | Atomic issue with PASS/MINOR_ISSUE; certificate attests inspection, not ownership/delivery; PlantUML source updated, SRS PDF revision pending |
| Positive result rejected by buyer | CERT spec keeps issued certificate valid | Retain inspection record; buyer rejection only controls fulfillment, not authenticity certification |
| Negative inspection | Four results in #54: PASS, MINOR_ISSUE, NOT_AS_DESCRIBED, FAKE | Negative results have no certificate and automatically qualify for return; do not permit buyer CONFIRM |
| Timers | Backlog defers, SRS requires; #92 covers only part of unpaid expiry | Automate unpaid payment expiry after 30 minutes, seller no-ship refund after 3 days, and receipt auto-release 72 hours after courier proof; inspection/result delays escalate to Admin without inventing a result/decision |
| Expiry state | Diagram uses PAYMENT_EXPIRED; #92 uses CANCELLED + reason | Use CANCELLED + EXPIRED for unpaid expiry; amend diagram; don't introduce a second expiry state |
| Paid no-ship cancellation | Diagram allows paid cancellation; #92 forbids CANCELLED when paid | Use atomic full refund and REFUNDED with SELLER_NO_SHIP reason after 3 days; do not route a paid order into #92's unpaid-only CANCELLED constraint |
| Delivery/reception photos | SRS requires reception photo; #54 made it optional | Assigned Courier uploads 1–3 private photos and confirms delivery on TO_CENTER, TO_BUYER and TO_SELLER; Inspector independently receives at center |
| Receipt decision | Existing CERT CONFIRM means accepting the inspection result | Add separate Buyer receipt confirmation after TO_BUYER proof. No response for 72 hours auto-releases; a timely non-receipt report holds funds for Admin review |
| Fees | Main: buyer pays shipping + inspection; seller pays commission | Keep 50.00 THB shipping + 100.00 THB inspection to Buyer and 5% item-price commission to Seller, snapshotted at Order creation |
| Refund amount/return cost | Existing sources do not fully settle fee refunds | Full simulated refund of original Order total; no extra return charge in the prototype |
| Returned listing | Main Product supports AVAILABLE/RESERVED/SOLD/CANCELLED | Cancel/unlist after return; no automatic relisting of failed inspection |
| Courier account | SRS lists four marketplace personas; no Courier role exists | Add restricted operator-provisioned COURIER, assigned per Shipment, without customer self-registration; update submitted SRS actor list |
| Roles | Main BUYER-only purchase; untracked UX plan lets Seller buy | Keep main contract for current integration unless UX-00 is explicitly selected; then update all buyer ownership checks together |
| Personal data | Seller currently sees buyer shipping address after payment, although first leg goes to center | Specify minimum destinations per role/leg; proposed seller sees center/own return destination, assigned Inspector gets delivery snapshot; revise existing contract before changing output |
| Account and certificate extras | SRS includes revocation, reviews, notifications, account management; backlog reduces scope | Implement minimum selected requirements or explicitly defer them; do not count omitted features as tested |

### Acceptance

- [ ] FE, BE, DB and QA use [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md) as the same planning revision; #54 records review and any implementation-level changes.
- [ ] SRS PDF p5/p14/p18 is revised to match the updated class/state diagram and project backlog for the selected release.
- [ ] Optional FR-42 Admin Order work and UX-00 account changes are explicitly scheduled or deferred.
- [ ] The API/DB/test task owner can implement without inventing fee, role or terminal-state policy.

## 3. INT-01 — Reconcile Order and INSPECT integration

**Owner:** BE + DB1; DB2 independent migration review. **Priority:** P1. **Depends on:** relevant DOC-01 decisions and #54. **Related work:** PR #92/#93/#94/#95.

### Reproduce the current conflict without changing shared data

VERIFIED: both `b41d7ce09f35` (#92) and `f3c1a09d8b56` (#93) descend from `9446ec1a2c5d` and drop/recreate `ck_orders_status` using incompatible state lists. #94 has `c7e4b21a9d08` on top of the INSPECT branch. Latest #93 is not contained in #94.

### Implementation scope

1. Read current PR heads again. Bring latest storage safeguards into #94, then refresh #95 against that base and current main UI. Keep the newer finalized-evidence and inspection-identity guards.
2. Determine whether each proposed migration revision has been applied anywhere. If genuinely unapplied, a reviewed linear chain may be prepared. If applied, preserve migration history and design a forward-compatible repair/merge. Do not rewrite an applied revision or assume a no-op merge fixes conflicting CHECK definitions.
3. Produce one migration head and a union of accepted Order states. Test upgrade from actual supported predecessors and legacy data; ensure no later migration removes states allowed by an earlier one.
4. Reconcile `uq_orders_active_product` with terminal/reservation semantics. Unpaid expiry must allow purchase again. Completed items remain sold; returned failed items remain unavailable unless a separate relisting rule permits otherwise.
5. Reconcile model CHECKs, Pydantic enums, API serialization, mobile decoder/types/labels and action flags. Preserve all existing states, not only whichever PR merged last.
6. Use persisted payment evidence (`paid_at`/Payment) to represent payment, not `status != WAITING_PAYMENT`. Keep `can_pay` and `can_cancel` limited to their explicitly allowed states. Cancelling an unpaid order must not make it appear paid.
7. Preserve authorized Order/receipt/history access across all later states and use the accepted role-specific address policy. Do not equate buyer acceptance of inspection with physical delivery.
8. If #92's Admin feature remains, keep its existing shared admin authorization and privacy/audit design; it must not grant public/ordinary users access to orders.
9. Document BE-first compatible deployment, mobile build compatibility, named DB operator, rollback limits and recovery from nonempty new tables.

### Required verification

- [ ] Single Alembic head; upgrade on isolated PostgreSQL from baseline with unpaid and paid Orders, Payment/Escrow/Receipt rows intact.
- [ ] Upgrade from any already-applied branch revision the team actually uses, or explicitly documented unsupported path and safe recovery; no untested claim of migration compatibility.
- [ ] Each accepted Order state survives write/read through DB → API → mobile; cancelled unpaid orders remain unpaid, and later paid orders retain receipts.
- [ ] Expiry/payment race has one valid winner; expiry releases the reservation; payment does not leave a paid order available for resale.
- [ ] Existing Order, Product, inspection FK/RLS, finalized evidence and rollback/race regressions pass at the **combined SHA**.
- [ ] No automatic action appears on a state that the server forbids; unknown future mobile states fail safely without enabling payment/cancel.
- [ ] Main UI navigation still reaches Seller/Inspector/Buyer flows after stack reconciliation.

Do not merge all existing migrations mechanically or run tests that reset a configured shared database. Pure planning review has not performed this integration.

## 4. Acceptance work that can start now

Use #50 and #63, plus their linked implementation issues. Record commit/build SHA, environment label, device/OS, actor role, operation, expected/actual, resulting row IDs/counts and evidence location. Redact tokens, signed URLs, personal documents and account secrets.

| Scenario | Required observation | Evidence type |
|---|---|---|
| Seller publish/discover/edit/cancel | Same product ID and ordered images through owner and public reads; after cancel public view excludes it | Real API + DB/private Storage + Android |
| Unauthorized product changes | Anonymous, Buyer, pending/rejected Seller and other Seller cannot write | API status/body and no DB change |
| Guest purchase/login return | Real Google flow returns to intended product once; no automatic order creation | Android OAuth/deep link + backend identity |
| Buyer checkout and pay | Server amount snapshot, one reservation, one successful Payment/Escrow/Receipt | API + database rows + mobile display |
| Duplicate/uncertain request | Same idempotency key returns original operation; conflicting payload rejected | API + persisted row counts |
| Two buyers race | One reservation winner; loser conflict; no inconsistent Product state | Isolated PostgreSQL concurrency test |
| Session/account switch | No previous-account orders/private photos/return intent retained | Component/logic regression plus device observation |
| API unavailable/timeout | Draft preserved, error/retry honest, no fabricated success or duplicate creation | Controlled API fault + mobile |

The 26 September local passes are a regression baseline, not substitutes for these rows. Close individual implementation criteria when verified; keep feature-level QA open until its own required evidence exists.

## 5. CERT work remaining after #94

Use [CERT-spec.md](CERT-spec.md) for the current detailed contract, subject to DOC-01. Do not duplicate its implemented subset.

| Issue | VERIFIED work in #94 | Remaining implementation / acceptance |
|---|---|---|
| CERT-01 DB | Unique certificate per Order/Inspection, public token, result, timestamp | Add buyer decision with unique Order/Inspection relationship; reconcile certificate status/revocation metadata and migration history |
| CERT-02 BE | Qualifying-result issuance in same transaction, failure rollback code | Revalidate on latest #93 + integrated Order; all four results, concurrent result replay, issuance failure recovery |
| CERT-03 FE1 + BE | `/certificates/{token}` returns JSON | Public HTML page and QR destination; no user-entered product name, PII, private evidence or raw Inspector notes; HTTPS scan on phone without app/login |
| CERT-04 BE | Buyer-only result GET and private evidence reads | Decision endpoint, persistent idempotency/decision-once, `can_decide`, `decision`, `next_action`; historical reads after fulfillment |
| CERT-05 FE2 | #95 has Buyer result panel/link | Actual QR and decision controls, selected-evidence loading, session cleanup, timeout resolution, finalized-state refresh |
| CERT-06 QA | Author-reported INSPECT flow tests | Integrated decision/concurrency/privacy tests plus browser/Android proof |
| CERT-07 conditional | No revocation support | If FR-23 retained: admin-only revoke with reason/audit, persistent REVOKED state, safe public invalidation and mobile display |

### Minimum decision contract

DOCUMENTED in existing CERT spec: use the current Order owner, not client-supplied buyer identity; one immutable final decision per Order; CONFIRM or REJECT; negative results already route to return. Final field/path naming must be checked against the accepted CERT contract before implementation.

- Only the active owning buyer can mutate; other owners receive the established 404/403 policy. If UX-00 allows Seller buyers, evaluate order ownership and allowed purchaser capability consistently, including evidence reads.
- Allow a first decision only for qualifying results in `RESULT_NOTIFIED`, while escrow is held. Inspection-result REJECT follows the existing CERT rule: an optional reason up to 500 characters. A later report that the parcel was not received requires a separate reason under FULFILLMENT-00.
- Commit decision and its idempotency record together. Same key/payload replays; changed payload under same key conflicts; competing CONFIRM/REJECT permits one winner. Client timeout must reuse its original key/read persisted decision.
- Decision changes `next_action`, not physical shipment or escrow. CONFIRM → SHIP_TO_BUYER; REJECT or negative result → RETURN_TO_SELLER; undecided positive → WAIT_BUYER_DECISION.
- Keep result and selected evidence readable by their authorized audience after shipping/completion/refund. The current `order.status == RESULT_NOTIFIED` GET restriction must be widened deliberately.
- Public HTML uses an allowlist of certificate number, issue time, inspection result and status, plus deliberately approved public product imagery if supported. Do not serialize the private Order object or derive public fields from user-entered raw notes/names.
- Adopt the existing CERT cache/referrer/indexing and HTML escaping rules. Test response body and network requests, not only visible text. A JSON URL opened by a QR reader does not satisfy the HTML acceptance criterion.

## 6. FINISH-00 — Final delivery and money contract

**Owner:** Lead with BE/DB/QA. **Status:** product behavior selected in [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md); API/table names proposed for team integration. **Purpose:** make FINISH-01…06 implementable with one delivery and money rule.

### State transitions

The high-level transitions are DOCUMENTED by the state diagram/backlog. Trigger API and internal ledger design below are PROPOSED.

| Before | Trigger and guard | After | Money effect |
|---|---|---|---|
| RESULT_NOTIFIED | CONFIRM persisted for PASS/MINOR_ISSUE; create TO_BUYER shipment | SHIPPING_TO_BUYER | Escrow remains HELD |
| RESULT_NOTIFIED | Negative result or persisted REJECT; create TO_SELLER shipment | RESULT_NOTIFIED while return is in transit | Escrow remains HELD |
| SHIPPING_TO_BUYER | Assigned Courier uploads photos and confirms TO_BUYER delivery | DELIVERED_PENDING_BUYER; set `receipt_deadline_at` to Server proof time + 72 hours | Escrow remains HELD |
| DELIVERED_PENDING_BUYER | Buyer confirms receipt, or recurring worker sees deadline with no non-receipt report | COMPLETED in same settlement transaction | Escrow RELEASED; one release record |
| DELIVERED_PENDING_BUYER | Buyer reports not received before deadline | DELIVERY_DISPUTED | Escrow remains HELD; Admin resolves with audit |
| DELIVERY_DISPUTED | Admin reviews evidence and records a reasoned release/refund decision | COMPLETED or REFUNDED | Exactly one terminal settlement, with audit |
| RESULT_NOTIFIED with return leg | Assigned Courier photos and confirms TO_SELLER delivery | RETURNED_TO_SELLER | Escrow remains HELD until refund succeeds |
| RETURNED_TO_SELLER | Refund transaction succeeds | REFUNDED | Escrow REFUNDED; one refund record |

Keep completion truthful on failures: a delivered parcel with a failed settlement remains visibly awaiting settlement, with a safe retry. Do not mark COMPLETED before release or REFUNDED before persisted refund. Courier proof and Buyer receipt are separate operations; the receipt/eligible timeout and money release are committed atomically.

### Actor/permission proposal

- Buyer/Seller read only Orders they own. Buyer makes the CERT decision; Seller cannot decide for Buyer.
- Inspector prepares center outbound/return shipments and confirms receipt at center; assigned active COURIER uploads photo and confirms delivery of each assigned leg. COURIER is operator-provisioned and sees only its shipment.
- Buyer confirms receipt or reports non-receipt only on its own Order. Backend settlement service releases on Buyer receipt or eligible 72-hour worker run, and refunds on return delivery or seller no-ship; Admin resolves a disputed delivery with reason and audit. Buyer/Seller cannot submit arbitrary money/status.
- No anonymous action or payment-provider callback trusts client-supplied `delivered`, `paid`, `buyer_id`, `seller_id` or money.
- New simulated commands must be disabled by default and unavailable in production under the agreed environment guard, consistent with existing payment simulation.

### Selected simulated amounts

VERIFIED current snapshot example: item `1200.00`, shipping `50.00`, inspection `100.00`, commission `60.00`, buyer total `1350.00`, seller payout `1140.00`.

The release allocation preserves that contract:

```text
held total = seller payout + commission + inspection fee + shipping allocation
1350.00    = 1140.00       + 60.00      + 100.00         + 50.00
```

These are simulated internal allocations, not proof of external bank/carrier transfers. Use original immutable Order snapshots and Decimal/NUMERIC arithmetic; send money as decimal strings. Do not reprice old orders from current fee configuration or subtract inspection fees from the seller again.

Refund the original buyer total `1350.00` in full; seller payout `0.00`, with fee reversals represented consistently. No extra return charge in the prototype. Never bury this rule in a test fixture or reprice older Orders.

Product completion: `SOLD` after successful sale; `CANCELLED`/unlisted after return/refund, especially FAKE/NOT_AS_DESCRIBED. Relisting requires an explicit later workflow.

## 7. FINISH issue-ready work

### FINISH-01 — Database and exactly-once settlement constraints

**Owner:** DB1, independent DB2 review. **Depends:** INT-01, FINISH-00, accepted CERT decision schema.

Extend the existing Shipment model, rather than adding another shipment system: inbound TO_CENTER already exists in #93. Add TO_BUYER/TO_SELLER legs, COURIER assignment, private proof rows, `DELIVERED_PENDING_BUYER`/`DELIVERY_DISPUTED`, receipt deadline/confirmation fields and terminal states/escrow states with a migration from the reconciled head.

PROPOSED minimum financial record is an immutable `order_settlements` table with unique `order_id` and unique `escrow_id`, kind RELEASE/REFUND, currency, total amount, allocation fields, recipient reference where appropriate, actor/operation reference and server timestamp. One terminal settlement row per escrow prevents both release and refund, including races. If team chooses a separate ledger instead, it must enforce the same cross-operation invariant, not only separate unique constraints in independent release and refund tables.

Store status history with from/to state, event, actor/operation and server UTC timestamp; use unique event/idempotency references where appropriate. Add shipment unique `(order_id, leg)` and prevent contradictory outbound legs under the Order lock. Delivery proof must be private, immutable after confirmation, and attributable to the assigned COURIER; the 72-hour deadline is based on Server-confirmed proof time. Finalized inspection and certificate constraints remain intact.

Acceptance:

- [ ] Isolated PostgreSQL upgrade preserves existing Order/payment/evidence/certificate records; downgrade does not silently discard new terminal/financial data.
- [ ] Monetary constraints validate snapshot totals; foreign keys bind settlement to the correct Order/escrow; direct invalid writes fail where enforceable.
- [ ] Two releases, two refunds and simultaneous release/refund cannot produce two terminal settlements.
- [ ] New private tables have the team's RLS/access policy; no direct anonymous/authenticated bypass.
- [ ] Order history, delivery proof and money records are auditable and not destructively rewritten by retries.

### FINISH-02 — Start/deliver outbound or return shipment

**Owner:** BE. **Depends:** FINISH-01, CERT-04; negative-result return does not require a buyer decision.

Proposed commands: `POST /orders/{id}/fulfillment` with `{carrier, tracking_number}`; server derives the leg from persisted result/decision. The assigned COURIER uploads 1–3 private photos via `POST /shipments/{id}/delivery-proofs`, then calls `POST /shipments/{id}/confirm-delivery`. A photo upload alone does not mark delivery. Inspector separately receives TO_CENTER at the center. Full request/response and role contract is in [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md).

These commands use `Idempotency-Key`, strict bodies and active actor authorization. Lock Order first, then affected shipment/escrow in a documented consistent order. Do not accept an arbitrary new Order status or a client-selected destination party. Retrying the same command must not create another shipment or advance time twice.

Acceptance:

- [ ] PASS/MINOR_ISSUE + CONFIRM produces TO_BUYER; REJECT or either negative result produces TO_SELLER.
- [ ] Undecided positive, unpaid, wrong-owner/operator, wrong shipment or wrong state is rejected without writes.
- [ ] Same key/body replays; changed payload conflicts; concurrent requests leave one leg and no contradictory destination.
- [ ] Return-in-transit remains RESULT_NOTIFIED with explicit fulfillment detail; proven return delivery changes to RETURNED_TO_SELLER. Proven Buyer delivery changes to DELIVERED_PENDING_BUYER and starts the Server deadline.
- [ ] Missing/invalid photos, unassigned Courier and missing center receipt acknowledgement cannot advance shipment or start a timer.
- [ ] Fulfillment failure leaves truthful, refreshable server state and can be retried without duplication.

### FINISH-03 — Release held escrow after buyer delivery

**Owner:** BE. **Depends:** FINISH-01/02, COURIER-01/02, TIMER-01 and the selected fee policy.

Release is reached by Buyer `POST /orders/{id}/confirm-receipt` after Courier-proven TO_BUYER delivery and strictly before `receipt_deadline_at`, or by the recurring worker when Server time reaches that deadline and no timely non-receipt report exists. Both call one settlement service with a stable operation key. Backend checks qualifying inspection, persisted inspection-result CONFIRM, immutable proof/TO_BUYER delivery, held escrow, successful original payment, no delivery dispute and no terminal settlement. Commit receipt confirmation source (`BUYER`/`AUTO`), allocation/ledger, escrow RELEASED, Product SOLD, Order COMPLETED and history together. The Buyer does not choose any amount.

Acceptance:

- [ ] Delivery proof alone or inspection-result CONFIRM alone cannot release funds; Buyer receipt or eligible 72-hour worker event is required.
- [ ] Before the exact deadline money stays HELD. At/after deadline, a successful scheduled run with no timely non-receipt report releases once even if no API is called.
- [ ] A report committed before deadline prevents automatic release; Admin resolution records evidence, reason and audit, then invokes the same release/refund service.
- [ ] Amounts reconcile exactly to the original escrow and chosen fee policy.
- [ ] Repeated/concurrent release returns existing result or the contracted conflict; it never credits twice.
- [ ] Opposing refund loses deterministically; injected failure rolls all money/status effects back.
- [ ] Buyer/Seller cannot alter recipient, amount or ledger entries; original receipt remains readable.

### FINISH-04 — Refund after return delivery

**Owner:** BE. **Depends:** FINISH-01/02 and accepted refund policy.

The backend initiates refund after Courier-proven TO_SELLER delivery for a negative inspection or persisted REJECT. Seller no-ship after three days is a separate eligible refund reason with no return leg. Admin may resolve a buyer non-receipt report as refund after evidence review. All routes use the same idempotent service and selected full-refund formula. Require held escrow, original payment, eligible reason and no terminal settlement. Commit refund record, escrow REFUNDED, Order REFUNDED, final Product state and history atomically. Keep original payment and receipt as historical records; expose refunded payment status/history without deleting the successful charge.

Acceptance:

- [ ] An in-transit return cannot refund under this rule; Courier proof at Seller destination is mandatory for the return path. Seller no-ship and Admin non-receipt resolutions use their separately recorded reasons.
- [ ] Both negative results and buyer rejection follow the correct route; refund formula matches FINISH-00.
- [ ] Same-key retry and concurrent refund produce one operation; release/refund cannot both settle the escrow.
- [ ] Injected failure leaves a safe retry state, and no seller payout exists on the refund path.
- [ ] Returned/fake product is not automatically public/available again under the proposed listing policy.

### FINISH-05 — Final order views

**Owner:** FE1, FE2 integration support. **Depends:** accepted response fixtures; live integration after FINISH-02…04.

Extend existing Order detail/list. Show direction and status of shipment, delivery-proof timestamp, 72-hour receipt deadline, separate inspection decision and receipt decision, final money outcome and history appropriate to role. Buyer sees “ยืนยันว่าได้รับสินค้า” and “ยังไม่ได้รับสินค้า” after Courier proof; the inspection-result button uses different wording. COURIER sees only assigned photo/confirm tasks. Show “awaiting settlement/refund” after delivery if money action has not succeeded. Preserve receipt and inspection/QR access. Use server `allowed_actions`/equivalent contract for operator commands; hide unavailable actions and still enforce them on backend.

Acceptance: loading/error/refresh, return-in-transit, completed/refunded, failed settlement retry, safe timeout recovery, expired session/account switch and persistent state after reopening are verified in components and an API-backed Android run. Never calculate payable/refundable money in the client or claim a real bank transfer.

### FINISH-06 — End-to-end success/refund acceptance

**Owner:** QA2, QA1 API/DB and DB2 data support. **Depends:** all FINISH tasks plus integrated CERT/INSPECT.

| Case | Required terminal outcome |
|---|---|
| PASS → inspect CONFIRM → Courier photo + buyer delivered → Buyer receipt CONFIRM | One RELEASE, COMPLETED, Product SOLD |
| MINOR_ISSUE → inspect CONFIRM → Courier photo + buyer delivered → 72h no response | One AUTO RELEASE, certificate truthfully states MINOR_ISSUE |
| PASS/MINOR_ISSUE → inspect REJECT → Courier proof of Seller return | One full REFUND, no RELEASE; certificate still attests inspection |
| NOT_AS_DESCRIBED → Courier proof of return | One full REFUND, no certificate or buyer inspect CONFIRM |
| FAKE → Courier proof of return | One full REFUND, no certificate; product remains unlisted |
| Buyer reports not received before 72h | HELD, no auto-release; Admin audited resolution leads to one RELEASE or REFUND |
| Courier photo missing/invalid, wrong assignment, failed upload | No DELIVERED/deadline/money transition |
| Race/replay/lost response at decision, Courier proof, receipt, worker, release or refund | One valid persisted result; consistent Order/Product/escrow/history |
| Settlement insert failure | No partial COMPLETED/RELEASED or REFUNDED combination; retry succeeds once |
| Cross-owner/role/private-image/public-QR probe | No unauthorized access or mutation |

Use isolated PostgreSQL for migration/constraint/race/rollback proof and real Android/browser observations for UI/QR acceptance. Record row counts and references, not secret data. If an environment-only step is pending, leave that criterion pending instead of reporting the feature complete.

## 8. Conditional SRS work and deferred scope

The first four items are now part of the selected fulfillment scope. Remaining items are recorded gaps to schedule under DOC-01:

| Proposed item | Requirement / acceptance focus |
|---|---|
| ORDER-08 scheduler | Unpaid 30-minute expiry without API traffic; UTC boundaries, bounded batch, restart-safe overlap, payment race and observable failed runs |
| SLA-01 | Seller 3-day shipping countdown from `paid_at`, full refund on no shipment, no automatic public relisting |
| SLA-02 | Inspection 3-business-day reminder/escalation with Bangkok weekday calendar; never fabricate a result |
| TIMER-01 | Buyer 72-hour **receipt** auto-release from Courier-proven TO_BUYER delivery, not inspection-result auto-CONFIRM; missing-delivery report and worker race tested |
| CERT-07 | FR-23 revoke with authorization/reason/audit and reliable public REVOKED display |
| NOTIFY-01 | FR-13/18/33 durable event/in-app notification versus FCM scope; delivery retry/dedup and privacy |
| REVIEW-01 | FR-37/38 completed-order owner only, one review per chosen type/order, safe public display; not verification review |
| ACCOUNT-01 | FR-03 agreed editable profile fields and legacy-account behavior |
| ADMIN-USER-01 | FR-41 minimum suspension/restore permissions, reason/audit, active-check regression |
| PRIVACY-01 | NFR-05 consent/privacy notice and access/correction/deletion process; align actual retention/purge behavior with accepted policy |
| PRODUCT-FILTER-01 | Remaining FR-08 brand/price/size/condition contract if retained |
| NFR-QA-01 | Agreed performance dataset/load, Android compatibility and measured Thai usability evidence |
| CI-01 | Optional repeatable backend/mobile checks and disposable PostgreSQL integration in CI; empty PR check snapshots currently provide no automated merge evidence |

Auction, chat, chatbot, wishlist, disputes, dashboards, trust-score automation, real withdrawal and inspection appeals are explicitly outside the SRS prototype. Real payment/shipping integrations also remain excluded. Do not add them to the critical path.

## 9. Definition of a reviewable handoff

Each implementation issue should deliver: exact base/head and contract revision, changed behavior and files, relevant tests with pass/fail/skip counts, migration/rollback impact, API request/response/error examples, and remaining environment/device evidence with a named owner.

For review/merge, distinguish schema/code integration from staging rollout and final feature acceptance. No applied shared migration or deployed route may be inferred from a merged PR. No mock/demo login may be used to close real Google OAuth acceptance.

For the final demo, pin one tested Android build and backend revision, verify the public QR origin from another device, provide repeatable synthetic data and an operator runbook, then demonstrate both terminal financial paths. If the final deliverable follows reduced scope, list the explicitly deferred FR/NFR items alongside the demo evidence.
