# INSPECT-02/03 API handoff (stacked on PR #93)

This backend branch adds the Seller → Inspector → Buyer API flow against the INSPECT-01 schema. It uses the draft [INSPECT-00 #54](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/54) contract, so the PR stays draft until Lead confirms the final revision. This branch is intended as a stacked PR with `feat/inspect-01-storage` as its base.

## Working routes

| Actor | Route | Result |
|---|---|---|
| Seller | `POST /orders/{id}/ship-to-center` | Creates one inbound shipment and inspection work, moves Order to `SHIPPING_TO_CENTER` |
| Buyer/Seller | `GET /orders/{id}/inspection-progress` | Reads only the caller's Order progress |
| Inspector | `GET /inspections`, `GET /inspections/{id}` | Authorized queue and work detail |
| Inspector | `POST /inspections/{id}/receive`, `/start` | Moves Order to `RECEIVED_AT_CENTER`, then `INSPECTING` |
| Inspector | `POST /inspections/{id}/evidence` | Validates and stores a private JPEG/PNG/WebP image, max 5 MiB and 5 images |
| Inspector | `POST /inspections/{id}/result` | One final result; 1–5 selected images; `PASS`/`MINOR_ISSUE` issue a Certificate in the same transaction, or roll back with `503 certificate_unavailable` |
| Buyer | `GET /orders/{id}/inspection`, `GET /inspection-evidence/{id}` | Reads own final result and selected image bytes only; image response has `Cache-Control: no-store` |
| Public | `GET /certificates/{token}` | Minimal verification record for a random public token; no buyer identity or private image |

Mutations require the Order-style `Idempotency-Key`. PostgreSQL row locks serialize transitions; an identical key/payload replays the saved response, a changed payload returns `409`, and a new key after completion cannot create a second shipment/result/Certificate. The database also enforces unique rows. Inspector work detail hides buyer identity/address. Seller cannot read Buyer-only final evidence. The Certificate table is a narrow implementation of the atomic gate in #54; its public presentation and QR experience still need the separately approved CERT contract.

## Configuration and deployment prerequisites

- Apply Alembic `c7e4b21a9d08` after INSPECT-01 `f3c1a09d8b56` on an isolated/staged database first. The new `certificates` table has RLS enabled and no anon/authenticated policy.
- Set `CERT_PUBLIC_ORIGIN` to the trusted public API origin. Do not derive it from a request Host header. Without it, qualifying results return `503` and remain uncommitted.
- For shared deployment, create a **private** Supabase Storage bucket named `inspection-evidence` and configure `SUPABASE_URL` plus `SUPABASE_SECRET_KEY` (or service-role key) on the backend only. Ensure the backend's database role can write the RLS-protected tables. The app must never receive this key or an object path.
- For an isolated local run, `INSPECT_PRIVATE_STORAGE_DIR` selects a backend-only directory instead of Supabase Storage. The PostgreSQL end-to-end tests use this real private file path. Do not expose the directory through static hosting.
- Do not deploy or expose the new write routes until #54 is confirmed, the mobile status decoder is compatible, the Certificate public URL/QR contract is approved and private storage is provisioned. No central database or shared bucket was changed by this branch.

## Verification and limits

The PostgreSQL API suite uses a dedicated empty local database with `INSPECT_FLOW_TEST_DATABASE_URL`; it migrates to head, creates actual Orders/Payments/Escrows and exercises all four results, private image bytes, unauthorized actors, replay, racing shipment/result requests and Certificate rollback/retry. Run it with `python -m pytest tests/test_inspection_flow_postgres.py -q`. It rejects non-local, non-test or non-empty database URLs. The earlier INSPECT-01 PostgreSQL suite uses a **different** empty database through `INSPECT_TEST_DATABASE_URL`.

Mobile screens are not part of this API PR. The user-facing Certificate/QR design, production Supabase bucket provision, real device test and final #54 acceptance are still pending. Do not claim the full mobile flow is live from backend tests alone.
