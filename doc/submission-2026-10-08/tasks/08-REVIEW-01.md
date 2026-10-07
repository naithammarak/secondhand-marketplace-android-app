# 08 / REVIEW-01 — Persisted seller reviews

**Priority:** P1 requested addition · **Owner:** Full stack Codex · **Depends:** 02, 04; migration after 07 · **Target:** 4 Oct

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement REVIEW-01 in the combined release containing task 04 settlement. Locate the submission packet and read DOC-01-scope.md, PROFILE-REVIEWS-contract.md, RELEASE-DESIGN.md, FINISH-00-release-gates.md and QA-MATRIX.md. Before mobile changes follow its AGENTS.md exact Expo documentation requirement. Preserve latest UI. If upstream settlement is not yet available, implement independently against the selected contract and fixtures, then explicitly mark final integration blocked by its missing base; do not fabricate completed Orders in normal API mode.

Create the minimal immutable review model/migration and APIs from PROFILE-REVIEWS-contract.md: unique review per Order; active actual Buyer of a COMPLETED+RELEASED Order may submit rating1–5 and optional comment≤1000. Derive buyer/seller/product from the locked Order, including Seller-role users acting as buyers. Refunded/cancelled/disputed/pending Orders cannot be reviewed. Strict payload rejects recipient, order state, product/inspection scores, tags and photos. Coordinate the migration after task 07 on the task 02 chain and keep one head.

Implement GET/POST /orders/{id}/review and public GET /sellers/{seller_id}/reviews pagination. Use existing Idempotency-Key format and replay semantics, canonical comment/rating and a DB unique constraint to prevent concurrent duplicate reviews. Public label is exactly 'ผู้ซื้อที่ยืนยันการซื้อ'; do not expose buyer/order IDs, real names, email, phone, addresses or inspector identity. Return real total/count/rounded average or null at zero plus distribution1..5; aggregate is over all reviews, not the page. Use a consistent read snapshot for aggregate/list.

Wire the existing /orders/[orderId]/review route and review-modal to persisted submit. Keep only seller stars and optional comment. Success navigates/refetches after the server response; network error retains form/key and does not pretend saved. Use server can_review and show existing submitted review. Wire seller-reviews-modal from product detail to the real public API, removing INITIAL_SELLER_REVIEWS, fixed4.8/count29/distributions from API mode. Provide honest zero-review/loading/error/pagination states and account-switch guards. Inspection rating, product score, tags/photos/replies/edit/delete are deferred.

Test eligibility/IDOR/inactive/field injection, bounds/Unicode safe text, duplicate concurrent requests and key reuse/replay, aggregates/pagination and public PII omission in isolated PostgreSQL. Test mobile successful submit, failed submit/retry, zero reviews, pagination and stale account response; run focused tests and typecheck. Deliver code, migration/API fixtures and reports/08-REVIEW-01.md using the template with exact upstream/head and evidence. Complete working APIs/UI rather than only a design or mock demo.
```

## Acceptance

- Completed sale produces one review; reload and another user's public view show actual persisted values.
- No reviews for rejected/refunded/pending/non-owned Orders; repeated/concurrent submit does not duplicate.
- Ratings/count/distribution/zero state are true and public reviewer identity is masked.
