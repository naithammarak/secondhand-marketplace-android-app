# A foundation API and physical schema mapping

Status: REVIEW_PENDING. Source commit `dcab3898fb4164721264310b62311f79bf1b4551`, upstream base `d98d4a0b4b5d0cbfdce842ac886ed0ffc0409b05`. The final PR head includes documentation-only descendants; its exact SHA is recorded in the review request and coordination state. Migration head: `a02f20261002`, parent `714f11c84d53`. Extend this chain in task order **02 → 07 → 08**; B reuses these models and must not introduce a competing head.

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

- `POST /orders/{id}/ship-to-center`: owning ACTIVE Seller, existing carrier/tracking body and idempotency header. Requires paid Order, HELD Escrow, return address, and fresh database time strictly before `paid_at + 72h`. Missing destination: 409 `fulfillment_destination_missing`; deadline: 409 `seller_shipping_deadline_passed`. Successful same-key replay precedes the new deadline guard. A PostgreSQL trigger also checks the actual insertion time and maps its boundary rejection back to 409.
- `POST /inspections/{id}/receive` remains the sole center receipt mutation. Existing start/evidence/result/Buyer decision routes remain registered.
- Existing `GET /courier/shipments?scope=pending|history|all&limit=100&offset=0`, upload `/courier/shipments/{id}/proofs`, confirm `/courier/shipments/{id}/confirm-delivery`, private image `/shipment-delivery-proofs/{proof_id}` and Admin assignment routes remain. Their current implemented work scope is TO_CENTER; B extends these routes for outbound legs rather than adding a parallel API.
- Courier confirmation verifies 1–3 stored objects' length/hash under Order/Shipment locks, refreshes metadata after I/O, samples DB wall-clock, and commits the selected immutable binding. A failed read or transaction leaves the confirmation uncommitted. Real shared Storage was not exercised.
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

`payment_status=REFUNDED` in existing Order reads derives from the terminal ledger; the successful original charge/receipt remains unchanged. Mobile recognizes the new final statuses and refunded payment status, while new final fulfillment controls remain E's work.

## Lock and time contract

For existing Orders: **Order → Shipment (when applicable) → Escrow → Product**. Actor authorization is refreshed under its own User lock after Order acquisition. Cancel/expiry lock Order before reservation release. Expiry locks candidate Orders in ascending ID order, then samples wall-clock and applies its conditional write. The unpaid worker samples DB time after its Order lock; explicitly injected clocks are retained only for deterministic tests.

Create reserves Product before inserting a new Order. It never then locks an existing Order. Expired reservations are swept before Product reservation; failed creation rolls back before reading another existing command. No new Product-first → existing-Order lock path is added.

`app.services.transaction_clock.database_now` uses PostgreSQL `clock_timestamp()` rather than transaction-start `now()`; SQLite tests use an injectable application fallback. B must revalidate authority/proofs after any storage I/O and resample immediately before its guarded final write. Receipt/release/refund handlers and final timer jobs are not implemented by A.

## Legacy and migration safety

Supported predecessors: 714f11c84d53, e8b2c490a713 and d8b7c4e2910a; fresh install also proven. Paid/unpaid/proof/inspection/certificate/decision data survives. Previously confirmed proofs are bound using their real persisted timestamp and Courier; no timestamps, addresses or money are fabricated. Unsafe cross-order money, invalid legacy proof/assignment/count, unknown legacy outbound destination or nonfinite snapshots fail preflight with an actionable message.

Legacy paid/unshipped Orders may save a valid Seller return address, then ship only while still within the actual deadline. Legacy in-flight Orders missing that snapshot preserve proof/inspection/certificate reads and continuation of existing inbound work. Their destination remains null and frozen: a future return leg cannot proceed until a separately authorized, audited compatibility repair is reviewed. No ordinary endpoint invents or alters their historical destination/proofs.

Downgrade is explicitly refused, even on an empty installation, to avoid silently discarding private audit/snapshot protections. Use a reviewed pre-upgrade backup or an explicit forward compatibility migration. New private tables enable RLS with no client policies; direct anon/authenticated bypass was tested on disposable PostgreSQL. Shared Supabase schema/bucket activation remains task10's separate gate.
