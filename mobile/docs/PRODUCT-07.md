# PRODUCT-07 — Product List, Search & Detail

## 1. Feature Overview

PRODUCT-07 is the Frontend (Expo / React Native / TypeScript, expo-router) implementation of
the **buyer-facing** product catalog:

- **Product List + Search** — `/products`
- **Product Detail** — `/products/[id]`

Business scope:

- Read-only browsing: list with search + pagination, and a full detail view.
- **No buy button, no seller information, no checkout, no auction/bidding** — these are
  explicitly out of scope for this ticket and are not present anywhere in the code.
- The catalog is **public**: neither screen requires a session. This matches the contract
  (`GET /products` / `GET /products/{id}` do not require `Authorization`).

## 2. Source of Truth / Scope

- **Issue #49** — PRODUCT-07 — [Frontend] หน้ารายการ ค้นหา และรายละเอียดสินค้า (acceptance
  criteria, required states, out-of-scope list).
- **Issue #42** — PRODUCT-00 contract comment, "PRODUCT-00 — Contract v1.0 สำหรับลงมือ
  (2026-09-18)" — the single frozen source for field names, envelope shape, status/condition
  enums, pagination/search rules, and the error code table. All type/decode/mock behavior in
  this ticket is derived from that comment, not guessed.
- PRODUCT-07 uses the public list/detail endpoints from PRODUCT-05. `main` now registers
  `GET /products` and `GET /products/{id}`. Cross-account and physical-device acceptance
  remains pending. The mock is available only through explicit configuration — see Sections 5 and 6.
- Branch: `PRODUCT-07`, created from `origin/main` (i.e. after PRODUCT-06 / PR #74 was merged).

## 3. Architecture & Frontend Files

Data flow: **service → store → instance (singleton) → screen → route**

```
product-catalog-service.ts  (mock + real fetch, contract decode)
        │
        ├── product-catalog-store.ts   (list/search state machine)
        │        │
        │        └── product-catalog-instance.ts  (singleton: one service + one store)
        │                 │
        │                 ├── product-list-screen.tsx   (imports the singleton store)
        │                 └── product-detail-screen.tsx (imports the singleton store,
        │                                                 only for the "กลับรายการ" button)
        │
        └── product-detail-store.ts   (detail state machine, NOT a singleton —
                                        created per screen instance)
```

| File | Responsibility |
|---|---|
| `mobile/src/services/product-catalog-service.ts` | `createProductCatalogService({ mode?, baseUrl? })`. Exposes `listProducts(params, signal)` and `getProduct(id, signal)`. API is the default; without a valid `baseUrl`, calls fail with `unavailable`. Mock data is returned only with `mode: 'mock'`. |
| `mobile/src/products/product-catalog-config.ts` | Resolves mode and URL settings; invalid/missing API configuration returns an API service option that fails with a configuration code instead of selecting mock. Production explicitly rejects mock mode. |
| `mobile/src/products/product-catalog-store.ts` | `createProductCatalogStore({ service, pageSize?, debounceMs? })`. Pub-sub state machine for the list screen: `query`, `page`, `items`, `meta`, `loading`/`refreshing`/`loadingMore`, `error`. Methods: `load()`, `setQuery(text)` (debounced 300ms), `refresh()`, `loadMore()`, `retry()`, `hasMore()`. |
| `mobile/src/products/product-detail-store.ts` | `createProductDetailStore(service)`. Pub-sub state machine for one product: `productId`, `product`, `loading`, `notAvailable` (404), `error` (network/5xx, distinct from `notAvailable`). Methods: `open(id)`, `retry()`. Does **not** import `product-catalog-store.ts` — the two are independent by design. |
| `mobile/src/products/product-catalog-instance.ts` | Resolves `EXPO_PUBLIC_PRODUCT_CATALOG_MODE` and `EXPO_PUBLIC_API_BASE_URL`, then creates the single shared service/store instance. Both list and detail screens import this instance so query and list state survive navigation. |
| `mobile/src/components/product-catalog-ui.tsx` | `ProductImage` — a small shared component that renders a placeholder (🖼 icon) when `uri` is missing **or** the image fails to load (`onError`). Each instance tracks its own failure state, so a broken image in one card/thumbnail never affects any other. |
| `mobile/src/components/product-list-screen.tsx` | The `/products` screen: search `TextInput` wired to `store.setQuery`, `FlatList` with pull-to-refresh, infinite scroll (`onEndReached` → `loadMore`), header error+retry (first-load failure), footer loading/error+retry (load-more failure), two distinct empty states. |
| `mobile/src/components/product-detail-screen.tsx` | The `/products/[id]` screen: creates its **own** `product-detail-store` instance per mount (`useState(() => createProductDetailStore(...))`), calls `store.open(id)` on mount/`id` change, renders images (sorted by `sort_order`, each with its own placeholder), category/brand/description/size/condition/price, and the `notAvailable` / network-error states. |
| `mobile/src/app/products/index.tsx` | Thin route file — renders `ProductListScreen`. |
| `mobile/src/app/products/[id].tsx` | Thin route file — renders `ProductDetailScreen`. |
| `mobile/src/app/_layout.tsx` | +2 lines: registers `<Stack.Screen name="products/index" />` and `<Stack.Screen name="products/[id]" />`. No other change — no auth guard exists at this layer for any route (each screen gates itself; these two intentionally do not). |
| `mobile/src/components/login-screen.tsx` | +20 lines: a temporary entry point — see Section 12. |

Reused as-is (no changes): `formatBaht` and `parseRouteId` from `mobile/src/orders/order-format.ts`
/ `route-params.ts`, and `Screen`/`Card`/`Button`/`Loading`/`Row`/`styles` from
`mobile/src/components/order-ui.tsx`.

## 4. Data / Types / Fields

All types live in `product-catalog-service.ts` and mirror Contract v1.0 exactly (snake_case
from the wire is mapped to camelCase in the decoded TypeScript types):

| Type | Fields |
|---|---|
| `ProductListItem` | `id`, `productName`, `price` (**string**, e.g. `"1290.00"`), `condition`, `status`, `mainImage: { imageId, imageUrl, urlExpiresAt } \| null` |
| `ProductDetail` | `id`, `productName`, `description`, `price` (string), `categoryId`, `category: { id, categoryName, parentCategoryId }`, `brandId`, `brand: { id, brandName }`, `size`, `condition`, `saleType: 'FIXED_PRICE'`, `status`, `images: ProductImage[]`, `createdAt`, `updatedAt` |
| `ProductImage` | `imageId`, `imageUrl`, `urlExpiresAt`, `fileSize`, `uploadedAt`, `sortOrder`, `photoType: 'MAIN' \| 'GALLERY'` |
| `ProductCondition` | `'NEW' \| 'LIKE_NEW' \| 'GOOD' \| 'FAIR'` — labelled via `conditionLabels`: NEW→ใหม่, LIKE_NEW→เหมือนใหม่, GOOD→ดี, FAIR→พอใช้ |
| `ProductStatus` | `'AVAILABLE' \| 'RESERVED' \| 'SOLD' \| 'CANCELLED'` (only `AVAILABLE` is ever visible publicly) |
| `ProductPageMeta` | `page`, `pageSize`, `total`, `totalPages`, `hasNext` |

`price` is intentionally kept as a `string` end-to-end (never parsed to `number`), matching the
same "no floating point" rule already used for money in `orders/order-format.ts`.

## 5. Mock Implementation

Mock data is served only when `EXPO_PUBLIC_PRODUCT_CATALOG_MODE=mock` (or when a caller
explicitly constructs `createProductCatalogService({ mode: 'mock' })`). No base URL or missing
mode does not select mock data; the service reports `unavailable` instead.

**Seed data — 8 products (`MOCK_SEED`):**

| id | name | status | note |
|---|---|---|---|
| 101 | เสื้อเชิ้ตสีฟ้า | AVAILABLE | normal |
| 102 | กระเป๋าสะพายหนัง | AVAILABLE | normal |
| 103 | รองเท้าผ้าใบ | AVAILABLE | normal |
| **104** | นาฬิกาข้อมือ | AVAILABLE | **`image_url` deliberately points at an unreachable host** (`storage.invalid.broken-host.test`) — use this product to manually verify the image placeholder |
| 105 | เสื้อแจ็คเก็ตกันหนาว | AVAILABLE | normal |
| 106 | กางเกงยีนส์ขายาว | AVAILABLE | normal |
| **107** | หมวกแก๊ป | **CANCELLED** | excluded from `listProducts()` results; `getProduct(107)` throws `ProductCatalogError('not-found')`, i.e. behaves exactly like a real 404 — use this id to manually verify the "สินค้าไม่พร้อมแสดง" detail state |
| 108 | กระเป๋าสตางค์หนัง | AVAILABLE | normal |

The mock also reproduces real-API behavior that the store/screens depend on:

- `listProducts` filters to `status === 'AVAILABLE'` only, sorts by `created_at DESC, id DESC`,
  does case-insensitive substring search on `product_name`, and paginates with the same
  `meta` shape (`page`, `pageSize`, `total`, `totalPages`, `hasNext`) as the real contract.
- `listProducts` rejects `page < 1` or `pageSize` outside `1–50` with
  `ProductCatalogError('validation-error', ...)`, mirroring the real 422 behavior.
- `getProduct(id)` throws `ProductCatalogError('not-found')` for any id that doesn't exist or
  isn't `AVAILABLE` — this is what lets the detail screen's 404 path be exercised without a
  real backend.
- Both calls simulate ~200ms of network latency (`setTimeout`).

The mock seed remains available as an explicit fixture after API mode is enabled, so tests can
continue to cover unavailable products and broken image URLs without depending on backend data.

## 6. Backend / API Integration

Set `EXPO_PUBLIC_PRODUCT_CATALOG_MODE=api` and a valid `EXPO_PUBLIC_API_BASE_URL` to use the
backend. If a URL is configured and mode is omitted, API mode is selected. Missing or invalid
API configuration fails with `ProductCatalogError('unavailable')`; it never falls back to mock.
Set mode to `mock` explicitly only for development/test screens. EAS `development`, `preview`,
and `production` builds select API mode; the `mock` profile is reserved for isolated UI work.
The development profile also disables product create/edit mocks, so seller and catalog calls
use the same `EXPO_PUBLIC_API_BASE_URL`. Set a URL reachable from the test phone in the matching
EAS environment. Production also carries an explicit
`EXPO_PUBLIC_PRODUCT_CATALOG_ENV=production` marker; the resolver refuses mock mode in that
environment even if the mode variable is misconfigured. Without a URL, the screens show the
unavailable state.

Endpoints consumed (per Contract v1.0, §7):

- `GET /products?q=&page=&page_size=` — public, no `Authorization` header.
- `GET /products/{id}` — public, no `Authorization` header.

## 7. Request / Response

The real branch decodes the **Contract v1.0 envelope**, which is a different shape from the
`{ detail }` envelope used by the older `order-service.ts` / `verification-service.ts`:

- Success (list): `{ "data": [ ...ProductListItem-shaped rows... ], "meta": { "page", "page_size", "total", "total_pages", "has_next" } }`
- Success (detail): `{ "data": { ...ProductDetail-shaped object... } }`
- Failure: `{ "error": { "code", "message", "fields", "request_id" } }`

HTTP status → `ProductCatalogErrorKind` mapping implemented in `product-catalog-service.ts`:

| Status | Kind |
|---|---|
| 404 | `not-found` |
| 422 | `validation-error` (with `fields` from the envelope) |
| 503 | `unavailable` |
| any other non-2xx | `server-error` |
| request timeout (`timeoutMs`, default 15000ms) | `timeout` |
| fetch/network failure | `network-error` |
| missing or invalid API base URL | `unavailable` with a `PRODUCT_CATALOG_API_BASE_URL_*` code |

## 8. Authentication / Authorization

None. Both `/products` and `/products/[id]` are public per contract §3
("GET /products, /products/{id}, ... ไม่ต้อง login"). Neither the service, the stores, nor the
screens send an `Authorization` header or check `useAuth()`/session state. Neither screen has an
`if (!auth.session) return <Redirect .../>` guard — this was a deliberate decision, not an
oversight (see Section 3 note on `_layout.tsx`).

## 9. Frontend Validation

There is no form/write input in this feature — the only user input is the search text box,
which has no validation rules (any text, including empty, is a valid query). The mock and the
real-branch decode both reject an out-of-range `page`/`page_size` (see Section 5/7), but this
is driven entirely by pagination state inside `product-catalog-store.ts`, not by anything the
user types directly.

## 10. User Flow

**List / Search:**

```
ProductListScreen gains focus
→ if not state.loaded yet: productCatalogStore.load()   (page 1, current query)
→ if revisiting cached catalog: productCatalogStore.refresh() (page 1, current query)
→ user types → store.setQuery(text) → debounced 300ms → page reset to 1, results replace
→ scroll to bottom → store.loadMore() → next page appended (deduped by id), stops when meta.hasNext is false
→ pull-to-refresh → store.refresh() → page 1 re-fetched immediately (no debounce), current query kept
→ tap a card → router.push({ pathname: '/products/[id]', params: { id } })
→ back from detail → same store instance, same query/items/scroll — no auto-refresh
```

**Detail:**

```
route param "id" (/products/[id])
→ id parsed with parseRouteId(); an invalid id is passed through as NaN
→ store.open(id)   [per-screen store instance, in a useEffect keyed on id]
→ loading / notAvailable (404) / error (network/5xx) / loaded state
→ notAvailable: "สินค้าไม่พร้อมแสดง" + ปุ่ม "กลับรายการ"
     onPress → await productCatalogStore.refresh() → router.canGoBack() ? router.back() : router.replace('/products')
→ error: generic message (by kind) + "ลองใหม่อีกครั้ง" → store.retry()
```

## 11. UI / Visual Design

Both screens reuse the existing `order-ui.tsx` kit (`Screen`, `Card`, `Button`, `Loading`,
`Row`, shared `styles`) rather than introducing a new visual language, matching
`orders-list-screen.tsx`'s existing look (light background, rounded cards, `#243a73`
primary-button color). The only new visual piece is `ProductImage` (Section 3): a fixed-size
rounded frame that shows either the real image or a light-gray box with a 🖼 placeholder icon.

## 12. Temporary Entry Point (`login-screen.tsx`)

There is currently **no persistent navigation** (no tab bar / header menu) anywhere in this app
— every existing feature (`orders`, `seller-verification`, `admin-verifications`,
`buy-by-product-id`) is reached via a button rendered inside `LoginScreen` after a successful
login, gated by role. PRODUCT-07 follows the same existing pattern:

- A new component, `ProductCatalogEntry` (in `login-screen.tsx`), renders a button
  ("ค้นหาสินค้า") that does `router.push('/products')` — navigation only, nothing else.
- It is rendered in:
  1. The authenticated dashboard for all roles:
     `{(auth.account?.role === 'BUYER' || auth.account?.role === 'SELLER' || auth.account?.role === 'ADMIN') && <ProductCatalogEntry />}`
  2. The unauthenticated landing card for guests / visitors who have not logged in yet,
     providing immediate public access to `/products` without requiring login.
- The function is preceded by a comment block starting with `TEMPORARY PRODUCT-07 entry
  point`, so it can be deleted (the function + the render lines) without touching anything
  else once a permanent navigation surface exists.

## 13. Testing

**Automated (run and confirmed passing on this branch):**

- `npm run test:logic` → **256/256 PASS** (service/config, catalog store, and detail store logic tests)
- `npm run test:components` (jest) → **94/94 PASS**, all suites including:
  - `component-tests/product-catalog-ui.test.tsx` (3 tests)
  - `component-tests/product-list-screen.test.tsx` (16 tests)
  - `component-tests/product-detail-screen.test.tsx` (9 tests)
- `npx tsc --noEmit` → **PASS** (0 errors)
- `npx expo lint` → **PASS** (0 errors)

**Manually confirmed (Expo web, `npx expo start --web`, navigating directly to
`http://localhost:8081/products` and via login screen buttons):**

- List loads the mock catalog (7 visible `AVAILABLE` products; id 107 correctly absent)
- Search filters by name; clearing the query returns the full list
- A query with no matches shows "ไม่พบสินค้าตามคำค้น"
- Tapping product 104 shows the image placeholder (its seeded `image_url` is unreachable)
- Tapping product detail shows category/brand/description/size/condition/price, no buy button,
  no seller info
- Navigating to `/products/999999` and `/products/107` both show "สินค้าไม่พร้อมแสดง" +
  "กลับรายการ"

**Not manually tested (needs a logged-in session and/or a physical device):**

- Pull-to-refresh and infinite-scroll `loadMore` gesture behavior on a real touch device
  (exercised programmatically via the store and component tests)

## 14. Known Limitations / Blocker for Real Backend Integration

- **Backend Integration:** `main` registers public list/detail routes. A local read-only API probe decoded list/detail/search for the same public item; seller create/persistence, cross-account visibility, and image order still need test data and device evidence.
- **Environment Safety:** `.env.example` and EAS development/preview/production select API. The separate `mock` profile opts into fixtures. Production rejects mock mode; missing or invalid API configuration shows the unavailable state.
- Detail screen shows every image at a fixed 140×140 tile with no full-screen/zoom viewer.
- Search has no cancel/clear (✕) button — clearing is done by manually deleting the text.

## 15. Handoff Checklist

- [ ] รายการ/รายละเอียดใช้ API จริงและข้อมูลตรงกัน รวมลำดับรูป (รอทดสอบ Seller → Buyer ด้วย id เดียวกัน)
- [ ] แนบหลักฐานมือถือจริงและผลทดสอบ navigation/state (รอทดสอบบนเครื่องจริง)
- [x] Explicit mock/API configuration in `.env.example` and EAS profiles; API mode fails closed when URL is missing/invalid
- [x] Replace/remove or extend the temporary `ProductCatalogEntry` in `login-screen.tsx` to give logged-out and ADMIN users a way to reach `/products`
- [x] Add component tests for `product-list-screen.tsx` / `product-detail-screen.tsx`
- [x] Backend: public PRODUCT-05 list/detail endpoints registered on `main`
- [ ] Test Mobile → API → Supabase end-to-end with an approved Seller and Buyer
- [ ] Manually test on a physical Android/iOS device (pull-to-refresh, infinite scroll,
      keyboard behavior with `keyboardShouldPersistTaps`)

## 16. Out of Scope

PRODUCT-07 does not include:

- Buy button / Checkout entry point
- Seller information on the detail screen
- Auction / Bidding
- Complex filters (category/brand/price-range filter UI)
- Recommendations / related products
- A permanent navigation surface (tab bar, menu) — the current entry point is explicitly
  temporary (Section 12)

## 17. Review Fixes (Post-Merge, PR #80 / Issue #49)

Review findings on PR #80 identified two P2 issues addressed in this revision:

### 17.1 Pending Search Preservation on Refresh During Load

- **Problem:** In `product-catalog-store.ts`, `refresh()` previously cancelled the debounce
  timer (`clearDebounce()`) and immediately returned if `state.loading || state.refreshing`
  was true. When a user typed a new search query while a slow load was in progress and pulled
  to refresh before 300ms, the debounce timer was cleared and the refresh call returned
  early without requesting the new query. The stale in-flight request subsequently completed
  and overwrote the items list with old results, permanently dropping the new search query.
- **Fix:** In `refresh()`, the store tracks whether a debounce query was pending
  (`const hasPendingQuery = debounceTimer !== undefined;`). It now proceeds to call
  `fetchPage('refresh')` whenever `!state.refreshing || hasPendingQuery`, incrementing the
  generation counter to cancel/ignore the stale in-flight load and immediately fetching page 1
  for the latest `state.query`.
- **Source:** `mobile/src/products/product-catalog-store.ts` (`refresh`);
  `mobile/tests/product-catalog-store.test.mjs`.

### 17.2 Image Failure State Reset on URI Change

- **Problem:** In `product-catalog-ui.tsx`, `ProductImage` held a boolean `failed` state that
  remained `true` indefinitely once an image triggered `onError`. When the `uri` prop changed
  (such as receiving a fresh signed URL after a refresh to replace an expired link), the
  component remained stuck displaying the placeholder icon without re-mounting or attempting
  to load the new image.
- **Fix:** `ProductImage` compares `prevUri !== uri` and resets `failed` to `false` during
  render, allowing `<Image>` to render and load immediately with the new URL.
- **Source:** `mobile/src/components/product-catalog-ui.tsx` (`ProductImage`);
  `mobile/component-tests/product-catalog-ui.test.tsx`.

### 17.3 Automated Tests & Verification

- `mobile/tests/product-catalog-store.test.mjs` (2 new tests, 19 total):
  - Refresh while loading with a pending debounced query fetches the new query instead of dropping it.
  - Refresh while already refreshing with a pending debounced query fetches the new query.
- `mobile/component-tests/product-catalog-ui.test.tsx` (3 tests):
  - Renders placeholder when uri is not provided.
  - Renders image and switches to placeholder when image fails to load (`onError`).
  - Resets failed state and renders `<Image>` again when uri changes after an image failure.
- Verification: `npm run test:logic` passes (213 tests), `npm run test:components` passes (56 tests),
  `tsc --noEmit` passes with 0 errors, and `expo lint` passes with 0 errors.

## 18. Implementation Handoff (Issue #49 Remains Open)

The frontend routes and screens are implemented, but Issue #49 acceptance is not complete until
real API behavior and on-device navigation/state checks are evidenced. Do not close the issue
based on this frontend-only handoff.

### 18.1 Backend Configuration and Fail-Closed Behavior
- `EXPO_PUBLIC_PRODUCT_CATALOG_MODE=mock` explicitly selects seeded data for development/test.
- A configured API URL selects API mode by default; `api` mode without a valid URL reports an
  unavailable configuration error.
- EAS development, preview, and production profiles select API mode; the `mock` profile selects
  the isolated fixture. The
  production environment marker and React Native release mode reject mock mode, so a release
  cannot silently replace missing backend data with mock products.

### 18.2 Public Discovery for Guests & ADMIN
- In `mobile/src/components/login-screen.tsx`, guest users can access "ค้นหาสินค้า" without logging in, and `ADMIN` accounts can also browse products.

### 18.3 Empty Image Array Fallback
- In `mobile/src/components/product-detail-screen.tsx`, when `product.images` is empty, a placeholder `ProductImage` is rendered.

### 18.4 Complete Component Test Coverage
- `component-tests/product-list-screen.test.tsx` (16 tests) covers initial loading, revisit refresh, detail return, list rendering, search, empty states, error/retry, load-more, and navigation.
- `component-tests/product-detail-screen.test.tsx` (9 tests) covers loading, full detail rendering, out-of-scope assertion (no buy/seller info), unavailable state (404/CANCELLED), invalid id handling, refresh on back, and retry.
- Current checks: **256 logic tests** + **94 component tests**, typecheck and lint pass. These do not replace Seller → Buyer or physical-device acceptance evidence.
