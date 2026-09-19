# PRODUCT-04 — Update and cancel products

PRODUCT-04 adds owner-only write endpoints from PRODUCT-00 Contract v1.0:

- `PATCH /products/{product_id}` updates an `AVAILABLE` product.
- `POST /products/{product_id}/cancel` changes `AVAILABLE` to `CANCELLED`.

Both endpoints authenticate the Supabase access token and recheck the current
local account, Seller role, latest approval, ownership, deletion flag and
product status from the database. Another owner's product and a deleted or
missing product return `404 PRODUCT_NOT_FOUND` without revealing ownership.

## Update example

Only supplied fields are changed. An empty body, `null`, owner/status fields and
other unknown fields are rejected. Scalar validation is the same as create.

```http
PATCH /products/101
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "price": "1190.00",
  "images": [
    {"upload_id": 802},
    {"image_id": 801}
  ]
}
```

When `images` is present it replaces the complete image set in array order.
Each item contains exactly one of:

- `image_id`: an existing image of this product that remains attached.
- `upload_id`: a new, unexpired PENDING upload owned by this Seller.

The final set must contain 1–10 unique references. Index 0 becomes `MAIN`; all
remaining images become `GALLERY`. Removed registry rows become `DETACHED` in
the same database transaction. After commit, Storage cleanup runs only after a
fresh database check confirms that the object is detached, belongs to the
Seller and has no remaining product-image reference. Cleanup failure is logged
for the PRODUCT-02 manual cleanup command and does not turn a committed update
into an API failure.

Success returns `200` with the same full Product shape as create. Every private
image URL is signed for 300 seconds and has a conservative per-image
`url_expires_at`.

## Cancel example

The body may be omitted or be `{}`.

```http
POST /products/101/cancel
Authorization: Bearer <access_token>
```

```json
{"data":{"id":101,"status":"CANCELLED","updated_at":"2026-09-18T10:10:00Z"}}
```

Cancel preserves the product row and every image; `deleted_at` remains null.
Calling cancel again returns `200` with the same status and `updated_at` without
writing again. `RESERVED` and `SOLD` products return
`409 PRODUCT_NOT_CANCELLABLE`.

## Concurrency and failures

Update and cancel lock the current Seller and product rows, refresh ORM cached
state and check the latest status before writing. `RESERVED`, `SOLD` and
`CANCELLED` cannot be updated and return `409 PRODUCT_NOT_EDITABLE`. If Order
changes the state first, Product writes roll back without changing fields or
images.

Product changes, upload consumption, image replacement, ordering and detach
metadata commit in one transaction. When commit acknowledgement is lost, the
backend checks the intended product and image state through a separate database
session. It returns the prepared success response only when the committed state
is confirmed.

## Main errors

- `401 AUTH_REQUIRED`
- `403 ACCOUNT_NOT_REGISTERED`, `ACCOUNT_INACTIVE`, `SELLER_ONLY`,
  `SELLER_NOT_APPROVED`
- `404 PRODUCT_NOT_FOUND`
- `409 PRODUCT_NOT_EDITABLE`, `PRODUCT_NOT_CANCELLABLE`,
  `IMAGE_ALREADY_ATTACHED`, `UPLOAD_EXPIRED`
- `422 VALIDATION_ERROR`, `FIELD_NOT_ALLOWED`, `INVALID_REFERENCE`,
  `INVALID_IMAGE_COUNT`, `INVALID_IMAGE_REFERENCE`
- `503 APPROVAL_STATE_UNAVAILABLE`, `STORAGE_UNAVAILABLE`

All errors use the Product error envelope with Thai `message`, `fields` and a
server-generated `request_id`.

## Test

From `backend`:

```powershell
.\.venv\Scripts\pytest.exe tests/test_products_update_cancel.py -q
```
