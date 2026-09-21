# PRODUCT-06 — Product Create & Edit

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
| `mobile/src/components/product-form.tsx` | Shared, reusable form UI used by both Create and Edit. Owns local field state, runs client-side validation, calls `image-upload-service.ts` directly when the user adds an image, and calls the `onSubmit` prop with the current field values. It does **not** call `product-service.ts` itself — that is left to the screen that renders it, keeping UI and service layer separate. |
| `mobile/src/app/product/new.tsx` | Screen for `/product/new`. Instantiates `createProductService()`, renders `ProductForm` in `mode="create"`, calls `productService.createProduct(values)` on submit, sets a local `success` flag, then navigates with `router.canGoBack() ? router.back() : router.replace('/')`. Shows an inline error message on failure. |
| `mobile/src/app/product/[id]/edit.tsx` | Screen for `/product/[id]/edit`. Reads the `id` route param, loads the product via `productService.getProductById(id)` in a `useEffect`, shows a loading indicator while fetching and "ไม่พบสินค้านี้" if not found. Once loaded, renders `ProductForm` in `mode="edit"` with the product as `initialValues`, calls `productService.updateProduct(id, values)` on submit, with the same success/navigate/error handling as the create screen. |
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

Verified in `product-form.tsx`'s `validate()` function. Only two fields are validated:

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

**Edit:**

```
route param "id" (/product/[id]/edit)
→ productService.getProductById(id)      [[id]/edit.tsx, in a useEffect]
→ loading / not-found / loaded state
→ ProductForm (mode="edit", initialValues = loaded product)
→ client-side validation in product-form.tsx
→ productService.updateProduct(id, values)   [[id]/edit.tsx]
→ on success: setSuccess(true)
→ router.canGoBack() ? router.back() : router.replace('/')
```

On failure (including the `id` not existing any more), `[id]/edit.tsx` shows
"บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่" inside the form.

## 10. Testing

**Automated checks (run and confirmed passing):**

- `npx tsc --noEmit` → PASS
- `npx expo lint` → PASS
- `npm test` → PASS (37 tests total; all belong to the pre-existing Login/Auth test suite —
  there are no automated unit/integration tests specific to PRODUCT-06's
  `product-service.ts`, `image-upload-service.ts`, or `product-form.tsx` yet)

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
