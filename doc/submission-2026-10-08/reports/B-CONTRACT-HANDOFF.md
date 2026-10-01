# Package B preparatory handoff to A / E / C / F

**Status: PENDING accepted A/task02; contracts and fixtures only.** Prepared
2 October 2026, Asia/Bangkok. This is not task02's `API-MAPPING.md` and does not
declare tasks03/04/05 complete. No new FINISH endpoint or financial worker is
mounted. A owns the migration chain and must supply the accepted mapping first.

## Provenance and commits

| Item | Verified value |
|---|---|
| Inspected checkout / preparatory parent | `d98d4a0b4b5d0cbfdce842ac886ed0ffc0409b05` |
| Branch | `feat/package-b-delivery-settlement` |
| Contract/code/fixture commit | `7918fc26a40df7eb316850482309600d9051d325` |
| Windows worker regression commit | `0b219f262ec670369b22053c8bbbc4654b1cb809` |
| Remote `main` observed | `8254f8d224f62aa765f978f65f110139410a09ab` |
| Remote latest source handoff observed | `cea7624140dc1fa065ebd0c12084a8663e3dcfe3` |
| Accepted release-base SHA | **NOT SUPPLIED**; do not substitute either source handoff |
| Accepted task02 SHA / report / API mapping | **NOT SUPPLIED / NOT PRESENT** |
| Existing Alembic head | `714f11c84d53`; no B migration added |

`git ls-remote origin` and subsequent checks for task02/package-a/release/finish
branches found no accepted task02 candidate. The latest handoff explicitly
excludes the separate A foundation checkpoint. There is no root/backend
`AGENTS.md`; `mobile/AGENTS.md` does not apply to these backend files. Mobile
files and current API routers/models/migrations were not edited.

## A: missing inputs and model requirements

Please supply the exact accepted release parent and task02 commit/patch, including
`reports/02-FINISH-01.md` and `reports/API-MAPPING.md`. The following gaps were
observed in actual code; A chooses/reconciles physical names and one migration
head. No B replacement tables or address provider have been created.

| Existing infrastructure | Missing accepted extension needed by B |
|---|---|
| `Order`, Buyer `ship_*` snapshot | Seller-owned validated frozen return snapshot; FINISH states, receipt deadline, receipt source/time, immutable missing-report facts |
| `Shipment`, `courier_id`, `courier_delivered_at` | Immutable current destination; at-most-one final direction; immutable selected-proof binding, including legacy TO_CENTER handling |
| `ShipmentDeliveryProof`, private `inspection_storage` | Freeze 1–3 selected IDs for the current leg/Courier; prohibit mutation of confirmed references |
| `Escrow`, currently `HELD` only | `RELEASED` / `REFUNDED` and settlement timestamp |
| `Payment` / original `Receipt` | Matching Order/Payment/Escrow tuples for terminal settlement; preserve successful charge and all original snapshots |
| No terminal settlement model | One immutable RELEASE **or** REFUND per Order and Escrow, matching party/amount FKs and Decimal sum checks |
| `InspectionIdempotency` uses required human actor | Accepted replay mapping for human and named system operations; resource/action/key scope; no placeholder system User |
| Existing inspection and access records | Append-only Order history, scoped case audit/resolution; existing Admin action CHECK only admits `ORDER_CONTACT_REVEAL` |
| `Inspection`, center `Shipment.received_at` | Durable one-time overdue escalation marker reserved by task02 |

Keep lock order **Order → Shipment → Escrow → Product** for existing Orders.
Refresh authenticated User/assignment facts after waiting for locks. `ship-to-center`
must reject a new shipment at/after `paid_at + 72h`, using the same Order lock and
fresh DB wall clock as no-ship refund; preserve successful same-key replay.

## E: concrete route plan and current compatibility

This table distinguishes inspected existing routes from additions awaiting A.
The new strict request classes are executable contracts, not active endpoints.
Retain the concrete `/courier` prefix; do not build a second Courier router.

| Route | Current state / required integration | Request |
|---|---|---|
| `POST /orders/{id}/ship-to-center` | Exists; add A return snapshot requirement and server no-ship deadline guard | Existing `{carrier,tracking_number}` |
| `POST /inspections/{id}/receive` | Exists; canonical center receipt, keep separate from Courier confirmation | Existing `{note?}` |
| `GET /courier/shipments` | Exists for TO_CENTER only; extend all legs and minimal destination | Existing `scope`, `limit`, `offset`; preserve pagination compatibility |
| `GET /courier/shipments/{id}` | Not mounted; add assigned-work detail in existing router | None |
| `POST /admin/shipments/{id}/assign-courier` | Exists for TO_CENTER only; extend all legs and audited reason | Current `{courier_id}`; accepted extension `{courier_id,reason}` |
| `POST /admin/orders/{id}/assign-courier` | Existing inbound alias; preserve meaning | Current `{courier_id}` |
| `POST /courier/shipments/{id}/proofs` | Exists for TO_CENTER only; extend all legs | Multipart one JPEG/PNG `file` |
| `POST /courier/shipments/{id}/confirm-delivery` | Exists for TO_CENTER, no body/selection; accepted extension must bind selected IDs | `{proof_ids:[21]}` |
| `GET /shipment-delivery-proofs/{id}` | Existing private bytes; extend relationship/leg access with scoped audit | Bearer authentication, no-store |
| `POST /orders/{id}/fulfillment` | Not mounted; assigned Inspector, server-derived leg/destination | `{carrier:"Demo Courier",tracking_number:"DEMO-42"}` |
| `GET /orders/{id}/delivery` | Not mounted; Buyer/Seller redacted view | None |
| `GET /orders/{id}/history` | Not mounted; bounded redacted history | `limit=20&offset=0` |
| `POST /orders/{id}/confirm-receipt` | Not mounted; owning active BUYER or SELLER acting as Buyer | `{}` |
| `POST /orders/{id}/report-not-received` | Not mounted; timely owning Buyer report, HELD | `{reason:"Parcel has not arrived"}` |
| `POST /admin/orders/{id}/delivery-review` | Not mounted; existing disputed case only, audited access | `{reason:"Review of missing parcel report"}` |
| `POST /admin/orders/{id}/resolve-delivery` | Not mounted; audited one-time resolution through shared settlement | `{resolution:"REFUND",reason:"Evidence confirms non-delivery",evidence_refs:["delivery-report:42"]}` |

All new commands forbid extra fields, client money/party/state/destination/time.
Reuse the existing Idempotency-Key syntax `[A-Za-z0-9_-]{8,100}`. Canonical proof
IDs and evidence refs are sorted and distinct; text is trimmed before hashing.
Evidence-reference syntax validation does **not** authorize a reference: the
integration must verify each reference belongs to this same audited case.

Existing Courier queue returns `scope`, `has_more`, `next_offset`, `limit`,
`offset`, `items`; do not silently replace it with the older conceptual total
pagination response. A/E should agree on additive fields in API-MAPPING.

## Fixtures, action flags and access

Use [`backend/test-data/finish-contract.v1.json`](../../../backend/test-data/finish-contract.v1.json).
The top-level `CONTRACT_ONLY_NOT_LIVE` marker must remain clear in development.
It supplies Buyer pending delivery, Seller redacted progress, durable return with
refund pending, timely report, COMPLETED/RELEASED and full-refund examples.

`can_confirm_receipt` and `can_report_missing` require an owning active BUYER or
SELLER account, `DELIVERED_PENDING_BUYER`, confirmed TO_BUYER delivery, HELD, no
report or settlement, and `server_time < receipt_deadline_at`. Result CONFIRM
never makes either action eligible. At the deadline both flags are false even
if the worker has not scanned. Commands must recheck eligibility, rather than
trusting previously returned flags.

| Actor | Private proof/destination contract |
|---|---|
| Owning Buyer, including Seller buying this Order | Own relevant legs; no unrelated Order/proof |
| Owning Seller | Inbound and return proof; TO_BUYER progress has `proofs:[]` and no Buyer destination |
| Active assigned Courier | Only assigned current leg/destination/proof; no finance or inspection findings |
| Active assigned Inspector | Only assigned work and destination needed to dispatch; no settlement mutation |
| Active Admin | Private evidence only through authorized, audited disputed-case access |
| Unrelated / anonymous / inactive proof reader | Denied; no object key/bytes disclosed |

Buyer settlement summary uses `amount` (held total for RELEASE, full refund for
REFUND); Seller uses `seller_payout`. Refund Seller payout is `0.00`. No private
Admin free-text reason, object key or arbitrary image URL appears in summaries.

## C: reviews dependency

The fixture `buyer_completed_release` provides the anticipated read shape only.
It does **not** establish task04 completion or review eligibility. C/task08 must
wait for actual task04 **COMPLETED + RELEASED** database state at an accepted
combined SHA. `RETURNED_TO_SELLER`, `REFUNDED`, inspection CONFIRM and all fixture
responses cannot qualify. B will supply real final-state creation commands and
row evidence after A's model integration and settlement verification.

## Shared service interface for tasks03/04/05

Prepared executable protocol: `app.services.finish_interfaces.SettlementService`.
The eventual implementation belongs in the single `order_settlement` service:

```python
settle(db, *, order_id, kind, source, reason,
       actor_id, worker_name, idempotency_key,
       admin_reason=None, evidence_refs=()) -> dict
```

`db` is caller-owned; settlement must never commit implicitly. Exactly one of
an authorized human actor and an allowlisted system worker is accepted. Amounts,
recipients, states and receipt source derive from locked persisted facts. HTTP
and worker wrappers commit or roll back once. Buyer receipt/RELEASE and Admin
resolution/settlement include command/history/audit in the same transaction.

Task03 return delivery commits its proof selection, `RETURNED_TO_SELLER` + HELD,
history and replay first. It then starts a separate session/transaction calling
the same REFUND branch. Failure leaves a durable retry candidate and a truthful
pending-processing response. A delivery replay must return its stable delivery
references and freshly authorized current state, never cached refund success.

Prepared independent helpers: `finish_policy.final_leg`, `return_reason`,
`allocation`, `database_now`, `before_deadline`, `no_ship_due`,
`inspection_due_at`, `simulation_allowed`, `buyer_action_flags`,
`proof_read_allowed`; `finish_proofs.verify_selected_proofs` consumes existing
proof rows and `inspection_storage.download_object`. No financial persistence,
lock coordinator, replay authorization or worker implementation is fabricated.

## Verification and resume

132 prepared contract/fixture/proof/clock tests passed: 131 independent checks
and one actual PostgreSQL blocked-lock/fresh-clock test. Existing Order/unpaid
worker suite: 35 passed. Existing Courier/inspection suite: 40 passed, using
local private Storage. See the [runbook](B-VERIFICATION-RUNBOOK.md) and individual
task reports. These results do not prove final RELEASE/REFUND, shared Storage,
Android or scheduled runtime activation.

Receive A's accepted upstream, verify its ancestry/mapping/models, integrate03
then04, run real final-state/financial races and return-failure tests, send the
implemented commits/interfaces to A/E/C, then integrate05 and its no-HTTP tests.
No recipient handles or cross-session messaging channel were supplied; this
repository handoff is prepared for A/E/C/F without claiming direct delivery.
