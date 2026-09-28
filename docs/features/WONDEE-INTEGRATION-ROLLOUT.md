# Wondee + INSPECT live integration

## Shared rollout completed

The owner requested continuation after the concrete migration/bucket approval
question. Applied 28 September 2026: revision `e8b2c490a713`, certificate RLS on,
private `inspection-evidence` bucket created with the limits below. Existing
user/product/order/verification/shipment/inspection row counts were unchanged.
The private pre-change public-schema/data backup is stored outside the repo at
`/home/tmk/.local/state/wondee-integration/20260928T113906Z/public-before.dump`.

Verified a temporary generated PNG upload and byte-identical read using real
Supabase Storage; unauthenticated public read was denied. The temporary object
was removed. No inspection/order fixture rows were seeded into the shared DB.

## Migration plan that was applied

Observed 28 September 2026: shared Supabase revision is `f3c1a09d8b56`;
`certificates` does not exist; private `inspection-evidence` bucket does not exist.
VERIFY already supplied nullable `shop_name VARCHAR(255)` with its constraint;
users already default to BUYER and no current user has a null role.

Run from this worktree's backend with its ignored `.env`:

```sh
python -m alembic upgrade e8b2c490a713
```

This applies the certificate table (`c7e4b21a9d08`, RLS enabled, no public
policies), adopts the existing compatible shop field without shrinking or
dropping it (`19d4be72a610`), and records a single merge head (`e8b2c490a713`).
No seed or reset is required. Existing product/order rows are preserved.
The migration uses PostgreSQL transactional DDL. A compatible shop field that
predated Wondee is preserved on downgrade. Certificate downgrade intentionally
refuses to drop a populated certificate table.

Create the missing Supabase Storage bucket through the existing backend service
credential with this exact body (never include the credential in documents):

```json
{
  "id": "inspection-evidence",
  "name": "inspection-evidence",
  "public": false,
  "file_size_limit": 5242880,
  "allowed_mime_types": ["image/jpeg", "image/png", "image/webp"]
}
```

The backend remains the only access path for private images. No anonymous or
authenticated bucket policy is added, and no existing bucket is modified.

## Local validation before shared changes

Backend: 465 passed, 45 skipped on disposable localhost PostgreSQL. This includes
INSPECT schema/flow tests, four results, private proof/evidence authorization,
replay/races and certificate rollback, plus Wondee fresh migration and adoption
of an existing VARCHAR(255) shop field. Skips require other dedicated database
configurations. Authentication is overridden in API tests; this is not proof
of a real Google OAuth/device session.

## Runtime

- Frontend: `http://127.0.0.1:8766` with normal providers and API catalog.
- Backend: `http://127.0.0.1:8001`, this worktree including PR #108.
- Ignored mobile `.env.local` contains only public mobile configuration reused
  from the original checkout. Ignored backend `.env` reuses backend credentials.
- `CERT_PUBLIC_ORIGIN=http://127.0.0.1:8766` opens the public certificate screen.
- Original backend on port 8000 is preserved.

Start the live web app with `npm run web:live -- --port 8766` from `mobile`.
The launcher requires API/Supabase configuration and removes the QA fixture flag.
Start its backend from `backend` with
`python -m uvicorn app.main:app --host 127.0.0.1 --port 8001`.
Both currently run detached with logs under
`/home/tmk/.local/state/wondee-integration/runtime/`.

## Integration implemented and verified

- Live product catalog, Google OAuth callback, verified backend account and
  existing buyer orders were observed in the browser. A full browser reload preserved the login session and loaded the live catalog;
  native Android was not run in this round.
- Seller shipping, customer progress, Inspector queue/receive/start/evidence/
  result, buyer result and public certificate read now use authenticated APIs.
- Courier proof/delivery and Admin courier assignment are wired. The added
  `GET /admin/couriers` exposes only active Courier IDs/names to Admin, allowing
  assignment by name without entering database IDs.
- Session reads use the current account; expired requests refresh once; mutation
  retries retain idempotency keys after uncertain responses. Private image
  sources have auth headers and do not persist in the image cache.
- Google callbacks wait for backend verification, restore the saved destination,
  and remove OAuth credentials from the browser address/history after parsing.
- Final mobile regression: 302 logic tests and 158 component tests passed. Typecheck/lint passed. Latest INSPECT
  PostgreSQL flow including Admin courier directory: 14 passed.

## Remaining account and feature boundaries

Read-only shared checks found zero active INSPECTOR or COURIER accounts and one
legacy active BUYER with a latest APPROVED shop request. The account identities
for Inspector/Courier, and permission to reconcile the existing Buyer to Seller,
were requested from the owner. No arbitrary account was promoted. The UI tells
the approved Buyer that seller access still needs activation.

The complete multi-account device journey requires those real staff accounts;
isolated API/component tests are not a substitute for that acceptance. Other
checkouts need this integration migration graph before running Alembic against
the updated shared head. No remote PR merge or branch push was performed.

Buyer decision/FINISH settlement endpoints are not provided by PR #108. The
existing UI must not claim to submit these actions or fabricate settlement.
Payment continues to use the existing explicitly labelled simulation contract.
