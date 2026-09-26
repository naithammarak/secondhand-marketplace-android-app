# INSPECT-02/03 API handoff (stacked on PR #93)

This backend branch implements Seller → Courier → Inspector → Buyer against the INSPECT-01 schema. It follows the Lead's final 26 September decision in [INSPECT-00 #54](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/54), including the inbound Courier delivery gate. This is a stacked PR with `feat/inspect-01-storage` as its base.

## Working routes

| Actor | Route | Result |
|---|---|---|
| Seller | `POST /orders/{id}/ship-to-center` | Creates one inbound shipment and inspection work, moves Order to `SHIPPING_TO_CENTER` |
| Buyer/Seller | `GET /orders/{id}/inspection-progress` | Reads only the caller's Order progress |
| Admin | `POST /admin/shipments/{id}/assign-courier` | Assigns an active Courier before any proof is uploaded; request `{ "courier_id": 12 }`; previous/new assignee and actor are recorded with the idempotency event |
| Courier | `GET /courier/shipments` | Lists up to 100 assigned inbound shipments and proof metadata |
| Courier | `POST /courier/shipments/{id}/proofs` | Uploads one genuine JPEG/PNG file per request, max 5 MiB and 3 proofs |
| Courier | `POST /courier/shipments/{id}/confirm-delivery` | Verifies 1–3 stored proofs and confirms arrival at the center |
| Buyer/Courier/Inspector | `GET /shipment-delivery-proofs/{id}` | Authorized private read; returns image bytes with `Cache-Control: no-store` |
| Inspector | `GET /inspections`, `GET /inspections/{id}` | Authorized queue and work detail |
| Inspector | `POST /inspections/{id}/receive`, `/start` | Receives only after Courier confirmation and 1–3 proofs, then starts inspection |
| Inspector | `POST /inspections/{id}/evidence` | Validates and stores a private JPEG/PNG/WebP image, max 5 MiB and 5 images |
| Inspector | `POST /inspections/{id}/result` | One final result; 1–5 selected images; `PASS`/`MINOR_ISSUE` issue a Certificate in the same transaction, or roll back with `503 certificate_unavailable` |
| Buyer | `GET /orders/{id}/inspection`, `GET /inspection-evidence/{id}` | Reads own final result and selected image bytes only; image response has `Cache-Control: no-store` |
| Public | `GET /certificates/{token}` | Minimal verification record for a random public token; no buyer identity or private image |

Mutations require the Order-style `Idempotency-Key`. PostgreSQL row locks serialize transitions and proof quota; an identical key/payload replays the saved response, a changed payload returns `409`, and a new key after completion cannot create a second shipment/result/Certificate. Courier proof keys use the `courier/{shipment_id}/` prefix in the same private bucket, separate from `inspections/{inspection_id}/` evidence. The database enforces proof ownership and prevents changing assignment or proofs after confirmation. Inspector work detail hides buyer identity/address. Seller cannot read Buyer-only final evidence. The Certificate table is a narrow implementation of the atomic gate in #54; its public presentation and QR experience still need the separately approved CERT contract.

Example inbound handoff after the Seller ships (all POST requests carry `Authorization: Bearer …` and `Idempotency-Key: <new UUID>`): Admin sends `{ "courier_id": 12 }` to `/admin/shipments/7/assign-courier`; Courier sends multipart `file=@arrival.png` to `/courier/shipments/7/proofs` and receives `{ "proof": { "id": 4, "sort_order": 0, "mime_type": "image/png", "size_bytes": 1234, "url": "/shipment-delivery-proofs/4" } }`; Courier confirms at `/courier/shipments/7/confirm-delivery`; Inspector can then call `/inspections/9/receive`. Before confirmation, receive returns `409 courier_delivery_required`. Missing or corrupted private image returns `503 storage_unavailable` without confirming delivery. No object key or storage secret is returned.

## Configuration and deployment prerequisites

- Apply Alembic `c7e4b21a9d08` after INSPECT-01 `f3c1a09d8b56` on an isolated/staged database first. The new `certificates` table has RLS enabled and no anon/authenticated policy.
- Set `CERT_PUBLIC_ORIGIN` to the trusted public API origin. Do not derive it from a request Host header. Without it, qualifying results return `503` and remain uncommitted.
- For shared deployment, create a **private** Supabase Storage bucket named `inspection-evidence` and configure `SUPABASE_URL` plus `SUPABASE_SECRET_KEY` (or service-role key) on the backend only. Ensure the backend's database role can write the RLS-protected tables. The app must never receive this key or an object path.
- For an isolated local run, `INSPECT_PRIVATE_STORAGE_DIR` selects a backend-only directory instead of Supabase Storage. The PostgreSQL end-to-end tests use this real private file path. Do not expose the directory through static hosting.
- Before deployment, provision private storage, confirm the mobile status decoder and Certificate public URL/QR contract, and have the database owner apply/review the stacked migrations. No central database or shared bucket was changed by this branch.

## Verification and limits

The PostgreSQL API suite uses a dedicated empty local database with `INSPECT_FLOW_TEST_DATABASE_URL`; it migrates to head, creates actual Orders/Payments/Escrows and exercises the Courier assignment, private proof read, pre-confirmation receipt rejection, 1–3 proof quota including concurrent uploads, corrupted storage rollback, all four inspection results, replay, racing shipment/result requests and Certificate rollback/retry. Run it with `python -m pytest tests/test_inspection_flow_postgres.py -q`. It rejects non-local, non-test or non-empty database URLs. The earlier INSPECT-01 PostgreSQL suite uses a **different** empty database through `INSPECT_TEST_DATABASE_URL`.

Mobile screens are not part of this API PR. The user-facing Certificate/QR design, production Supabase bucket provision and real device test remain separate deployment work. Do not claim the full mobile flow is live from backend tests alone.
