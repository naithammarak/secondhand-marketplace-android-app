# Marketplace UI implementation and verification

Design reference: [provided marketplace HTML](../design/marketplace-reference.html). Base: `0856b6d` on `main`.

## Implemented behavior

- `/` and `/products`: public two-column catalog with real images, prices, conditions, search, paginated results and API category chips.
- `/products/[id]`: large product image, selectable thumbnails, product information and a persistent purchase bar opening checkout for that product.
- `/login` and `/profile`: Thai login layout and account management. Existing role selection and seller approval rules are retained. A guest purchase/order/sell destination survives OAuth, expires after 30 minutes, and is consumed once after backend verification. Canceling clears it.
- `/sell`: account-scoped seller approval and actual listing/verification destinations.
- `/product/new` and editing: photo-first form, API options, field errors, accessible condition choices and the existing upload/create/update safeguards.
- `/orders`: compact order cards, status pills and payment/detail actions using real order IDs. No previous-account rows render during an account change.
- Shared navy light/dark colors, local Kanit/Noto Sans Thai fonts with licenses, reusable headers, icons, cards, buttons and four bottom tabs.

The only backend change is additive `GET /products?category_id=<positive integer>`. It combines with `q`, `page`, and `page_size`, applies the existing public visibility rules, and computes pagination totals after filtering. No migration is needed. Category IDs come from `GET /categories`.

The example's five-image limit is illustrative; the existing API limit of 1–10 JPEG/PNG files remains in effect. No escrow claim or payment-provider integration is introduced. Existing payment simulation remains explicitly labeled by its existing checkout/order screens. All new production screens use existing API services; no demonstration inventory or fake order state is added.

## Verification (2026-09-25)

Automated checks and HTTP checks are separate from device acceptance. Unit/component tests use controlled fixtures, and are not proof of real OAuth, payment, uploads or Android interaction.

| Case | Reproduce | Expected | Actual / evidence | Status |
| --- | --- | --- | --- | --- |
| TypeScript | In `mobile`, `npm run typecheck` | No type errors | Completed without errors | Verified |
| Lint | `npm run lint` | No lint errors | Completed without errors | Verified |
| Logic | `npm run test:logic` | All logic tests pass | 271 tests, including stale catalog responses and login return validation | Verified in tests |
| Components | `npm run test:components -- --silent` | Auth, navigation, catalog, form and order actions pass | 108 tests passed in 12 suites | Verified in tests |
| API filtering | In `backend`, `python -m pytest tests/test_product_reads.py -q` | Correct filtering, pagination and validation | 23 tests passed, including unknown/duplicate/invalid categories | Verified in isolated SQLite tests |
| Live catalog | Run this branch's backend; call through `createProductCatalogService({mode:'api', baseUrl})` | Categories and details agree; unknown search is empty | HTTP 200; 5 products; 5 categories; category counts 3/0/0/0/2; all returned detail category IDs match; empty search 0 | Verified with configured development DB, read only |
| Web export | `npx expo export --platform web --output-dir dist/web` | Production bundle builds | 20 routes exported | Build verified |
| Android export | `npx expo export --platform android --output-dir dist/android` | Native JS bundle and font/icon assets build | Hermes bundle and bundled assets exported | Build verified; not an APK/device test |
| Responsive appearance | Open catalog, detail, login, form and orders at 320/390/768px, light and dark, with large text | No clipping; accessible controls; purchase bar visible | Browser access to localhost was blocked by an administrator policy | Not run |
| Google login and checkout return | Guest opens a product, chooses buy, completes Google login and role setup | Same product's checkout opens once | Navigation tested with fixtures; live Google flow requires interactive login | Not run live |
| Seller upload and order/payment | Approved seller uploads a real test image; buyer places a test order and follows the documented simulated-payment flow | API-backed changes and correct account visibility | Existing automated tests only; no real account transaction performed | Not run live |

## Run and review

1. Configure the ignored backend `.env` and run `python -m uvicorn app.main:app --host 127.0.0.1 --port 8004` from `backend`.
2. Configure mobile `.env` from `.env.example`: use the backend origin in `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_PRODUCT_CATALOG_MODE=api` and `EXPO_PUBLIC_PRODUCT_MOCK_MODE=false`; supply the existing Supabase public configuration.
3. Run `npm ci` and `npm run web -- --port 8083` from `mobile`. Configure Supabase's allowed OAuth callback for the actual preview origin. For a physical Android device, use a backend address reachable from that device instead of loopback.
4. Complete the three live acceptance rows above before merging. Do not attach tokens, signed image links, private account fields or credentials as evidence.
