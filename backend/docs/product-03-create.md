# PRODUCT-03 — Create product

`POST /products` creates an `AVAILABLE` fixed-price product for the approved
seller identified by the Supabase access token. The endpoint follows PRODUCT-00
Contract v1.0 and consumes 1–10 PENDING `upload_id` values produced by
`POST /products/images/upload`.

## Example request

```http
POST /products
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "product_name": "เสื้อเชิ้ตสีฟ้า",
  "description": "เสื้อเชิ้ตมือสองสภาพดี",
  "price": "1290.00",
  "category_id": 1,
  "brand_id": 1,
  "size": "M",
  "condition": "GOOD",
  "sale_type": "FIXED_PRICE",
  "images": [{"upload_id": 801}]
}
```

The client must not send owner, role, approval, status, timestamps, object keys,
signed URLs, or other unknown fields. Price is a positive decimal string with at
most two decimal places. `condition` is one of `NEW`, `LIKE_NEW`, `GOOD`, or
`FAIR`.

## Success

The response is `201 Created`, includes `Location: /products/{id}`, and returns
the saved product in `data`. The server sets owner and `AVAILABLE` status. Images
are returned in request order; index 0 is `MAIN` and the remaining images are
`GALLERY`. Every `image_url` is a private signed URL valid for 300 seconds.

## Atomic behavior

The endpoint locks and rechecks the local Seller and current approval, validates
category and brand, inserts the product, locks all pending uploads, and changes
them to `ATTACHED` in one database transaction. A missing, expired, already-used,
or different-owner upload rolls back the product and every image binding. A
signed URL failure also rolls back the database transaction and leaves the
uploads PENDING for retry.

## Main errors

- `401 AUTH_REQUIRED`: missing or invalid access token
- `403 ACCOUNT_NOT_REGISTERED`, `ACCOUNT_INACTIVE`, `SELLER_ONLY`, or
  `SELLER_NOT_APPROVED`
- `409 IMAGE_ALREADY_ATTACHED` or `UPLOAD_EXPIRED`
- `422 VALIDATION_ERROR`, `FIELD_NOT_ALLOWED`, `INVALID_REFERENCE`,
  `INVALID_IMAGE_COUNT`, or `INVALID_IMAGE_REFERENCE`
- `503 APPROVAL_STATE_UNAVAILABLE` or `STORAGE_UNAVAILABLE`

Errors use the PRODUCT-00 envelope with `code`, Thai `message`, `fields`, and a
server-generated `request_id`. Responses never expose a storage secret or private
object key.

## Test

From `backend`:

```powershell
.\.venv\Scripts\pytest.exe tests/test_products_create.py tests/test_product_upload_binding.py -q
```

The API validates product values before writing them. PRODUCT-01 remains the
owner of adding database check constraints for legacy-compatible product status,
condition, sale type, and positive price after existing shared data is audited.
