# REFUND-DECISION-02 — Buyer result rejection / silence return amendment

**Human instruction received 2 October 2026. Status: confirmed item-only refund for Buyer rejection / 72-hour result silence. No backend or database change is claimed.**

The subsequent owner discussion confirms refunding the item price, retaining inspection/shipping fees once. For delivery actors/evidence and implementation prompts use the later [EXTERNAL-SHIPPING-03 plan](EXTERNAL-SHIPPING-03.md), which supersedes mandatory Courier proof for new-policy journeys.

This amendment takes precedence over the previous blanket full-refund wording for **Buyer rejection of an eligible inspection result and Buyer failure to accept within3 days**. It does not change all refund causes automatically. Keep the prior full-refund rules for Seller no-ship, negative inspection (FAKE/NOT_AS_DESCRIBED) and audited non-receipt resolution until the owner changes those cases. Preserve all historical accepted review reports and immutable completed transactions.

## Requested behavior

- Positive inspection result is ready and available to the owning Buyer: allow result acceptance/rejection for3 calendar days (72 consecutive hours).
- Start from the persisted final-result availability time. Recommended mapping to existing inspected_at is valid only if the result/certificate become available atomically; implementer must verify this mapping and persist the deadline/policy where needed. First opening the app does not start or reset the clock.
- Buyer REJECT before cutoff → return to the frozen Seller return address.
- No Buyer acceptance by cutoff → system records an audited timeout return outcome and permits TO_SELLER dispatch. Do not auto CONFIRM or RELEASE funds and do not impersonate a manually submitted Buyer decision.
- Actual Seller return receipt or scoped audited Admin confirmation of return is required before settlement under the new external-shipping policy. A timeout alone does not certify physical return or refund success. Durable return with failed settlement remains pending and retries through the one existing service; legacy Courier evidence remains preserved under the legacy policy.
- At/after cutoff, fresh decision writes must be rejected using fresh DB time after locking. Committed replay remains readable. Concurrent Buyer CONFIRM and timeout have exactly one winner and one outbound direction.
- This inspection-result deadline is distinct from 3 working days for overdue center inspection, Seller no-ship 72h, and physical Buyer receipt 72h after trusted final delivery. External-shipping evidence replaces the new-policy Courier trigger as defined in EXTERNAL-SHIPPING-03; the other durations remain unchanged.

## Confirmed amount

Owner example requested: item1,200 + inspection100 + shipping50 = charged1,350.

| Rule | Buyer refund | Status |
|---|---:|---|
| Return item amount; retain original inspection/shipping fees once |1,200|Confirmed for Buyer rejection / result silence|
| Deduct inspection/shipping again from the item amount |1,050|Incorrect; fees must not be deducted twice|

Retain original successful Payment/Receipt and Order pricing snapshots. The server determines amounts; clients never submit refund totals. Refund 1,200 + retained inspection 100 + retained shipping 50 conserves held 1,350; Seller payout and commission are zero on this refund. Use Decimal and explicit immutable allocations. No new return fee is inferred. Successful sale still deducts 5% item commission from Seller payout. Existing paid/settled Orders retain their old policy; apply the amendment to new-policy Orders without rewriting history.

## Current-source impact

Composed PR129 head b531bd1372c0d26b8492fa28ff29ab20a85d7578 passed the previous selected contract. Current shared service/schema require full held refunds, and the runner has no Buyer result-decision timeout job. Consequently that review remains valid historical evidence but does not accept this new behavior. Profile/review/revoke and existing successful-sale checks remain useful; changed refund/timer/schema/reads/UI require new focused review. Never amend historical terminal records to make the new tests pass.

## Implementation package

1. **A/schema:** add a descendant migration from c08f20261002 as needed for reason/policy-aware refund conservation and an auditable timeout source/deadline. Rehearse legacy upgrade/downgrade/data preservation on a new owned PostgreSQL target. Refuse ambiguous legacy cases rather than rewriting financial history.
2. **B/settlement:** one existing locked exactly-once service supports the confirmed item-only rejection/timeout refund allocation; retain cause-specific full refunds for unrelated causes. Expose original charge, refund amount, retained fees, policy/cause and references with role redaction. A completed REFUND always blocks review.
3. **B/timer:** implement bounded restart-safe Buyer result-timeout scans without HTTP, durable progress/ownership, exact boundary guards and opposing-action races. Preserve existing five job categories and their fairness/replay behavior.
4. **B/fulfillment:** both explicit rejection and system timeout authorize only TO_SELLER using the immutable return snapshot; actual recipient return confirmation precedes refund as specified in EXTERNAL-SHIPPING-03. Preserve committed CONFIRM and TO_BUYER journeys.
5. **E:** inspection-result countdown, accept/reject, timeout→return status, physical-return/pending-refund/settled-refund states; original fees and confirmed refund arithmetic. Keep this distinct from physical receipt/non-receipt actions. Read deadline/amount/action flags from the server.
6. **Lead/docs/QA:** reconcile DOC-01, SRS, requirements.csv, RELEASE-DESIGN, active FINISH fixtures, tasks02–06, QA matrix and diagrams. Preserve historical references and source-specific old evidence; obtain independent review of the new exact candidate before final UI/runtime acceptance. Detailed R1–R6 prompts are in EXTERNAL-SHIPPING-03.

## Required acceptance

- Before/at/after result deadline, including fresh-clock behavior after lock wait and runner outage.
- Explicit rejection and silence each cause return; no automatic acceptance or money release.
- Independent concurrent CONFIRM-vs-timeout and duplicate workers select one outcome/leg.
- Actual normal API rejection/timeout → physical return → confirmed policy refund, accurate retained fee allocation, original Receipt equality and no review eligibility.
- Failure after durable return survives and retry settles once using the original policy; no duplicate fee retention.
- Unrelated negative/no-ship/Admin refunds and successful-sale RELEASE remain correct under their selected policies.
- Migration refuses unsafe history conversion; financial conservation constraints reject invalid allocations.

## Copyable implementation prompt

```text
Continue the secondhand marketplace contract amendment REFUND-DECISION-02 in doc/submission-2026-10-08/changes. Read coordination/REFUND-DECISION-STATE.json and EXTERNAL-SHIPPING-03.md first. The confirmed refund is item-only: charged1350/item1200/inspection100/shipping50 -> refund1200 and retained fees150, never refund1050. Use the later R1–R6 task prompts for the combined external-shipping changes.

Use an isolated branch/checkout from the current reviewed composed source PR129 b531bd1372c0d26b8492fa28ff29ab20a85d7578 (verify latest remote and review first). Preserve the dirty live UI and all secrets; do not reset/migrate a shared DB. Implement the scoped result-rejection/72-hour silence→return policy using the one existing settlement/fulfillment architecture. Add a migration descendant from c08 if needed. Read the amendment's distinctions, implementation package and required acceptance; unrelated refunds retain their current policy unless human instructions supersede it.

Do not emulate a Buyer decision, auto accept inspection, refund before actual recipient return confirmation or reuse the physical receipt timer. Derive deadlines/amounts from persisted server facts; preserve historic Payment/Receipt/settlements and exactly-once/replay guards. Add cause/policy-aware refund conservation and a bounded restart-safe no-HTTP result-timeout worker, correct read models/action flags and frontend handoff. Run meaningful isolated PostgreSQL migration, opposing action/worker races, normal API journeys and retry conservation checks; do not claim shared/device QA. Publish a separate reviewable stacked PR and report exact head/base, changed contracts, actual checks and remaining E/runtime gates for independent review.
```
