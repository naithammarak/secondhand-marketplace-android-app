# E / R5 — current amendment handoff

**Scope:** task06 · [Current amendment](../changes/EXTERNAL-SHIPPING-03.md) · [Confirmed refund](../changes/REFUND-DECISION-02.md) · [Concrete scope](../coordination/AB-AMENDMENT-SCOPE.md)

PR130 extends reviewed PR129 without changing the historical accepted A/B/CD/BCD branches. New Orders snapshot EXTERNAL_V2; legacy Orders preserve their policy and financial history. Backend R1–R4 local checks do not establish E/shared/Android acceptance.

## Prompt สำหรับ Codex

```text
Locate doc/submission-2026-10-08 in the supplied repository. Read changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md, coordination/AB-AMENDMENT-SCOPE.md, DOC-01-scope.md and reports/EXTERNAL-SHIPPING-API-MAPPING.md before older references. Execute current task06 prompts and their amendment acceptance, on the exact delivered upstream SHA. Historical Courier proof/full-refund wording applies only to LEGACY_V1 or specified unchanged causes.

Preserve one settlement ledger, immutable original Payment/Receipt and addresses, private data, shared databases, live servers and unrelated UI work. New shipping uses carrier/tracking, actual recipients and scoped explicitly enabled Admin demo events. Positive result rejection or SYSTEM timeout authorizes return; actual Seller/Admin receipt precedes item-only refund1200 retaining100/50 once. Other specified and legacy refunds remain full1350; RELEASE keeps commission5%. Two independent72h windows and fresh locked DB clock govern eligibility. Six bounded jobs preserve prior cursor IDs and never invent Buyer decisions or physical dispatch.

Record exact base/head, migration, actual checks and evidence in the current reports. E must wire the current server flags/amounts and preserve existing visual UI; no new Courier workspace. Backend implementation/review must not wait for E.
```

Use [tasks](../README.md) and [R1–R4 reports](../reports/EXTERNAL-SHIPPING-R1.md). Full release/native/scheduler activation remains tasks10–13. No local-only PASS is relabeled as final readiness.
