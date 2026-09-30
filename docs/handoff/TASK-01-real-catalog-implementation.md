# TASK-01: Real catalog implementation handoff

## Purpose and boundary

This change adds an explicit catalog-only API and mobile runtime so the app can browse the project's existing public products and Storage images. The catalog-only API exposes `GET /health`, `/products`, `/products/{product_id}`, `/categories`, and `/brands`. It has no authentication, order, payment, seller, inspection, certificate, or write routes. Catalog reads do not run lazy reservation expiry.

The full application and its certificate-origin startup guard are unchanged. Catalog-only mode supports browsing, search, category filtering, and product details. Login, buying, orders, profile, and selling are unavailable in this mode. Completing those actions still requires the full application and its valid certificate configuration.

## Run locally

Start the isolated API from the repository root, supplying the original private backend environment file explicitly:

```sh
PYTHON_DOTENV_DISABLED=true backend/.venv/bin/python backend/scripts/run_catalog_only.py \
  --env-file /secure/path/to/backend/.env \
  --host 127.0.0.1 --port 8765
```

The launcher requires `DATABASE_URL`, `SUPABASE_URL`, and either `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in that file. It loads only those settings, disables implicit dotenv loading, and does not print their values. The default bind is loopback on port 8765.

In another terminal, start the live Expo web app from `mobile`:

```sh
EXPO_PUBLIC_CATALOG_ONLY=true \
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8765 \
EXPO_NO_DOTENV=1 npm run web:live
```

The mobile launcher does not load `.env` in catalog-only mode and removes Supabase public credentials from the Expo process. The default `EXPO_PUBLIC_CATALOG_ONLY=false` retains the regular full-app path.

## Isolation details

- Every top-level PostgreSQL transaction uses `SET TRANSACTION READ ONLY`. The SQLAlchemy session hook runs again when a new transaction begins after rollback; nested transactions inherit the outer transaction's state.
- The isolated catalog routes reuse the established public catalog response, search, filter, and image-signing contracts without invoking the full product router's lazy-expiry behavior.
- The mobile AuthProvider does not restore/register a persisted Supabase session in catalog-only mode. Expo Router protects all discovered non-catalog routes, including the nested `product` navigator. Product details show a Thai message that buying is unavailable and hide placeholder seller reviews.
- No schema migration, seed, shared database write, order expiry, or payment change is included.

## Verification evidence

- Backend route/contract test: `1 passed, 1 skipped` without an isolated PostgreSQL URL.
- Isolated PostgreSQL write-denial test: `2 passed, 2 warnings`, using a temporary local Podman PostgreSQL 16 container and a database named `task01_catalog_test`. It verified `transaction_read_only=on`, denied a temporary-table write, rolled back, then verified read-only state and write denial again. The test container was stopped afterward. This was not a shared database test.
- Mobile typecheck: `npm run typecheck` passed.
- Focused component tests: `auth-provider.test.tsx`, `product-detail-screen.test.tsx`, and `catalog-only-layout.test.tsx` passed (3 suites, 24 tests).
- Python compile check and `git diff --check` passed.
- The task owner separately preflighted the original catalog through this API: nine public listings and nine signed image URLs were returned; image `HEAD` checks returned 200. The mobile catalog service parsed the listings, categories, and details and completed a real-name search. The task owner's broader live route, filter, and served-bundle verification is tracked separately from the isolated tests above.

No credentials, database URLs, signed Storage URLs, or private environment files are included in this repository.
