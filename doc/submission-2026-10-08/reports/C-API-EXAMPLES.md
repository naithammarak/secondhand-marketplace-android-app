# Package C API / integration handoff to A and E

Base A PR123 `94a26a0fbb7a0a82948d95de7db9af070707b770`. C isolated worktree `D:\projectsa\package-c`; do not copy its dependency directories or test PostgreSQL. A owns merge order for E; C's profile-screen/login-screen changes live only here.

## Task07 — independently consumable

Authenticated requests use `Authorization: Bearer <current session token>`.

```http
GET /profile
PATCH /profile
Content-Type: application/json

{"full_name":"ชื่อที่แก้ไข"}
```

```http
POST /profile/policy-acknowledgement
Content-Type: application/json

{"policy_version":"submission-2026-10-01"}
```

All return the same private projection (synthetic example; timestamps are server-generated):

```json
{"id":42,"full_name":"ชื่อที่แก้ไข","email":"buyer@example.test","role":"BUYER","status":"ACTIVE","privacy_policy_version":"submission-2026-10-01","privacy_acknowledged_at":"2026-10-02T06:00:00Z"}
```

Before acknowledgement both policy fields are null. Unsupported fields/version or invalid name → 422 `validation_error`; inactive writes → 403 `account_inactive`; no target user ID accepted. Saving name does not update historical Order snapshots. Same-policy POST retains first DB timestamp.

`createProfileService({baseUrl})`: `get(token,signal?)`, `save(token,name,signal?)`, `acknowledge(token,signal?)`. `useProfile()` exposes `profile,busy,error,reload,save,acknowledge`; operations return success boolean only for the same account generation. Mount `ProfileDetails key={session.user.id} model={model}`; use `model.profile.full_name` in identity card. Keep existing auth/verification gates and approved Seller Buyer navigation. `ConsentModal` persists acknowledgement internally and then invokes `onAgree`; cancellation just closes it.

No mock mode for these services: missing API configuration produces a retryable unavailable error. Shared timeout includes response-body reads. On account change/unmount hook cancels and rejects stale commits to UI. Server still authorizes every request.

## Migration / file ownership

`a02f20261002` → `c07f20261002` → `c08f20261002`. No competing head. C owns new profile/review modules, existing review/consent components and isolated screen wiring. A applies C's profile identity/form/policy and removes old mock widgets before combining E's entry/navigation work. Preserve E's fulfillment controls. Do not replace the full E screen with an older copy.

Task08 final integration stays pending accepted B/task04. Test-only terminal fixtures must never be exposed in the regular API or app.

## Task08 — review contract and exports

```http
GET /orders/42/review
Authorization: Bearer <owning Buyer token>
```

```json
{"order_id":42,"can_review":true,"review":null}
```

Only the server decides can_review: ACTIVE actual Buyer (including approved Seller acting as Buyer), COMPLETED Order, RELEASED Escrow and RELEASE settlement. After submission can_review=false and review contains the persisted private result.

```http
POST /orders/42/review
Authorization: Bearer <owning Buyer token>
Idempotency-Key: review-attempt-0001
Content-Type: application/json

{"rating":5,"comment":"แพ็กดี สินค้าตรงภาพ"}
```

```json
{"id":7,"order_id":42,"rating":5,"comment":"แพ็กดี สินค้าตรงภาพ","created_at":"2026-10-02T06:00:00Z"}
```

201 after commit; exact canonical replay returns same result + `Idempotent-Replayed: true`. Existing header contract: 8–100 ASCII letters/digits/_/-. Whitespace at comment boundaries is stripped; absent/blank comment canonicalizes to empty string. Same-key changed body → `idempotency_key_reused`; other key once reviewed → `review_already_exists`; ineligible state → `order_not_reviewable` (all 409); strict field/rating/comment validation → 422. Recipient/order state/inspection score/product score/photos/tags fields forbidden. No edit/delete/reply endpoint.

```http
GET /sellers/3/reviews?limit=20&offset=0
```

```json
{"seller_id":3,"summary":{"count":1,"average_rating":5.0,"distribution":{"1":0,"2":0,"3":0,"4":0,"5":1}},"items":[{"id":7,"rating":5,"comment":"แพ็กดี สินค้าตรงภาพ","created_at":"2026-10-02T06:00:00Z","reviewer_label":"ผู้ซื้อที่ยืนยันการซื้อ","product_name":"เสื้อแจ็กเก็ตมือสอง"}],"total":1,"limit":20,"offset":0}
```

Public without token; latest APPROVED ACTIVE Seller only. At zero: items=[], total=count=0, average_rating=null, all distribution values 0. Limit1–100, offset≥0, newest created_at/id DESC. Summary always across all reviews. Product name comes from original Order snapshot. Public item has exactly the six displayed fields above; never display private submitted-review order_id in a public list.

Product GET/list now return additive `seller.id` beside `display_name`/`verified`. Mobile `PublicSeller.id` maps this value (optional for old fixtures); missing ID displays unavailable/retry, never a fake review dataset. Keep this mapping when combining E's catalog changes.

Exports:

- `createReviewService({baseUrl})`: `get(token,orderId,signal?)`, `submit(token,orderId,{rating,comment},key,signal?)`, `publicList(sellerId,offset?,limit?,signal?)`. Types `ReviewInput`, `SubmittedReview`, `OrderReview`, `PublicReview`, `SellerReviews`.
- `useOrderReview(orderId)`: account/request generation guard, server data, submit/reload, error/busy, frozen uncertain attempt. Token refresh requires the same current account. GET reload recovers an already-committed submission after lost response.
- `OrderReviewEntry({orderId,productName,onReviewed?})`: mount in completed own-buyer Order detail; it loads can_review before showing action and displays actual submitted review. It opens the existing `ReviewModal` and refreshes after persisted response. E should retain this entry when adding receipt/settlement controls.
- `ReviewModal({visible,orderId,productName,onClose,onSubmitted?})`: internal API submission; no mock onSubmit callback. Account/order key clears drafts on switch. Uncertain failure retains exact input/key for retry. Route `/orders/[orderId]/review` uses this component too.
- `SellerReviewsModal({visible,sellerId,sellerName?,onClose})`, `SellerReviewSummary({sellerId})`, `useSellerReviews(sellerId,enabled?)`: actual aggregate/list, true zero, retry and page navigation, cancellation on seller/visibility change; summary refreshes on focus. My Products resolves its seller ID through private Profile API, not a hardcoded ID.

Do not copy test terminal fixtures into demo API state creation. For final B acceptance, use its ordinary completed receipt/settlement path and capture task04's accepted commit in report08. F retains native device evidence ownership.
