> Historical contract snapshot copied 1 Oct 2026. Current scope/gates: ../DOC-01-scope.md and ../FINISH-00-release-gates.md. Old baseline coordinates and proposed decisions do not override the selected submission rules. External local links not supplied in this packet are labeled historical references.

# FINISH — delivery, receipt confirmation, settlement and refund

Revision: **FINISH v1, 26 September 2026**. Owner: Lead. Audience: BE, DB1/DB2, FE1/FE2 and QA1/QA2.

**Status: implementation planning specification; upstream integration gates remain open.** This document defines FINISH-00…06 and the interfaces needed from COURIER and TIMER. It does not assert that GitHub issues exist, PRs have merged, shared migrations have run, or feature acceptance has passed. Task IDs are planning IDs, not GitHub issue numbers. Use [FINISH-AI-handoff.md](FINISH-AI-handoff.md) to start an implementation session.

## 1. Outcome and authority

Finish both prototype journeys using persisted API/DB/private Storage state:

1. `PASS`/`MINOR_ISSUE` → Buyer accepts **inspection result** → delivery to Buyer with Courier proof → Buyer confirms **receipt**, or the 72-hour deadline becomes eligible → one simulated RELEASE → `COMPLETED`.
2. `NOT_AS_DESCRIBED`/`FAKE`, or Buyer rejects a qualifying result → return to Seller with Courier proof → one full simulated REFUND → `REFUNDED`.

Also support the already-selected exceptions: seller fails to ship within 72 hours of payment → full refund; Buyer reports non-receipt before the receipt deadline → hold money for audited Admin resolution.

Product rules come from [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md); the feature boundary comes from the backlog (historical reference, not included). [CERT-spec.md](CERT-spec.md) owns result acceptance, [INSPECT-spec.md](INSPECT-spec.md) owns inbound shipment and inspection, and the Order state diagram (historical reference, not included) illustrates the selected states. This spec makes FINISH interfaces concrete without changing those product rules. Its new API/schema details are Lead proposals for this revision; reconcile actual upstream names at gate G0 and update all affected contracts together.

Included: outbound/return shipment, private delivery proof integration, receipt actions, minimal non-receipt resolution, exactly-once simulated settlement, retry worker integration, final Order views and acceptance evidence.

Excluded: real payment/carrier providers, wallet/withdrawal, partial refunds, extra return fees, relisting returned products, post-completion returns, general dispute/appeal systems, push notifications, certificate issuance changes and unrelated UI redesign. The full project's unpaid-expiry and inspection-reminder jobs retain their existing owners; FINISH consumes their interfaces where needed.

## 2. Verified local baseline and implementation gates

Inspected checkout: `secondhand-marketplace-android-app`, branch `feat/marketplace-design-ui`, HEAD `b342523591b7f0b0a00d1ca0b74b6364cde33172`. This is a local observation, not a claim about current remote main or open PRs.

| Observed source | Consequence for FINISH |
|---|---|
| Order models (historical reference, not included) contain Order, PaymentAttempt, Payment, Escrow and Receipt; Order states are only `WAITING_PAYMENT`/`WAITING_SELLER_SHIP`, Escrow only `HELD` | Extend the integrated models and constraints; do not create parallel payment/escrow tables |
| Order API (historical reference, not included) has persistent create/payment idempotency and Order row locking | Reuse its auth/error/key conventions; add persistent records for the new commands |
| That API's `is_paid()` uses `status != WAITING_PAYMENT` | Before adding cancelled/refunded states, derive payment history from Payment/`paid_at`; a status comparison is insufficient |
| Order schema (historical reference, not included) and mobile service (historical reference, not included) accept only the two initial states | Expand DB, API, decoder and labels together; retain historical receipt access |
| Pricing service (historical reference, not included) uses Decimal, 50.00 shipping, 100.00 inspection and 5% commission | Settle original Order snapshots; never reprice at delivery |
| User model (historical reference, not included) has BUYER/SELLER/ADMIN/INSPECTOR; route registration (historical reference, not included) has no shipment/inspection/certificate router | COURIER and integrated INSPECT/CERT are dependencies, not implemented features in this checkout |

There are existing mobile edits and untracked UX/prototype documents. Preserve them. Planning files live outside the nested Git repository; the handoff must explicitly include them or copy this reviewed revision into the implementation branch before remote review.

| Gate | Required evidence before dependent implementation |
|---|---|
| **G0: common base and contracts** | Record actual base/head, applicable AGENTS instructions, migration graph and applied-history assumptions. Compare integrated ORDER/INSPECT/CERT against these documents. Resolve overlapping status constraints and assign one owner per shared migration/file. Historical PR references in NEXT-WORK are not current merge evidence |
| **G1: inspect/decision inputs** | Real Order → Payment/Escrow → TO_CENTER delivery + Inspector receipt → final Inspection and qualifying Certificate. One immutable Buyer decision per qualifying result, with negative results requiring none. FK/ownership links agree |
| **G2: delivery inputs** | COURIER role, operator provisioning, assignment, private proof upload/read/confirm and all three legs share one implementation. Snapshot destinations exist: Buyer from Order shipping snapshot; Seller return destination from a verified upstream snapshot. Current inspected Order only contains Buyer address fields; locate or add the missing Seller snapshot through an explicitly scoped upstream task before return-shipment implementation |
| **G3: settlement/runtime** | Combined schema, shared settlement service, worker command and configuration guards pass isolated PostgreSQL checks. Actual test environment has private Storage and worker deployment; fixture-only execution is not runtime evidence |
| **G4: acceptance** | Both Android journeys, exception/race matrix and privacy checks have evidence at the same integrated revision |

G2 destination choice: reuse an immutable sender/return-address snapshot if the integrated inbound contract has one. Otherwise add a Seller-owned validated return-address snapshot to the inbound shipping workflow, reusing the Order address validator. Do not use Buyer destination, an editable profile at return time, or Inspector-supplied arbitrary destination as fallback. Existing Orders with no valid snapshot return `409 fulfillment_destination_missing`; synthetic demo data may be backfilled explicitly, never by fabricated production data.

## 3. Business invariants and states

### 3.1 Invariants

- Each paid Order has one original successful Payment and Escrow. Each Escrow/Order has **at most one terminal settlement of either kind**. Separate unique RELEASE and REFUND tables alone do not enforce this.
- Inspection acceptance and receipt confirmation are different immutable facts. CERT `CONFIRM` never releases money. Courier delivery to Buyer starts the clock and never releases money by itself.
- Use server UTC timestamps. `receipt_deadline_at = TO_BUYER.delivery_proof_confirmed_at + 72 hours`; retries never move that timestamp.
- Buyer receipt/report commands require `now < deadline`; AUTO requires `now >= deadline`. Sample database wall-clock time after acquiring the Order lock, not the request start, client clock, or PostgreSQL transaction-start `now()` after a long lock wait. Recheck immediately before the conditional write. A Buyer action committed before the deadline always excludes the worker. In a transaction crossing the boundary, the guarded DB write under the lock is the ordering point; never promise request-arrival ordering.
- A timely non-receipt report persists `DELIVERY_DISPUTED` and `HELD`; there is no subsequent automatic release. Only audited Admin resolution chooses RELEASE/REFUND, with no client-selected amount.
- A return's physical delivery and refund are separate durable facts. Preserve confirmed proof if a later refund attempt fails; leave `RETURNED_TO_SELLER` + `HELD` and retry settlement.
- Buyer receipt confirmation and its RELEASE are one transaction. Failure leaves neither receipt confirmation nor partial money changes. AUTO and Admin settlement follow the same atomic boundary.
- Product remains `RESERVED` during paid fulfillment, becomes `SOLD` with RELEASE, and `CANCELLED` with any REFUND. No automatic relisting. Original Payment and Receipt remain immutable historical records.
- PASS/MINOR_ISSUE certificate remains an inspection record after Buyer rejection/refund. FINISH cannot issue, delete or revoke it.

### 3.2 Transition table

All transitions require successful original payment, correct ownership/operator authority and `HELD`, except replay of an already committed command. Keep all upstream states; add the FINISH states below across every layer.

| From | Trigger/guard | To | Money |
|---|---|---|---|
| `RESULT_NOTIFIED` | Assigned Inspector starts outbound; PASS/MINOR_ISSUE + persisted CONFIRM | `SHIPPING_TO_BUYER`, create TO_BUYER IN_TRANSIT | HELD |
| `RESULT_NOTIFIED` | Assigned Inspector starts return; negative result or persisted REJECT | Remain `RESULT_NOTIFIED`, create TO_SELLER IN_TRANSIT | HELD |
| `SHIPPING_TO_BUYER` | Assigned Courier confirms readable proof | `DELIVERED_PENDING_BUYER`, fixed deadline | HELD |
| `DELIVERED_PENDING_BUYER` | Owning Buyer confirms receipt before deadline | `COMPLETED`, receipt source BUYER | RELEASED |
| `DELIVERED_PENDING_BUYER` | Eligible worker at/after deadline, no report, readable proof | `COMPLETED`, receipt source AUTO | RELEASED |
| `DELIVERED_PENDING_BUYER` | Owning Buyer reports missing before deadline | `DELIVERY_DISPUTED` | HELD |
| `DELIVERY_DISPUTED` | Admin audits and resolves RELEASE | `COMPLETED`, settlement source ADMIN_RESOLUTION | RELEASED |
| `DELIVERY_DISPUTED` | Admin audits and resolves REFUND | `REFUNDED`, settlement source ADMIN_RESOLUTION | REFUNDED |
| `RESULT_NOTIFIED` + return IN_TRANSIT | Assigned Courier confirms return proof | `RETURNED_TO_SELLER` | HELD pending refund |
| `RETURNED_TO_SELLER` | Settlement service verifies confirmed readable return proof | `REFUNDED` | REFUNDED |
| `WAITING_SELLER_SHIP` | Worker at/after `paid_at + 72h`, no committed inbound shipment/`shipped_at` | `REFUNDED`, reason SELLER_NO_SHIP | REFUNDED |

Admin resolution does not fabricate Buyer receipt fields: keep `receipt_confirmed_at`/`receipt_confirmation_source` null and record separate resolution time/actor/source. An Order with missing inspection decision cannot ship to Buyer. Return in transit is distinguishable through Shipment even though its Order remains `RESULT_NOTIFIED`.

## 4. Permissions and private evidence

| Actor | Allowed operations/data |
|---|---|
| Owning Buyer | Read own delivery/final money, own delivery proof across relevant legs; confirm receipt/report missing on eligible own Order; retain Order/receipt reads for inactive accounts under existing ORDER policy |
| Owning Seller | Read own progress, inbound/return proof, own payout/refund outcome; no TO_BUYER photo/address access through these new endpoints; no receipt confirmation/refund trigger |
| Assigned Inspector | Start the one outbound/return leg for their finalized inspection; read shipment/proof for their work and only the destination needed for dispatch; no settlement mutation |
| Assigned active Courier | Assigned shipment queue/detail, current leg destination, upload/confirm only that leg; no Payment, inspection findings, certificates, identity documents or unrestricted Order detail |
| Active Admin | Assign Courier; inspect a non-receipt case with logged access reason; resolve it with reason and evidence references; no arbitrary money/status editor |
| Worker/service | Server-derived eligibility and amount only; no unauthenticated HTTP shortcut |

Every new mutation requires ACTIVE actor, relevant ownership/assignment and an enabled prototype environment. Operator roles cannot self-register. Buyer authority follows owning `orders.buyer_id` and the accepted purchase-role contract; FINISH does not independently adopt the untracked Seller-as-Buyer UX proposal.

Authenticate before reading resource details. Unrelated objects return 404 (`order_not_found`, `shipment_not_found`, `proof_not_found`). A related Seller attempting Buyer-only actions gets 403 `not_order_buyer`. Authorized operator with wrong action role gets 403; unassigned operators cannot enumerate other work. Read endpoints and image responses use `Cache-Control: no-store`. Recheck authorization on retries, including revoked assignments; a cached command result must not bypass it.

Proof: 1–3 selected, distinct, successfully stored JPEG/PNG still images, each >0 and ≤5 MiB. Validate actual decoded content/format, size and safe image dimensions; ignore supplied MIME as proof of type. Persist server-generated private key, hash, uploader, size/type and UTC timestamps. Strip metadata exposing location/device details when preparing the stored image. Hash the bytes actually stored; separately fingerprint uploaded bytes for request replay. Client cannot submit an arbitrary URL/object key.

Check private objects are readable at delivery confirmation and before any proof-dependent settlement, including Buyer, AUTO, Admin RELEASE and return REFUND. A storage outage/missing object leaves money HELD, records a retryable operational error and exposes no private key. Admin REFUND for non-receipt may proceed on audited available evidence without asserting the missing photo exists. This is not an atomic DB/Storage guarantee: prohibit ordinary deletion/replacement of finalized objects, revalidate selected IDs/metadata under lock, and retain proof references after settlement.

Pending upload cleanup must reconcile uncertain DB commits before deletion and must never delete a referenced or confirmed proof. Reassignment is allowed only before any proof upload, with reason/audit. No standard edit/delete API for confirmed proof. Return-proof requirements cannot be bypassed by a Seller button.

## 5. Data and transaction contract

Proposed physical names below are binding for new work unless G0 finds an equivalent integrated model; document that mapping once and reuse it.

| Model/extension | Required fields and constraints |
|---|---|
| `shipments` (extend INSPECT) | Existing FK/order/leg/carrier/tracking/shipped fields; `assigned_courier_id`, immutable destination snapshot, `delivered_at`, `delivery_proof_confirmed_at`; status IN_TRANSIT/DELIVERED. Unique `(order_id, leg)` plus partial unique on `order_id WHERE leg IN ('TO_BUYER','TO_SELLER')` to exclude contradictory outbound legs |
| `shipment_delivery_proofs` (COURIER owner) | Shipment FK, private key unique, hash/type/size, uploader/uploaded time, confirmed time. Confirmation binds 1–3 selected proofs from the same shipment and Courier. Lock Shipment to enforce count/immutability across concurrent uploads/confirm |
| `orders` (extend) | Receipt deadline, nullable receipt-confirmed time/source BUYER or AUTO; nullable missing-report timestamp/reason; extend status CHECK. Required field pairs/checks prevent source without timestamp and confirmed receipt with a missing report. Admin resolution is separate |
| `escrows` (extend) | HELD/RELEASED/REFUNDED and settlement timestamp. Preserve original held amount/payment relationship |
| `order_settlements` | PK, unique `order_id`, unique `escrow_id`, payment FK, kind RELEASE/REFUND, reason/source, currency, held amount, seller/buyer recipient references, seller payout, buyer refund, commission, inspection and shipping allocations, actor or worker operation, settled_at. Immutable terminal record |
| `fulfillment_commands` | Actor scope (USER id or named SYSTEM worker), action, resource type/id, key, canonical request hash, stable result references and committed time; unique across `(actor_scope, action, resource_type, resource_id, key)`. Persist in same transaction as the business write. Reuse equivalent upstream operation table if present |
| `delivery_resolutions` | Unique Order, RELEASE/REFUND, reason, audit evidence references, Admin ID and timestamp; commit with settlement. Never overwrites original Buyer report |
| `order_status_history` | Order, before/after, event, actor/source, operation reference, UTC time. Unique operation/event reference; append only, including shipment events with unchanged Order status |

Financial database requirements:

1. `order_settlements` must reference the matching `(escrow_id, order_id, held_amount)` and `(payment_id, order_id, held_amount)`, using composite FKs backed by unique tuples. Also bind `(order_id, held_amount, currency)` to the Order snapshot. Independent FKs alone allow cross-Order mismatches.
2. Use `NUMERIC(12,2)`/Decimal, nonnegative allocations and a kind-specific sum CHECK. RELEASE: buyer refund = 0 and `held_amount = seller_payout + commission + inspection + shipping`. REFUND: buyer refund = held amount; seller payout/retained allocations = 0. Validate individual release allocations equal the original Order snapshots in the locked service, with integration tests.
3. Bind release recipient to Order Seller and refund recipient to Order Buyer; client cannot select either. Preserve original successful Payment/Receipt. Read-model `payment_status=REFUNDED` comes from the terminal settlement; a successful historical charge is not rewritten as a failed payment.
4. Keep reservation-index semantics explicit. Existing `uq_orders_active_product` excludes only CANCELLED Orders; do not broaden it to make refunded stock buyable. FINISH does not implement relisting.
5. Enable RLS with no direct anon/authenticated write/read bypass on private tables, consistent with the existing backend-mediated Order policy. Secrets and Storage service keys remain server-only.

Example from existing pricing snapshots (THB):

| Kind | Held | Seller | Buyer refund | Commission | Inspection | Shipping |
|---|---:|---:|---:|---:|---:|---:|
| RELEASE | 1350.00 | 1140.00 | 0.00 | 60.00 | 100.00 | 50.00 |
| REFUND | 1350.00 | 0.00 | 1350.00 | 0.00 | 0.00 | 0.00 |

These are internal simulated allocations, not external transfers. A second financial ledger is unnecessary unless an integrated implementation already requires it; if present, write it atomically and reconcile it against the single settlement record.

Settlement enums for v1: `source=BUYER_RECEIPT|AUTO_RECEIPT|RETURN_DELIVERY|SELLER_NO_SHIP|ADMIN_RESOLUTION`; `reason=RECEIPT_CONFIRMED|RECEIPT_TIMEOUT|BUYER_REJECTED_INSPECTION|INSPECTION_NOT_AS_DESCRIBED|INSPECTION_FAKE|SELLER_NO_SHIP|DELIVERY_REVIEW_RELEASE|DELIVERY_REVIEW_REFUND`. Only the first two and DELIVERY_REVIEW_RELEASE permit RELEASE; the other reasons permit REFUND. Validate source/reason/kind combinations in the service and DB CHECK where practical. These public enum codes never contain the Buyer's or Admin's free-text notes.

Shared settlement transaction:

1. Validate actor and simulation guard. Obtain the Order lock; check persisted command replay, final settlement and required input relationships.
2. For existing Orders, use a consistent lock order: Order → Shipment (if applicable) → Escrow → Product. Reconcile every touching upstream mutation at G0. Existing create-Order begins with Product reservation; do not introduce a Product-first path that then locks an existing Order. Include deadlock/retry testing with upstream expiration/cancel.
3. Re-read final inspection/decision, proof metadata, payment/escrow, dispute, deadline and financial snapshots. Bound Storage calls; after any I/O/lock delay revalidate state and DB wall clock before mutation.
4. Insert one settlement and command record; update Escrow, Product and Order; append history. Include Buyer receipt or Admin resolution in this same transaction. Commit once.
5. Any failure rolls this transaction back. Unique-constraint races reload the winning record and return replay or a contracted conflict. Do not turn unknown DB failure into success. A lost response is resolved using the same command key and a GET.

For TO_SELLER, first commit confirmed delivery, its history and its command record. Then invoke the settlement service in a separate transaction. If the process crashes between them, the worker finds `RETURNED_TO_SELLER` + HELD without settlement and retries. Do not return a refund-success message merely because delivery committed.

Migrations: continue from the actual reconciled head; preserve applied revisions/data. Test supported predecessor upgrades with paid/unpaid Orders. Downgrade must refuse incompatible populated financial/proof states rather than drop them silently. No shared database reset. Show one expected migration head and document forward-repair/rollback limits.

## 6. API contract

### 6.1 Common conventions and replay

Bearer authentication; strict JSON (`extra=forbid`); integer IDs from existing models; UTC ISO-8601 dates; money strings with two decimals. Mutations require existing `Idempotency-Key` format `[A-Za-z0-9_-]{8,100}`. No client amount/status/party/timestamp fields. Canonicalize trimmed text and sorted unique selected proof IDs; multipart replay hashes file content rather than multipart boundary or temporary filename.

Same actor/action/resource/key + same canonical payload returns the committed operation result, with `Idempotent-Replayed: true`, without new events. Same key + different payload gives 409 `idempotency_key_reused`. Stable operation fields replay unchanged; included current state is freshly authorized/read and can be newer. No saved signed URLs or cached authorization. A failed rolled-back mutation leaves the key retryable. A different key after final completion gives 409 `already_settled` (or `delivery_already_confirmed` for delivery); return references only to authorized callers. Buyer commands with a new key after deadline return 409 `receipt_deadline_passed`, even if the worker is delayed. Successful same-key replay remains readable after deadline.

### 6.2 Commands and reads

| Endpoint | Actor / request | Response and effect |
|---|---|---|
| `POST /orders/{id}/fulfillment` | Assigned Inspector; `{ "carrier":"Demo Courier", "tracking_number":"DEMO-42" }`, trimmed 1–100 chars each | `201 {shipment,order_status}`; derive direction/destination from immutable inputs, create exactly one outbound leg |
| `GET /shipments?limit=20&offset=0` | Active Courier; assigned shipments only; limit 1–100, offset ≥0 | `200 {items,total,limit,offset}` ordered created_at DESC, id DESC; current leg's minimal recipient/destination and actions, no financial detail |
| `GET /shipments/{id}` | Assigned Courier/Inspector under work authorization | `200` shipment detail with permitted proof and action flags |
| `POST /admin/shipments/{id}/assign-courier` | Admin; `{ "courier_id":8, "reason":"Assigned demo delivery" }` | `200 {shipment}`; active Courier only, before any upload; audit |
| `POST /shipments/{id}/delivery-proofs` | Assigned active Courier; multipart **one** `file` per command | `201 {proof:{id,mime_type,size_bytes}}`; repeat up to 3 successful pending images, bounded under lock; no delivery/time transition |
| `POST /shipments/{id}/confirm-delivery` | Assigned active Courier; `{ "proof_ids":[21,22] }` | `200 {shipment,order_status,receipt_deadline_at,settlement_status}`; 1–3 distinct valid IDs; commit proof/delivery once; optional subsequent return-refund attempt |
| `GET /shipment-delivery-proofs/{id}` | Per section 4 proof authorization | Authenticated bytes; no-store, safe Content-Type; no raw Storage keys |
| `GET /orders/{id}/delivery` | Related Buyer/Seller | `200 DeliveryView` below; same shape for pre-delivery/terminal Orders, nullable fields instead of invented progress |
| `POST /orders/{id}/confirm-receipt` | Owning active Buyer; `{}` | `200 {order_id,order_status,settlement,receipt_confirmed_at,receipt_confirmation_source}`; atomic BUYER RELEASE |
| `POST /orders/{id}/report-not-received` | Owning active Buyer; `{ "reason":"Parcel has not arrived" }` | `200 {order_id,order_status,reported_at,settlement_status}`; reason trimmed 10–1000 chars; one immutable report; HELD |
| `POST /admin/orders/{id}/delivery-review` | Active Admin; `{ "reason":"Review of missing parcel report" }` | `200` scoped case/proof detail; existing dispute required; persist audited access reason; idempotent audit on retry |
| `POST /admin/orders/{id}/resolve-delivery` | Active Admin; `{ "resolution":"REFUND", "reason":"Evidence review confirms non-delivery", "evidence_refs":["delivery-report:42"] }` | `200 {order_id,order_status,settlement,resolution}`; reason 10–1000 chars, 1–10 authorized same-case references; audited one-time resolution and settlement atomic |

`evidence_refs` accepts server-issued case references only (delivery report, selected proof, or a recorded case audit entry), not arbitrary URLs or object keys. Existing dispute report is valid evidence for a refund when an object is missing. New Admin reads/actions are narrowly scoped to this case, not general Order browsing.

COURIER owns its queue/assignment/upload/read/confirm endpoints; FINISH-02 integrates outbound/return behavior into them. Do not create a second implementation. Canonical center-receipt operation remains INSPECT's `POST /inspections/{id}/receive`; FULFILLMENT's proposed `/shipments/{id}/receive-at-center` is an alternative route name, not a requirement to expose a duplicate. Both must never independently record receipt.

### 6.3 DeliveryView and final Order reads

Example: owning Buyer after TO_BUYER delivery, before receipt. IDs and timestamps are fixtures, not observed production records.

```json
{
  "order_id": 42,
  "order_status": "DELIVERED_PENDING_BUYER",
  "server_time": "2026-09-26T10:05:00Z",
  "shipments": [{
    "id": 17,
    "leg": "TO_BUYER",
    "status": "DELIVERED",
    "carrier": "Demo Courier",
    "tracking_number": "DEMO-42",
    "shipped_at": "2026-09-26T09:00:00Z",
    "delivered_at": "2026-09-26T10:00:00Z",
    "delivery_proof_confirmed_at": "2026-09-26T10:00:00Z",
    "proofs": [{"id": 21, "url": "/shipment-delivery-proofs/21", "expires_at": null}]
  }],
  "receipt_deadline_at": "2026-09-29T10:00:00Z",
  "receipt_confirmed_at": null,
  "receipt_confirmation_source": null,
  "delivery_reported_missing_at": null,
  "can_confirm_receipt": true,
  "can_report_missing": true,
  "settlement_status": "HELD",
  "settlement": null
}
```

`shipments` includes all relevant legs sorted by shipped_at/id, with proofs filtered per actor. Relative image paths resolve against configured API origin and use authenticated loading. Do not persist these private images across account switches. Seller sees TO_BUYER progress with `proofs:[]`, no Buyer destination. Inactive readers get false mutation flags. Buttons require both valid state and owning active Buyer; unknown enum values fail safely and prompt refresh/update.

`settlement_status` is HELD/RELEASED/REFUNDED. Client derives “awaiting settlement” from HELD + returned/due delivery; it must not display COMPLETED/REFUNDED until committed. `settlement` for Buyer is `{id,kind,source,reason,currency,amount,settled_at}` where RELEASE amount is the original held total and REFUND amount is the full refund. Seller projection shows only `{id,kind,source,reason,currency,seller_payout,settled_at}`; payout is zero on refund. Reasons are safe enum codes, not private Admin notes. Separate operator diagnostics can show the allocation breakdown.

Example Buyer-visible settlement after refund:

```json
{
  "id": 9,
  "kind": "REFUND",
  "source": "RETURN_DELIVERY",
  "reason": "BUYER_REJECTED_INSPECTION",
  "currency": "THB",
  "amount": "1350.00",
  "settled_at": "2026-09-27T12:00:00Z"
}
```

For the same record, Seller sees `seller_payout:"0.00"` in place of `amount`. RELEASE with Buyer receipt uses `source=BUYER_RECEIPT`, `reason=RECEIPT_CONFIRMED`; `receipt_confirmation_source=BUYER` is a separate receipt-field enum.

Extend existing Order detail/list with terminal states and correct payment status; retain existing fields/role redactions and receipt link. Existing receipt remains the original charge; final page adds refund/settlement reference. Add a bounded role-redacted history read `GET /orders/{id}/history?limit=20&offset=0` (limit 1–100) returning `{items,total,limit,offset}` sorted occurred_at/id ASC, with event, from/to state, source and time; omit private reason text, actor PII and storage details. Inspector uses existing work detail plus Shipment routes, not customer Order permissions.

### 6.4 Errors

Use existing `{"detail":{"code":"...","message":"..."}}`; 422 may provide `detail.fields`.

| HTTP | Codes / caller handling |
|---|---|
| 401 | Existing auth error; refresh/login through established session flow |
| 403 | `account_inactive`, `not_order_buyer`, `inspector_role_required`, `courier_role_required`, `admin_role_required`, `fulfillment_simulation_disabled` |
| 404 | `order_not_found`, `shipment_not_found`, `proof_not_found` for absent or inaccessible resources |
| 409 | `invalid_state`, `inspection_not_ready`, `decision_required`, `fulfillment_destination_missing`, `idempotency_key_reused`, `delivery_already_confirmed`, `proof_limit`, `receipt_deadline_passed`, `delivery_report_already_recorded`, `already_settled`; refresh authorized state after conflict |
| 413 / 415 | `file_too_large` / `unsupported_media_type`; preserve remaining draft and valid uploads |
| 422 | `validation_error`, including forbidden fields, invalid proof IDs/count, missing key and text lengths |
| 503 | `storage_unavailable`, `settlement_unavailable`; no fabricated money result, retry same logical command |

Simulation configuration: introduce `FULFILLMENT_SIMULATION_ENABLED=false` by default and an explicit application-environment allowlist for development/test/demo; refuse simulation on production or unknown environment even if the flag is true. Reuse a verified integrated environment discriminator if available; otherwise document the new discriminator/config values. API commands and worker settlement use the same guard; ordinary historical reads stay available. Existing payment-guard behavior alone is not proof of production protection.

## 7. Worker and failure recovery

TIMER-01 owns an actual recurring process/command, scheduled every **5 minutes**, not a lazy GET side effect. Each scan uses bounded batches (default 100), deterministic ordering, per-Order transaction/recheck and safe concurrent-worker locking such as `SKIP LOCKED`. One failing Order must not starve the batch. Run catch-up immediately after restart and retain enough failure/attempt metadata for operational diagnosis without private data.

Process three FINISH candidates through the same settlement service:

1. TO_BUYER delivered, `DELIVERED_PENDING_BUYER`, deadline ≤ DB wall clock, no missing report, HELD and no settlement → AUTO RELEASE after proof revalidation.
2. `RETURNED_TO_SELLER`, confirmed readable return proof, HELD and no settlement → REFUND, including a crash after delivery commit.
3. `WAITING_SELLER_SHIP`, `paid_at + 72h` reached, no committed inbound shipment/`shipped_at`, HELD and no settlement → SELLER_NO_SHIP REFUND.

Seller `ship-to-center` must lock the same Order and reject new shipment creation at/after its deadline, even if worker is offline. A pre-deadline committed shipment prevents no-ship refund; late/in-transit shipment is an escalation, never synthetic delivery. Coordinate that upstream change explicitly with INSPECT/ORDER ownership.

Automatic completion happens on the first successful eligible scan, normally within one scan interval plus processing time. Worker outage/Storage failure leaves HELD beyond the deadline and visible “awaiting processing”; no promise of completion exactly at 72 hours. Emit observable scan/attempt/failure counts and failed run signals. Supply a manual retry command that uses the same guards/services and synthetic demo runbook; do not add a public force-release endpoint.

## 8. Issue plan and implementation sequence

One primary owner per issue, one implementation branch/PR per issue; cross-cutting interfaces are coordinated, not copied. Keep FINISH-01's backlog owner **DB2**, with DB1 owning shared migration integration. This resolves the older NEXT-WORK draft's DB1-primary suggestion for FINISH-01. Role names are placeholders, not GitHub assignees.

| ID / priority / owner | Scope and deliverable | Dependency / acceptance gate |
|---|---|---|
| **FINISH-00 / P1 / Lead** | This spec, state/permission/amount contracts, fixtures, base/contract mapping and issue handoffs | Before code: G0 recorded; list unresolved upstream dependencies; do not mark approved team review without evidence |
| **FINISH-01 / P1 / DB2** | Settlement/operation/history/resolution constraints and escrow/Order extension; DB1 integrates shared courier/inspection schema | G0 + schema inputs from G1/G2; isolated upgrade, invalid direct writes, matching FK tuples, duplicate/opposing settlement races and safe downgrade proof |
| **FINISH-02 / P1 / BE** | Inspector outbound/return creation, server-derived leg/destination; integrate COURIER proof confirmation and return-refund retry trigger | FINISH-01, G1/G2, COURIER-01/02; no two outbound directions, no delivery without proof, durable return delivery despite settlement failure |
| **FINISH-03 / P1 / BE** | Shared settlement service with RELEASE branch, Buyer receipt/report and audited Admin case operations; Admin REFUND delegates FINISH-04 service branch | FINISH-01/02 and CERT decision; atomic receipt/release; report/AUTO/Admin races, truthful source, permissions and rollback; full closure after FINISH-04 + TIMER-01 |
| **FINISH-04 / P1 / BE** | REFUND branch of same settlement service, return/no-ship/Admin reasons, durable retry candidate handling | FINISH-01 + shared service interface from FINISH-03; return integration after FINISH-02; one full refund, no payout, no relisting, original receipt preserved |
| **FINISH-05 / P1 / FE1** | Extend Order list/detail/delivery/history, separate inspection/receipt buttons, final outcome, private image loading; FE2 integrates existing result/receipt navigation | Can start from v1 fixtures after FINISH-00; live acceptance after FINISH-02…04; no client-derived money/success, safe timeout/session/account changes |
| **FINISH-06 / P1 / QA2** | Both Android paths and exception matrix with API/DB/Storage evidence; QA1 validates backend/races, DB2 supports data assertions | Integrated FINISH + COURIER/TIMER/CERT/INSPECT at one SHA; each pending environment gate stays explicitly pending |

Supporting tasks are real prerequisites, not optional future extras: COURIER-01 (DB1 role/assignment/proof), COURIER-02 (BE queue/private proof/confirm), COURIER-03 (FE1 capture/assigned queue), TIMER-01 (BE recurring runner with DB support). Reuse their existing tasks if present. Confirm Seller return-address snapshot ownership at G2; create only the missing narrowly scoped upstream work.

Recommended sequence:

1. FINISH-00/G0: inspect the actual integrated base; freeze common fixtures and schema ownership. G1/G2 gaps become explicit upstream tasks.
2. FINISH-01 with COURIER schema integration. FE1 can prepare final-view components against documented fixtures; QA prepares cases.
3. FINISH-02 + COURIER-02. Implement the shared settlement service in FINISH-03, then its REFUND branch in FINISH-04 on a coordinated base. Neither issue closes the full feature independently.
4. Complete Admin REFUND wiring, TIMER-01 (all three candidate types), COURIER-03 and FINISH-05 API integration.
5. FINISH-06 on a combined revision, followed by Lead overview review. Publish/build/deploy and shared DB operations remain separately scoped actions.

## 9. Acceptance matrix and review evidence

| Case | Required persisted result / evidence |
|---|---|
| PASS + CONFIRM + proof + Buyer receipt | One RELEASE, COMPLETED, SOLD; BUYER source; receipt/settlement atomic |
| MINOR_ISSUE + CONFIRM + proof + silence | HELD before deadline; one AUTO RELEASE after eligible worker; certificate keeps true inspection result |
| PASS and MINOR_ISSUE + REJECT | TO_SELLER only; delivery proof → full refund once; issued certificate retained |
| NOT_AS_DESCRIBED and FAKE | No qualifying certificate/Buyer CONFIRM; proven return → full refund, no payout/relisting |
| Positive result without decision / unpaid / missing center receipt | No outbound shipment or money transition |
| Buyer report before deadline | DELIVERY_DISPUTED + HELD; repeated worker never releases; Admin separately tested for RELEASE and REFUND |
| No-ship at paid_at + 72h | Full refund once, Product CANCELLED; committed timely shipment prevents refund; at/after deadline new shipment denied |
| Deadline boundary and delayed lock | Test just before/exactly at/after, predeadline arrival with postdeadline lock, Buyer receipt vs report vs worker, two worker processes; one valid winner using DB clock |
| Photo missing/invalid/cross-shipment / wrong Courier | No delivery confirmation/deadline/settlement; validate 1 and 3 photos, reject 0/4, oversized and fake MIME; concurrent upload count enforced |
| Proof object removed or Storage unavailable | Confirmation or proof-dependent settlement fails safely; HELD until recovery; test actual private Storage in test environment |
| Same key replay / changed payload / new key after terminal | Stable original operation; no duplicate history/timestamps/settlements; payload conflict and terminal conflict contractual |
| Delivery commit then crash before return refund | Persistent RETURNED_TO_SELLER + HELD; scheduled retry refunds once without re-upload |
| Inject failure during receipt/settlement/history writes | All financial/status/receipt writes roll back together; original payment and receipt survive; retry succeeds once |
| Two release, two refund, release vs refund / direct mismatched FK write | Isolated PostgreSQL constraints and independent concurrent connections prove one terminal settlement and matching relationships |
| Migration from supported upstream predecessors | Existing paid/unpaid Orders and proofs/certificates preserved; one expected head, invalid legacy data fails explicitly; unsafe downgrade refused |
| Cross-owner/inactive/operator/anonymous/private QR probes | No unauthorized mutation or private leakage; inactive historical reads retain existing policy; assignment replay rechecks authority |
| Mobile timeout, refresh, reopen, expired session/account switch | No fabricated terminal status; retry retains logical key, query persisted state; old account/proof cache cleared; receipt/result navigation works |

Automated requirements: focused API/unit tests for permissions, validation, serializers and UI behavior; isolated PostgreSQL for migrations/FKs/constraints/concurrency/rollback; worker tests prove scans without HTTP traffic and crash recovery. Do not substitute SQLite or mocked locks for PostgreSQL race proof. Reuse existing relevant Order/Product/INSPECT/CERT regression suites at the combined head.

Feature-level proof additionally requires real test API/private Storage and Android observation of both journeys, operator actions, refresh/restart, authenticated image loading and public QR privacy. Record SHA/build, environment label, device/OS, synthetic actor roles, expected/actual states, row IDs/counts, commands and evidence paths. Redact credentials, signed URLs and personal details. Do not claim external payment transfers.

Lead review checklist:

- [ ] Actual implementation matches this revision or a recorded coordinated amendment.
- [ ] Upstream gates and migration ownership resolved; no duplicate Shipment/Escrow/decision service.
- [ ] Exactly-once financial invariant holds in PostgreSQL, including opposing operations and rollback.
- [ ] Every deadline/action is enforced server-side; worker deployment and failure recovery demonstrated.
- [ ] API/DB/mobile states, field names, role redactions and historical receipts agree.
- [ ] Both customer outcomes and Admin exception outcomes have evidence; pending device/environment work has owner.
- [ ] SRS submission update remains tracked under DOC-01; this spec does not claim the PDF was revised.

**FINISH is complete only when FINISH-01…06 and required COURIER/TIMER integration pass G4.** Merged code, passing mocks, or a locally running worker alone do not close the feature.
