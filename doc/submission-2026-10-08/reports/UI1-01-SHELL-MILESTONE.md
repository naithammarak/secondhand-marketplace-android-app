# UI1-01 — shell / primitives / route milestone

Base: PR130 `0ffff2de66d321ab37a0a725d4427716cbfecba3` (migration head `r01e20261002`). Branch `claude/ui1-customer-seller-2026-10-03`. This is the first isolated UI1 commit, published for Lead to compose with UI2-00 into `E_BASE`.

Unchanged on purpose: providers (`AuthProvider`, `VerificationProvider`, `ReviewProvider`, `OrdersProvider`), font loading, splash, theme tokens in `constants/theme.ts`, dependencies/lockfile/Expo config. The client role still comes from the backend account (`auth.account.role`). There are no role pickers, time skips or backend badges.

## Route targets (`mobile/src/navigation/routes.ts`)

| Export | Target | Owner |
|---|---|---|
| `routes.home`, `login`, `profile`, `sellerVerification` | `/`, `/login`, `/profile`, `/seller-verification` | UI1 |
| `routes.product(id)`, `checkout(id)`, `myProducts`, `newProduct`, `editProduct(id)` | catalog/product/checkout | UI1 |
| `routes.buyerOrders`, `sellerOrders`, `order(id)`, `orderInspection(id)`, `shipToCenter(id)`, `orderReview(id)`, `receipt(id)` | Buyer/Seller orders | UI1 |
| `routes.publicCertificate(token)` | `/certificates/[token]` | UI2 screen, UI1 link |
| `staffRoutes.inspectorQueue`, `inspectorWork(id)` | `/inspections`, `/inspections/[inspectionId]` | UI2 |
| `staffRoutes.adminVerifications`, `adminDeliveries`, `adminCertificates`, `adminCertificate(id)` | existing Admin route files | UI2 |
| `staffWorkspaceFor(role)` | Profile entry list for provisioned INSPECTOR/ADMIN | UI1 renders, UI2 owns targets |

`_layout.tsx` now registers every existing route file, including staff names. UI2 keeps its own guards inside its screens and does not edit `_layout.tsx`; it asks UI1 for any new route name.

## Shared primitives

`mobile/src/components/wondee/status.tsx` (theme tokens only, no network or business timers):

- `StatusBanner({tone, title, detail?, testID?})` — `tone`: `success|warning|danger|info|neutral`.
- `SimulationLabel({text?})` — mandatory label next to every simulated provider fact.
- `MoneyRow({label, amount, emphasis?, negative?, note?})` — server decimal strings only.
- `SectionCard({title, trailing?, testID?})`.
- `ServerDeadline({label, deadline, serverTime?, onReached?, passedText?})` — informative countdown that applies server-time skew; reaching zero only calls `onReached` (refetch).
- `ActionNotice({failure, onRetry?, onRefetch?, onLogin?, retrying?})` paired with `describeActionError(error)` from `mobile/src/orders/action-errors.ts`. It accepts `OrderServiceError`, `InspectionServiceError` or any `{status, code, fields}` error. `next` is `retry-same` (same Idempotency-Key after refetch), `refetch` (409), `relogin` (401), `fix-input` (422) or `none` (403/404).
- `ReasonField({label, value, onChange, min, max})` with a code-point counter; `textLength` and `formatLongRemaining` live in `orders/order-format.ts`.

Existing primitives stay as they are: `TextField`, `EmptyState`, `ErrorState`, `Skeleton`, `ConfirmationSheet`, `ImageViewer` (`wondee/primitives.tsx`) and `Button`, `Card`, `Row`, `Loading`, `Screen` (`order-ui.tsx`).

## What UI1 needs from UI2-00

UI1-05 consumes the shipping client through `FulfillmentPort` (see `mobile/src/orders/order-journey.ts` once published). It uses the OWNERSHIP method names `getDelivery`, `getHistory`, `getReturnAddress`, `saveReturnAddress`, `confirmReceipt`, `reportNotReceived`, `confirmReturn` with server snake_case DTOs. Once `E_BASE` exists, UI1 binds UI2's `createFulfillmentService` to this port in one file and does not write a second HTTP client. Buyer-result window fields (`result_available_at`, `result_decision_deadline_at`, `result_timed_out_at`, `server_time`, `fulfillment_policy`) are read from `getBuyerResult` by a UI1 parser until UI2 extends `BuyerResult`.

## Checks

From `mobile`: `npm run typecheck` PASS; `node --test tests/ui1-shell.test.mjs` 5/5 PASS.
