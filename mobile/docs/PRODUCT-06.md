# PRODUCT-06 — Product Create & Edit

> **4 October 2026 amendment (local patch):** The brand field accepts a selected
> catalog ID or a typed name (1–255 characters). Create/update send exactly one
> of `brand_id` or `brand_name`; the API resolves or creates the brand within the
> product transaction. Option reloads preserve typed names. Deploy the updated
> API before distributing the new APK. See
> [F brand fix report](../../doc/submission-2026-10-08/reports/F-BRAND-FIX-2026-10-04.md).
> The sections below describe the earlier PRODUCT-06 implementation.

> **Status:** Merged to `main` via PR #74. Post-merge review findings on the Edit flow
> (load error handling, stale form state on product id change, image upload error
> handling) were fixed on branch `product-06-review-fixes` — see
> [Section 14, Review Fixes (Post-Merge, PR #74)](#14-review-fixes-post-merge-pr-74).

## 1. Feature Overview

PRODUCT-06 is the Frontend (Expo / React Native / TypeScript, expo-router) implementation for:

- **Create Product** — `/product/new`
- **Edit Product** — `/product/[id]/edit`

Business scope for this ticket:

- Sale Type: `FIXED_PRICE` only. There is no seller-facing control to choose a sale type; the
  Frontend always assigns `FIXED_PRICE` when creating a product.
- Auction / Bid: **Out of scope** — no UI or logic exists for it.
- Seller Home: **Out of scope** — not built.
- My Products (product listing/management screen): **Out of scope** — not built.
- Product Detail (buyer-facing view page): **Out of scope** — not built.

Because there is no Seller Home / My Products screen yet, the only way to reach
`/product/[id]/edit` today is by already knowing the product id (e.g. a screen the Lead
Dev builds later, or manual navigation during development).

## 2. Frontend Files

| File | Responsibility |
|---|---|
| `mobile/src/components/product-form.tsx` | Shared, reusable form UI used by both Create and Edit. Owns local field state, delegates validation and image-add logic to `products/product-form.ts`, calls `image-upload-service.ts` directly when the user adds an image, and calls the `onSubmit` prop with the current field values. It does **not** call `product-service.ts` itself — that is left to the screen that renders it, keeping UI and service layer separate. |
| `mobile/src/products/product-form.ts` | *(Added in the PRODUCT-06 review fixes.)* Pure domain logic extracted out of `product-form.tsx`: `emptyProductFormValues`, `validateProductForm(values, priceText)`, `uploadProductImage(uploadImage)` (wraps the upload call in try/catch so a failed upload cannot become an unhandled rejection), and `addProductImage(values, imageUrl)` (pure functional helper for image appending). No React/React Native imports — covered directly by `mobile/tests/product-form.test.mjs`. |
| `mobile/src/app/product/new.tsx` | Screen for `/product/new`. Instantiates `createProductService()`, renders `ProductForm` in `mode="create"`, calls `productService.createProduct(values)` on submit, sets a local `success` flag, then navigates with `router.canGoBack() ? router.back() : router.replace('/')`. Shows an inline error message on failure. **Unchanged by the review fixes** — still uses local `useState`, not the store described below. |
| `mobile/src/app/product/[id]/edit.tsx` | Screen for `/product/[id]/edit`. Reads the `id` route param and owns a `createProductEditStore(productService)` instance (via `useState(() => ...)`), read with `useSyncExternalStore`. Calls `store.open(id)` on mount/`id` change and `store.submit(values)` on form submit. Renders a loading indicator, "ไม่พบสินค้านี้" if not found, a load-error box with a "ลองใหม่อีกครั้ง" retry button on load failure, and `ProductForm` (`mode="edit"`) once a product is loaded. |
| `mobile/src/products/product-edit-store.ts` | *(Added in the PRODUCT-06 review fixes.)* External store (subscribe/getSnapshot, driven by `useSyncExternalStore` in `edit.tsx`) that owns all load/submit state for the Edit screen: `open`, `retry`, `submit`. Wraps `service.getProductById`/`service.updateProduct` in try/catch, tracks a `generation` counter so a late response for a previously opened id can never overwrite the currently displayed product, and resets `product` to `null` immediately when `open()` is called with a different id. Covered by `mobile/tests/product-edit-store.test.mjs`. |
| `mobile/src/services/product-service.ts` | Mock (in-memory) product data service. Exports the `Product`/`ProductInput` types and a `createProductService()` factory (same dependency-injection pattern as the existing `me-service.ts`) exposing `createProduct`, `updateProduct`, `getProductById`. |
| `mobile/src/services/image-upload-service.ts` | Mock image upload service. Exports `createImageUploadService()` returning `uploadImage()`, used by `product-form.tsx` when the user taps "+ เพิ่มรูป". |

## 3. Product Data

Verified against the `Product` interface in `product-service.ts`:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Assigned by the mock service on create (`mock-1`, `mock-2`, …). **Not a real backend ID format** — see [Known Limitations](#11-known-limitations). |
| `name` | `string` | Product name. Required by client-side validation (non-empty). |
| `description` | `string` | Free-text description. No validation. |
| `size` | `string` | Free-text size (e.g. "M", "42"). No validation, no enum. |
| `condition` | `string` | Selected from `CONDITION_OPTIONS` via chip selector. Plain `string` type in code, not a TypeScript enum/union. |
| `price` | `number` | Required by client-side validation (must be `> 0`). Entered as text and parsed with `Number(...)` at submit time. |
| `category` | `string` | Selected from `CATEGORY_OPTIONS` via chip selector. Plain `string` type in code, not a TypeScript enum/union. |
| `brand` | `string` | Free-text brand. No validation. |
| `images` | `string[]` | Array of mock image URLs returned by `image-upload-service.ts` (format `mock://product-images/<id>`). Can be empty — not required. |
| `saleType` | `'FIXED_PRICE'` | Always set to `'FIXED_PRICE'` by the service; not a user-editable field. |

**`status` field:** does **not** exist in the current implementation. It is not in the
`Product` interface, not set by `product-service.ts`, and not shown/edited anywhere in
`product-form.tsx`. If Backend's Product model requires a `status`, this needs to be added
to the Frontend as new work.

**Condition options implemented** (`CONDITION_OPTIONS` in `product-service.ts`, Thai labels,
plain strings — not an enum):
`ใหม่`, `เหมือนใหม่`, `สภาพดี`, `พอใช้`, `มีตำหนิ`

**Category options implemented** (`CATEGORY_OPTIONS` in `product-service.ts`, same caveat):
`เสื้อผ้า`, `รองเท้า`, `กระเป๋า`, `เครื่องประดับ`, `อิเล็กทรอนิกส์`, `อื่น ๆ`

Both lists are explicitly marked in code as placeholders (`TODO(PRODUCT-06)`) pending the
real category/condition values from Backend's Product model / class diagram.

**Sale type implemented:** `SaleType` is a TypeScript union of exactly one literal,
`'FIXED_PRICE'`. There is no other value implemented or reachable from the UI.

## 4. Current Mock Implementation

PRODUCT-06 does not call any Backend API today. Both services are fully mocked and are
only ever instantiated with no `baseUrl` in this app (`createProductService()` and
`createImageUploadService()` are both called with no arguments in `new.tsx`, `edit.tsx`,
and `product-form.tsx`), so the mock code path is always the active one.

### `product-service.ts`

- **Create Product** (`createProduct`): assigns a new id (`mock-${counter}`), forces
  `saleType: 'FIXED_PRICE'`, and pushes a copy of the product into an in-memory array.
- **Get Product by ID** (`getProductById`): looks up the in-memory array by `id` and
  returns a copy, or `null` if not found (surfaced by the Edit screen as "ไม่พบสินค้านี้").
- **Update Product** (`updateProduct`): looks up the product by `id` in the in-memory
  array and replaces it. If the `id` doesn't exist, it throws a `ProductServiceError`
  with kind `'not-found'` — the Edit screen currently catches this the same as any other
  error and shows a generic "บันทึกการแก้ไขไม่สำเร็จ" message (the specific `'not-found'`
  kind is not surfaced differently in the UI today).
- **Storage:** a plain module-level array (`mockProducts`) plus a counter
  (`mockIdCounter`). There is no persistence layer (no AsyncStorage, no localStorage, no
  database).
- **Reset behavior:** all mock product data is lost whenever the app process restarts or
  the web page does a full reload — this is expected and by design for the current
  mock-only phase.

### `image-upload-service.ts`

- Is a **mock image upload only**. It does not read, encode, or send any real file, and
  it does not call any Backend endpoint.
- `uploadImage()` waits ~400ms (`setTimeout`) to simulate network latency, then returns
  `{ url: 'mock://product-images/<random 8-char id>' }`. The `mock://` scheme makes it
  visually obvious this is not a real, servable URL.
- This mock service is intended for Development/Testing only, to let the Create/Edit
  form exercise a realistic "select image → get a URL → include it in the product" flow
  before a real upload endpoint exists.

## 5. Backend Integration

The following APIs are needed from Backend. None of their endpoints/methods/payloads
have been specified or agreed yet — all are `TBD`.

### 5.1 Create Product
- Endpoint: TBD
- Method: TBD
- Authentication: TBD
- Request JSON: TBD
- Response JSON: TBD

### 5.2 Get Product by ID
- Endpoint: TBD
- Method: TBD
- Authentication: TBD
- Response JSON: TBD

### 5.3 Update Product
- Endpoint: TBD
- Method: TBD
- Authentication: TBD
- Request JSON: TBD
- Response JSON: TBD

### 5.4 Image Upload
- Endpoint: TBD
- Method: TBD
- Authentication: TBD
- Content-Type: TBD
- Request: TBD
- Response: TBD

## 6. Backend Integration Notes

When Backend is ready, the two integration points are:

- `mobile/src/services/product-service.ts`
- `mobile/src/services/image-upload-service.ts`

Both already use a `createXService({ baseUrl })` factory pattern (matching the existing
`me-service.ts` used by Login/Auth), so wiring a real `baseUrl` in is expected to be a
contained change inside these two files, without touching the screens or `product-form.tsx`
that consume them.

Before that integration work starts, Backend should confirm:

- **Field names** — whether Backend's Product model matches `name`, `description`, `size`,
  `condition`, `price`, `category`, `brand`, `images`, `saleType` exactly, and whether a
  `status` field (or others) needs to be added on the Frontend.
- **Product ID format** — current mock ids look like `mock-1`; real ids (UUID, numeric,
  etc.) are unspecified.
- **`price` type** — currently a plain `number` on the client, parsed from user text input.
  Confirm units/currency and whether Backend expects an integer, decimal, or a
  minor-unit (e.g. satang) representation.
- **`condition` enum** — currently free-form placeholder strings in Thai
  (`CONDITION_OPTIONS`); confirm the real allowed values/codes.
- **`category` values** — same caveat as `condition` (`CATEGORY_OPTIONS`).
- **`saleType`** — confirm `'FIXED_PRICE'` is the exact value/casing Backend expects.
- **`images` format** — currently an array of mock string URLs; confirm whether Backend
  expects URLs, file IDs, or a separate upload-then-reference flow.
- **Authentication** — how the Product API should be authenticated (this app already has
  a Supabase session/access token available via `useAuth()`, used for the existing `/me`
  call in `me-service.ts`).
- **Authorization** — whether only `SELLER` accounts may create/edit, and how that should
  be enforced/reported to the client.
- **Validation rules** — required fields, min/max price, string length limits, etc.
- **Error response format** — so the Frontend can map specific failures (e.g. "not found",
  "forbidden", "validation error") to distinct UI messages instead of the current single
  generic error message per screen.

## 7. Frontend Validation

*(Updated in the PRODUCT-06 review fixes — the validation function moved out of the
component.)* Verified in `products/product-form.ts`'s `validateProductForm(values, priceText)`,
called from `product-form.tsx`'s `handleSubmit()`. Only two fields are validated:

- **`name`** — required; error `"กรุณากรอกชื่อสินค้า"` if empty/whitespace-only.
- **`price`** — required and must parse to a finite number `> 0`; error
  `"กรุณากรอกราคาที่มากกว่า 0"` otherwise.

No other field (`description`, `brand`, `size`, `category`, `condition`, `images`) has
validation — `category`/`condition` always hold a valid selection because they default to
the first option in `CATEGORY_OPTIONS`/`CONDITION_OPTIONS`, and `images` may be an empty
array.

This validation is **client-side only**, implemented purely in the Frontend for UX. Once a
real API exists, **Backend must re-validate all fields independently** — the Frontend
checks must not be relied on as the source of truth.

## 8. UI / Visual Design

Verified against the styles in `product-form.tsx`, `new.tsx`, and `[id]/edit.tsx`:

- Screen background: light blue (`#eaf3fb`).
- Form content sits inside a white, rounded card (`borderRadius: 24`) with a soft drop
  shadow, centered and width-capped (`MaxContentWidth`) for larger/web screens.
- Primary accent color `#96bde9` (matching the existing Login screen) is used for: selected
  category/condition chips, the "฿" price prefix, the dashed "add image" tile border, and
  the submit button background.
- Text inputs: rounded corners, light gray background (`#f8fafc`), light border
  (`#dce4ee`); invalid fields switch to a red border (`#d9534f`) with a red helper message
  underneath.
- Category and condition selectors are pill-shaped chips; the selected chip switches to
  the accent background with bold white text.
- Price field shows a "฿" prefix inside the input's bordered box.
- Image upload area shows uploaded images as tiles with a 🖼 placeholder icon and a small
  red "✕" badge in the corner to remove them, plus a dashed "+ เพิ่มรูป" tile to add another
  (mock) image.
- Loading state: while submitting, the submit button shows a spinner and all inputs, chips,
  and image controls are disabled.
- Success feedback: right after a successful create/update (before navigating away), the
  submit button switches to a green "✓ สำเร็จ" state — added without introducing any
  artificial delay to navigation.
- Layout uses `ScrollView` + `SafeAreaView` with grouped label/input spacing intended to
  read comfortably on a phone-width screen.

## 9. Create / Edit Flow

**Create:**

```
ProductForm (mode="create")
→ client-side validation in product-form.tsx
→ productService.createProduct(values)   [new.tsx]
→ on success: setSuccess(true)
→ router.canGoBack() ? router.back() : router.replace('/')
```

On failure, `new.tsx` catches the error and shows "ลงขายสินค้าไม่สำเร็จ กรุณาลองใหม่" inside
the form.

**Edit** *(updated in the PRODUCT-06 review fixes — now goes through `product-edit-store.ts`
instead of local `useState` in the screen; see [Section 14](#14-review-fixes-post-merge-pr-74)):*

```
route param "id" (/product/[id]/edit)
→ store.open(id)                          [product-edit-store.ts, called from a useEffect in edit.tsx]
→ loading / not-found / loadError (retryable via store.retry()) / loaded state
→ ProductForm (mode="edit", initialValues = state.product) — only mounted once state.product is set
→ client-side validation in products/product-form.ts
→ store.submit(values)                    [product-edit-store.ts]
→ on success: state.submitSuccess = true
→ (edit.tsx effect) router.canGoBack() ? router.back() : router.replace('/')
```

On a failed load, `[id]/edit.tsx` shows "โหลดข้อมูลสินค้าไม่สำเร็จ กรุณาลองใหม่" with a
"ลองใหม่อีกครั้ง" retry button. On a failed submit (including the `id` not existing any
more), it shows "บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่" inside the form.

## 10. Testing

**Automated checks — original PRODUCT-06 (PR #74), for reference:**

- `npx tsc --noEmit` → PASS
- `npx expo lint` → PASS
- `npm test` → PASS (37 tests total; all belong to the pre-existing Login/Auth test suite —
  there were no automated unit/integration tests specific to PRODUCT-06's
  `product-service.ts`, `image-upload-service.ts`, or `product-form.tsx` at that point)

**Automated checks — after the PRODUCT-06 review fixes (branch `product-06-review-fixes`,
commit `82f3df4`, verified 2026-09-20):**

- `npx tsc --noEmit` → PASS
- `npx expo lint` → 1 pre-existing error, unrelated to this work:
  `mobile/src/verification/pick-id-card.ts:1:30` —
  `Unable to resolve path to module 'expo-image-picker'` (`import/no-unresolved`)
- `npm test` → PASS — 186 logic tests (`tests/*.test.mjs`) + 53 component tests
  (`component-tests/*.test.tsx`), 0 failing. 20 of the logic tests are new, specific to
  this work: 10 in `mobile/tests/product-edit-store.test.mjs`, 10 in
  `mobile/tests/product-form.test.mjs` (see [Section 14.4](#144-automated-tests) for what
  they cover).

**Manually confirmed during development (via a temporary, `__DEV__`-only test link since
there is no My Products/Product Detail screen to navigate through normally; the temporary
code has since been removed):**

- Create Product (in-app) → PASS
- Edit Product — load and prefill an existing mock product → PASS
- Update Product (Save) → PASS
- Create → Edit → Save end-to-end, same JS session (no page reload) → PASS

**Implemented per code review, but not separately/explicitly verified in a reported manual
test** (to avoid overstating QA coverage — these were exercised only incidentally, if at
all, during the flow above):

- Client-side validation error paths (empty `name`, `price <= 0`) — not explicitly tested
- Loading state (disabled inputs/spinner while submitting) — not explicitly observed
- Success feedback ("✓ สำเร็จ" button state) — not explicitly observed
- Category / Condition chip selection interaction — not explicitly tested
- Mock image upload UI (add/remove image tile) — not explicitly tested

**Unrelated pre-existing lint warnings** (not part of PRODUCT-06, present in
`mobile/src/components/login-screen.tsx` before and after this work):
- `'ImageBackground' is defined but never used`
- `'BottomTabInset' is defined but never used`

## 11. Known Limitations

- Product data is entirely an in-memory Mock (no persistence layer).
- Mock data is lost whenever the app/web process reloads or restarts.
- Image Upload is a Mock — no file is read, stored, or sent anywhere.
- No Backend API is connected for Create, Get, Update, or Image Upload.
- Backend endpoint/request/response contracts are all `TBD` (see Section 5).
- Authentication/Authorization for the Product API is not implemented and is pending
  Backend specification.
- There is no Seller Home / My Products screen, so there is currently no in-app way to
  discover a product's `id` to reach the Edit screen.
- `condition` and `category` are free-form placeholder string lists, not confirmed
  Backend enums.
- The Edit screen does not distinguish a "not found" update failure from any other
  failure in its error message.
- `ProductForm` does not itself re-sync its internal `values` state if its `initialValues`
  prop changes while the same instance stays mounted — the Edit screen avoids hitting this
  by unmounting/remounting `ProductForm` on a product id change instead (see
  [Section 14.2](#142-product-id-change--stale-form-state)). A future screen that reuses
  `ProductForm` and changes `initialValues` without unmounting it would need to add its
  own reset.

## 12. Backend Handoff Checklist

- [ ] Create Product API
- [ ] Get Product by ID API
- [ ] Update Product API
- [ ] Image Upload API
- [ ] Request JSON
- [ ] Response JSON
- [ ] Product ID format
- [ ] Authentication
- [ ] Authorization
- [ ] Validation rules
- [ ] Error response format
- [ ] Replace Mock Product Service
- [ ] Replace Mock Image Upload Service
- [ ] Test Create Product with Backend
- [ ] Test Edit Product with Backend

## 13. Out of Scope

PRODUCT-06 does not include:

- Auction
- Bid
- Seller Home
- My Products
- Product Detail
- Order / Payment
- Chat
- Notification
- Backend implementation
- Real Image Storage

## 14. Review Fixes (Post-Merge, PR #74)

PRODUCT-06 merged to `main` via PR #74. A post-merge code review found 3 P2 findings, all
in the Edit flow. They were fixed on branch `product-06-review-fixes`
(commit `82f3df4`, "PRODUCT-06: address review findings"), with automated tests added for
the new logic. This section documents what changed; Sections 2, 7, 9, and 10 above have
been updated in place to reflect the current code.

Two new files were added, both under the `products/` domain folder (matching the existing
`orders/`, `admin/`, `verification/` pattern in this repo):

- `mobile/src/products/product-edit-store.ts` — subscribe/getSnapshot store for the Edit
  screen, read via `useSyncExternalStore` in `edit.tsx`.
- `mobile/src/products/product-form.ts` — pure validation/image-add logic extracted out of
  `product-form.tsx`.

### 14.1 Product Edit Load Error + Retry

- **Before:** `edit.tsx` called `productService.getProductById(id)` directly inside a
  `useEffect`, with only a bare `.then(...)` — a rejected promise was never caught, so a
  failed load became an unhandled promise rejection with no way to retry.
- **After:** `createProductEditStore`'s internal `load()` wraps the call in try/catch. On
  failure it sets `loadError: true` on the store's state instead of throwing.
  `edit.tsx` renders a dedicated error box
  ("โหลดข้อมูลสินค้าไม่สำเร็จ กรุณาลองใหม่") with a "ลองใหม่อีกครั้ง" button that calls
  `store.retry()`, which re-runs `load()` for the same `productId` held in the store.
- **Source:** `mobile/src/products/product-edit-store.ts` (`load`, `retry`);
  `mobile/src/app/product/[id]/edit.tsx` (`loadErrorBox` / retry button JSX).

### 14.2 Product ID Change / Stale Form State

- **Before:** `ProductForm`'s local `values` state was seeded once from `initialValues` at
  mount (`useState(initialValues ?? emptyValues)`). In `edit.tsx`, `loading` was only ever
  set to `true` once, at initial mount — the `useEffect` that re-fetched on `id` change did
  not reset it. A slow response for a previously-opened product, or navigating to a
  different product id while the Edit screen stayed mounted, could leave stale
  product data displayed by an already-mounted `ProductForm` instance.
- **After:** `product-edit-store.ts`'s `open(productId)` compares against the currently
  open id; if it differs, it immediately resets state to
  `{ ...initialProductEditState, productId, loading: true }` (clearing `product` to
  `null`) *before* starting the new fetch, and bumps an internal `generation` counter so
  any in-flight response for the previous id is discarded on arrival
  (`if (current !== generation) return;`). Because `edit.tsx` only renders
  `<ProductForm ... />` when `!state.loading && state.product`, this reset unmounts the
  previous `ProductForm` instance and a fresh instance is only mounted once the new
  product has actually loaded — so it always initializes from the correct data.
  **Note for future maintainers:** `ProductForm` itself still does not watch its
  `initialValues` prop for changes after mount; the fix relies on the parent
  unmounting/remounting it rather than the component re-syncing internally. This is
  sufficient for the current Edit screen (its `id` route param is the only thing that
  changes `initialValues`), but a future reuse of `ProductForm` that changes
  `initialValues` while keeping the same instance mounted would need the same treatment
  (or an internal reset) again.
- **Source:** `mobile/src/products/product-edit-store.ts` (`open`, `generation`);
  `mobile/src/app/product/[id]/edit.tsx` (conditional render of `ProductForm`).

### 14.3 Image Upload Error + Concurrent Form Edits

- **Before:** `handleAddImage()` in `product-form.tsx` called
  `imageUploadService.uploadImage()` inside a `try`/`finally` with no `catch` — a failed
  upload became an unhandled promise rejection, with no user-visible error and no way to
  retry other than the button re-enabling itself in the `finally`.
  In the initial review revision (`82f3df4`), `addProductImage(values, uploadImage)` was
  used and called `setValues(result.values)` upon completion; this caused a P2 issue where
  form edits made while the upload was in flight were overwritten by the stale pre-upload
  snapshot, on both upload success and upload failure.
- **After:** the upload call is encapsulated by `uploadProductImage(uploadImage)` in
  `product-form.ts`, which wraps the upload in try/catch and returns `{ url, error }`
  without capturing form state. `product-form.tsx` then applies a **functional update**
  via `setValues(current => addProductImage(current, result.url))` on success so any
  concurrent field edits or removed images are preserved. On failure, it updates only
  `uploadError` state ("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่") without touching form state.
  No separate retry control was added — the "+ เพิ่มรูป" tile is only disabled while
  `uploadingImage` is `true`, so it is immediately tappable again after a failure.
- **Source:** `mobile/src/products/product-form.ts` (`uploadProductImage`, `addProductImage`);
  `mobile/src/components/product-form.tsx` (`handleAddImage`, `uploadError` render);
  `mobile/component-tests/product-form.test.tsx`.

### 14.4 Automated Tests

- `mobile/tests/product-edit-store.test.mjs` (10 tests): initial load; an unknown id
  reported as `notFound` rather than `loadError`; a failed load reporting a retryable
  `loadError` and `retry()` recovering; `retry()` being a no-op without a prior `open()`;
  a slow response for a discarded id not overwriting the product from a newer `open()`;
  the previous product being cleared immediately (before the new fetch resolves) when
  `open()` is called with a different id; a successful submit; a second submit while one
  is in flight not sending a duplicate request; a failed submit leaving the form usable
  and reporting `submitError`; and subscribers being notified on state changes (and not
  after unsubscribing).
- `mobile/tests/product-form.test.mjs` (15 tests): `validateProductForm` — empty name,
  whitespace-only name, four invalid `priceText` values (`''`, `'0'`, `'-5'`, `'abc'`), a
  fully valid form, and both fields reported together when both are missing;
  `addProductImage` pure functional helper; `uploadProductImage` success/failure returns;
  `addProductImage` backward-compatible overload; functional update appending image to
  latest state while preserving concurrent edits made during upload; and failed upload
  preserving concurrent edits without overwriting.
- `mobile/component-tests/product-form.test.tsx` (2 tests): `ProductForm` component
  integration tests verifying that editing form fields or removing images while image
  upload is pending preserves all user edits upon upload success, and updates only error
  upon upload failure without resetting form state.

Both test files follow the existing test conventions in `mobile/tests/` (Node's built-in
`node:test` + `node:assert/strict`, `.test.mjs`, explicit `.ts` extension on the imported
source file) and `mobile/component-tests/` (Jest + `@testing-library/react-native`).

### 14.5 Verification

Run on branch `product-06-review-fixes` (resolving issue #48 / PR #82 review):
Summary: `tsc --noEmit` passes with 0 errors, `expo lint` passes with 0 errors, and
`npm test` passes (191 logic tests + 55 component tests, 246 total tests passing).
