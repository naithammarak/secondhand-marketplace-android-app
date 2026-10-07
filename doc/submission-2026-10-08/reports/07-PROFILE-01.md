# Task delivery report — 07 / PROFILE-01

- Task ID / owner: 07 / package C
- Status: IMPLEMENTED_AND_TESTED (isolated implementation); native acceptance PENDING F
- Repo / branch: `D:\projectsa\package-c` / `codex/c-profile-reviews-2026-10-02`
- Upstream SHA: `94a26a0fbb7a0a82948d95de7db9af070707b770`, A PR #123, supplied as completed by owner in this chat. PR itself was OPEN with no reviewDecision; this is not a claim of GitHub approval/merge.
- Delivered implementation SHA: `eee71dd06dc2958785bb5ca3824f270c5c44d503` (includes original `710f8e2321df24a0c7d99275d72210f72a78d7a0` plus existing schema-test updates); this report follows as documentation only. Independent delivery branch: `codex/c-task07-profile`.
- Migration predecessor/head: `a02f20261002` → `c07f20261002`; one head. Reserve review successor `c08f20261002`.
- Date / timezone: 2 October 2026 / Asia/Bangkok

## What changed and why

เพิ่ม GET/PATCH `/profile` และ POST `/profile/policy-acknowledgement` ใช้ verified identity เดิม แก้เฉพาะชื่อของตน ACTIVE หลัง User lock; strict payload ไม่เปิด role/email/status/provider ID. Nullable acknowledgement ไม่มี legacy backfill; เวลาจาก DB ส่งออก UTC; same-version retry คงครั้งแรก. `/auth/me` ไม่เปลี่ยน response contract และ Google login ไม่ทับชื่อที่แก้.

ProfileScreen ใช้ API, ProfileDetails บันทึกชื่อ/email/role/status readonly. ConsentModal อ่านนโยบายภาษาไทยและบันทึกกับ server ก่อนแจ้งสำเร็จ; เอา photo reuse switch และคำสัญญาลบบัญชีในแอปออก. ลบชื่อ/วันสมัคร/counters สมมติและเมนู placeholder ของ profile; คง theme/mascot และ customer/staff entries ที่มีจริง. Pending/failed seller verification แสดงจริง ไม่แสดงเป็นคำขอใหม่. Guest ยังเข้าทาง Google; approved Seller ยังมีทั้งซื้อ/ขาย. Inactive อ่านได้ แต่บันทึกและสมัคร Seller ไม่ได้.

## Verification performed

ฐานทดสอบ C สร้างใหม่เฉพาะ localhost port 55437, PostgreSQL 16.15 portable; ไม่มีการอ่าน env หรือ mutate shared DB. Python ใช้ `D:\projectsa\SA-Project\backend\.venv\Scripts\python.exe`; mobile `npm ci --ignore-scripts --no-audit --no-fund` จาก lockfile ของ A.

| Check / exact command | Environment / DB isolation | Result / count | Evidence path |
|---|---|---|---|
| `python -m pytest -q tests/test_profile_postgres.py tests/test_profile_review_migration.py tests/test_auth.py -p no:cacheprovider --tb=short` | `DATABASE_URL=sqlite:///:memory:`; `ORDER_TEST_DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:55437/c_profile_test`; `PROFILE_MIGRATION_TEST_DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:55437/c_migration_test`; `PROFILE_LEGACY_SOURCE=D:\projectsa\SA-Project\secondhand-marketplace-android-app\backend` | 61 passed, 1 skipped (pre-existing AUTH-specific PG case without its separate variable). C cases 25 passed, none skipped. | `backend/tests/test_profile_postgres.py`, `backend/tests/test_profile_review_migration.py` |
| `npm run test:components -- --runTestsByPath component-tests/profile-screen.test.tsx component-tests/profile-persistence.test.tsx component-tests/login-screen.test.tsx --silent` | React renderer + mocked transport/session | 26 passed / 3 suites | named component tests |
| `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-isolation=none tests/profile-service.test.mjs` | isolated HTTP adapters; no credentials | 3 passed | named service test |
| `npm run typecheck` | exact A dependency lock | PASS | TypeScript |
| `python -m alembic heads`; `git diff --check` | local source only | `c07f20261002` only; PASS | migration file |
| `python -m pytest -q -p no:cacheprovider --tb=short` | detached task07-only `D:\projectsa\package-c07-check`, exact `eee71dd`; `DATABASE_URL=sqlite:///:memory:` | 452 passed, 223 environment-dependent tests skipped; actual C PostgreSQL evidence remains the separate command above | backend default suite |

First PG run caught +07:00 serialization; UTC response normalization fixed and suite rerun. First UI run caught saved-message reset; fixed and rerun. Normal Node test subprocess was blocked by Windows sandbox EPERM; `--test-isolation=none` ran the same tests successfully. PostgreSQL startup required sandbox escalation; server listens only on 127.0.0.1. Existing dependency deprecation/JWT-test warnings remain. Initial rendering has existing mascot act warnings; focused final run used `--silent`.

## Contract and safety checks

- Private success/error routes, including root prefixes, use no-store. Own projection omits provider ID. Strict injections/control/bounds/non-string names fail 422; inactive writes fail 403.
- Actual paid Order/Payment/Receipt/Escrow/verification JSON unchanged by profile save. Save → GET → `/auth/google` → GET keeps new name; other account unchanged.
- Concurrent acknowledgement on independent requests returns identical DB time. Paired-null DB constraint rejects partial writes.
- Migration test seeds actual legacy inspection/shipment/proof/order/payment data, upgrades through A then C, compares every existing table/column and checks all legacy acknowledgements remain null.
- Read required exact [Expo v57 docs](https://docs.expo.dev/versions/v57.0.0/) before mobile edits. No Expo version upgrade. Windows PostgreSQL binary source is the [official download path](https://www.postgresql.org/download/windows/).

## Remaining work / exact blocker

Actual APK Google login/relogin/account switch/keyboard and policy reading remain PENDING F (Q20/Q21/Q25 native/shared portions). TestClient uses real PostgreSQL + synthetic JWTs, not real Google. A must integrate this isolated checkout's screen changes with E; no other checkout was edited. B/task04 is not required for task07 and has not been merged into it.

## Handoff

- A may take task07 now without task08/B. Take branch `codex/c-task07-profile` (all commits after A through code `eee71dd` and following report), before E's navigation integration. Migration must run after `a02f20261002`. A portable git bundle is supplied outside the source tree in `D:\projectsa\package-c-delivery`.
- Named exports: `createProfileService`, `Profile`, `POLICY_VERSION`; `useProfile`; `ProfileDetails({model})`; `ConsentModal({visible,userName,onAgree,onCancel})`; `PROTOTYPE_POLICY`. ConsentModal owns persisted acknowledgement; onAgree runs only after successful API response. Account-scoped hook rejects late old-account responses and suppresses duplicate writes.
- API examples and merge-file coordination are in `C-API-EXAMPLES.md`. Environment: `EXPO_PUBLIC_API_BASE_URL` only; normal API mode never uses profile fixtures.
- Re-run focused checks after A resolves `main.py` router registration and E's `profile-screen.tsx`/`login-screen.tsx` edits. No navigation file changed in task07. Reports describe implementation, not final release readiness.
