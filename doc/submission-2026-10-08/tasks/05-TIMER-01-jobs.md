# 05 / TIMER-01 — Scheduled lifecycle and recovery

**Priority:** P0 · **Owner:** Backend runtime Codex · **Depends:** 03, 04 · **Target:** 5 Oct

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement task 05 in the combined release containing tasks 03 and 04. Read the submission packet DOC-01-scope.md, FINISH-00-release-gates.md, references/FINISH-spec.md section 7 and QA-MATRIX.md, and inspect existing unpaid_expiry_worker/order_expiry runner and runbook. Reuse existing scheduled infrastructure and the task 04 settlement service; do not introduce a second financial implementation, a public force-release API, or client-side jobs.

Deliver a bounded recurring runner targeting scans every 5 minutes: unpaid 30-minute expiry, eligible receipt release after confirmed readable TO_BUYER proof+72h with no timely missing report, seller no-ship full refund at paid_at+72h absent a committed timely center shipment, retry for durable RETURNED_TO_SELLER+HELD without settlement, and overdue inspection escalation after 3 working days from center receive. For this prototype working days are Monday–Friday Asia/Bangkok, excluding weekends without a public-holiday calendar. Escalation persists an observable Admin/workqueue marker once; it must not invent result/certificate/Buyer decision or release funds. Reuse an existing overdue marker if available.

Lock/re-read eligibility and fresh DB wall-clock at each guarded write; two runners must not duplicate outcomes. Storage failure/outage leaves HELD and a retry candidate; return delivery survives prior refund failure. The seller ship command enforces its deadline even while worker is down. Preserve successful same-key command replay after deadlines. Avoid holding broad DB locks while doing unbounded Storage calls; use bounded I/O and revalidation according to FINISH.

Provide safe CLI one-shot/dry-run options using the same services, deployment configuration (systemd/container scheduler matching actual environment), structured counts and failure signals, restart instructions and an isolated synthetic demo procedure. Do not automatically enable a runner against a shared/production DB merely because a sample env exists. Task 10 performs the configured runtime activation after environment authorization.

Verify all cases with no HTTP traffic, just-before/at/after deadlines, simultaneous runners, restart after partial progress, Storage unreadability, outage/recovery and repeated overdue scans in isolated PostgreSQL. Do not sleep 72 hours or weaken production guards: use injectable server clocks/test fixtures in the isolated environment. Deliver implementation, runbook and reports/05-TIMER-01.md with exact base/head and recovery evidence. Finish working scheduled code and relevant tests rather than only cron instructions.
```

## Acceptance

- All five categories run without a user opening the app; no automatic inspection decision.
- Duplicate scans/processes yield one terminal settlement and one overdue marker.
- Failure remains visible/retryable; real schedule configuration and monitoring instructions are present.
