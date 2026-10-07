# FINISH-00 readiness v1 — 29 September 2026

Status: planning evidence for [FINISH-00 #98](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/98), **not** an integrated or deployed implementation. Read with [the decision register](FINISH-contract-decisions.md), [API fixtures](FINISH-api-fixtures.md), and the issue handoffs in this directory. Source was inspected read only; no database, application tests, or PRs were changed.

## Source coordinates and G0

| Source checked | Exact revision / state at review | Meaning |
|---|---|---|
| `a234/codex/wondee-ui-redesign` | `794b193924b17f93f45afaee60f4ae5073a328b6`, clean | Local Wondee checkout; backend differs from #113 in Order image handling and merge-file formatting. It has no CERT buyer-decision table/API. |
| PR #108 INSPECT | `f0d1494c223d4e2317ff32f9bc44926e6885f233`, OPEN, base `main` | Upstream Inspect storage branch. |
| PR #109 CERT-01 | `09118fe2f4b05ac3a3a89432d51945f63b14a7fc`, OPEN, base #108 branch | Certificate extension and buyer decision migration in its ancestry. |
| PR #110 CERT-02 | `3f5f1304d58d60354d95e12a8a0f22c47852056d`, OPEN, base #109 branch | Head moved since handoff. |
| PR #111 CERT-03 | `260bec7e1e4c0898b1bb6283ee3230b9e1ac6cd7`, OPEN/DRAFT, base #110 branch | Head moved since handoff. |
| PR #112 CERT-04 | `85ea7546dd7d725bc6621a1f9ca9ec87ef8cd8ee`, OPEN/DRAFT, base #111 branch | One-time Buyer decision source; not in #113 or a234. |
| PR #113 Wondee integration | `9a3313757675848fe542085e3173fd5ea34fd445`, OPEN/DRAFT, base #108 branch | Wondee + INSPECT, no CERT-04 decision. |
| PR #114 Wondee UI | `b6667c2cc4c8beabd2de11ffb0c11206e2b444ad`, OPEN/DRAFT, base #113 branch | UI follow-up, not FINISH backend. |

Read-only `git merge-base #112 #113` was `d6a1a1a8f86b2bc1e3c2b5bcb0b0d1b34b3f8d59`; neither head is an ancestor of the other. The common integrated candidate therefore **does not yet exist in the inspected sources**. Recheck all heads at L1 handoff. Do not infer integration from files present in separate branches.

Migration graph evidence: #113 has `f3c1a09d8b56` → `c7e4b21a9d08` plus Wondee `19d4be72a610`, joined by `e8b2c490a713`. #112 adds `d8b7c4e2910a` after `c7e4b21a9d08`. An L1 combination needs one new descendant/merge path from the **actual** candidate graph and applied revision audit; never rewrite applied revisions or assert one head until checked. DB1 owns the common Alembic lineage, `orders.status`/Shipment/Courier schema reconciliation; DB2 owns FINISH-01 additions and reviews the combined migration. No shared DB migration is authorized by this planning work.

## Actual source inventory, not proposed FINISH behavior

| Component | Observed fields/behavior | FINISH consequence |
|---|---|---|
| Order/payment | `backend/app/models/order.py`: `Order` has buyer/seller/product IDs, immutable product/amount snapshots, Buyer `ship_*` address, `paid_at`, expiry/cancel fields. `PaymentAttempt`, successful `Payment`, `Escrow(status=HELD)`, and `Receipt` are separate persisted rows with one-per-Order/payment and amount FKs. `orders.py::is_paid` uses `paid_at`, so FINISH-spec §2's old status-only warning is fixed. | Extend Order/Escrow; preserve Payment and original Receipt. Current Order statuses end at `RESULT_NOTIFIED` or unpaid `CANCELLED`; no receipt/settlement state or service. |
| Product | `Product.status` allows `AVAILABLE/RESERVED/SOLD/CANCELLED`; paid Order retains its reserved Product. | RELEASE → SOLD; REFUND → CANCELLED, no automatic relist. |
| Inbound Shipment | `backend/app/models/shipment.py`: one `shipments` table, `leg=TO_CENTER/TO_BUYER/TO_SELLER`, unique `(order_id,leg)`, status `IN_TRANSIT/DELIVERED`, `courier_id`, `courier_delivered_at`, `received_at/by`; proof rows have private `object_key`, MIME, size, SHA and uploader. | Leg names and proof storage already exist. No `destination_*` snapshot, outbound exclusion constraint, or selected/confirmed proof IDs yet. `courier_delivered_at` is the existing confirmed-delivery timestamp; map it to proposed `delivery_proof_confirmed_at` instead of adding a second clock without a need. |
| Courier API | `backend/app/api/inspections.py` has `/admin/shipments/{id}/assign-courier`, `/courier/shipments`, `/courier/shipments/{id}/proofs`, `/courier/shipments/{id}/confirm-delivery`, `/shipment-delivery-proofs/{id}`. `_courier_shipment`, admin lookup, queue and transitions hardcode `TO_CENTER`; confirmation currently takes no `proof_ids` and only checks existing 1–3 objects. `POST /inspections/{id}/receive` separately records center receipt. | Extend these canonical routes to all legs and add selected proof binding; avoid duplicate `/shipments` subsystem or second receive endpoint. Operator `COURIER` role exists; real provisioning and all-leg authorization/Android proof acceptance remain gates. |
| Inspection/certificate | `Inspection` is unique per Order with four results, private evidence and result evidence links; `Certificate` is unique per Order/Inspection and only PASS/MINOR_ISSUE. `POST /inspections/{id}/result` issues qualifying certificate atomically in the CERT branch, then sets `RESULT_NOTIFIED`. | Negative result requires return; positive result requires persisted Buyer decision before TO_BUYER. Never treat certificate/decision as receipt or release. |
| Buyer decision | #112 model `BuyerInspectionDecision` has unique Order and Inspection, composite FKs to Order Buyer, Inspection and Certificate, immutable UPDATE/DELETE trigger. API `GET /orders/{id}/inspection`, `POST /orders/{id}/inspection/decision` stores CONFIRM/REJECT. | Reuse this row. Current #112 mutation checks `actor.role == BUYER`; Wondee product policy permits a SELLER account to buy another seller's item. F1 access reconciliation and L1 candidate verification are prerequisites to full G1, not a new decision table. |
| Existing timer | `services/order_expiry.py` and `scripts/release_expired_orders.py` handle unpaid expiry/orphan repair, not a recurring FINISH worker. | TIMER-01 must run independently of API traffic and must not accidentally enable unrelated orphan repair. F2 may adjust unpaid expiry only. |

## G1/G2 gate disposition

| Gate | Disposition now | Evidence needed to close |
|---|---|---|
| G0 common base | **OPEN** | L1 supplies one candidate SHA containing latest CERT decision, Wondee/INSPECT, F1/F2 changes and reviewed a234 Order-image commit; `git status`, migrations/heads, applied-history plan and diff ownership. |
| G1 Order → proof → inspection → certificate → decision | **PARTIAL on separate branches** | On candidate: paid Order/Escrow link, center proof and Inspector receipt, four results and atomic certificate behavior, one decision with Seller-as-Buyer authorization, all at one SHA. Negative results need no Buyer decision. |
| G2 Courier + destinations | **OPEN** | Assigned Courier's private proof works for all three legs, with selected confirmation and authorized bytes; Buyer destination from Order `ship_*`; immutable validated Seller return snapshot added upstream. No Buyer/profile/Inspector fallback. Existing legacy Order without valid Seller snapshot returns `409 fulfillment_destination_missing` and remains HELD for explicit resolution. |

The narrow return-address task and Courier/TIMER dependencies are in [FINISH-dependencies.md](FINISH-dependencies.md). Proposed FINISH code can be designed and reviewed now; migration/API implementation that depends on a unified graph or a real return destination waits for the integrated candidate. Neither this review nor the PR states prove staging Storage, operator accounts, worker deployment, shared DB, or Android acceptance.
