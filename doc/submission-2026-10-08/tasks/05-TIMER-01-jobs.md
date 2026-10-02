# 05 / TIMER-01 — Six durable no-HTTP lifecycle jobs

**Priority:** P0 · **Owner:** Backend runtime · **Depends:** 03;04 · **Amendment:** R4

Current backend candidate is PR130; historical accepted A/B/C/D work and legacy references remain separate evidence. See [amendment scope](../coordination/AB-AMENDMENT-SCOPE.md). E/native/shared rollout acceptance is separate.

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository.

Continue R4 on the same PR130 branch. Read changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md, coordination/AB-AMENDMENT-SCOPE.md and reports/EXTERNAL-SHIPPING-R4.md. Reuse the one existing guarded settlement service, CLI, bounded scan ownership and progress infrastructure.

Keep unpaid30min, receipt release, Seller no-ship72h full refund, durable return-refund retry and inspection3workingdays escalation unchanged by policy where appropriate. Add result-timeout as sixth bounded job with cursorID6; preserve paid progress IDs1–4 and unpaidID5. Positive atomic availability+72h with no decision/outbound authorizes only SYSTEM timeout return; no invented Buyer REJECT/CONFIRM, shipment or money. New AUTO requires trusted TO_BUYER delivery event+72h and no report; tracking alone never starts AUTO. Legacy proof checks remain.

Re-read eligibility under shared locks and sample fresh DB wall clock after locks/I/O. Test no HTTP, before/at/after both deadlines, opposing CONFIRM/timeout and receipt/report/AUTO, independent workers, failed-first fairness, stop/restart, dry-run purity and durable retry using persisted policy. Locked rows may be skipped by bounded scans and picked up by catch-up; do not count a scan as guaranteed instant completion.

Provide existing safe CLI/dry-run/retry/restart commands and structured result/failure counts. Do not activate scheduler or migrate shared DB. Runtime activation remains task10 and native/UI task06 is separate. Deliver reports/EXTERNAL-SHIPPING-R4.md with actual command paths and exact source/evidence.
```

## Acceptance

- Follow the concrete amendment acceptance in EXTERNAL-SHIPPING-03 and AB-AMENDMENT-SCOPE.
- Record actual head/base, migration, commands and evidence; no legacy or mock PASS is relabeled as new-policy acceptance.
- Preserve historical/shared/private/UI state and deliver through the same reviewed branch.
