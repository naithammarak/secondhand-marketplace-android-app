# UI2-00 — shipping client / DTO contract milestone

Base: PR130 `0ffff2de66d321ab37a0a725d4427716cbfecba3` (migration `r01e20261002`). Branch `claude/ui2-staff-certificates-2026-10-03`. First UI2 commit, for Lead to compose with UI1-01 into `E_BASE`. There are no backend, dependency or Expo-config changes, and no UI1-owned files are touched.

## Exports

`mobile/src/services/fulfillment-service.ts`:

- `createFulfillmentService({ baseUrl, fetch?, timeoutMs? })` → `FulfillmentService`.
- `FulfillmentServiceError { status, code, fields, uncertain }`. `status` 0 means no committed answer was received (network/timeout). `uncertain` is true for 0 and 5xx: refetch, then retry with the same key.
- `carrierBody(input)` — canonical carrier/tracking (trim, 1–100, no case or format change).

Every method takes the current account token first (same convention as `inspection-service`). Mutations take the caller's `Idempotency-Key` (8–100 characters, `[A-Za-z0-9_-]`) last, and resolve `{ result, replayed }`, where `replayed` reflects the `Idempotent-Replayed` header.

| Method | Route | Actor |
|---|---|---|
| `getDelivery(token, orderId)` | GET `/orders/{id}/delivery` | owning Buyer/Seller (role-redacted) |
| `getHistory(token, orderId, {limit, offset})` | GET `/orders/{id}/history` | owning Buyer/Seller |
| `getReturnAddress(token, orderId)` | GET `/orders/{id}/return-address` | owning Seller |
| `saveReturnAddress(token, orderId, address, key)` | PUT `/orders/{id}/return-address` | owning Seller, seven fields |
| `confirmReceipt(token, orderId, key)` | POST `/orders/{id}/confirm-receipt` `{}` | owning Buyer |
| `reportNotReceived(token, orderId, reason, key)` | POST `/orders/{id}/report-not-received` | owning Buyer, reason 10–1000 |
| `confirmReturn(token, orderId, key)` | POST `/orders/{id}/confirm-return` `{}` | owning Seller |
| `createFulfillment(token, orderId, {carrier, tracking_number}, key)` | POST `/orders/{id}/fulfillment` | assigned Inspector; leg/destination from server |
| `recordShippingEvent(token, shipmentId, {leg, event:'DELIVERED', event_id}, key)` | POST `/admin/shipments/{id}/shipping-events` | Admin, config-gated demo; `recipient_confirmed:false` |
| `reviewReturn(token, orderId, reason, key)` | POST `/admin/orders/{id}/return-review` | Admin; returns issued refs |
| `confirmAdminReturn(token, orderId, {reason, evidence_refs}, key)` | POST `/admin/orders/{id}/confirm-return` | Admin; 2–10 issued `return-shipment:`/`delivery-audit:` refs |
| `listDeliveryCases(token, {limit, offset})` | GET `/admin/delivery-cases` | Admin |
| `reviewDelivery(token, orderId, reason, key)` | POST `/admin/orders/{id}/delivery-review` | Admin; returns issued refs |
| `resolveDelivery(token, orderId, {resolution: 'RELEASE' or 'REFUND', reason, evidence_refs}, key)` | POST `/admin/orders/{id}/resolve-delivery` | Admin; one settlement |

Ship-to-center for the Seller stays `inspectionService.ship` (existing). Bad input is rejected locally as a 422 `FulfillmentServiceError` with `fields`, and no request is sent: reason bounds, carrier bounds, event id, reference patterns, duplicate refs, unknown resolution, bad key. Evidence refs are sorted to the server's canonical order.

`mobile/src/fulfillment/contract.ts` holds all DTOs in server snake_case:

- `DeliveryView`, `DeliveryShipment` (transport `transport_*`/`simulated_transport` separate from recipient `recipient_*`).
- `RefundQuote`, plus `BuyerSettlement`/`SellerSettlement` with the `isBuyerSettlement` guard.
- `HistoryPage`, `ReturnAddressView`, `FulfillmentResult`, `ShippingEventResult`, `ReturnReceiptResult`, `DeliveryCasesPage`, `DeliveryReviewResult`, `ReturnReviewResult`, `CommandResult<T>`, plus limits and patterns.

`canReportNotReceived(view)` reads the server flag. PR130 returns `can_report_missing`, while the mapping doc names it `can_report_not_received`; this is reported to Lead.

`mobile/src/fulfillment/fixtures.ts` has typed fixtures:

- `deliveryFixtures` covering:
  - decision open and legacy
  - shipping with no event, delivered via demo event, disputed (Buyer and Seller projections)
  - returning, return pending, item-only refund (Buyer and Seller)
  - negative full refund, Seller release
- `historyFixture`, `deliveryCasesFixture`, `deliveryReviewFixture`, `returnReviewFixture`, `errorFixtures`.

`mobile/src/services/inspection-service.ts` changes are compatible:

- `ResultWindow` type with `fulfillment_policy`, `result_available_at`, `result_decision_deadline_at`, `result_timed_out_at`.
- `BuyerResult` adds `server_time`.
- `WorkDetail` adds `buyer_decision`, `fulfillment`, `can_create_fulfillment` and `inspection_overdue_escalated_at`.
- `receive` sends `{}` when there is no note.
- The Buyer decision keeps the existing content replay with no new key.

`mobile/src/inspections/use-inspection-api.ts`:

- `useFulfillmentApi()` → `{ service, call, token }`, using the same current-account guard and 401 refresh as `useInspectionApi`.
- `inspectionError()` gains Thai messages for the new codes.
- `useInspectionMutation` keeps the key across uncertain outcomes for both error classes.

## Usage (UI1 binding example)

```ts
const api = useFulfillmentApi();
const view = await api.call(token => api.service.getDelivery(token, orderId));      // DeliveryView
const key = attemptKeys.get(`report:${orderId}:${reason}`) ?? Crypto.randomUUID(); // keep on uncertain errors
try {
  await api.call(token => api.service.reportNotReceived(token, orderId, reason, key));
} catch (error) {
  if (error instanceof FulfillmentServiceError && error.uncertain) { /* refetch, keep key */ }
} finally {
  await refetchDelivery(); // never show success from the command alone
}
```

## Checks

From `mobile`: `npm run typecheck` PASS; `tests/fulfillment-service.test.mjs` 7/7 and `tests/inspection-service-ui2.test.mjs` 3/3 PASS; the full `test:logic` suite passes.
