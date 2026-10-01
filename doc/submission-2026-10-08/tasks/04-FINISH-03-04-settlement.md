# 04 / FINISH-03 + FINISH-04 — One settlement service

**Priority:** P0 · **Owner:** Backend Codex · **Depends:** 02; integrate return with 03 · **Target:** 3–4 Oct

## Outcome / ownership

Buyer receipt, timely missing-delivery report, audited Admin resolution and all full-refund paths through one locked exactly-once service. Own settlement service, receipt/report routes, final Order read models and scoped Admin APIs. Task 05 calls the same service.

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement task 04 on INT-01 plus task 02, coordinating with task 03 for delivery hooks. Read the submission packet DOC-01-scope.md, FINISH-00-release-gates.md, QA-MATRIX.md, references/FINISH-spec.md sections 3–7, references/FINISH-03-handoff.md and FINISH-04-handoff.md, plus task 02 API-MAPPING.md. G0 deadline behavior is selected: use a fresh DB wall-clock after obtaining the Order lock and revalidating I/O; writes at/after deadline fail even if the HTTP request arrived earlier. Same-key committed replay remains readable. Do not reopen this as a product question.

Build one transactional settlement service with RELEASE and REFUND branches, existing schema/command replay and Order→Shipment→Escrow→Product lock order. Verify persisted paid Payment/Receipt, Escrow HELD, party/FK relationships, immutable pricing snapshots, delivery/inspection/decision guards, current proof readability and absence of conflicting final settlement. One Order/Escrow can receive RELEASE or REFUND exactly once, never both. No client amounts/recipients/states. Use Decimal; RELEASE held=seller payout+commission+inspection+shipping and matches original snapshots; REFUND returns the full held total with all other allocations zero. Preserve the successful original charge/receipt; refund has a separate immutable settlement. Product becomes SOLD on release, CANCELLED on refund; do not auto relist or add a wallet.

Implement owning active Buyer confirm-receipt and report-not-received, including approved Seller users buying an Order. Result acceptance is not receipt. Receipt atomically produces COMPLETED/RELEASED. A report before deadline produces DELIVERY_DISPUTED/HELD and blocks AUTO. Implement scoped audited Admin review/resolve with required reason and authorized same-case evidence references, producing RELEASE or REFUND once; do not add general unrestricted customer Order reads. Implement return-delivery, seller-no-ship and Admin full refund eligibility in the same service, and a return hook that can retry after durable delivery.

Extend Order delivery/history/terminal read models and action flags with correct role redaction and settlement summary. payment_status=REFUNDED derives from settlement; never rewrite the original successful Payment. Return readable replay references only to authorized actors. Reconcile old is_paid status comparisons that become wrong after terminal states.

Prove allocation examples held1350→payout1140 or refund1350, all eligibility/role errors, repeat/replay/key mismatch, rollback/failure injection, independent concurrent release-vs-refund and duplicate operations, report-vs-auto and exact deadline races, upstream cancel/expiry lock compatibility in isolated PostgreSQL. Do not assert shared/device acceptance from these tests. Deliver code and reports/04-FINISH-03-04.md including service interfaces for tasks 03/05, exact SHA and commands. Continue until both settlement branches and read APIs are implemented and verified.
```

## Acceptance

- One immutable financial outcome under retries/races; snapshots conserve money and parties match.
- Timely non-receipt keeps money HELD; late commands reject; Admin resolution is audited/scoped.
- Successful charge/receipt remains intact after refund; returned stock is not relisted.
- Tests include real independent PostgreSQL connections and rollback recovery, not mock-only evidence.
