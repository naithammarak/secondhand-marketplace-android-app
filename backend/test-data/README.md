# Login test-account preparation

This directory contains a synthetic roster showing the shape of role assignments. The example file is documentation only; the CLI does not consume it, preventing accidental execution with sample UUIDs.

## Operator workflow

1. Lead privately chooses the four Google accounts and adds them to Google Auth Platform Test users.
2. Each tester signs in once after LOGIN-05 is available.
3. DB2 obtains the corresponding `supabase_user_id` from the authenticated user record without copying access tokens.
4. From `backend`, DB2 previews the assignment:

   ```powershell
   $testUserId = Read-Host "Supabase user UUID"
   .\.venv\Scripts\python.exe -m scripts.assign_test_role --supabase-user-id $testUserId --role ADMIN
   ```

5. DB2 applies it explicitly (providing `--project-ref` to verify against the target database):

   ```powershell
   $targetProjectRef = Read-Host "Target Supabase project ref"
   .\.venv\Scripts\python.exe -m scripts.assign_test_role --supabase-user-id $testUserId --role ADMIN --project-ref $targetProjectRef --apply
   ```

6. DB2 repeats the preview to verify `already-set`, then checks that `public.users` contains exactly one row for that UUID.
7. QA keeps the alias-to-real-email mapping in the team's approved private channel. It is never copied into GitHub Issues, screenshots, logs, or repository files.

Equivalent role values for the same preview/apply commands are `BUYER`, `SELLER`, `INSPECTOR`, and `COURIER` (in addition to `ADMIN`). Courier accounts are assigned by staff; login role selection remains limited to Buyer/Seller.

## Recovery and safety

If the command reports user-not-found, have the tester sign in once after LOGIN-05 is available, then ask DB2 to obtain the authenticated user's `supabase_user_id` again. Do not insert a row manually or reuse an identifier from the example roster.

If the command detects multiple user records matching the same `supabase_user_id`, it aborts safely without modifying data. Verify database integrity and unique constraints before retrying.

The command enforces fail-closed execution: applying changes (`--apply`) requires specifying `--project-ref` (or setting `EXPECTED_PROJECT_REF` / `SUPABASE_PROJECT_REF` in the environment), which is verified via exact matching against the target `DATABASE_URL` (parsed from pooler username `postgres.<ref>` or direct hostname `db.<ref>.supabase.co`). In addition, the target project ref must belong to the approved test project allowlist (`hzromkehaftcfthhrunm`, `localhost`, `127.0.0.1`, `private-host`, or configured via `ALLOWED_TEST_PROJECT_REFS`), and the command rejects execution against production environments by default. To assign roles in an explicitly confirmed production or unlisted project, `--allow-production` must be supplied.

Do not place credentials, access or refresh tokens, database URLs, service-role keys, real names, personal emails, or private mappings in this repository.
# INSPECT-01 synthetic fixtures

`scripts.seed_inspections` creates eight deterministic scenarios on a **dedicated local PostgreSQL test database**: paid Order awaiting Seller shipment, shipping, received, inspecting, and final results `PASS`, `MINOR_ISSUE`, `NOT_AS_DESCRIBED`, `FAKE`. It also creates synthetic Buyer/Seller/Inspector/Courier users, products, payment/escrow/receipt rows, private object-key placeholders, a Courier proof before each Inspector receipt, and one selected inspection image per final result. It never writes a storage object or issues a certificate.

Prepare an empty local database whose name includes `test`, then migrate it to the INSPECT-01 head. Supply its URL explicitly; the command refuses a non-local host or the application's `DATABASE_URL`.

```powershell
cd backend
python -m scripts.seed_inspections --database-url "postgresql+psycopg://...@localhost/inspect_test" --namespace inspect01-v1
python -m scripts.seed_inspections --database-url "postgresql+psycopg://...@localhost/inspect_test" --namespace inspect01-v1 --apply
```

Preview is read-only. Apply uses one transaction and an advisory lock for the namespace. Running it twice reports `already-present` with the same Order IDs; a changed scenario reports `fixture conflict` and rolls back. Use a new namespace for another run. This fixture is for database validation only; it cannot stand in for real uploaded files or CERT issuance.

Run integration checks with a **different empty** local PostgreSQL database URL. The isolated cluster must have non-superuser `anon` and `authenticated` roles; the test grants them table access in the test database so a rejected read/write proves RLS rather than a missing table grant. Create these roles only in the local test cluster if they do not already exist:

```sql
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
```

```powershell
$env:INSPECT_TEST_DATABASE_URL = "postgresql+psycopg://...@localhost/inspect_migration_test"
python -m pytest tests/test_inspection_postgres.py -v
```

The test suite requires an empty database and never targets the shared Supabase database. Migration tests create data in that dedicated database and refuse a non-local target.
