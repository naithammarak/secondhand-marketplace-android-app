# 04 / FINISH-03/04 — Cause-aware exactly-once settlement

**Priority:** P0 · **Owner:** Backend · **Depends:** 02;03 · **Amendment:** R3

Current backend candidate is PR130; historical accepted A/B/C/D work and legacy references remain separate evidence. See [amendment scope](../coordination/AB-AMENDMENT-SCOPE.md). E/native/shared rollout acceptance is separate.

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository.

Continue R3 on the same PR130 branch. Read changes/REFUND-DECISION-02.md, changes/EXTERNAL-SHIPPING-03.md, coordination/AB-AMENDMENT-SCOPE.md and reports/EXTERNAL-SHIPPING-API-MAPPING.md before historical full-refund text.

Use one existing locked settlement service and original immutable financial snapshots. New-policy positive-result Buyer REJECT or SYSTEM result timeout requires actual Seller/scoped audited Admin return receipt before item-only refund: held1350=Buyer1200+retained inspection100+shipping50, Seller payout/commission0. Never deduct fees again to refund1050 or add return fees. Negative-result/no-ship/audited non-receipt and all legacy refunds retain full policy1350. RELEASE keeps payout1140+commission60+inspection100+shipping50 and the 5% item commission.

Keep Order→Shipment→Escrow→Product locks, unique terminal settlement, command replay/financial tuples/rollback guards. Preserve original successful Payment/Receipt byte-for-byte; returned Product becomes CANCELLED, never auto-relisted. Actual return commits first; failed independent financial attempt remains RETURNED_TO_SELLER/HELD and retries using the same persisted policy/cause once. Carrier return event or result timeout alone cannot refund. Timely missing report blocks AUTO and enables only audited same-case Admin resolution, with no client amounts/recipients.

Expose role-redacted original charge/refund quote/retained fees/settlement cause/reference and pending flags. Prove normal API sale and rejection/timeout/negative/no-ship/Admin journeys, invalid-conserving allocations, rollback/retry, receipt/report/AUTO races and C review/D revoke regression on owned PostgreSQL. Deliver reports/EXTERNAL-SHIPPING-R3.md and focused evidence; keep shared/device gates separate.
```

## Acceptance

- Follow the concrete amendment acceptance in EXTERNAL-SHIPPING-03 and AB-AMENDMENT-SCOPE.
- Record actual head/base, migration, commands and evidence; no legacy or mock PASS is relabeled as new-policy acceptance.
- Preserve historical/shared/private/UI state and deliver through the same reviewed branch.
