# F1 — Seller-as-buyer access handoff

## Local change

- Effective base: PR #112 `feat/cert-04-buyer-decision` at `85ea7546dd7d725bc6621a1f9ca9ec87ef8cd8ee` (verified live on 2026-09-29).
- Local branch: `codex/f1-buyer-access` in `/home/tmk/.codex/worktrees/451e/secondhand-marketplace-android-app`.
- Scope: Order quote/create accepts active BUYER or SELLER; `order.buyer_id` stays the buyer authority. Result, selected evidence, and courier proof reads accept either account role under their existing status rules. Decision reloads the account after the Order lock and accepts only an active BUYER or SELLER owner. No schema, migration, mobile, Payment, Escrow, or Shipment change.
- `GET /orders?role=buyer` retrieves purchase history after promotion. A SELLER's default list still selects the seller view, so consumers showing purchase history must request `role=buyer`.

## Endpoint policy

| Endpoint | BUYER/SELLER order buyer | Inactive order buyer | Seller of item / other owner / staff |
|---|---|---|---|
| `GET /orders/{id}/inspection` | Final result and selected evidence URLs | Historical final result, `can_decide=false` | Denied; item seller 403, unrelated account 404 |
| `POST /orders/{id}/inspection/decision` | Active only; one decision, normalized same-payload replay | Denied even for replay | Denied |
| `GET /inspection-evidence/{id}` | Selected final-result image only | Historical selected image allowed | Denied except assigned active Inspector |
| `GET /shipment-delivery-proofs/{id}` | Active only | Denied | Denied except authorized active Courier/Inspector |

Staff account roles never gain buyer capability from a matching historical `buyer_id`. Negative results remain readable without a decision; missing/revoked certificates still prevent a new decision. Self-purchase stays `409 self_purchase`.

## Synthetic API example

For an active SELLER whose account ID is `orders.buyer_id`:

```http
GET /orders/42/inspection
Authorization: Bearer <seller-account-token>

200 Cache-Control: no-store
{"order_id":42,"result":"PASS","can_decide":true,"evidence":[{"id":7,"url":"/inspection-evidence/7","expires_at":null}],"decision":null,"next_action":"WAIT_BUYER_DECISION"}

POST /orders/42/inspection/decision
Authorization: Bearer <seller-account-token>
Content-Type: application/json

{"decision":"CONFIRM"}

200 Cache-Control: no-store
{"decision":{"decision":"CONFIRM","reason":null,"decided_at":"2026-09-29T00:00:00Z"},"next_action":"SHIP_TO_BUYER"}
```

The example omits unrelated result fields; it is not a captured runtime response. CERT decision only records intent. FINISH handles later shipment and settlement.

## Verification

- On the unmodified PR #112 code, the four initial seller-access PostgreSQL cases failed: seller purchase, promoted owner result read, and two account-change-under-lock cases.
- On this change, `backend/tests/test_inspection_flow_postgres.py`: **36 passed**, 0 skipped, 2 dependency deprecation warnings. Each run used a fresh, empty, local disposable PostgreSQL 16 database and applied migrations there only.
- `backend/tests/test_orders_api.py`: **77 passed**, 0 skipped, 2 dependency deprecation warnings.
- `backend/tests/test_orders_postgres.py`: **26 passed**, 0 skipped, 2 dependency deprecation warnings, on a separate disposable local PostgreSQL database.
- The PostgreSQL flow covers seller purchase, promotion before/after purchase and during decision locking, selected/unselected evidence, courier proof, inactive reads/replay denial, staff/other-owner denial, negative results, conflicting and concurrent decisions, and unchanged Payment/Escrow/Shipment counts/status.

Commands (set each PostgreSQL variable to a different empty local disposable database; the test fixtures apply migrations):

```sh
INSPECT_FLOW_TEST_DATABASE_URL=<local-inspect-test-db-url> pytest -q backend/tests/test_inspection_flow_postgres.py
pytest -q backend/tests/test_orders_api.py
ORDER_TEST_DATABASE_URL=<local-order-test-db-url> pytest -q backend/tests/test_orders_postgres.py
git diff --check 85ea7546dd7d725bc6621a1f9ca9ec87ef8cd8ee..HEAD
```

## Integration gate for L1/F3

Cherry-pick the local F1 commit onto the combined Wondee/CERT candidate. Re-run Order and INSPECT/CERT tests against a new disposable PostgreSQL database after reconciling the migration graph. Check the actual role promotion, private Supabase Storage permissions, OAuth account state, Android buyer history (`role=buyer`), and later FINISH handoff on that combined candidate. This F1 branch does not establish those integration or device outcomes. No shared database, GitHub issue, deployment, push, or remote merge was changed.
