# B — Backend ส่งสินค้า, Escrow settlement และ jobs

**ผู้รับ:** เพื่อน 1 / backend Codex · **Tasks:** 03 → 04 → 05 · **Priority:** P0 · **เริ่ม implementation หลัง:** A/02

## ผลลัพธ์

- ส่งถึง Buyer หรือคืน Seller ตามผลตรวจและ Buyer decision พร้อม private Courier proof
- Buyer ยืนยันรับ/แจ้งไม่ได้รับ, Admin ตัดสินกรณีพิพาท, ปล่อยเงินหรือคืนเต็มจำนวนแบบ exactly once
- runner สำหรับ unpaid expiry, 72h receipt release, seller no-ship refund, return-refund retry และ inspection overdue escalation

## Prompt สำหรับ Codex

```text
You own work package B, backend only, for the Android marketplace prototype due 8 October 2026, Asia/Bangkok. Use the exact release base plus accepted task02 supplied by package A. Locate doc/submission-2026-10-08 (or the supplied packet path), read work-packages/README.md, DOC-01-scope.md, FINISH-00-release-gates.md, QA-MATRIX.md and reports/API-MAPPING.md. Apply repository AGENTS.md. Inspect the actual code and upstream SHA before editing.

Execute the full prompts and acceptance checks in tasks/03-FINISH-02-delivery.md, then tasks/04-FINISH-03-04-settlement.md, then tasks/05-TIMER-01-jobs.md. Own final delivery/order services, receipt/report/scoped Admin resolution, exactly-once settlement and jobs. Reuse existing Courier/proof/inspection/payment infrastructure and task02's models. Share one RELEASE/REFUND service between HTTP commands and workers. Payment gateway, payout and refund simulate transfers; persist actual database records of simulated amounts. Do not add a real bank integration, a wallet or a second escrow ledger.

Preserve the distinction between inspection acceptance and physical receipt. Server-valid private proof starts the Buyer 72h deadline only after delivery confirmation. A timely non-receipt report keeps HELD. Preserve original successful Payment/Receipt and pricing snapshots; RELEASE and full-held-amount REFUND are mutually exclusive. Return delivery commits durably even if refund fails, allowing retry. All five jobs must work without user HTTP traffic and use server guards, shared locks and deadline rules. Follow exact eligibility/amounts in the original task prompts.

Send task03/04 commits and concrete routes, fixtures, action flags and service interfaces early to A/E and package C; C's reviews require task04 COMPLETED+RELEASED. Then complete task05. Coordinate any missing model requirement with A instead of introducing a parallel migration head. Keep mobile visual work outside this package.

Verify roles, proof access, successful sale/return, replay, concurrent release-vs-refund, deadline boundaries, rollback and worker recovery in isolated PostgreSQL using meaningful tests from the tasks. Write reports/03-FINISH-02.md, reports/04-FINISH-03-04.md and reports/05-TIMER-01.md using templates/TASK-REPORT.md. Deliver upstream/head SHAs, code, APIs, commands/results and runbook. Do not equate isolated tests with Android/shared Storage/runtime activation. If task02 is missing, prepare independent contract/fixtures/tests, report its missing input, and resume integration once supplied; do not invent replacement upstream infrastructure. Continue through implementation and verification, not only planning.
```

## งานและส่งต่อ

1. [03 Delivery](../tasks/03-FINISH-02-delivery.md) → proof/delivery APIs ให้ E; return hook ให้ 04
2. [04 Settlement](../tasks/04-FINISH-03-04-settlement.md) → terminal states ให้ C/08, APIs ให้ E, service ให้ 05
3. [05 Jobs](../tasks/05-TIMER-01-jobs.md) → runner/runbook ให้ F/10

**ตรวจสำคัญ:** held 1,350 → seller payout 1,140 เมื่อ RELEASE หรือ refund 1,350 เมื่อ REFUND เป็นยอดจำลองตาม snapshots ทั้งหมด
