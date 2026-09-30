# L1 frontend contract handoff

UI source selected by the frontend owner: local commit `794b193924b17f93f45afaee60f4ae5073a328b6` in `a234`. L1 changed no `mobile/` files. This contract describes the integrated backend candidate; device and shared Storage acceptance remain separate.

## Certificate routes

| Route | Response | Consumer |
|---|---|---|
| `GET /certificates/{opaque_token}` | Public HTML, no login. Valid and revoked certificates render status; unknown tokens render generic HTML 404. `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`. | QR code and external browser. `certificate.public_url` points here. |
| `GET /certificates/{opaque_token}/json` | Public JSON `{certificate_no, result, issued_at, status}`; unknown tokens return JSON 404 with `detail.code=certificate_not_found`. Same cache/referrer/robots headers. No identity, address, money, evidence, or token in the body. | Native app certificate screen. |

**Frontend change required:** `mobile/src/services/inspection-service.ts::publicCertificate` still calls `/certificates/${encodeURIComponent(token)}` and then parses JSON. Change only that request path to `/certificates/${encodeURIComponent(token)}/json`; keep the QR/public URL as the HTML route. The existing app screen at `mobile/src/app/certificates/[token].tsx` should show `status=REVOKED` as invalid instead of presenting its positive result as a usable certificate. Until this consumer update, the native certificate screen cannot parse the HTML response.

## Buyer result and decision

`GET /orders/{order_id}/inspection` accepts the `order.buyer_id` owner with account role `BUYER` or `SELLER`, including historical final-result reads after suspension. It returns `Cache-Control: no-store`. A result response has this shape (synthetic IDs and date):

```json
{
  "order_id": 42,
  "order_status": "RESULT_NOTIFIED",
  "result": "PASS",
  "summary": "The item passed inspection.",
  "inspected_at": "2026-09-29T08:00:00Z",
  "evidence": [{"id": 7, "mime_type": "image/png", "size_bytes": 77, "url": "/inspection-evidence/7", "expires_at": null}],
  "certificate": {"certificate_no": "CERT-EXAMPLE", "status": "ISSUED", "issued_at": "2026-09-29T08:00:00Z", "public_url": "https://api.example.test/certificates/opaque-example"},
  "decision": null,
  "can_decide": true,
  "next_action": "WAIT_BUYER_DECISION"
}
```

Only evidence selected in the final inspection result appears here. Its relative URL needs the same Bearer token as the result. An unselected image and a different buyer's image return 404. Inactive buyers can read selected historical evidence, while shipment delivery proof requires an active authorized account. Staff roles do not inherit buyer access from `buyer_id`.

`POST /orders/{order_id}/inspection/decision` accepts `{"decision":"CONFIRM"}` or `{"decision":"REJECT","reason":"..."}` for an active BUYER/SELLER owner with a positive result and issued certificate. The response is `{"decision":{"decision":"CONFIRM","reason":null,"decided_at":"..."},"next_action":"SHIP_TO_BUYER"}`. A normalized identical request replays the same decision; a different answer or reason returns `409 decision_already_recorded`. Negative or revoked certificate results return `409 decision_not_allowed`; an incomplete result returns `409 inspection_not_ready`. Invalid fields return `422 validation_error` with `detail.fields`. An inactive owner gets `403 account_inactive` even for a replay. The decision records intent only; it does not move Shipment, Payment, or Escrow.

For a SELLER who bought another seller's product, purchase history requires `GET /orders?role=buyer`; the default SELLER order list remains the selling view. Self-purchase remains `409 self_purchase`. The frontend owner's Order image fields remain in this candidate: Order and quote `product.image_url` use the signed product image lookup from `794b193`.

## Courier queue

`GET /courier/shipments` now defaults to `scope=pending&offset=0&limit=100`. The response keeps `items` and adds `scope`, `offset`, `limit`, `has_more`, and `next_offset`. Valid scopes are `pending`, `history`, and `all`; `limit` is 1–100. **Frontend change required:** `mobile/src/services/inspection-service.ts::courierShipments` and the Courier queue screen currently read only the first page. Follow `next_offset` until null for the chosen scope, and refresh from offset zero after queue changes. The default view now omits already confirmed deliveries; request `scope=history` to show them.

## Frontend acceptance checks

1. Open the QR URL in an unauthenticated external browser: HTML is visible; no private evidence or buyer data appears; revoked state is clear.
2. Open the in-app certificate screen through the JSON route; handle `status=REVOKED` and unknown-token 404.
3. Sign in as a SELLER who owns `order.buyer_id`: retrieve buyer history with `role=buyer`, selected evidence, final result, and one decision. The product's seller and unrelated accounts cannot see buyer evidence.
4. Verify the existing Order list/detail/quote product image on the frontend owner's latest UI revision.
5. Assign more than 100 pending Courier jobs in a test environment and verify every page is reachable without repeated items on a fixed dataset.
