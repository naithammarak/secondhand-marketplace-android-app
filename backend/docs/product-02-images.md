# PRODUCT-02: Upload product images

`POST /products/{product_id}/images` accepts one multipart field named `file`.
The caller must be an active seller who owns the product. JPEG and PNG files
must match their MIME type and extension, decode successfully, and be at most
5 MiB each. Images over 25 million pixels are also rejected with HTTP 415
to limit decoder resource use; **this pixel limit is pending team confirmation**.
A product can have at most 10 images. The tenth succeeds; an
eleventh returns HTTP 409. PostgreSQL locks the product row while checking
the count and saving the new row, so concurrent requests through this API
cannot both claim the last slot.

## Example

```sh
curl -X POST 'https://api.example.invalid/products/123/images' \
  -H 'Authorization: Bearer <SUPABASE_ACCESS_TOKEN>' \
  -F 'file=@item.jpg;type=image/jpeg'
```

```json
{
  "product_id": 123,
  "image_id": 456,
  "image_url": "https://PROJECT_REF.supabase.co/storage/v1/object/public/product-images/123/EXAMPLE.jpg",
  "file_size": 248193,
  "photo_type": "image/jpeg",
  "uploaded_at": "2026-09-18T10:00:00Z"
}
```

Success is HTTP 201. Common failures: 400 empty file, 403 wrong role or
owner, 404 missing product, 409 already 10 images, 413 over 5 MiB,
415 unsupported or unreadable image, 502 Storage upload failure, and
503 missing Storage configuration. Server errors use a generic response
without credentials or object paths.

## Supabase Storage setup

Create a **public** bucket named `product-images` in the same Supabase
project as the database. Public reads are needed because the API returns a
public object URL. Set `SUPABASE_URL` and either `SUPABASE_SECRET_KEY`
(preferred) or `SUPABASE_SERVICE_ROLE_KEY` in the backend environment.
Keep the key server-side and out of Git. Use `backend/.env.example` as a
placeholder template. Run the existing Alembic migrations before using the
endpoint. The backend uses the privileged key for uploads and deletes; clients
must call the API rather than write directly to this bucket.
See Supabase's [bucket access guide](https://supabase.com/docs/guides/storage/buckets/fundamentals)
and [API key guide](https://supabase.com/docs/guides/getting-started/api-keys).

## Find and remove orphaned objects

If Storage times out after receiving an upload, or the DB fails before
`commit()`, the API attempts to delete the object and logs
`PRODUCT-02 orphan cleanup failed` with its bucket and generated path when
that delete fails. If `commit()` raises, its result may be uncertain. The
API checks the image row through a new DB session. A confirmed row returns
HTTP 201 and keeps its file. If the row cannot be confirmed, the API returns
HTTP 500, keeps the file, and logs `PRODUCT-02 commit outcome uncertain`
with the path for manual reconciliation. It never deletes an object after
an uncertain commit response.

An operator can run this **read-only** query in the Supabase SQL editor.
The one-hour delay excludes uploads still in flight. Review each result
against the product record before removal.

```sql
SELECT o.name AS object_path, o.created_at
FROM storage.objects AS o
WHERE o.bucket_id = 'product-images'
  AND o.created_at < now() - interval '1 hour'
  AND o.name ~ '^[0-9]+/[0-9a-f]{32}\.(jpg|png)$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.product_images AS pi
    WHERE pi.image_url LIKE
      '%/storage/v1/object/public/product-images/' || o.name
  )
ORDER BY o.created_at;
```

Delete confirmed orphans through the Supabase Storage dashboard, or the
Storage remove API using the exact bucket and path. Do **not** delete rows
from `storage.objects` directly; that would leave the actual object behind.
Run the query after a Storage or database incident and when reviewing cleanup
error logs. A commit whose acknowledgement is lost may need a separate
manual check of both the product image row and Storage object before action.
The [Storage schema guide](https://supabase.com/docs/guides/storage/schema/design)
explains why direct metadata deletion is unsafe.

## Decisions pending from other work

PRODUCT-00 must define which product states permit image uploads, the minimum
number of images before publication, and the product creation API. VERIFY-03
must define which status or source proves seller approval. This endpoint
continues the existing active-seller and ownership checks until those
decisions are made.
