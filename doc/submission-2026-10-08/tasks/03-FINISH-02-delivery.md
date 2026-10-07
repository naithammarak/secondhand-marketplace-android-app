# 03 / FINISH-02 — External transport and actual recipient receipt

**Priority:** P0 · **Owner:** Backend · **Depends:** 02 · **Amendment:** R2

Current backend candidate is PR130; historical accepted A/B/C/D work and legacy references remain separate evidence. See [amendment scope](../coordination/AB-AMENDMENT-SCOPE.md). E/native/shared rollout acceptance is separate.

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository.

Continue R2 on the same PR130 branch after R1. Read changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md, coordination/AB-AMENDMENT-SCOPE.md and reports/EXTERNAL-SHIPPING-API-MAPPING.md. New-policy flow does not require Courier accounts/photos; preserve old Courier routes and records only for legacy Orders.

Seller sends TO_CENTER with carrier/tracking and frozen return address. Authorized center Inspector confirms actual receipt through canonical POST /inspections/{id}/receive; assigned Inspector dispatches only server-derived TO_BUYER after CONFIRM or TO_SELLER after REJECT/SYSTEM timeout/negative result. Never accept leg/destination from client. Positive result and certificate are atomic; timeout never fabricates a Buyer decision or physical dispatch.

Implement minimum authenticated active-Admin explicitly configured demo shipping events with immutable source/identity/leg/server time, dedup/replay/audit. Transport DELIVERED differs from recipient receipt: center events do not receive inspection, return events do not refund, Buyer events start only the independent AUTO receipt+72h clock. Actual owning Buyer receipt/report work after authorized dispatch even with no carrier event, subject to an existing deadline; report blocks later AUTO. Actual Seller or scoped audited Admin confirms return with required same-case reason/evidence. Commit return durably before the same settlement service attempts refund separately; failure stays pending for the retry job.

Enforce role redaction, private legacy proof/inspection access, wrong actor/leg/event rejection, source/deadline immutability, normal API journeys, lock-wait boundaries and opposing action races on owned PostgreSQL. Deliver reports/EXTERNAL-SHIPPING-R2.md and concrete E requests/action flags. Preserve unrelated UI/live servers/shared DB; do not claim real carrier or Android acceptance.
```

## Acceptance

- Follow the concrete amendment acceptance in EXTERNAL-SHIPPING-03 and AB-AMENDMENT-SCOPE.
- Record actual head/base, migration, commands and evidence; no legacy or mock PASS is relabeled as new-policy acceptance.
- Preserve historical/shared/private/UI state and deliver through the same reviewed branch.
