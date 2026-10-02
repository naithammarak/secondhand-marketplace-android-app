# A/B amendment — concrete planner decisions

Human authorization: 2 October 2026, implement A/B through existing implementation → independent reviewer → planner. This file narrows [EXTERNAL-SHIPPING-03](../changes/EXTERNAL-SHIPPING-03.md) to R1–R4. E/R5 and final R6/F acceptance remain separate work.

## Source and ownership

- Verified remote PR129 head: `b531bd1372c0d26b8492fa28ff29ab20a85d7578`; migration `c08f20261002`. Create a new isolated descendant branch/PR based on that branch; do not add code to accepted historical A123/B128/BCD129 branches. Preserve their accepted sources and reports.
- Read current planner packet from `/home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app/doc/submission-2026-10-08`; the packet in older worktrees can be stale. Copy the explicit current amendment and active documentation files into the new checkout as needed, preserving historical review records and secrets.
- Implementation owns R1–R4 and backend contract/docs, prepares concrete E API examples/action flags, and hands the new PR/head directly to the authorized reviewer. Reviewer is independent and may send actionable findings to implementation and planner. Planner verifies reviewed remote SHA, evidence and scope before accepting.

## Decisions for implementation

1. **Versioned policy:** preserve the old delivery/refund policy for all existing Orders when migrating, including existing paid Orders and terminal rows. New Orders created by the amended server persist the new external-shipping/result-timeout/item-only policy. Reject client-supplied policy, price, parties or deadline. Use the minimum snapshot fields needed; no general policy engine or new ledger.
2. **Results:** only eligible positive final results (`PASS`/`MINOR_ISSUE`) await owning Buyer decision. Persist final availability +72 continuous hours; verify atomic result/certificate availability before reusing `inspected_at`. At/after deadline, new decisions fail with fresh DB clock under locks; committed replay remains readable. The SYSTEM timeout is its own audited outcome and authorizes return, never a fabricated Buyer REJECT, automatic CONFIRM or physical dispatch.
3. **Shipping:** Seller sends TO_CENTER with carrier/tracking and frozen return address; assigned/authorized center Inspector receives without Courier photos. Center Inspector dispatches only the correct final leg with carrier/tracking and immutable destination. No new external shipping employee account, carrier API or mandatory shipping image.
4. **Physical receipt:** owning Buyer can confirm receipt after valid TO_BUYER dispatch even if provider status is late, subject to an existing receipt deadline. Buyer can report missing after dispatch; the report blocks any later AUTO event. Owning Seller confirms actual TO_SELLER receipt; scoped Admin can resolve a return-confirmation exception with required reason/evidence and audit, without client-selectable amounts. Carrier return-delivered alone is insufficient for refund. Keep actual recipient confirmations distinct from external transport events.
5. **Trusted demo events:** use the smallest authenticated Admin-only, explicitly configured demo event command/adapter. Persist source, shipment/leg, event identity and server confirmation time, with replay/dedup/audit. Untrusted users cannot mark delivery, change recipients, backdate deadlines, reverse terminal state or bypass dispute. New-policy AUTO Buyer receipt deadline = trusted TO_BUYER delivery confirmation server time +72h. No trusted event means no AUTO money release. The future carrier adapter is out of scope.
6. **Refund:** new-policy explicit positive-result rejection or result timeout refunds the item snapshot only after actual return; retained inspection/shipping snapshots once, seller payout/commission zero. Example held1350 = refund1200 + inspection100 + shipping50. Negative-result, no-ship and audited Buyer non-receipt refunds keep full policy; legacy refunds keep their snapshot policy. Do not add return fees or rewrite successful Payment/Receipt/settled history. Successful RELEASE keeps 5% item commission.
7. **Jobs and failure:** preserve one settlement service, lock order/replay and all five current jobs. Add result timeout as a sixth bounded no-HTTP job; maintain durable scan ownership/fairness/dry-run. Return receipt commits durably before a separate settlement attempt; a failed attempt remains pending and retries its persisted policy/cause exactly once. Do not require E completion to prove backend/API acceptance.
8. **Migration rollback:** verify fresh install and representative legacy upgrade plus data/constraint preservation on owned PostgreSQL. Reversible empty-new-policy downgrade/re-upgrade should be tested. If new rows cannot be represented safely in old schema, downgrade must refuse with a clear guard; never silently transform partial-refund history to a full refund or drop new financial/evidence rows.

## Acceptance of this A/B work

- Independent actual PostgreSQL migration, authorization/constraint and normal API evidence for all three delivery legs without a Courier account/photo under new policy.
- New sale → Buyer receipt → RELEASE with 5% → normal C review eligibility; reject and 72h silence each → actual Seller return receipt → item-only refund → review forbidden. Negative/no-ship/Admin causes and legacy policy retain full refund. Original successful receipts remain identical.
- Wrong actor/leg, untrusted/duplicate/late event, report-before-event, strict decision/receipt boundary and fresh-clock lock wait, opposing decisions/two workers, durable-return refund failure/retry, scan fairness/restart/no-HTTP/dry-run checked meaningfully.
- New API mapping and action flags reach E; role-specific reads and public C/D certificate/reviews do not leak private data; existing profile/revoke behavior remains valid.
- Active scope/SRS/QA/diagrams updated consistently; historical references/review records are not rewritten as new-policy acceptance.
- Exact new remote head independently PASS and confirmed by planner. Local A/B acceptance does not establish E UI, shared rollout, Android/Google/Storage/QR, APK or full presentation readiness.

## Workflow files

Use separate `AB-AMENDMENT-WORKFLOW.json`, `AB-AMENDMENT-IMPLEMENT-STATE.json`, `AB-AMENDMENT-REVIEW-STATE.json`, and eventual `AB-AMENDMENT-ACCEPTANCE.json` in this coordination folder. Do not overwrite A FOUNDATION or BCD acceptance. Preserve existing thread history; report missing plan/reasoning/access explicitly, and continue authorized independent work.
