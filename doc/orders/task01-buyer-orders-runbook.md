# TASK-01: buyer orders awaiting payment

This runtime preserves the original public catalog and adds real Google/Supabase
sign-in, buyer registration and orders. Checkout creates `WAITING_PAYMENT` /
`UNPAID`, reserves the product, and shows the saved order. No payment provider is
configured, and this runtime has no simulated-payment endpoint or QR display.
The buyer must enter the recipient and shipping address; prototype address
quick-fill and an address-book save checkbox are unavailable in this runtime.

## Runtime boundary

- Catalog GET routes use `CatalogSession`, whose PostgreSQL transactions are
  read-only. Auth/order transactions use the existing writable `get_db` contract.
- Auth exposes only `POST /auth/google` and `GET /auth/me`; registration assigns
  BUYER using the existing authenticated Supabase JWT contract.
- Orders expose quote, create, buyer list/detail, cancellation and receipt.
  Every order route requires an active customer (BUYER or SELLER) acting as the
  buyer. Staff and inactive accounts cannot use this surface. Lists always use
  buyer ownership; `role=seller` is rejected. Detail/cancel/receipt require
  `order.buyer_id` ownership, including when the actor has a SELLER account.
  Self-purchase remains forbidden.
- Order responses report `can_pay=false`. Payments remain unavailable regardless
  of `APP_ENV` or `PAYMENT_SIMULATION_ENABLED` values. No financial rows are
  created by order creation.
- Seller, upload, admin, inspection, certificate and role-selection routes are
  absent. The full application's certificate startup/issuance guards are intact.
- Existing reservation expiry and cancellation contracts still apply. Since
  catalog reads stay read-only, an expired reservation may remain hidden until an
  authenticated order read/quote triggers existing expiry handling.

## Activation configuration

The existing API 8765 and Expo 8090 were left in catalog-only mode. These commands
document activation for the lead after the independent review; implementation
did not execute them against the project database.

```sh
PYTHON_DOTENV_DISABLED=true backend/.venv/bin/python backend/scripts/run_buyer_orders.py \
  --env-file /secure/path/to/backend/.env --host 127.0.0.1 --port 8765
```

The launcher privately loads only DB/Storage and JWT settings, disables implicit
dotenv loading, forces simulation off, and does not migrate or seed. The supplied
environment must contain the existing database/Storage and valid Supabase JWT
verification configuration. It does not require or invent a certificate origin.

From `mobile`, with real Supabase public configuration supplied privately:

```sh
EXPO_PUBLIC_CATALOG_ONLY=false EXPO_PUBLIC_BUYER_ORDERS=true \
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8765 npm run web:live -- --port 8090
```

The two capability modes are mutually exclusive. The buyer runtime enables
browse, login/callback, checkout, orders, profile and receipt only; unrelated
discovered routes are explicitly protected. The profile supports account retry,
orders and sign-out without seller/verification requests. OAuth callbacks still
need the existing Supabase redirect allowlist/device configuration.

## Verification

Local PostgreSQL integration used a newly owned `task01-buyer-orders-test`
container, database `task01_buyer_test`, on loopback port 55443. Only this isolated
database was migrated. Disposable identities and transactions proved registration,
one persisted unpaid order, reservation, replay, cross-owner/role denial, no
payment/escrow/receipt rows, and cancellation restoring availability.

No shared Supabase sign-in, account registration, order creation/cancellation,
reservation, migration, seed, or write-capable server smoke was performed.
Browser/device OAuth and shared-database acceptance remain unverified.
