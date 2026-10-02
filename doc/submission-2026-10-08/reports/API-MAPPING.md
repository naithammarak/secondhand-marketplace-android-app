# A foundation API and physical schema mapping

> **Current B update:** correction source `9e8474c8c1bbf8b28d82aba51e4f212497863539` follows implementation `1e3d6a061be4f6fa8e875885dfd68586aa79b7cc`. Original A/initial B snapshots below remain provenance; current contracts include the correction section and [handoff](B-CONTRACT-HANDOFF.md). No B migration.

## PR124 corrected contracts

- Admin starts at `GET /admin/orders?status=SHIPPING_TO_BUYER` (Buyer leg) or `status=RESULT_NOTIFIED` (return transit), then `GET /admin/orders/{id}`. New `shipments` contains only `{id,leg,status,courier_id}` for persisted legs. Select TO_BUYER/TO_SELLER and use the existing `POST /admin/shipments/{id}/assign-courier`; the Order alias still selects TO_CENTER. No private proof, destination or tracking is added to Admin detail.
- Admin list/detail `payment_status` now use committed OrderSettlement REFUND records: REFUNDED after refund, PAID after RELEASE. Payment/Receipt and original paid_at remain unchanged.
- Request validation errors keep HTTP422 `{detail:[{loc,msg,type}]}`; raw input/context are omitted and unsafe Unicode in error locations/messages is replaced for serialization. Existing strict Finish rejection of lone surrogates/NUL remains; valid Thai/emoji are accepted.
- Four paid lifecycle categories rotate using completed `SYSTEM:lifecycle-cursor` / `LIFECYCLE_SCAN` commands with resource `LIFECYCLE_JOB`, IDs1–4 (receipt/no-ship/return/overdue). Per-job advisory locks coordinate scans; cursor records are separate from ORDER history/financial outcomes. Bounded visits, once-per-traversal wrap, per-Order transactions and exact guards remain. Dry-run does not write progress; scoped return retry does not move it.

All four original reviewer checks and 19 new regressions passed; [correction report](B-PR124-REVIEW-FIXES.md) contains current results/commands and limitations.

Status: REVIEW_PENDING. Source commit `33f0eadd8c1739735434ee9f103a5f23398178ed`, upstream base `d98d4a0b4b5d0cbfdce842ac886ed0ffc0409b05`. The final PR head includes documentation-only descendants; its exact SHA is recorded in the review request and coordination state. Migration head: `a02f20261002`, parent `714f11c84d53`. Extend this chain in task order **02 → 07 → 08**; B reuses these models and must not introduce a competing head.

## Return address

`GET /orders/{order_id}/return-address` and `PUT /orders/{order_id}/return-address` require authenticated owning ACTIVE Seller. A related Buyer receives 403 `seller_role_required`; unrelated resources receive 404 `order_not_found`. Both successful and error responses use `Cache-Control: no-store`, including ASGI root prefixes.

PUT additionally requires an 8–100 character `[A-Za-z0-9_-]` `Idempotency-Key`, `FULFILLMENT_SIMULATION_ENABLED=true`, and `APP_ENV=development|dev|test|demo`. Missing, unknown and production environments refuse with 403 `fulfillment_simulation_disabled`; the default flag is false. Historical GET remains available when the flag is disabled. B's services/workers must reuse `app.services.fulfillment_guard.require_fulfillment_simulation` before new fulfillment money writes; the existing payment simulation flag alone is insufficient.

Strict PUT body: the existing seven address fields directly, without an envelope, Order ID, URL or courier-selected destination:

```json
{"recipient_name":"ผู้ขาย ทดสอบ","phone":"0812345678","address_line":"99 ถนนทดสอบ","subdistrict":"แขวงทดสอบ","district":"เขตทดสอบ","province":"กรุงเทพมหานคร","postal_code":"10110"}
```

The existing address cleaner canonicalizes whitespace and phone separators. Recipient 2–100 chars; address line 5–255; locality fields 2–100; ASCII phone starts with 0 and has 9–10 digits; postal code has five ASCII digits. Extra fields, malformed JSON, unsupported text characters, missing/invalid fields yield 422 `validation_error` with `detail.fields`.

Successful PUT returns the stable saved command result:

```json
{"order_id":42,"return_address":{"recipient_name":"ผู้ขาย ทดสอบ","phone":"0812345678","address_line":"99 ถนนทดสอบ","subdistrict":"แขวงทดสอบ","district":"เขตทดสอบ","province":"กรุงเทพมหานคร","postal_code":"10110"},"saved_at":"2026-10-02T00:00:00+00:00"}
```

GET returns `{order_id, return_address, saved_at, frozen}`. Use GET for current freeze state. Same key/canonical payload returns the original result plus `Idempotent-Replayed: true`, even after shipment. Reusing a key with a different canonical address returns 409 `idempotency_key_reused`. A different key may change a paid `WAITING_SELLER_SHIP` address only before any committed Shipment; afterward 409 `return_address_locked`. Other unpaid/final states receive 409 `invalid_state`.

Order fields: nullable JSON `return_address`, paired UTC `return_address_saved_at`. PostgreSQL validates the exact field shape and freezes the snapshot after Shipment insertion. API writes and Shipment insertion serialize through the same Order lock.

## Existing retained mutations

- `POST /orders`: after validation and the initial owning Buyer/key lookup, an availability conflict during product precheck rolls back and rechecks that same scope/key. A committed same canonical request replays the original 201 Order and `Idempotent-Replayed: true`; a changed canonical request returns 409 `idempotency_key_reused`. Other precheck errors retain their original behavior. Existing conditional reservation/unique constraint replay guards remain; different keys/Buyers keep one winner per product.

- `POST /orders/{id}/ship-to-center`: owning ACTIVE Seller, existing carrier/tracking body and idempotency header. Requires paid Order, HELD Escrow, return address, and fresh database time strictly before `paid_at + 72h`. Missing destination: 409 `fulfillment_destination_missing`; deadline: 409 `seller_shipping_deadline_passed`. Successful same-key replay precedes the new deadline guard. A PostgreSQL trigger also checks the actual insertion time and maps its boundary rejection back to 409.
- `POST /inspections/{id}/receive` remains the sole center receipt mutation. Existing start/evidence/result/Buyer decision routes remain registered.
- Existing `GET /courier/shipments?scope=pending|history|all&limit=100&offset=0`, upload `/courier/shipments/{id}/proofs`, confirm `/courier/shipments/{id}/confirm-delivery`, private image `/shipment-delivery-proofs/{proof_id}` and Admin assignment routes remain. Their current implemented work scope is TO_CENTER; B extends these routes for outbound legs rather than adding a parallel API.
- Retained TO_CENTER `POST /courier/shipments/{id}/confirm-delivery` is a bodyless compatibility command (A-PROOF-01): the server selects ALL currently uploaded valid private proofs (1–3), fingerprints `{}`, and freezes that exact same-shipment/current-assigned-Courier set. It does **not** parse a client `proof_ids` JSON body; changing an ignored body with the same key still replays the historical command. Active authorization is rechecked on replay. Confirmation verifies stored objects' length/hash under Order/Shipment locks, refreshes metadata after I/O, samples DB wall-clock, and commits the immutable binding atomically. A failed read or transaction leaves it uncommitted. Real shared Storage was not exercised.
- **PENDING — B/task03:** extend the SAME existing confirmation route with uniform strict `{proof_ids:[...]}` bodies for TO_CENTER/TO_BUYER/TO_SELLER. Validate 1–3 distinct integer IDs belonging to the same shipment/current assigned Courier; reject duplicates, unknown fields, missing body and invalid IDs/count. Canonicalize ordering: the same key/canonical selected set replays, while a changed set conflicts; persist only that selected set atomically and refresh authorization/proof metadata/readability after I/O under shared locks. B/E must update the existing mobile Courier caller and define/test compatibility for earlier committed bodyless replays, without rewriting historical `{}` fingerprints or frozen bindings. A binding evidence does not establish FINISH section6.2 strict-selector acceptance.
- Certificate HTML/JSON routes remain, including startup validation of the exact `PUBLIC_CERTIFICATE_BASE_URL` variable. Latest PR112 unsupported-reason and prefix/no-store fixes are integrated.

## Physical names and downstream interfaces

| Contract concept | Concrete field/model |
|---|---|
| Assigned Courier | Existing `Shipment.courier_id` |
| Delivery/proof confirmation time | Existing `Shipment.courier_delivered_at`; no duplicate timestamp |
| Immutable selected set | `ShipmentConfirmedProof` / `shipment_confirmed_proofs`: proof ID, Shipment ID, Courier ID, `confirmed_at` matching the Shipment time |
| One-time confirmation enforcement | DB-managed `Shipment.confirmation_txid` permits initial binding in that transaction only; it is not a client/API field |
| Private proof | Existing `ShipmentDeliveryProof`: object key, SHA256, JPEG/PNG MIME, size, uploader, sort order and upload time |
| Destination | Nullable `Shipment.destination_address` JSON; outbound requires a snapshot, TO_SELLER must match Order return address |
| One outbound | Existing unique `(order_id,leg)` plus partial unique Order index across TO_BUYER/TO_SELLER |
| Final Order states | SHIPPING_TO_BUYER, DELIVERED_PENDING_BUYER, DELIVERY_DISPUTED, RETURNED_TO_SELLER, COMPLETED, REFUNDED; all upstream states retained |
| Final Escrow | Existing original `amount/payment_id/held_at`; statuses HELD/RELEASED/REFUNDED and paired `settled_at` |
| Receipt fact | `Order.receipt_deadline_at`, `receipt_confirmed_at`, `receipt_confirmation_source=BUYER|AUTO`; paired fields, mutually exclusive with missing report, correct before/at deadline boundary |
| Missing report | `Order.missing_report_id`, `missing_reported_at`, `missing_report_reason` (10–2000 chars), persisted before deadline; immutable once set |
| Inspection escalation | `Order.inspection_overdue_escalated_at`, nullable immutable timestamp; task05 supplies the job and history command |
| Terminal ledger | `OrderSettlement`: one unique Order and Escrow across both kinds, original Payment, command, parties, currency, held amount, seller payout, buyer refund, commission/inspection/shipping amounts, source/reason/time |
| Replay | `FulfillmentCommand`: USER:id or named SYSTEM scope, actor, action, resource type/ID, key, canonical SHA256, response status, stable JSON result, committed time; unique scope/action/resource/key |
| History | `OrderStatusHistory`: Order, command, from/to state, event, source and time; unique command/event and matching command resource; append only |
| Admin resolution/access | `DeliveryResolution` binds its Order/kind to the terminal Settlement, reason/evidence/Admin/time; unique Order. `DeliveryEvidenceAccess` stores private audit reason/Admin/time. Both append only. B supplies the authorized APIs. |

Settlement RELEASE: `buyer_refund=0`, held amount equals seller payout + commission + inspection + shipping, and individual allocations equal original Order snapshots. REFUND: buyer refund equals held amount and all other allocations equal zero. Source/reason/kind codes follow FINISH-spec v1. Composite FKs bind Escrow + Order + Payment + amount; Payment + Order + amount; Order + total + currency; Order + Seller + Buyer. Original Payment/Attempt/Receipt, held Escrow financial tuple, paid Order financial/buyer-address snapshot and terminal audit records cannot be rewritten. NaN/nonfinite money is rejected. Deferred checks prevent a terminal Order/Escrow without its matching settlement.

`payment_status=REFUNDED` in both owning Buyer/Seller Order list and detail reads derives from the committed terminal ledger through one shared projection. List reads fetch refund IDs once, restricted to the current page; ordinary paid/RELEASE reads remain PAID and unpaid/cancelled reads remain UNPAID; the successful original charge/receipt remains unchanged. Mobile recognizes the new final statuses and refunded payment status, while new final fulfillment controls remain E's work.

## Lock and time contract

For existing Orders: **Order → Shipment (when applicable) → Escrow → Product**. Actor authorization is refreshed under its own User lock after Order acquisition. Cancel/expiry lock Order before reservation release. Expiry locks candidate Orders in ascending ID order, then samples wall-clock and applies its conditional write. The unpaid worker samples DB time after its Order lock; explicitly injected clocks are retained only for deterministic tests.

Create reserves Product before inserting a new Order. It never then locks an existing Order. Expired reservations are swept before Product reservation; failed creation rolls back before reading another existing command. No new Product-first → existing-Order lock path is added.

`app.services.transaction_clock.database_now` uses PostgreSQL `clock_timestamp()` rather than transaction-start `now()`; SQLite tests use an injectable application fallback. B must revalidate authority/proofs after any storage I/O and resample immediately before its guarded final write. Receipt/release/refund handlers and final timer jobs are not implemented by A.

## Legacy and migration safety

Supported predecessors: 714f11c84d53, e8b2c490a713 and d8b7c4e2910a; fresh install also proven. Paid/unpaid/proof/inspection/certificate/decision data survives. Previously confirmed proofs are bound using their real persisted timestamp and Courier; no timestamps, addresses or money are fabricated. Unsafe cross-order money, invalid legacy proof/assignment/count, unknown legacy outbound destination or nonfinite snapshots fail preflight with an actionable message.

Legacy paid/unshipped Orders may save a valid Seller return address, then ship only while still within the actual deadline. Legacy in-flight Orders missing that snapshot preserve proof/inspection/certificate reads and continuation of existing inbound work. Their destination remains null and frozen: a future return leg cannot proceed until a separately authorized, audited compatibility repair is reviewed. No ordinary endpoint invents or alters their historical destination/proofs.

Downgrade is explicitly refused, even on an empty installation, to avoid silently discarding private audit/snapshot protections. Use a reviewed pre-upgrade backup or an explicit forward compatibility migration. New private tables enable RLS with no client policies; direct anon/authenticated bypass was tested on disposable PostgreSQL. Shared Supabase schema/bucket activation remains task10's separate gate.

## B tasks03–05 current implementation addendum

Source `1e3d6a061be4f6fa8e875885dfd68586aa79b7cc`; A head `94a26a0fbb7a0a82948d95de7db9af070707b770` integrated by `76faba8a3fd939e7dad429f3351da583bd302cf0`. A REVIEW_PENDING does not become an accepted deployment. Source inputs are complete for B; one head a02f20261002, all existing physical models reused.

- `POST /orders/{id}/fulfillment`: assigned active Inspector, strict trimmed carrier/tracking_number only. Derives positive CONFIRM→TO_BUYER, positive REJECT/either negative→TO_SELLER and immutable destination. Missing decision/snapshot rejects. One outbound lock/index. Return dispatch retains RESULT_NOTIFIED; leg identifies transit. Inspector detail adds buyer_decision/fulfillment/next_action/can_create_fulfillment/overdue marker.
- Existing Courier queue/upload/assignment/private read now cover all three legs; `GET /courier/shipments/{id}` admits assigned Courier/Inspector. Queue adds leg/carrier/tracking/pending destination/action flags; delivered history omits destination. Seller final detail/progress hides Buyer address/TO_BUYER proofs. Assignment retains `{courier_id}` and audited InspectionIdempotency; final-leg operations include Shipment ID.
- The same confirm-delivery route requires strict `{proof_ids:[...]}` for all new commands:1–3 distinct positive integers, no extras, canonical sorting, same-shipment/current-Courier real JPEG/PNG byte/type/size/hash/readability checks. Only selected proofs bind atomically. FulfillmentCommand resource is ORDER with Shipment ID in the fingerprint, matching history FK. TO_BUYER→DELIVERED_PENDING_BUYER/deadline+72h; TO_SELLER→durable RETURNED_TO_SELLER/HELD then independent shared refund attempt. Replay is the stable delivery result; fetch delivery for current settlement/pending_processing.
- Historical A inbound InspectionIdempotency keeps original `{}` hashes/results/bindings. Absent/empty-body replay and identical explicit frozen set are supported; changed selected set conflicts. New bodyless confirmation fails422. Existing mobile service/caller sends proof IDs; E owns final-leg labels/controls and visual work.
- `GET /orders/{id}/delivery`: server_time, shipments/selected references, receipt facts, Buyer-only missing report, escrow/role-redacted settlement, pending_processing, overdue marker and receipt/report action flags. `GET /orders/{id}/history?limit=100&offset=0`: paginated immutable events without free-text reasons/actor IDs. Detail also adds flags/deadline/summary. Buyer sees held/refund; Seller sees payout/commission. Money is two-decimal string with simulated=true.
- `POST /orders/{id}/confirm-receipt` strict `{}`: owning active Buyer/Seller-as-Buyer, shared BUYER RELEASE. `POST /orders/{id}/report-not-received` strict `{reason}`10–1000: immutable pre-deadline HELD dispute, possible during Storage outage. Exact-at/after writes reject after locked DB clock; committed authorized replay survives deadlines. No client amount/party/state/time.
- missing_report_id remains A's String(36). B stores its report FulfillmentCommand integer ID as a decimal string, permitting `delivery-report:<positive-id>` references without another table/migration.
- `GET /admin/delivery-cases`: disputed IDs/times only. `POST /admin/orders/{id}/delivery-review` strict reason plus key persists DeliveryEvidenceAccess, returns report/selected-proof/audit refs. `GET /admin/orders/{id}/delivery-proofs/{proof_id}?audit_id=<id>` requires that active Admin's same-case audit/selected proof. Ordinary proof URL denies Admin.
- `POST /admin/orders/{id}/resolve-delivery`: strict resolution RELEASE|REFUND, reason,1–10 distinct same-case evidence_refs and prior own case review. RELEASE requires readable confirmed Buyer proof; REFUND may rely on the immutable report during object outage. Resolution/settlement/history/command commit together. No unrestricted customer read.
- OrderSettlementService implements the typed caller-owned shared interface, exact saved RELEASE allocations/full-held REFUND, unique immutable ledger, preserved charge/receipt and SOLD/CANCELLED Product. Internal named workers lifecycle/return-delivery. A simulation guard protects writes; dry-run validates without IDs/records.
- `python -m scripts.run_lifecycle_jobs`: unpaid_expiry, receipt_release, seller_no_ship, return_refund, inspection_overdue without HTTP. Defaults300seconds/100records/10batches per category, locked fresh checks/SKIP LOCKED/independent transactions, safe dedicated URL/target, dry-run/apply/scoped retry. One escalation after3Bangkok weekdays appears in `GET /admin/inspection-overdue`; no result/decision/certificate/fund invention.

Private success/error responses use no-store. Errors include invalid_state/inspection_not_ready/decision_required/fulfillment_destination_missing, delivery_already_confirmed, proof_not_found/storage_unavailable, receipt_deadline_passed/receipt_not_due, seller_shipping_not_due, delivery_review_required/invalid_evidence_reference/already_settled and idempotency_key_reused. Strict model validation is422; selected-proof errors use the Order validation envelope.

Evidence: [task03](03-FINISH-02.md), [task04](04-FINISH-03-04.md), [task05](05-TIMER-01.md), [runbook](B-VERIFICATION-RUNBOOK.md). Android/shared Storage/runtime activation and legacy audited address repair remain pending. Local backend implementation is not full release acceptance.
