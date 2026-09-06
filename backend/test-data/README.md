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

5. DB2 applies it explicitly:

   ```powershell
   .\.venv\Scripts\python.exe -m scripts.assign_test_role --supabase-user-id $testUserId --role ADMIN --apply
   ```

6. DB2 repeats the preview to verify `already-set`, then checks that `public.users` contains exactly one row for that UUID.
7. QA keeps the alias-to-real-email mapping in the team's approved private channel. It is never copied into GitHub Issues, screenshots, logs, or repository files.

Equivalent role values for the same preview/apply commands are `BUYER`, `SELLER`, and `INSPECTOR` (in addition to `ADMIN`).

## Recovery and safety

If the command reports user-not-found, have the tester sign in once after LOGIN-05 is available, then ask DB2 to obtain the authenticated user's `supabase_user_id` again. Do not insert a row manually or reuse an identifier from the example roster.

The command must never run with a test database URL against production unintentionally. Confirm the intended environment before applying a role. Do not place credentials, access or refresh tokens, database URLs, service-role keys, real names, personal emails, or private mappings in this repository.
