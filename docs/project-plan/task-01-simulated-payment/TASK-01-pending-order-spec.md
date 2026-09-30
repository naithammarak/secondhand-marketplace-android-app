# TASK-01: real buyer orders, pending payment

## User decision

Create a real order persisted in the configured Supabase/PostgreSQL database and leave it in the existing `WAITING_PAYMENT` state. No payment provider has been selected. Do not simulate payment or mark an order paid.

## Scope

1. Build a limited buyer application stacked on the reviewed real-catalog PR #119. Keep real public catalog browsing and add only required buyer authentication, quote/create, buyer-owned order list/detail, and safe cancellation/receipt routes supported by the existing contract.
2. Preserve existing order validation, product reservation, amount snapshots, ownership checks, and transaction semantics. A successful checkout must say the order is awaiting payment; it must not show a fake QR, payment success, or `PAID` state.
3. Keep simulation endpoints unavailable in this runtime. Exclude seller/storefront order views, admin, upload, inspection, certificate, and unrelated write routes. Do not relax the full application certificate startup guard.
4. Make web/mobile navigation support browse → sign in → create order → see pending order using the real API. Clearly explain that payment is not yet available. Do not silently fall back to fixture/mock data.
5. Allow active BUYER and SELLER accounts to act as buyers, preserving the canonical customer-role contract. Always list buyer-owned orders; reject seller views. Detail/cancel/receipt require `order.buyer_id` ownership, and own-product purchasing, staff access and inactive customer access remain forbidden.
6. Keep read-only catalog access separate from order/auth write transactions. Reuse current backend contracts rather than inventing parallel payment/order states.

## Safety and test boundaries

- Implement and verify using isolated local PostgreSQL and disposable test identities only.
- Never sign in using a real user account, create/cancel an order against the shared Supabase instance, or run a write-capable server against it as part of implementation/review.
- Keep the currently running API/web in catalog-only read mode until code is complete and independently reviewed. No live write smoke tests.
- Do not expose credentials, DSNs, signing tokens, private user data, or environment files in code, logs, screenshots, PR notes, or this spec.

## Acceptance

- Local integration coverage proves authorized buyer order creation creates exactly one persisted order with the established `WAITING_PAYMENT` status, reserves the product atomically, and is visible only to its owner.
- Invalid/duplicate/unavailable product requests cannot create extra orders or reservations; unauthorized users cannot view/cancel another buyer's order.
- No reachable simulated-payment route can transition the order to `PAID`; no client action or server capability falsely reports successful payment.
- Buyer checkout starts with empty contact/shipping inputs and saves only buyer-entered data. Prototype address quick-fill and unimplemented address-book save controls are unavailable in this mode.
- Cancellation follows the existing backend contract and restores availability only when eligible.
- Existing catalog, auth, and order tests plus focused mobile/web flow checks pass on the exact branch head; secrets and full-app guard remain protected.
- A separate Sol 6.1 xhigh review approves the exact remote PR head before considering any live server activation. PR is stacked on #119 and is not merged without normal project acceptance.

## Explicit exclusions

Payment provider selection/integration, QR generation, settlement, real-account testing, shared-database writes, migration/seed changes, and production rollout are out of scope.
