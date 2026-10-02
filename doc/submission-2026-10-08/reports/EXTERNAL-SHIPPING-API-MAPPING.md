# R1–R4 concrete API mapping for E

Backend candidate: PR130, branch `codex/ab-external-shipping-2026-10-02`, parent PR129 `b531bd1372c0d26b8492fa28ff29ab20a85d7578`, migration `r01e20261002` after `c08f20261002`. Exact published source/evidence is recorded in [verification](EXTERNAL-SHIPPING-VERIFICATION.json). Independent final acceptance, E screens and shared/native rollout are separate.

## Common contract

Authenticated routes use `Authorization: Bearer <current account token>`. All mutations below except the existing content-replayed inspection decision require a stable `Idempotency-Key` (8–100 characters under the existing Order contract). Keep the key while retrying the same canonical payload. Reusing its scoped actor/action/Order key with changed content returns409. A committed command replay returns its original result and `Idempotent-Replayed: true`; the result-decision endpoint replays identical decision/reason without that header/key contract.

Bodies are strict: unknown policy, actor, amount, time, recipient or destination fields are rejected. Server flags and amounts are authoritative. Timestamps are UTC ISO strings; money is decimal strings, never client-calculated floats. Authorized read/mutation/error responses are `Cache-Control: no-store` through existing sensitive-route middleware. On ambiguous network failure refetch persisted state; do not infer financial success from a transport or recipient command alone.

Simulation mutations require `APP_ENV` development/dev/test/demo and `FULFILLMENT_SIMULATION_ENABLED=true`. Simulated payment has its existing separate `PAYMENT_SIMULATION_ENABLED` gate. Admin transport events additionally require `EXTERNAL_SHIPPING_DEMO_ENABLED=true`, defaultfalse. No carrier webhook/provider or real payout/refund API is implemented. Configuration cannot select the Order policy: the server creates EXTERNAL_V2 and the migration labels every pre-existing Order LEGACY_V1.

## Routes and actors

| Method / concrete route | Actor and body | Effect / read to refresh |
|---|---|---|
| POST `/orders` | Owning Buyer capability; existing `product_id`, validated `shipping_address` | New EXTERNAL_V2 Order; immutable quote/parties/destination. Client policy/money/time forbidden. |
| POST `/orders/{id}/payments/simulate` | Owning Buyer, `{"outcome":"SUCCESS"}` | Existing successful Payment/Receipt/HELD, not a provider payment. |
| GET/PUT `/orders/{id}/return-address` | Owning active Seller; PUT is the existing seven-field address | Required before TO_CENTER; frozen on shipment. |
| POST `/orders/{id}/ship-to-center` | Owning Seller, carrier/tracking | TO_CENTER; requires timely paid Order and frozen return address. |
| GET `/inspections`, GET `/inspections/{id}` | Authorized Inspector | Existing queue/detail. `can_create_fulfillment`, outcome/deadline/policy fields guide outbound work. |
| POST `/inspections/{id}/receive` | Authorized center Inspector, `{}` or `{"note":"Actual receipt"}` | Actual center recipient at fresh server time. EXTERNAL_V2 needs no Courier/photo. Legacy still requires proof. |
| POST `/inspections/{id}/start`, POST `/inspections/{id}/evidence`, POST `/inspections/{id}/result` | Assigned Inspector; existing start/multipart evidence/final result body | Private inspection evidence remains mandatory. Positive final result+certificate+availability/deadline become atomic. |
| GET `/orders/{id}/inspection` | Owning Buyer capability | Final result, selected private evidence, certificate/decision, `can_decide`, independent result window and timeout. |
| POST `/orders/{id}/inspection/decision` | Owning Buyer, CONFIRM/REJECT and optional reason | Positive result strictly before cutoff, one decision. Same content replays after cutoff; opposite decision fails. |
| POST `/orders/{id}/fulfillment` | Assigned Inspector, carrier/tracking only | One final direction selected by server: CONFIRM→TO_BUYER; REJECT/timeout/negative→TO_SELLER. No client leg/address. |
| POST `/admin/shipments/{id}/shipping-events` | Active Admin, strict leg/DELIVERED/event identity | Explicit demo transport fact; exact source/leg/server time audited. Does not confirm recipient. |
| GET `/orders/{id}/delivery`, GET `/orders/{id}/history` | Owning Buyer/Seller | Role-redacted progress, amounts, settlement/pending flags and paginated history. |
| POST `/orders/{id}/confirm-receipt` | Owning active Buyer capability, `{}` | Actual Buyer receipt after authorized dispatch; optional existing deadline applies; same service RELEASE. |
| POST `/orders/{id}/report-not-received` | Owning Buyer, reason10–1000 | Allowed after dispatch without waiting for event; existing cutoff applies. DISPUTED/HELD blocks later AUTO. |
| POST `/orders/{id}/confirm-return` | Owning active Seller, `{}` | Actual TO_SELLER receipt commits first; separate financial attempt/retry. |
| POST `/admin/orders/{id}/return-review` | Active Admin, reason10–1000 | Audited scoped pending-return view with destination and issued evidence references. |
| POST `/admin/orders/{id}/confirm-return` | Same-case Admin, reason and2–10 issued distinct references | Actual recipient exception, no selectable amount; separate financial attempt. |
| GET `/admin/delivery-cases`, POST `/admin/orders/{id}/delivery-review`, POST `/admin/orders/{id}/resolve-delivery` | Active Admin, existing scoped reason/references/resolution | Non-receipt case is separate from return receipt. Audited REFUND remains full; RELEASE preserves sale allocations. |

Existing C routes `/profile`, `/profile/policy-acknowledgement`, `/orders/{id}/review`, `/sellers/{id}/reviews` and D `/admin/certificates/{id}/revoke`, public `/certificates/{token}` and `/certificates/{token}/json` are retained. C review requires actual COMPLETED/RELEASED; an approved Seller buying another Seller's product can review. Every REFUND forbids review. Public D revoked status exposes no private reason or financial rewrite.

## Bodies and response examples

Seller address uses `recipient_name`, `phone`, `address_line`, `subdistrict`, `district`, `province`, `postal_code`. Address is the same strict validated shape as checkout. New external-shipping mutations never accept address changes after dispatch.

```json
{"carrier":"Demo carrier","tracking_number":"OUTBOUND-001"}
```

This is the body for both ship-to-center and Inspector fulfillment; the server derives its leg/destination. Positive final result uses the existing body:

```json
{"result":"PASS","summary":"Expert final result","evidence_ids":[31]}
```

Owning Buyer decision:

```json
{"decision":"REJECT","reason":"Condition differs from my expectations"}
```

Example trusted event body (Admin-only and configured):

```json
{"leg":"TO_BUYER","event":"DELIVERED","event_id":"demo-delivered-001"}
```

Its successful projection is:

```json
{"order_id":7,"shipment_id":14,"leg":"TO_BUYER","event_id":"demo-delivered-001","event":"DELIVERED","source":"ADMIN_DEMO","confirmed_at":"2026-10-05T10:00:00Z","simulated":true,"recipient_confirmed":false}
```

Event identity is unique for `(ADMIN_DEMO,event_id)`, cannot move across Order/shipment/leg, and one delivered fact exists per shipment. Repeating identical identity/destination with a new command key returns the original event time, not a new deadline. A fresh event cannot reverse actual received/terminal facts. TO_CENTER delivery event leaves the Order shipping-to-center until actual Inspector receipt; TO_SELLER event never returns/refunds the Order.

Seller actual return body is `{}`. Example stable result:

```json
{"order_id":7,"shipment_id":15,"return_received_at":"2026-10-06T10:00:00Z","recipient_source":"SELLER","order_status":"RETURNED_TO_SELLER","settlement_attempt":"SEPARATE","simulated":true}
```

Even if settlement succeeds immediately, this receipt-command response keeps its original replayable facts. **Refetch GET delivery** for current REFUNDED/pending state and settlement reference. Do not display the command as money success.

Admin return-review uses `{"reason":"Review this exact physical return exception"}` and returns only scoped `return_recipient`, `shipment_id`, `evidence_refs` plus IDs/simulation. Confirmation body:

```json
{"reason":"Actual Seller return verified through the scoped case","evidence_refs":["delivery-audit:23","return-shipment:15"]}
```

References must belong to this Order, its actual return shipment and an audit issued to this Admin. Other-case/other-Admin references fail422. There is no generic cross-customer Order read or mandatory external shipping photo. Admin asserts actual receipt through this reasoned audited exception; a carrier event is insufficient.

## Read fields / E action rules

| Read model | Fields / meaning |
|---|---|
| Buyer inspection | `fulfillment_policy`, `result_available_at`, `result_decision_deadline_at`, `result_timed_out_at`, `server_time`, `can_decide`, `decision`, `next_action`. At cutoff `can_decide=false` before a worker records timeout; do not fabricate timeout/dispatch locally. Persisted timeout selects `RETURN_TO_SELLER`. |
| Inspector detail | Existing `can_create_fulfillment`, `fulfillment`, result/decision plus policy/result window/timeout. Final leg needs actual outcome and assigned Inspector. |
| Buyer/Seller delivery | `order_status`, `settlement_status`, `pending_processing`, receipt/result times and server time. `can_confirm_receipt`, `can_report_not_received` reflect owning Buyer eligibility; `can_confirm_return` reflects owning active Seller and dispatched unreceived return. |
| Each shipment | `carrier`, `tracking_number`, `shipped_at`, `transport_delivered_at`, `transport_source`, `simulated_transport`, `recipient_received_at`, `recipient_source`. Transport source ADMIN_DEMO is distinct from actual BUYER/SELLER/ADMIN/INSPECTOR receipt. Existing `courier_delivered_at` projection remains `delivered_at`/`delivery_proof_confirmed_at` for legacy only. |
| Buyer money | `charged_amount`, `refund_quote.buyer_refund`, `retained_inspection`, `retained_shipping`, `requires_actual_return`; the quote describes the required policy/cause and is never proof of settled money. `settlement` carries immutable `id` (settlement reference), `kind`, `source`, `reason`, `fulfillment_policy`, `held_amount`, `buyer_refund`, `retained_inspection_amount`, `retained_shipping_amount` and `settled_at`. |
| Seller money | Buyer charge/refund quote null; settlement exposes Seller payout/commission only, with common policy/cause/settlement `id`. Buyer private destination/recipient ID/private report text are excluded. |
| Durable return | Actual recipient data exists and Order RETURNED_TO_SELLER with HELD; `pending_processing=true` until one settlement commits. Replay/worker retry never changes policy or deducts fees again. |

Two independent continuous72h timers:

1. Positive result availability and certificate atomic commit → result decision deadline. Before cutoff CONFIRM/REJECT; at/after reject new decisions and SYSTEM scan may authorize return. No auto-CONFIRM, invented Buyer row, dispatch or money.
2. Trusted TO_BUYER transport delivery server time → AUTO physical-receipt deadline. Actual manual receipt/report can occur after dispatch without this event; if event exists, writes must be strictly before its deadline. A report blocks any later AUTO. Tracking alone creates no timer.

Both mutations sample PostgreSQL wall clock after locks/I/O. A request arriving before cutoff but waiting across it fails409. Use server time/deadlines for informative countdowns only. Same successful replay remains readable; inactive/wrong actor does not gain replay access. Event and fulfillment endpoints still require their simulation configuration on replay.

## Amounts and errors

| Cause/policy | Charged | Refund | Retained inspection/shipping | Seller / commission |
|---|---:|---:|---:|---:|
| New positive REJECT or result TIMEOUT after actual return |1350.00|1200.00|100.00 /50.00|0.00 /0.00|
| New negative inspection / no-ship / Admin non-receipt |1350.00|1350.00|0.00 /0.00|0.00 /0.00|
| Legacy REFUND under retained policy |1350.00|1350.00|0.00 /0.00|0.00 /0.00|
| Successful RELEASE |1350.00|0.00|100.00 /50.00|1140.00 /60.00|

These numbers illustrate tested immutable snapshots, not hardcoded client calculations. Never subtract fees again to show1050, add return fees, alter original Receipt or relist returned stock automatically.

Errors use existing `detail.code/message` for business errors, with existing strict-validation responses on malformed bodies. Important codes/statuses:401 unauthenticated;403 unauthorized/inactive or disabled simulation;404 wrong-owner/assigned-resource hiding;409 `result_decision_deadline_passed`, `decision_already_recorded`, `receipt_deadline_passed`, `shipping_leg_mismatch`, `shipping_event_reused`, `shipping_event_too_late`, `delivery_already_recorded`, `legacy_courier_only`, invalid state/duplicate fulfillment/settlement;422 invalid or injected fields and `invalid_evidence_reference`. Refetch eligible views after409; do not treat it as a local success.

## Legacy and worker compatibility

Migration preserves every old Order/shipment/settlement snapshot as LEGACY_V1, including unpaid Orders created before deployment. Existing Courier assignment/proof/private-read/delivery routes remain for those Orders. Assigning Courier to new external shipments returns409, not500. No legacy policy/history rewrite; old inspection decisions keep their accepted behavior.

`backend/scripts/run_lifecycle_jobs.py` keeps dry-run by default and explicit target guards. Jobs: unpaid expiry(ID5), receipt release(ID1), no-ship(ID2), return retry(ID3), overdue escalation(ID4), new result timeout(ID6). Durable scan ownership, fairness, restart and bounded SKIP LOCKED remain; catch-up handles transient locked-row skips. No new HTTP timeout endpoint and no scheduler activation in this PR. See [R4](EXTERNAL-SHIPPING-R4.md) for safe commands.

Code sources: [external API](../../../backend/app/api/external_shipping.py), [inspection API](../../../backend/app/api/inspections.py), [delivery/receipt API](../../../backend/app/api/finish.py), [settlement service](../../../backend/app/services/order_settlement.py), [timeout service](../../../backend/app/services/result_timeout.py), [migration](../../../backend/migrations/versions/r01e20261002_external_shipping.py). Historical [API mapping](API-MAPPING.md) remains a prior-source record; this file takes precedence for changed new-policy behavior.
