# L1 integration report — 2026-09-29

Local branch: `codex/l1-cert-wondee-integration` in the isolated `7c5f` worktree. The integrated code tree is `230944f4e9a4d6afce8da1298cbb51ce0c7b1848`; this report and frontend handoff are documentation-only follow-ups. Use the final task handoff SHA to check out the candidate with both reports. Nothing was pushed, deployed, merged remotely, or applied to a shared database.

## Source revisions and inclusion

Authenticated GitHub PR state checked on 2026-09-29. These are exact PR base/head OIDs at that check, not approval or merge claims.

| PR | Base OID | Head OID | State | L1 treatment |
|---|---|---|---|---|
| #108 INSPECT | `8254f8d224f62aa765f978f65f110139410a09ab` | `894ce7228f82c58e9f2751f0b2be7fcae19eafa5` | OPEN | Latest review fix included through the #112 ancestry merged at `230944f`; courier pagination and uncertain upload cleanup retained. |
| #109 CERT-01 | `894ce7228f82c58e9f2751f0b2be7fcae19eafa5` | `f532164f97d37251233ff668cae2843f74b44913` | OPEN | Included through #112 ancestry. |
| #110 CERT-02 | `f532164f97d37251233ff668cae2843f74b44913` | `a9ecb11c7dd1c6b9623a937b7c50d183a74be740` | OPEN | Included through #112 ancestry. |
| #111 CERT-03 | `a9ecb11c7dd1c6b9623a937b7c50d183a74be740` | `2c59505add94973737f922f12de16cf04b38a665` | OPEN, Draft | Included through #112 ancestry. |
| #112 CERT-04 | `2c59505add94973737f922f12de16cf04b38a665` | `1493a43b29458459976dd0d5bde5c88fe6847411` | OPEN, Draft | Exact head is a merge parent of `230944f`. |
| #113 Wondee | `f0d1494c223d4e2317ff32f9bc44926e6885f233` | `9a3313757675848fe542085e3173fd5ea34fd445` | OPEN, Draft | Backend behavior came from the frontend owner's selected UI tree `794b193`; the only backend difference from #113 before this integration was Order image API/schema/tests and minor formatting. #113's commit is not an ancestor. |
| #114 UI follow-up | `9a3313757675848fe542085e3173fd5ea34fd445` | `b6667c2cc4c8beabd2de11ffb0c11206e2b444ad` | OPEN, Draft | Not an ancestor. L1 kept the actual frontend owner selection `794b193924b17f93f45afaee60f4ae5073a328b6`; no CERT mobile files were imported. |

F1 source commit `ac597b9cc974cf2bce6161d392a4c59c9e9da244` (base #112 at `85ea754`) was cherry-picked as `ea487f40db88c11da6b9a631c92714f08fb77d69`, with Wondee-specific authorization/test reconciliation in `b9abec24c49780c3cf17ed5cbe8e03a9f255da4c`. F2 source commit `2febd19a6a9ff8dad59ac85079dd6e162ef598db` (base #113 at `9a331375`) was cherry-picked as `3cebbe032b5064c12579e94c568216d097659d78`. Both are included. The UI tree is identical to `794b193`; `git diff 794b193..HEAD -- mobile` is empty.

## Reconciled behavior

- Order and quote product image fields from `794b193` remain; CERT ancestry did not replace `orders.py`, Order schema, or the image tests.
- An Order buyer with account role BUYER or SELLER can read the final result and selected evidence, and an active owner can record one CONFIRM/REJECT decision. Staff roles do not gain buyer capability. Historical result and selected evidence reads can continue after suspension; decision/replay and delivery proof reads remain active-only. Wondee conceals staff Order access as 404. CERT decision does not alter Shipment, Payment, or Escrow.
- The QR/public certificate route stays HTML. A limited `/certificates/{token}/json` route serves native JSON consumers. The result evidence shape includes `mime_type` and `size_bytes`. Unknown public JSON tokens return a protected 404. See `L1-frontend-contract.md` for the frontend changes still required.
- Latest #108 Courier queue pagination and storage cleanup are included. F2's bounded unpaid expiry worker shares the Order expiry transaction helper and does not run orphan Product repair. Its CLI remains dry-run by default; no scheduler was installed.

## Migration graph and data proof

The single Alembic head is `714f11c84d53`:

```text
c93b7e5a1d84 -> 19d4be72a610 ---------------------> e8b2c490a713 --\
             \-> f3c1a09d8b56 -> c7e4b21a9d08 --/                  \
                                      \-> d8b7c4e2910a ---------------> 714f11c84d53
```

`e8b2c490a713` already joins Wondee `19d4be72a610` and INSPECT certificate `c7e4b21a9d08`; the new no-op merge revision joins `e8b2c490a713` with CERT `d8b7c4e2910a`. Neither previously published revision was rewritten. `backend/tests/test_l1_migration_postgres.py` migrated separate seeded histories from each applied branch to the new head, preserving Order, PaymentAttempt, Payment, Escrow, Receipt, Inspection, evidence and a legacy certificate. Downgrading only the merge revision restores two Alembic heads (`e8b2c490a713` and `d8b7c4e2910a`) without changing those snapshots; it is not a complete rollback to either single branch. The CERT suite separately checks its direct downgrade refusal when buyer decisions or revocation data exist. No shared or production database was used.

## Verification on disposable PostgreSQL 16

- Combined CERT/INSPECT/Wondee migration and Order suites after F1+F2: **207 passed**, two dependency deprecation warnings. This run covered certificate constraints/RLS and one-time concurrent decisions, private evidence, Order image API tests, direct migration tests, and both applied-branch adoption paths. The test cluster had nonprivileged `anon` and `authenticated` roles provisioned for RLS checks.
- F2 worker plus Order API, Product read, and Admin Order suites on the integrated branch: **147 passed**, two dependency deprecation warnings. Worker checks include no-HTTP expiry, dry-run/apply/restart, lock races, rollback, and CLI process behavior.
- After the new #108–#112 heads arrived, the full integrated INSPECT flow suite: **40 passed**, two dependency deprecation warnings. This includes the added Courier pagination and uncertain upload cleanup cases.
- `python -m alembic -c backend/alembic.ini heads` returned only `714f11c84d53`; `git diff --check` passed; no `mobile/` diff from `794b193`.

## Acceptance gates

1. Frontend owner must adopt the certificate JSON route, display revoked state, and follow Courier `next_offset`; those consumer changes are detailed in `L1-frontend-contract.md`. The selected UI commit is local and diverges from published #114; reconcile its remote review path before merge. L1 made no frontend edits.
2. F3 should test the final checkout on fresh disposable databases and review the latest PR states again. These PRs are OPEN and several are Draft; local passing tests are not remote approval.
3. Shared migration history, private Supabase Storage, real Google OAuth/staff accounts, Android device flows, worker scheduling/observability, and FINISH settlement remain unverified by L1. The worker was not run against a shared target. No certificate decision releases funds.
