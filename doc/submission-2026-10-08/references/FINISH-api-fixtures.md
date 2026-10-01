> Historical contract snapshot copied 1 Oct 2026. Current scope/gates: ../DOC-01-scope.md and ../FINISH-00-release-gates.md. Old baseline coordinates and proposed decisions do not override the selected submission rules. External local links not supplied in this packet are labeled historical references.

# FINISH API/JSON fixtures v1 — proposed, 29 September 2026

These are contract fixtures for FINISH-01…05 and QA, **not** live endpoint responses. Machine-readable v1 response copies: [pending Buyer delivery](fixtures/buyer-delivery-pending.v1.json), [Courier confirmation](fixtures/courier-confirm-buyer.v1.json), [Buyer receipt RELEASE](fixtures/buyer-receipt-release.v1.json), [return REFUND](fixtures/return-refund.v1.json). IDs, times and names are synthetic. Existing INSPECT/CERT endpoints remain the source for inspection result and Buyer decision. Use Bearer auth and `Idempotency-Key: finish_demo_0001` (8–100 `[A-Za-z0-9_-]`) on each mutating example; choose a fresh key per logical command. Same key and normalized body replay the committed result with `Idempotent-Replayed: true`; changed body returns `409 idempotency_key_reused`. Strict JSON forbids client amount, party, state and timestamp fields. UTC timestamps and money strings are server output.

## Precondition: CERT decision is separate

On #112 `POST /orders/42/inspection/decision` with `{"decision":"CONFIRM"}` stores a one-time decision and returns `{"decision":{"decision":"CONFIRM","reason":null,"decided_at":"2026-09-26T08:00:00Z"},"next_action":"SHIP_TO_BUYER"}` (illustrative timestamp). Escrow remains `HELD`; no FINISH receipt/settlement is written. For `NOT_AS_DESCRIBED` or `FAKE`, there is no decision row and fulfillment derives TO_SELLER from the final result.

## FINISH-02: one server-derived outbound leg

`POST /orders/42/fulfillment` by the assigned Inspector:

```json
{"carrier":"Demo Courier","tracking_number":"DEMO-42"}
```

`201` for PASS + persisted CONFIRM:

```json
{"order_id":42,"order_status":"SHIPPING_TO_BUYER","shipment":{"id":17,"leg":"TO_BUYER","status":"IN_TRANSIT","carrier":"Demo Courier","tracking_number":"DEMO-42","shipped_at":"2026-09-26T09:00:00Z","courier_id":null,"courier_delivered_at":null}}
```

For a negative result or REJECT, the same route returns `leg:"TO_SELLER"`, order remains `RESULT_NOTIFIED` until proven return, and a Seller return snapshot must exist. The API never accepts `leg` or `destination` from the Inspector. Missing snapshot: `409 {"detail":{"code":"fulfillment_destination_missing","message":"Verified seller return destination required"}}`; no Shipment is inserted.

## COURIER-02 extension used by FINISH-02

Keep the existing route family. `POST /admin/shipments/17/assign-courier` with `{"courier_id":8,"reason":"Assigned demo delivery"}` returns `200 {"shipment_id":17,"courier_id":8}` and an audit event. `GET /courier/shipments` includes only Courier 8's assigned legs, each with the current leg's minimal recipient/destination; no amounts, inspection findings or other Order data. `POST /courier/shipments/17/proofs` remains multipart with one private JPEG/PNG `file` per request and returns `201 {"proof":{"id":21,"mime_type":"image/jpeg","size_bytes":218440}}`. After 1–3 proof uploads, extend existing `POST /courier/shipments/17/confirm-delivery` to take:

```json
{"proof_ids":[21]}
```

`200` for TO_BUYER:

```json
{"shipment":{"id":17,"leg":"TO_BUYER","status":"DELIVERED","courier_delivered_at":"2026-09-26T10:00:00Z","confirmed_proof_ids":[21]},"order_status":"DELIVERED_PENDING_BUYER","receipt_deadline_at":"2026-09-29T10:00:00Z","settlement_status":"HELD"}
```

`courier_delivered_at` is the existing persisted confirmation clock and the origin for the 72-hour deadline. Confirmation validates selected proof IDs, shipment, uploader, assignment, 1–3 count and object readability under lock; selected proof references become immutable. For TO_SELLER, delivery commits `RETURNED_TO_SELLER` + `HELD` and the response does **not** claim refund success. A later shared-service attempt, possibly by worker, performs REFUND. `GET /shipment-delivery-proofs/21` remains authenticated, role-scoped, `Cache-Control: no-store`; no raw object key in JSON.

## FINISH-03: Buyer delivery view, receipt and report

`GET /orders/42/delivery` by the owning Buyer before receipt:

```json
{
  "order_id":42,"order_status":"DELIVERED_PENDING_BUYER","server_time":"2026-09-26T10:05:00Z",
  "shipments":[{"id":17,"leg":"TO_BUYER","status":"DELIVERED","carrier":"Demo Courier","tracking_number":"DEMO-42","shipped_at":"2026-09-26T09:00:00Z","courier_delivered_at":"2026-09-26T10:00:00Z","proofs":[{"id":21,"url":"/shipment-delivery-proofs/21"}]}],
  "receipt_deadline_at":"2026-09-29T10:00:00Z","receipt_confirmed_at":null,"receipt_confirmation_source":null,
  "delivery_reported_missing_at":null,"can_confirm_receipt":true,"can_report_missing":true,
  "settlement_status":"HELD","settlement":null
}
```

The Seller projection omits TO_BUYER destination/photo and uses `proofs:[]`; an inactive reader gets false action flags per existing historical-read policy. A SELLER account that is `order.buyer_id` gets the Buyer projection/action rights after F1 reconciliation. No public QR receives these fields.

`POST /orders/42/confirm-receipt` by that active Buyer with `{}` before deadline and no report:

```json
{"order_id":42,"order_status":"COMPLETED","receipt_confirmed_at":"2026-09-26T10:06:00Z","receipt_confirmation_source":"BUYER","settlement":{"id":9,"kind":"RELEASE","source":"BUYER_RECEIPT","reason":"RECEIPT_CONFIRMED","currency":"THB","amount":"1350.00","settled_at":"2026-09-26T10:06:00Z"}}
```

Receipt confirmation, one RELEASE, Escrow `RELEASED`, Order `COMPLETED`, Product `SOLD`, command and history commit together. Original Payment/Receipt remain. `POST /orders/42/report-not-received` with `{"reason":"Parcel has not arrived at my address"}` before deadline instead returns:

```json
{"order_id":42,"order_status":"DELIVERY_DISPUTED","reported_at":"2026-09-26T10:06:00Z","settlement_status":"HELD"}
```

AUTO must never release this reported Order. After audited `POST /admin/orders/42/delivery-review` with `{"reason":"Review of missing parcel report"}`, `POST /admin/orders/42/resolve-delivery` with `{"resolution":"REFUND","reason":"Evidence review confirms non-delivery","evidence_refs":["delivery-report:42"]}` returns a terminal settlement and resolution in one commit; Admin cannot provide an amount. The report itself does not refund.

## FINISH-04: full simulated refund

After TO_SELLER proof confirms return, shared settlement returns:

```json
{"order_id":42,"order_status":"REFUNDED","settlement":{"id":10,"kind":"REFUND","source":"RETURN_DELIVERY","reason":"BUYER_REJECTED_INSPECTION","currency":"THB","amount":"1350.00","settled_at":"2026-09-27T12:00:00Z"}}
```

For a negative inspection, reason is `INSPECTION_NOT_AS_DESCRIBED` or `INSPECTION_FAKE`; for seller no-ship, source/reason are `SELLER_NO_SHIP`. Buyer refund `1350.00`, seller payout/retained allocations `0.00`, Escrow REFUNDED, Product CANCELLED, no relist, original Payment and Receipt still readable. Same Order can never also RELEASE.

## Boundary and failure fixtures

| Input/state | Contracted response/effect |
|---|---|
| Positive inspection, no persisted decision | `409 decision_required`; no outbound row. |
| Proof missing/unreadable, wrong shipment, >3 IDs, wrong Courier | No delivery confirmation or deadline; `409 proof_required`/validation or `503 storage_unavailable` as applicable; no money change. |
| New Buyer command after authoritative deadline | `409 receipt_deadline_passed`; deadline ordering remains the one Lead decision in [register](FINISH-contract-decisions.md). Same-key replay of an earlier committed command still succeeds. |
| Timely report versus worker | Exactly one locked outcome; a persisted report keeps HELD until Admin resolution. |
| Return delivery committed, refund service crashes | `RETURNED_TO_SELLER` + HELD remains visible; TIMER retries, without re-upload or fabricated refund response. |
| Release versus refund race | Unique Order/Escrow terminal settlement lets one win; loser gets authorized replay or `409 already_settled`, never an opposite payout. |
| Worker or Storage unavailable | Keep HELD; `503 storage_unavailable`/`settlement_unavailable` to direct caller, operational retry for worker. |

Error envelope: `{"detail":{"code":"receipt_deadline_passed","message":"Receipt window has ended"}}`; validation may include `detail.fields`. All fixture enum names beyond existing code are FINISH-spec v1 proposals pending G0 mapping, not evidence of running endpoints.
