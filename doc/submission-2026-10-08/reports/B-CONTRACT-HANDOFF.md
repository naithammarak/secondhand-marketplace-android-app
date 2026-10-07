# Package B implementation handoff

Status: IMPLEMENTED_AND_TESTED backend; Android/shared runtime acceptance pending.
Latest correction source `9e8474c8c1bbf8b28d82aba51e4f212497863539`, initial source `1e3d6a061be4f6fa8e875885dfd68586aa79b7cc`, on `feat/package-b-delivery-settlement`, existing [PR124](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/124).
A source `33f0eadd8c1739735434ee9f103a5f23398178ed`, A head `94a26a0fbb7a0a82948d95de7db9af070707b770`, merge `76faba8a3fd939e7dad429f3351da583bd302cf0`. B `bc4f6c4` remains an ancestor. One head `a02f20261002`; no B migration. A independent review remains REVIEW_PENDING; source/model handoff is present, with no deployed release asserted.

## PR124 corrections for consumers

Admin discovers final shipment IDs via `GET /admin/orders/{id}.shipments` (id/leg/status/courier_id only), reached from its own Order list; assign using the existing Shipment route. TO_CENTER Order alias and privacy boundaries are unchanged. Admin payment_status reflects committed refunds, with RELEASE still PAID. Generated request-validation detail now omits input/context and safely serializes invalid Unicode, returning422. All five lifecycle scans persist/rotate their cursor in separate SYSTEM journal commands across processes; dry-run/scoped retry do not move it. No model/migration/financial-ledger changes. [Latest correction evidence](B-PR124-REVIEW-FIXES.md): 192 PostgreSQL passes, 626 default passes/263 skips, source review still pending.

## E / task06 contracts

Mutations require bearer auth and existing 8–100 character Idempotency-Key. Strict bodies prohibit client money/state/party/destination/time. ISO timestamps have UTC offsets; money is a two-decimal string. Private success/error responses use no-store.

| Route | Actor / body | Effect |
|---|---|---|
| POST /orders/{id}/fulfillment | Assigned active Inspector; carrier/tracking_number | 201 one server-derived final leg/snapshot |
| GET /inspections/{id} | Assigned Inspector | buyer_decision, fulfillment, next_action, can_create_fulfillment, overdue marker |
| GET /courier/shipments | Assigned active Courier; retained scope/pagination | Three legs; pending destination, no destination in delivered history |
| GET /courier/shipments/{id} | Assigned active Courier/Inspector | Minimal leg/proof/action detail |
| POST /admin/shipments/{id}/assign-courier | Active Admin; courier_id (retained body) | Active assignment before upload; existing audited replay ledger |
| POST /courier/shipments/{id}/proofs | Assigned active Courier; one JPEG/PNG file | 201 private upload, maximum3; no delivery transition |
| POST /courier/shipments/{id}/confirm-delivery | Assigned active Courier; proof_ids1–3 distinct integers | Atomic selected-only binding/confirmation |
| GET /shipment-delivery-proofs/{id} | Owning/assigned relationship | Authenticated bytes; no raw keys |
| GET /orders/{id}/delivery and /history | Related active Buyer/Seller | Redacted progress/actions/summary; paginated history |
| POST /orders/{id}/confirm-receipt | Owning active Buyer/Seller-as-Buyer; empty object | Atomic physical receipt + RELEASE |
| POST /orders/{id}/report-not-received | Owning Buyer; reason10–1000 | Timely dispute + HELD |
| GET /admin/delivery-cases | Active Admin; pagination | Case IDs/times only |
| POST /admin/orders/{id}/delivery-review | Active Admin; reason10–1000 | Idempotent audited scoped references |
| GET /admin/orders/{id}/delivery-proofs/{proof_id}?audit_id={id} | Same Admin's same-case audit | Selected private bytes |
| POST /admin/orders/{id}/resolve-delivery | Active Admin; resolution, reason, evidence_refs | Audited one-time RELEASE/REFUND |
| GET /admin/inspection-overdue | Active Admin; pagination | Unresolved escalated work IDs/times |

Keep `POST /inspections/{id}/receive` as the sole center-receipt mutation. Shipment.courier_delivered_at is the existing confirmation field; ShipmentConfirmedProof freezes selected IDs.

New confirmation: `{"proof_ids":[21,22]}`. Canonical order does not matter; duplicate/foreign IDs, unknown fields, missing body and invalid count/type fail. New commands fingerprint Shipment ID plus selected IDs under ORDER, matching the history FK. A's committed bodyless inbound commands replay with absent/empty body or identical frozen set; changed selected set conflicts. Original hashes/bindings stay untouched. The existing mobile service/caller sends IDs; E owns final-leg labels/controls and journey UI.

TO_BUYER: positive inspection+CONFIRM → SHIPPING_TO_BUYER; confirmed proof → DELIVERED_PENDING_BUYER + immutable72h deadline. Owning active Buyer flags require pre-deadline state without report/settlement. Exact-at/after writes reject after locked DB time sampling. Inspection CONFIRM is never physical receipt.

TO_SELLER: positive REJECT/either negative → frozen return destination. Dispatch retains RESULT_NOTIFIED; Shipment leg communicates transit. Stable confirmation records RETURNED_TO_SELLER/HELD at the committed delivery transaction. A subsequent independent refund may have completed: fetch delivery for current REFUNDED. On failure, pending_processing=true/HELD remain until task05 commits retry.

Seller receives no TO_BUYER private proof/address; final detail redacts Buyer shipping_address. Buyer summary exposes held_amount/buyer_refund; Seller exposes seller_payout/commission_amount. simulated=true identifies terminal money records. Courier history omits destination. Admin proof URLs require that Admin's audited case; ordinary proof URL denies Admin. No raw keys/signed URLs are exposed.

## C / task08 eligibility

Actual service tests persist COMPLETED + RELEASED + SOLD, preserving charge/receipt and1350→1140/60/100/50. These states can qualify under task08's checks. REFUNDED, HELD or inspection acceptance cannot qualify. Old backend/test-data/finish-contract.v1.json remains contract-only. A repeatable real-service fixture is in the [runbook](B-VERIFICATION-RUNBOOK.md).

## A / compatibility

No replacement model, competing migration, wallet or backfill. Source provenance is in [task03](03-FINISH-02.md). New-order integration is unblocked. Legacy in-flight null return snapshots remain frozen; return dispatch rejects pending separately reviewed audited repair. A review disposition and shared activation remain separate gates.

## Tasks03/05 service and F / task10

`order_settlement.settlement_service.settle(db, order_id, kind, source, reason, actor_id=None, worker_name=None, idempotency_key, admin_reason=None, evidence_refs=(), clock=None, dry_run=False)` returns SettlementOutcome(result, replayed). Caller commits/rolls back. Recognized workers: lifecycle and return-delivery; return-delivery only requests RETURN_DELIVERY. No public caller supplies worker, amounts or clock. New money writes require APP_ENV dev/development/test/demo and exact FULFILLMENT_SIMULATION_ENABLED=true; production/unknown environments deny.

`attempt_return_refund(engine, order_id)` opens its own session after delivery commit. Worker uses the same service for AUTO/no-ship/return retry. Five categories run via `python -m scripts.run_lifecycle_jobs`; target guards, dry-run/apply/recurring/retry, monitoring and Windows template are in the [runbook](B-VERIFICATION-RUNBOOK.md).

173 specialized PostgreSQL checks, default627/243skipped, mobile306logic/214components/typecheck pass; [evidence](B-verification.json). Android/shared Storage/OAuth/QR, E/C combined acceptance and task10 activation remain NOT RUN. Repository handoff is available to A/E/C/F; no direct teammate message was sent because no recipient/channel was supplied. Neither GitHub PR was merged.

Unpaid fairness follow-up: [B-RF05-REWORK](B-RF05-REWORK.md) records the separate correction on the current B base, new durable deadline/ID cursor and focused independent-review gates. Earlier verification totals above remain historical.
