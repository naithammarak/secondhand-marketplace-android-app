# 02 / FINISH-01 + COURIER-01 — Schema and immutable return address

**Priority:** P0 · **Owner:** Backend/DB Codex (migration owner) · **Depends:** 01 · **Target:** 2 Oct

## Outcome / ownership

One reviewed migration chain for final states, return snapshot, proof binding, receipt/report/command records and exactly one settlement. Own `models`, migrations, schema fixtures and API mapping. Work 07 then 08 extends this same chain; 03/04 reuse its models.

## Prompt สำหรับ Codex

```text
Implement task 02 on the exact release base delivered by INT-01. Locate doc/submission-2026-10-08 or the supplied packet. Read README.md, DOC-01-scope.md, FINISH-00-release-gates.md, references/FINISH-spec.md sections 3–6, references/FINISH-contract-decisions.md, references/FINISH-01-handoff.md and PROFILE-REVIEWS-contract.md for later migration coordination. Inspect the actual integrated models/migrations first; reuse the already-present COURIER role, Shipment and private proof storage. Do not duplicate existing tables or routes just because an older spec names them differently.

Add missing final Order/Escrow states and the durable data needed for RELEASE/REFUND, receipt/non-receipt, replay, selected proof binding and audit. Enforce unique Order/Escrow terminal settlement, matching Order/Payment/Escrow parties, Decimal allocations and one-time proof confirmation. A proof is private metadata for one shipment and assigned courier. Selected 1–3 readable proof objects become immutable when confirmation succeeds.

Reserve the durable inspection-overdue escalation marker required by task 05, reusing an existing equivalent or adding a nullable timestamp/unique audited marker in this coordinated migration. The job owner must not create a parallel migration head for the marker later.

Implement the smallest seller-owned validated return-address save/read needed before ship-to-center, snapshot it on the Order and prohibit changes after shipment starts. Choose the concrete route by reusing an existing equivalent if present; otherwise use PUT /orders/{id}/return-address for the owning active seller with the existing address shape, strict JSON and Idempotency-Key. Before shipment, the same canonical address may replay; changing address is allowed only before a committed inbound shipment. Do not accept arbitrary courier/buyer return destinations. Use existing validated recipient/phone/address fields; no secrets in fixtures. Preserve legacy paid Orders with missing return addresses explicitly and block shipping until a valid seller address exists; do not invent/backfill addresses.

Publish reports/API-MAPPING.md with final concrete routes, schema fields, return-address request/response/error examples and the common lock order. Reuse canonical POST /inspections/{id}/receive and existing courier route prefixes. Do not implement a parallel center-receipt mutation. Confirm with code that create/cancel/expire/ship paths can use Order→Shipment→Escrow→Product for existing Orders without deadlocks. Boundary writes use fresh DB wall-clock after lock and any I/O revalidation, as selected by DOC-01.

Verify one Alembic head, fresh install and upgrade from supported predecessors with paid/unpaid/proof/certificate rows in an isolated PostgreSQL DB. Use nested savepoints for expected IntegrityError tests. Prove unique/FK/check failures, data preservation and explicit unsafe downgrade refusal or safe downgrade where supported. Do not reset/stamp a shared DB. Deliver migration/model code, fixtures, API mapping and reports/02-FINISH-01.md with exact base/head and migration evidence. Coordinate migration order 02→07→08. Continue to working code and meaningful verification; report only actual blockers.
```

## Acceptance

- One head; no loss of legacy orders/proofs/certs; unsafe state/FK/allocation writes fail.
- Return address is owning Seller data, validated and immutable once center shipment exists.
- Replays and unique terminal settlement can support the downstream transactional services.
- Route/field mapping is concrete and available before frontend implementation.
