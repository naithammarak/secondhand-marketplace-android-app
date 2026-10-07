# 06 / FINISH-05 — External-shipping API integration in existing UI

**Priority:** P0 · **Owner:** Frontend · **Depends:** 03;04 · **Amendment:** E / R5

Current backend candidate is PR130; historical accepted A/B/C/D work and legacy references remain separate evidence. See [amendment scope](../coordination/AB-AMENDMENT-SCOPE.md). E/native/shared rollout acceptance is separate.

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository.

Implement E/R5 separately after the exact R1–R4 candidate is independently accepted. Locate doc/submission-2026-10-08 in the repository. Read applicable AGENTS.md and exact Expo docs before editing mobile. Read DOC-01-scope.md, RELEASE-DESIGN.md, changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md and reports/EXTERNAL-SHIPPING-API-MAPPING.md. Preserve latest visual/navigation work; no new Courier workspace or redesign.

Wire actual Buyer result can_decide/deadline/timeout separately from physical receipt/report flags. Inspector canonical center receipt and final carrier/tracking dispatch, Seller frozen return address and actual confirm-return, Buyer delivery/receipt/report, scoped Admin demo shipping event and return exception/non-receipt resolution use mapped existing/new routes. New shipping requires no Courier account/photo; old legacy records stay readable under their own policy. Tracking alone does not start AUTO. Result silence authorizes return, never auto accepts, dispatches or refunds.

Render original charged1350, positive reject/timeout refund1200 with retained100/50, negative/no-ship/Admin full refunds1350, sale payout1140/commission60 using server values. Distinguish transport-delivered from recipient-received and durable return pending from settled refund. Refetch after ambiguous mutation/retry; stable idempotency keys, account-switch stale guards, disabled duplicate buttons and authorized no-store private images remain. C review requires completed RELEASE; refunded Orders cannot review. Public D revoked status never exposes private reason.

Run relevant mobile component/logic/typecheck and API-backed smoke, then actual Android/Auth/Storage/QR checks separately. Browser/mocks and backend local PASS are not full release acceptance. Deliver reports/06-FINISH-05.md, routes/action fields wired, exact heads and pending native/runtime gates. R1–R4 backend implementation must not wait for this visual/UI work.
```

## Acceptance

- Follow the concrete amendment acceptance in EXTERNAL-SHIPPING-03 and AB-AMENDMENT-SCOPE.
- Record actual head/base, migration, commands and evidence; no legacy or mock PASS is relabeled as new-policy acceptance.
- Preserve historical/shared/private/UI state and deliver through the same reviewed branch.
