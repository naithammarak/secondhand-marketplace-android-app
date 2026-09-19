# PRODUCT-02: Upload product images

The registered API on this branch is `POST /products/images/upload`. It accepts
exactly one multipart `file` and no `product_id`. An approved active Seller
receives a PENDING `upload_id`, a 300-second signed preview URL, and a 24-hour
expiry. The object key stays on the server. A Seller can have at most 16 active
pending uploads; a product must eventually bind 1–10 JPEG/PNG images.

Lead confirmed that approval uses the newest `verifications` row ordered by
`created_at DESC, id DESC`. The backend rechecks this before uploading.

The endpoint fails closed with 503 while `product-images` remains public or
the new schema has not been applied. Switching the shared bucket and applying
shared migrations are separate rollout steps. The old product-ID upload route
is no longer registered in the application.

## New request and response

```sh
curl -X POST 'https://api.example.invalid/products/images/upload' \
  -H 'Authorization: Bearer <SUPABASE_ACCESS_TOKEN>' \
  -F 'file=@item.jpg;type=image/jpeg'
```

```json
{"data":{"upload_id":801,"image_url":"https://example.supabase.co/storage/v1/object/sign/product-images/pending/example.jpg?token=EXAMPLE","url_expires_at":"2026-09-18T10:05:00Z","expires_at":"2026-09-19T10:00:00Z","mime_type":"image/jpeg","file_size":120000,"uploaded_at":"2026-09-18T10:00:00Z"}}
```

## Live integration verification

Verified against the shared development Supabase project on 2026-09-19:

- `product-images` was private and limited to 5 MiB JPEG/PNG files.
- An active Seller whose latest verification was APPROVED received HTTP 201.
- The response contained an `upload_id` and a 300-second signed URL.
- The corresponding `product_uploads` row was PENDING, unexpired, and not yet
  attached to a product.
- The private Storage object existed in `product-images`.

Access tokens and signed-URL tokens are intentionally omitted from test
evidence. The pending upload will be consumed by PRODUCT-03 or become eligible
for cleanup after its 24-hour expiry.

## Pending-upload registry migration

Revision `7f4c2e91a6b0` adds `product_uploads`, with seller ownership,
server-generated private object key, MIME type, file size, upload/expiry time,
PENDING/ATTACHED/DETACHED state, and optional attached product. It has foreign
keys, unique object keys, constraints, a seller/state/expiry index, and RLS
without Mobile policies. Revision `54ca8e0731bd` adds nullable `upload_id`
and `sort_order` to existing product images, preserving every existing row and
public URL. These revisions descend from `c6b19e0d4f2a`, so they can be
applied without pulling in Verify/Order. Separate revision `9a18d37ce520`
joins the two branches. The configured database was read-only checked at
`c6b19e0d4f2a`; `alembic upgrade head` would also apply unrelated
Verify/Order migrations. PR #71 may add another verification revision, so
re-check/reconcile Alembic heads after merging it.

Only run `alembic upgrade head` against an isolated test database until the
whole migration chain is reviewed. No shared database has been migrated. A
downgrade drops only the new table, but any pending upload metadata in it
would be lost; reconcile its Storage objects before downgrading a database
that has accepted uploads. A read-only check on 2026-09-18 found zero
`product_images` rows, zero objects in `product-images`, and a public bucket.
Repeat that check immediately before any privacy change. If data has appeared,
copy and verify every referenced object before changing bucket visibility;
never delete the original until references and signed reads are verified.

After applying the schema and deploying the new upload endpoint, review
pending uploads and orphaned `pending/` objects with:

```sh
python -m scripts.cleanup_product_uploads
```

The default is read-only and reports counts. `--apply` deletes only expired
PENDING or DETACHED registry objects that no product image references, plus
unreferenced `pending/` objects older than 24 hours. The command rechecks
references before each delete and removes objects through the Storage API;
it does not delete `storage.objects` rows with SQL. Use `--limit` to bound one
run. Keep the backend secret key on the server only.

## Storage and legacy-image rollout

The `product-images` bucket must be **private** before this endpoint accepts
uploads. Set `SUPABASE_URL` and a server-only `SUPABASE_SECRET_KEY` or
`SUPABASE_SERVICE_ROLE_KEY`; do not expose either key to Mobile. The backend
checks bucket visibility, writes the object, and returns a signed URL valid
for 300 seconds. The database stores the private object key. Existing public
URLs are retained as legacy data until a separate migration copies or moves
each object, checks its checksum and reference, and verifies signed reads.
Do not flip a populated bucket to private until existing product images have
a working signed-read path. See the [Supabase bucket guide](https://supabase.com/docs/guides/storage/buckets/fundamentals).

The former `POST /products/{product_id}/images` route is not registered.
Its rows and URLs are preserved by the new migrations. A read-only legacy
object audit can compare `storage.objects` with `product_images` before
changing access or removing files. Remove confirmed orphans through the
Storage API or dashboard, never by deleting `storage.objects` rows in SQL.
See the [Storage schema guide](https://supabase.com/docs/guides/storage/schema/design).

## Remaining integration

PRODUCT-03 must call the binding helper in the same database transaction as
product creation. It checks ownership, PENDING state, expiry and the 1–10
limit before attaching images. PRODUCT-04 must make the same check when
replacing images on an owned, undeleted AVAILABLE product. A read endpoint
must create a fresh 300-second signed URL after checking read permission.
These create/edit/read endpoints are outside PRODUCT-02 and are not yet
available on this branch. The maximum decoded image size of 25 million
pixels is a protective limit awaiting Lead confirmation.
