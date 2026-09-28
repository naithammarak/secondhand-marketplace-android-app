# UX-01 — Wondee marketplace contract

28 September 2026. Applies to `codex/wondee-ui-redesign`, based on main `8254f8d224f62aa765f978f65f110139410a09ab`. This describes the implemented local contract; deployment acceptance is tracked separately in [delivery](WONDEE-UI-REDESIGN-DELIVERY.md).

## Identity and navigation

The public catalog is the entry point. The three persistent tabs are Home, Orders and Me; detail, checkout, verification, product management and staff screens are stack routes. Guest private routes lead to login. Existing validated, expiring product-return intent and account-switch cleanup remain in place; returning from Google never creates an order by itself.

New `POST /auth/google` users are BUYER, including legacy `role=SELLER` requests. ADMIN/INSPECTOR are not self-selectable. Existing customer/staff roles are preserved; legacy null becomes BUYER. `POST /auth/role` remains for old clients: BUYER can normalize null or replay BUYER, SELLER returns `409 role_selection_closed`, staff input is rejected by schema, inactive accounts get 403. It cannot demote existing Seller/staff accounts. The mobile login no longer displays a role chooser and only treats backend-resolved roles as authorization evidence.

Opening a shop follows the single contract in [VERIFY-00](VERIFY-00-seller-verification.md). The profile shows request status and refetches account/verification on focus. Approval does not unlock seller tools until `/auth/me` returns SELLER and the current owner's latest verification is APPROVED. Product management deep links use the same gate. A changed owner remounts forms and removes old private content immediately.

## Purchase capability and public seller information

An active BUYER or SELLER may quote, create, pay, cancel and read their own purchases under existing order-state rules. A SELLER may also view their sales. `/orders?role=buyer|seller` is explicit; changing the view cancels/discards the old request and clears the old view. Self-purchase is forbidden. Staff roles receive no customer purchase capability. Money, payment idempotency, reservation, unpaid expiry and receipt semantics remain backend-owned.

Public product list/detail add `seller: { display_name, verified }`. The approved shop name is selected using the latest verification ordered by `created_at DESC, id DESC`, matching eligibility. Approved legacy records with no shop name receive a generic Thai label. No legal name, email, bank information, card path or private evidence is added to public products. List projection uses one batched lookup, not a query per product. A future unknown product condition displays an unavailable-condition label rather than inventing a known grade or percentage.

## Appearance and unavailable features

Dark is the first-launch default. Users may select dark, light or system; the preference is stored locally. The root navigation, status bar and components use the same theme source. Local Prompt and Plus Jakarta Sans fonts include OFL licenses; the splash is released on font success or failure. Emerald prices and primary actions, 48px primary controls, visible field errors/focus, reduced-motion and app-focus guards are shared primitives. Native accessibility still requires device acceptance.

Inspection, public certificate HTML, certificate decisions and fulfillment capabilities are unavailable in this base. The manifest `mobile/src/features/feature-capabilities.ts` records this; it is an inventory, not a runtime switch or authorization mechanism. The production routes are explicitly gated unavailable and make no inspection/evidence API request. Flipping a flag alone does not enable a feature: integration must replace the unavailable adapters with verified services and owner/role checks.

Reusable ship/queue/work/result/certificate views accept data and callbacks. Negative inspection outcomes expose neither certificate nor buyer confirmation, even if conflicting capabilities are passed. Buyer inspection acceptance is never receipt confirmation or fund release. Public certificate opening requires a supplied real HTTPS URL and capability; a QR is displayed only when actually supplied. The isolated visual router uses fabricated data and visibly labels it. It is excluded from normal web and Android exports.

## Compatibility and rollout

Deploy the shop_name migration before compatible backend/mobile code. Old submit clients without shop_name receive 422. Do not deploy this migration on an already applied INSPECT/CERT branch until that migration graph is reconciled and upgrade paths are tested. Keep server authorization authoritative; no local role toggle, sample inventory, fake inspection success, fake certificate or fabricated sales/rating count is introduced.
