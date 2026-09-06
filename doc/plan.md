# LOGIN-04 Test Accounts and Role Preparation Implementation Plan (Corrective)

> **Status:** Implementation completed and verified across commits `880d3af`, `11b964f`, and `7c4fbbf`. All 29 unit tests pass. This plan serves as the verified execution record. Note on TDD Red Phase: Unit tests in Tasks 1 and 2 were verified failing (RED) against base commit `7619430` before the fixes were committed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide DB2 and QA1 with a safe, repeatable, fail-closed way to assign Buyer, Seller, Admin, and Inspector roles to existing Supabase-authenticated test users without duplicates, destructive resets, accidental production mutation, or committed private account data.

**Architecture:** Google test accounts remain managed manually in Google Auth Platform and Supabase Auth. After a person signs in and LOGIN-05 creates the matching `public.users` row, an operator runs a backend-only CLI using the existing `DATABASE_URL`. The command enforces fail-closed safety by requiring an explicit `--project-ref` (or environment configuration) matching the database target via exact URL parsing before applying changes, validates against an approved test project allowlist, rejects unlisted and production projects by default, finds exactly one row by `supabase_user_id` (aborting safely if duplicates exist), commits without calling `refresh()`, and performs an idempotent role update. No role-assignment HTTP endpoint is added, so Mobile cannot promote users to Admin or Inspector.

**Tech Stack:** Python 3, SQLAlchemy 2, PostgreSQL/Supabase, argparse, pytest

**Spec:** `../ProjectPlan/GitHub_Prototype_Backlog.md` — LOGIN-01 decisions and LOGIN-04

## Global Constraints and Preserved Baseline

- Work from `G:\SecondHandMarketPlace\SA-Project` and read applicable `AGENTS.md` files first.
- **Preserve all pre-existing unrelated changes and files:**
  - `backend/app/main.py` (LOGIN-05 modified; verified against baseline SHA256 `6A264B6F5021C5329D3A6A987BC05048E34E8F9F4CD63E791F71112678C252CE`)
  - `backend/tests/test_main.py` (LOGIN-05 untracked; verified against baseline SHA256 `8FAA82AF37C5119A6208C55E6C756117536AA5C2EFB0E36027072932199F8260`)
  - Note on `install.cmd`: Untracked installer script previously present; permanently removed per user instruction.
  These pre-existing files are outside the scope of LOGIN-04 and must remain untouched, uncommitted, and unstaged. Baseline integrity is verified via SHA256 hashes recorded before implementation and re-verified at handoff.
- **Preserve core database and model files:** `backend/app/database.py` and `backend/app/models/user.py`.
- **Preserve synthetic example data and ignore rules:** `backend/test-data/login-role-assignments.example.json` and `.gitignore`.
- This is a corrective plan starting from commit `6a8fb78` on branch `Login-backend-i4`, resolving review findings for duplicate row enforcement, prohibition of post-commit refresh, fail-closed project ref exact matching, and test project allowlists.
- Do not add an HTTP endpoint for role assignment.
- Do not create or delete Supabase Auth users and do not alter `auth.users`.
- Do not insert a missing `public.users` row. A test account must first sign in through LOGIN-05 so the trusted token creates the row.
- Do not identify an account by display name or email. Assign roles only by the verified `supabase_user_id` UUID.
- Re-running the same assignment must succeed without creating another row or modifying unrelated users.
- Real names, personal emails, real UUIDs, access tokens, refresh tokens, database URLs, and service-role keys must not be committed.
- The local operator command may assign all four valid roles. Admin and Inspector remain protected because the command is backend-only and requires database credentials unavailable to Mobile.
- Do not run tests that truncate, downgrade, reset, or delete data in the shared Supabase database.
- Do not run the role-assignment command against shared Supabase as part of automated tests.

---

### Task 1: Enforce single-row guarantee and prohibit refresh after commit

**Files:**
- Modify: `backend/app/services/test_user_roles.py`
- Modify: `backend/app/services/__init__.py`
- Modify: `backend/tests/test_test_user_roles.py`

**Interfaces:**
- Consumes: `app.models.user.User`, `app.models.user.UserRole`, and a SQLAlchemy `Session`.
- Produces: `assign_test_user_role(db: Session, supabase_user_id: UUID, role: UserRole) -> RoleAssignmentResult`.
- Produces: `RoleAssignmentResult(supabase_user_id: UUID, previous_role: UserRole | None, current_role: UserRole, changed: bool)`.
- Raises: `TestUserNotFoundError` when no application user matches the UUID.
- Raises: `MultipleTestUsersFoundError` when more than one application user matches the UUID.

- [x] **Step 1: Write failing service unit tests for new requirements** (Completed in commit `880d3af`)

In `backend/tests/test_test_user_roles.py`, update `FakeSession` and write tests for the corrective requirements:
- Configure `FakeSession.refresh(user)` to explicitly raise `AssertionError("refresh() must not be called in assign_test_user_role")`.
- Add `test_assign_role_never_calls_refresh_after_commit`: asserts that `assign_test_user_role` completes without triggering `FakeSession.refresh()`.
- Add `test_assign_role_rejects_duplicate_users_without_commit`: when duplicate rows match the UUID, assert `MultipleTestUsersFoundError` is raised, commit count is 0, and user roles remain untouched.
- Add `test_assign_role_rolls_back_and_raises_when_commit_fails`: asserts `db.rollback()` is called on commit failure and no refresh occurs.
- Preserve existing tests: updating existing user once, idempotent repeat, missing user rejection without insert, and switching buyer to seller.

- [x] **Step 2: Run the service tests and confirm new tests fail on previous implementation** (Verified RED against commit `7619430`)

Run from `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_test_user_roles.py -v
```

Expected failure reasons on previous implementation:
- Tests calling `assign_test_user_role` fail with `AssertionError: refresh() must not be called in assign_test_user_role` because previous implementation called `db.refresh(user)` after commit.
- `test_assign_role_rejects_duplicate_users_without_commit` fails because previous implementation used `db.scalar(...)` and did not raise `MultipleTestUsersFoundError`.

- [x] **Step 3: Implement the safe service modifications** (Completed in commit `880d3af`)

In `backend/app/services/test_user_roles.py`:
1. Define `MultipleTestUsersFoundError(RuntimeError)`.
2. In `assign_test_user_role`:
   - Query matching users using `users = list(db.scalars(select(User).where(User.supabase_user_id == supabase_user_id)).all())`.
   - If `not users`: raise `TestUserNotFoundError(str(supabase_user_id))`.
   - If `len(users) > 1`: raise `MultipleTestUsersFoundError(f"Expected exactly one user for {supabase_user_id}, found {len(users)}")`.
   - If `user.role == role`: return `RoleAssignmentResult(supabase_user_id=supabase_user_id, previous_role=previous_role, current_role=role, changed=False)`.
   - Set `user.role = role`.
   - Wrap `db.commit()` in `try ... except Exception: db.rollback(); raise`.
   - Remove `db.refresh(user)` and return `RoleAssignmentResult(supabase_user_id=supabase_user_id, previous_role=previous_role, current_role=role, changed=True)`.
3. In `backend/app/services/__init__.py`: Export `MultipleTestUsersFoundError`.

- [x] **Step 4: Run the service unit tests and confirm they pass** (Verified GREEN: 7 passed)

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_test_user_roles.py -v
```

Expected: all 7 service tests pass.

- [x] **Step 5: Commit the service corrective changes** (Committed: `880d3af`)

Stage only Task 1 files. Confirm pre-existing unrelated files (`backend/app/main.py`, `backend/tests/test_main.py`) are not staged.

```powershell
git add backend/app/services/__init__.py backend/app/services/test_user_roles.py backend/tests/test_test_user_roles.py
git diff --cached --check
git commit -m "fix(login-04): enforce single row and prohibit refresh after commit"
```

---

### Task 2: Implement Fail-Closed Project Allowlist and Exact URL Parsing in CLI

**Files:**
- Modify: `backend/scripts/assign_test_role.py`
- Modify: `backend/tests/test_assign_test_role_cli.py`

**Interfaces:**
- Consumes: `assign_test_user_role(...)` from Task 1, `SessionLocal` and `DATABASE_URL` from `app.database`.
- Produces: module command `python -m scripts.assign_test_role --supabase-user-id UUID --role ROLE [--apply] [--project-ref REF] [--environment ENV] [--allow-production]`.
- Fail-closed rules:
  - Applying changes (`--apply`) strictly requires specifying an explicit project ref via `--project-ref <REF>` (or environment configuration `EXPECTED_PROJECT_REF` / `SUPABASE_PROJECT_REF`). Without it, the command halts immediately with exit code `2`.
  - The CLI parses the target `DATABASE_URL` using `extract_supabase_project_ref` to extract the project ref from pooler username (`postgres.<ref>`) or direct host (`db.<ref>.supabase.co`) and requires an **exact string equality match** (`extracted_ref == expected_ref`), preventing accidental substring matches in passwords or query parameters. Mismatches halt with exit code `1`.
  - The extracted project ref must belong to the approved test project allowlist (`hzromkehaftcfthhrunm`, `localhost`, `127.0.0.1`, `private-host`, or configured via `ALLOWED_TEST_PROJECT_REFS`). Any project not in the allowlist is rejected with exit code `1` unless `--allow-production` is explicitly passed.
  - Production environments (`APP_ENV=production`, `ENVIRONMENT=production`, `--environment production`, or production URL tokens) are rejected by default with exit code `1` unless `--allow-production` is passed.
  - If multiple rows match the UUID in preview or apply mode, the CLI halts safely without modifying data or leaking secrets, and exits with code `1`.
- Exit codes: `0` for success or already-set, `2` for invalid arguments or missing mandatory project ref on apply, `3` when user not found, and `1` for unexpected database failure, duplicate users found, project mismatch, unlisted project, or production rejection.

- [x] **Step 1: Write failing CLI unit tests for fail-closed guard and allowlist** (Completed in commit `11b964f`)

In `backend/tests/test_assign_test_role_cli.py`:
- Add `test_cli_apply_rejected_when_project_ref_is_missing`: asserts exit code 2 and error message when `--apply` is called without `--project-ref` or env configuration.
- Add `test_cli_apply_succeeds_when_project_ref_provided_in_env`: asserts exit code 0 when `EXPECTED_PROJECT_REF` is set in env.
- Add `test_cli_rejects_when_project_ref_mismatches`: asserts exit code 1 when `--project-ref` does not match the database URL.
- Add `test_cli_rejects_substring_match_in_password_or_query`: asserts exit code 1 when expected ref is only a substring of password/query string and not the extracted host/pooler username.
- Add `test_cli_apply_rejected_when_project_not_in_allowlist`: asserts exit code 1 when project matches URL but is not in the test project allowlist.
- Add `test_cli_apply_allowed_for_unlisted_project_with_allow_production`: asserts exit code 0 when `--allow-production` is supplied for unlisted project.
- Add `test_cli_preview_rejects_duplicate_users`: asserts exit code 1 and error message when multiple users match UUID during preview.
- Add `test_cli_apply_rejects_duplicate_users`: asserts exit code 1 and error message when multiple users match UUID during apply.
- Preserve existing CLI tests: preview pending-change, preview already-set, invalid UUID/role, missing application user (code 3), and secret redaction on database errors.

- [x] **Step 2: Run the CLI tests and confirm new tests fail on previous implementation** (Verified RED against commit `880d3af`)

Run from `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_assign_test_role_cli.py -v
```

Expected failure reasons on previous implementation:
- Fails because previous implementation did not mandate `--project-ref` on apply (fail-closed).
- Fails because previous implementation used substring `contains` check instead of exact URL parsing.
- Fails because previous implementation lacked the project allowlist guard.

- [x] **Step 3: Implement exact URL parsing, allowlist, and fail-closed validation** (Completed in commit `11b964f`)

In `backend/scripts/assign_test_role.py`:
1. Add `extract_supabase_project_ref(database_url)` to parse pooler username (`postgres.<ref>`) or direct host (`db.<ref>.supabase.co`).
2. Define `DEFAULT_ALLOWED_TEST_PROJECT_REFS` and `get_allowed_project_refs()` supporting `ALLOWED_TEST_PROJECT_REFS` env var.
3. Update `verify_project_ref(expected_ref, database_url)` to return `(extracted == expected_ref, extracted)`.
4. Add `--project-ref`, `--environment`, and `--allow-production` arguments to `build_parser()`.
5. In `main(...)`:
   - If `arguments.apply`:
     - Resolve `expected_ref = arguments.project_ref or os.getenv("EXPECTED_PROJECT_REF") or os.getenv("SUPABASE_PROJECT_REF")`. If missing, output error to stderr and return `2`.
     - Verify with `matches, extracted = verify_project_ref(expected_ref, effective_db_url)`. If mismatch, output error to stderr and return `1`.
     - Check `extracted in get_allowed_project_refs()`. If not in allowlist and not `arguments.allow_production`, output error to stderr and return `1`.
     - Check `is_production_environment(...)`. If production and not `arguments.allow_production`, output error to stderr and return `1`.
   - If `arguments.project_ref` provided in preview: verify exact match against target database URL.
   - Preview mode: query `db.scalars(...)`. If `len(users) > 1`, raise `MultipleTestUsersFoundError`.
   - Exception handlers:
     - `MultipleTestUsersFoundError`: output `Multiple application users found with this UUID.` to stderr and return `1`.
     - `TestUserNotFoundError`: output application user not found to stdout and return `3`.
     - General exceptions: output `Unexpected database failure.` to stderr without leaking secrets and return `1`.

- [x] **Step 4: Run the focused CLI and service tests and confirm they pass** (Verified GREEN: 24 passed)

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_test_user_roles.py tests/test_assign_test_role_cli.py -v
```

Expected: all 24 tests pass without contacting Supabase.

- [x] **Step 5: Commit the CLI corrective changes** (Committed: `11b964f`)

```powershell
git add backend/scripts/assign_test_role.py backend/tests/test_assign_test_role_cli.py
git diff --cached --check
git commit -m "fix(login-04): enforce fail-closed project allowlist and exact URL parsing"
```

---

### Task 3: Update Test-Account Instructions and Verify Exact Synthetic Roster

**Files:**
- Modify: `backend/test-data/README.md`
- Verify: `backend/tests/test_login_test_data.py`
- Preserve: `backend/test-data/login-role-assignments.example.json`
- Preserve: `.gitignore`

**Interfaces:**
- Consumes: the Task 2 CLI.
- Produces: a reusable, fail-closed operator runbook and verified synthetic example role roster.

- [x] **Step 1: Verify exact-equality safety assertion test** (Completed in commit `7c4fbbf`)

In `backend/tests/test_login_test_data.py`, verify the test asserts exact list equality:

```python
def test_example_login_role_roster_is_synthetic_and_complete():
    entries = json.loads(EXAMPLE_FILE.read_text(encoding="utf-8"))

    assert entries == [
        {
            "alias": "demo-buyer",
            "supabase_user_id": "00000000-0000-4000-8000-000000000001",
            "role": "BUYER",
        },
        {
            "alias": "demo-seller",
            "supabase_user_id": "00000000-0000-4000-8000-000000000002",
            "role": "SELLER",
        },
        {
            "alias": "demo-admin",
            "supabase_user_id": "00000000-0000-4000-8000-000000000003",
            "role": "ADMIN",
        },
        {
            "alias": "demo-inspector",
            "supabase_user_id": "00000000-0000-4000-8000-000000000004",
            "role": "INSPECTOR",
        },
    ]

    assert {entry["role"] for entry in entries} == {
        "BUYER",
        "SELLER",
        "ADMIN",
        "INSPECTOR",
    }
    assert all(entry["alias"].startswith("demo-") for entry in entries)
    assert all(
        entry["supabase_user_id"].startswith("00000000-") for entry in entries
    )
    assert all("email" not in entry for entry in entries)

    assert "/backend/test-data/login-role-assignments.local.json" in (
        GITIGNORE_FILE.read_text(encoding="utf-8").splitlines()
    )
```

Exact equality guarantees that no extra keys (`access_token`, `database_url`, `full_name`, `email`, etc.) can ever be committed in the synthetic roster.

- [x] **Step 2: Run the repository safety test and confirm it passes** (Verified GREEN)

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_login_test_data.py -v
```

Expected: test passes, confirming exact synthetic roster structure and `.gitignore` rule.

- [x] **Step 3: Preserve the synthetic roster** (Verified: only synthetic demo accounts preserved)

Preserve `backend/test-data/login-role-assignments.example.json` containing only the four synthetic entries (`demo-buyer`, `demo-seller`, `demo-admin`, `demo-inspector`).

- [x] **Step 4: Update the operator runbook** (Completed in commit `7c4fbbf`)

Update `backend/test-data/README.md` to document the fail-closed workflow:
1. Lead privately chooses the four Google accounts and adds them to Google Auth Platform Test users.
2. Each tester signs in once after LOGIN-05 is available.
3. DB2 obtains the corresponding `supabase_user_id` from the authenticated user record without copying access tokens.
4. From `backend`, DB2 previews the assignment:

```powershell
$testUserId = Read-Host "Supabase user UUID"
.\.venv\Scripts\python.exe -m scripts.assign_test_role --supabase-user-id $testUserId --role ADMIN
```

5. DB2 applies it explicitly, providing the mandatory target project ref:

```powershell
$targetProjectRef = Read-Host "Target Supabase project ref"
.\.venv\Scripts\python.exe -m scripts.assign_test_role --supabase-user-id $testUserId --role ADMIN --project-ref $targetProjectRef --apply
```

6. DB2 repeats the preview to verify `already-set`, then checks that `public.users` contains exactly one row for that UUID.
7. QA keeps the alias-to-real-email mapping in the team's approved private channel. It is never copied into GitHub Issues, screenshots, logs, or repository files.

Document recovery and safety:
- User-not-found recovery: tester must sign in once.
- Duplicate user detection: command aborts safely without mutating data.
- Fail-closed project validation: `--apply` requires matching `--project-ref` via exact URL matching against pooler/host, checks the project against the test project allowlist, and rejects production environments by default unless `--allow-production` is supplied.

- [x] **Step 5: Run tests across Tasks 1, 2, and 3** (Verified GREEN: 25 passed)

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_login_test_data.py tests/test_test_user_roles.py tests/test_assign_test_role_cli.py -q
```

Expected: all LOGIN-04 tests pass without contacting Supabase.

- [x] **Step 6: Commit documentation and safety runbook updates** (Committed: `7c4fbbf`)

```powershell
git add backend/test-data/README.md
git diff --cached --check
git commit -m "docs(login-04): document exact project verification and test allowlist"
```

---

### Task 4: Verify scope, commits, and prepare handoff

**Files:**
- Verify only; no new files expected.

**Interfaces:**
- Produces: a review summary for DB2, QA1, and Lead with exact commands and test results.

- [x] **Step 1: Run the complete non-destructive backend test suite** (Verified GREEN: 29 passed)

From `backend`, ensure `.env` points to the intended environment, then run tests that do not mutate shared data. Do not set `TEST_DATABASE_URL` to shared Supabase.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_test_user_roles.py tests/test_assign_test_role_cli.py tests/test_login_test_data.py tests/test_user_model.py tests/test_database_security.py -v
```

Expected: all 29 tests pass.

- [x] **Step 2: Inspect final branch diff, staging area, and baseline isolation** (Verified clean index and matching baseline hashes)

Compare against commit `6a8fb78` (the base commit before LOGIN-04 work started), ensuring all branch commits and corrective changes are fully covered, the staging index is completely empty, and that pre-existing baseline files remain untouched:

```powershell
git status --short
git diff --check 6a8fb78..HEAD
git diff --name-only 6a8fb78..HEAD
git diff --cached --name-only
git diff --cached --quiet
git grep -n -E "service_role|refresh_token|access_token|DATABASE_URL=" -- backend/test-data backend/scripts backend/app/services

# Verify baseline files remain strictly identical to pre-task baseline:
(Get-FileHash backend/app/main.py).Hash -eq "6A264B6F5021C5329D3A6A987BC05048E34E8F9F4CD63E791F71112678C252CE"
(Get-FileHash backend/tests/test_main.py).Hash -eq "8FAA82AF37C5119A6208C55E6C756117536AA5C2EFB0E36027072932199F8260"
```

Expected:
- Only LOGIN-04 files are modified across `6a8fb78..HEAD`.
- Staged index is completely empty (`git diff --cached --name-only` produces no output and `git diff --cached --quiet` exits with code 0).
- Baseline file integrity holds: both hash assertions return `True`, proving that pre-existing baseline files (`backend/app/main.py`, `backend/tests/test_main.py`) were not modified during implementation. `install.cmd` was deleted per explicit user request.
- Secret scan returns no committed values.

- [ ] **Step 3: Perform a read-only CLI preview only when a disposable or approved existing user UUID is available** (Manual checkpoint for DB2)

Do not invent a UUID and do not apply a role during automated verification. Run only the preview command using a UUID supplied privately by DB2. If no approved UUID is available, state that shared-environment preview/apply remains a manual DB2 checkpoint.

- [x] **Step 4: Report the implementation handoff** (Reported)

Report:
- Files created and modified across `6a8fb78..HEAD`.
- Exact test command and pass count (29 passed).
- Confirmation that no HTTP role-assignment endpoint was added.
- Confirmation that no user rows were inserted or deleted.
- Confirmation that existing LOGIN-05 baseline files (`backend/app/main.py`, `backend/tests/test_main.py`) were preserved and matched baseline hashes, and `install.cmd` was deleted per request.
- The remaining manual steps listed in `backend/test-data/README.md` for Lead, DB2, and QA1.

Do not claim LOGIN-04 is fully complete until the Lead confirms the private test-account roster exists and DB2 verifies one real authenticated test user per intended role.
