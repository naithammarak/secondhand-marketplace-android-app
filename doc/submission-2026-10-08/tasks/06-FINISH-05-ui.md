# 06 / FINISH-05 + COURIER-03 — Complete business UI

**Priority:** P0 · **Owner:** Frontend Codex · **Depends:** 03, 04 APIs; prepare from fixtures earlier · **Target:** 4–5 Oct

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Implement task 06 in mobile of the actual complete release base. Read applicable AGENTS.md and the exact versioned Expo docs it requires before code. Read the submission packet DOC-01-scope.md, RELEASE-DESIGN.md, references/FINISH-spec.md, references/FINISH-api-fixtures.md, reports/API-MAPPING.md and reports for tasks 03/04. Preserve the newest UI/theme/navigation work already in the working tree. Do not replace it with a historical mock prototype or redesign the app again.

Wire real services/routes for owning Buyer delivery summary, receipt, non-receipt report, deadlines, history, settlement/refund references; Seller return-address save before center shipment, shipping/return progress and payout projection; Inspector outbound dispatch; Courier assigned queue/detail, camera/gallery proof upload and explicit selected-proof confirmation; minimal Admin courier assignment and scoped missing-delivery review/resolution. Reuse existing role entry/navigation and API client/token provider. Use concrete mapped courier routes rather than duplicating conceptual routes from older specs.

Keep result CONFIRM/REJECT distinct from physical receipt. Negative inspection results only return. Deadline starts at persisted Buyer delivery confirmation; client countdown is informational and cannot settle money. For durable return with failed settlement show pending refund, not REFUNDED. Show server-settled amounts and simulation labels. Server action flags/auth decide permissions; approved Seller can use Buyer actions on purchased Orders. No general user-admin dashboard is required.

For each mutation keep a stable idempotency key while retrying the same canonical payload, prevent accidental duplicate presses, refetch persisted state on ambiguous network failure, and suppress stale responses after logout/account change. Display useful loading/empty/error/retry states and readonly terminal outcomes; authorized proof access must not store raw private object keys or signed URLs in permanent caches/logs. Camera/image permissions and Android back/keyboard behavior must be usable.

Use existing tests and contract fixtures for both journeys, report-vs-auto boundary displays, role redaction, duplicate/retry/network failure, account switch and pending return retry. Run focused component/logic tests and typecheck from mobile; separate pre-existing baseline lint failures. Then perform API-backed browser smoke on the combined candidate if the environment is available. Browser/mocks do not establish actual Android/Auth/Storage acceptance. Deliver code plus reports/06-FINISH-05.md with routes wired, exact base/head, checks and remaining device steps. Continue through API wiring and verification, not preview-only UI.
```

## Acceptance

- All retained roles can finish their part of the two journeys using APIs.
- UI never claims payout/refund/receipt success before backend commit.
- Latest visual work survives; errors/replay/account switching and device permissions are accounted for.
