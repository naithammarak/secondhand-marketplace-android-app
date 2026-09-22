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
- **Issue #47** (PRODUCT-05 — Backend API รายการ ค้นหาชื่อ และรายละเอียดสินค้า) is the backend
  ticket this Frontend work depends on to go live. **As of this handoff, #47 is still open**
  (no endpoint implemented), so this entire feature runs on mock data — see Section 5.
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
| `mobile/src/services/product-catalog-service.ts` | `createProductCatalogService({ baseUrl? })`. Exposes `listProducts(params, signal)` and `getProduct(id, signal)`. With no `baseUrl` (the default), every call is served from an in-memory mock. With a `baseUrl`, it fetches the real API and decodes the Contract v1.0 envelope. Exports `ProductCondition`, `ProductStatus`, `conditionLabels`, `ProductListItem`, `ProductDetail`, `ProductPage`, `ProductPageMeta`, `ProductCatalogError`, `ProductCatalogErrorKind`. |
| `mobile/src/products/product-catalog-store.ts` | `createProductCatalogStore({ service, pageSize?, debounceMs? })`. Pub-sub state machine for the list screen: `query`, `page`, `items`, `meta`, `loading`/`refreshing`/`loadingMore`, `error`. Methods: `load()`, `setQuery(text)` (debounced 300ms), `refresh()`, `loadMore()`, `retry()`, `hasMore()`. |
| `mobile/src/products/product-detail-store.ts` | `createProductDetailStore(service)`. Pub-sub state machine for one product: `productId`, `product`, `loading`, `notAvailable` (404), `error` (network/5xx, distinct from `notAvailable`). Methods: `open(id)`, `retry()`. Does **not** import `product-catalog-store.ts` — the two are independent by design. |
| `mobile/src/products/product-catalog-instance.ts` | The single shared instance: `export const productCatalogService = createProductCatalogService();` and `export const productCatalogStore = createProductCatalogStore({ service: productCatalogService });`. Both the list screen and the detail screen's "กลับรายการ" button import from **this file only**, so they always operate on the same store (search text and scroll position survive navigating to a detail screen and back). |
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

`createProductCatalogService()` called with **no `baseUrl`** (the default used everywhere in
this app today) always serves an in-memory mock defined at the top of
`product-catalog-service.ts`, marked with `// MOCK: replace when backend API is ready`.

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

**Every place that must change when #47 ships** is tagged `// MOCK: replace when backend API
is ready` — grep for that exact string in `product-catalog-service.ts` to find the 3 call
sites (the seed table itself, `listProducts`, `getProduct`). Two more `// MOCK:` comments (not
the exact phrase above) annotate the two special seed rows specifically — the broken image on
id 104 and the cancelled status on id 107 — so a `grep "// MOCK"` (5 total) finds all of it.

## 6. Backend / API Integration

**How to switch to the real backend once #47 is done:** call
`createProductCatalogService({ baseUrl: '<api origin>' })` instead of
`createProductCatalogService()` in `product-catalog-instance.ts` (the only place the service is
constructed). No other file needs to change — `product-catalog-store.ts`,
`product-detail-store.ts`, and both screens only ever call `service.listProducts(...)` /
`service.getProduct(...)`, which have the exact same signature and return shape in both the
mock and real branch.

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
| no `baseUrl` configured | `unavailable` |

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
ProductListScreen mounts
→ if not state.loaded yet: productCatalogStore.load()   (page 1, empty query)
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

- A new component, `ProductCatalogEntry` (in `login-screen.tsx`), renders a single button
  ("ค้นหาสินค้า") that does `router.push('/products')` — navigation only, nothing else.
- It is rendered in its **own** conditional block, immediately after `OrderEntries`:
  `{(auth.account?.role === 'BUYER' || auth.account?.role === 'SELLER') && <ProductCatalogEntry />}`
  — `OrderEntries` itself was not modified.
- The function is preceded by a comment block starting with `TEMPORARY PRODUCT-07 entry
  point`, so it can be deleted (the function + the one render line) without touching anything
  else once a permanent navigation surface exists.

**Known gap:** because this entry point only renders for a logged-in `BUYER`/`SELLER` account,
there is currently **no in-app way to reach `/products` for a user who is not logged in, or for
an `ADMIN` account** — even though the route itself is public and works fine via direct
navigation/deep link for anyone. This is a UI-discoverability gap, not an access-control gap.

## 13. Testing

**Automated (run and confirmed passing on this branch):**

- `npm run test:logic` → **211/211 PASS** (188 pre-existing on this branch + 22 in
  `product-catalog-service.test.mjs` + 14 in `product-catalog-store.test.mjs` + 9 in
  `product-detail-store.test.mjs` — no regressions in any pre-existing test)
- `npx tsc --noEmit` → **PASS** (required regenerating the gitignored, locally-generated
  `.expo/types/router.d.ts` via a brief `npx expo start` so the new `/products` /
  `/products/[id]` routes are recognized by TypeScript's typed-routes; this does not touch any
  source, config, or dependency file)
- `npx expo lint` → 1 error, pre-existing and unrelated: `expo-image-picker` cannot be
  resolved by ESLint's `import/no-unresolved` in `mobile/src/verification/pick-id-card.ts`
  (a `unrs-resolver` native-postinstall-script gap on this machine, not caused by and not
  fixed by this PR — see Section 14)
- `npm run test:components` (jest) → **53/53 PASS**, all 4 pre-existing suites, including
  `login-screen.test.tsx` after the entry-point change. **No new component tests were written
  for `product-list-screen.tsx` / `product-detail-screen.tsx` / `product-catalog-ui.tsx`** —
  only the logic layer (service decode + both stores) has automated coverage.

**Manually confirmed (Expo web, `npx expo start --web`, navigating directly to
`http://localhost:8081/products` since login was not available in this environment — see
Section 14):**

- List loads the mock catalog (7 visible `AVAILABLE` products; id 107 correctly absent)
- Search filters by name; clearing the query returns the full list
- A query with no matches shows "ไม่พบสินค้าตามคำค้น"
- Tapping product 104 shows the image placeholder (its seeded `image_url` is unreachable)
- Tapping product detail shows category/brand/description/size/condition/price, no buy button,
  no seller info
- Navigating to `/products/999999` and `/products/107` both show "สินค้าไม่พร้อมแสดง" +
  "กลับรายการ"

**Not manually tested (needs a logged-in session and/or a physical device):**

- The `ProductCatalogEntry` button itself (requires login, which needs backend/Google OAuth
  access this environment doesn't have)
- Pull-to-refresh and infinite-scroll `loadMore` gesture behavior on a real touch device
  (only exercised programmatically via the store's unit tests, not through an actual gesture)
- Returning from detail to list preserving scroll position (needs the login-gated entry point
  to reach `/products` as part of the normal navigation stack, rather than a fresh browser tab)

## 14. Known Limitations / Known Issues

- Entirely mock data — no persistence, resets on every reload; see Section 5.
- No real backend connected; PRODUCT-05 (#47) is still open.
- No component tests for the three new screen/UI files (Section 13).
- `expo-image-picker` / `unrs-resolver` lint error is a pre-existing local-environment gap
  (also seen and documented during PRODUCT-06), unrelated to this PR's files.
- `/products` has no reachable UI entry point for a logged-out user or an `ADMIN` account
  (Section 12).
- Detail screen shows every image at a fixed 140×140 tile with no full-screen/zoom viewer.
- Search has no cancel/clear (✕) button — clearing is done by manually deleting the text.

## 15. Handoff Checklist

- [ ] Backend: implement PRODUCT-05 (#47) — `GET /products`, `GET /products/{id}`
- [ ] Once #47 is live, set `baseUrl` in `product-catalog-instance.ts` and re-run
      `product-catalog-service.test.mjs` against a real (or recorded) response to confirm the
      decode still matches
- [ ] Replace/remove the temporary `ProductCatalogEntry` in `login-screen.tsx` once a
      permanent navigation surface (e.g. tab bar) exists, or at minimum give logged-out/ADMIN
      users a way to reach `/products`
- [ ] Add component tests for `product-list-screen.tsx` / `product-detail-screen.tsx`
- [ ] Manually test on a physical Android/iOS device (pull-to-refresh, infinite scroll,
      keyboard behavior with `keyboardShouldPersistTaps`)
- [ ] Resolve the `expo-image-picker` / `unrs-resolver` lint gap at the team/environment level
      (tracked separately from this PR)

## 16. Out of Scope

PRODUCT-07 does not include:

- Buy button / Checkout entry point
- Seller information on the detail screen
- Auction / Bidding
- Complex filters (category/brand/price-range filter UI)
- Recommendations / related products
- Real backend integration (pending #47)
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
