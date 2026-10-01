# 03 / FINISH-02 + COURIER-02 — Buyer delivery and Seller return

**Priority:** P0 · **Owner:** Backend Codex · **Depends:** 02 · **Target:** 3–4 Oct

## Outcome / ownership

Inspector creates one final leg; assigned Courier uploads/reads/confirms private proof; Buyer delivery starts receipt window; Seller return is durable and invokes the shared refund service when available. Own delivery modules/routes, not a second settlement service.

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement task 03 on the release base plus accepted task 02. Read the submission packet README.md, DOC-01-scope.md, FINISH-00-release-gates.md, references/FINISH-spec.md sections 3–6 and references/FINISH-02-handoff.md. Read reports/API-MAPPING.md from task 02 and existing courier/inspection code; reuse concrete routes, role and storage services. Preserve concurrent frontend work.

Implement assigned Inspector fulfillment creation derived from final inspection and immutable Buyer decision: PASS/MINOR_ISSUE plus CONFIRM creates TO_BUYER using the buyer Order snapshot; positive REJECT or FAKE/NOT_AS_DESCRIBED creates TO_SELLER using the frozen seller return snapshot. Never accept leg/destination from client, create both final directions, fabricate a positive decision for a negative result or route a return to a profile address changed later.

Extend existing Courier assigned queue/detail, Admin assignment and private upload/read/confirm commands for final legs. Require an active assigned Courier, 1–3 distinct server-bound JPEG/PNG proofs, real byte/type/size/hash checks, current-leg binding and private Storage readability at confirmation. Upload alone does not prove delivery. Freeze selected proof IDs and server UTC confirmation once, with Idempotency-Key/replay behavior from FINISH. Enforce role-specific projections; Courier sees only necessary current destination, Seller cannot inspect Buyer private delivery address/proofs, unrelated users cannot access object bytes/keys. Reuse center receive POST /inspections/{id}/receive.

Confirmed TO_BUYER sets DELIVERED_PENDING_BUYER and immutable deadline confirmation+72h. Confirmed TO_SELLER first commits RETURNED_TO_SELLER+HELD and history/replay records; then invokes the settlement interface from task 04 in a separate transaction. If settlement is unavailable/fails, preserve delivery and expose pending processing for the worker retry. Define the integration interface with task 04; do not make a second refund implementation or return a false REFUNDED response. Add the seller ship-to-center 72h no-ship guard under the shared Order lock, before creating a late shipment.

Test positive CONFIRM/REJECT and both negative results, alternate-leg races, assignments/IDOR, wrong/unreadable/foreign/excess proofs, changed-address attempts, same-key replay, duplicate confirmation and delivery-commit/refund-failure recovery in isolated PostgreSQL and a deterministic storage adapter. Actual shared Storage remains a runtime QA gate. Deliver code/API examples and reports/03-FINISH-02.md with base/head, proof authorization matrix and exact tests. Do not mutate shared data or claim Android acceptance. Finish implementation and verification, not just a design.
```

## Acceptance

- Exactly one final direction and correct immutable destination; every final delivery has selected valid proof.
- Buyer deadline starts once at TO_BUYER confirmation; result notification does not start it.
- Return remains durable if refund fails; retry can complete without re-upload.
- Minimal Courier/Seller/Buyer/Inspector projections and private access are enforced by server.
