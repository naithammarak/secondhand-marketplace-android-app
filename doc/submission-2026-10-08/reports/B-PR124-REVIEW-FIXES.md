# PR124 review corrections

- Branch / PR: `feat/package-b-delivery-settlement` / [#124](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/124); not merged.
- Reviewed and fetched starting head: `29e90c3fe7c283aab6444ad56f011eef455b84fc`. Working tree was clean; existing B/A work was preserved.
- Correction source: `9e8474c8c1bbf8b28d82aba51e4f212497863539`. The subsequent evidence commit contains documentation/JUnit only; use the current PR head for review.
- Review input: `pr124-review-29e90c3.md` and unchanged `pr124-review-checks/test_pr124_review.py` supplied outside the repository. Reviewer test SHA256: `961f8260eb65bd7fc6b46312fa91a491a2ac66fd0006d0755e5b50c97c25fb00`.
- Date: 2 October 2026, Asia/Bangkok. Status: all four reproduced findings corrected and tested; independent re-review pending.

## Corrections and regression evidence

1. **Admin discovers the final shipment.** `GET /admin/orders?status=...` identifies the Order and `GET /admin/orders/{id}` now returns `shipments:[{id,leg,status,courier_id}]` for its persisted legs. Admin selects TO_BUYER/TO_SELLER and uses the existing `POST /admin/shipments/{shipment_id}/assign-courier`. It exposes no destination, tracking, object key or proof. The legacy Order assignment alias still means TO_CENTER and remains locked after inbound delivery. Two regressions discard Inspector IDs and discover/assign through Admin reads only; non-Admin detail remains forbidden. Return transit retains the existing RESULT_NOTIFIED Order status.
2. **A failing early candidate cannot monopolize later scans.** Each paid lifecycle category continues after its last visited Order, wraps once at the end, and visits no candidate twice within the same traversal. Scan/batch ceilings remain unchanged. Applying scans append their cursor/counters to the existing immutable FulfillmentCommand journal under `SYSTEM:lifecycle-cursor`, action `LIFECYCLE_SCAN`, resource `LIFECYCLE_JOB` (1 receipt, 2 no-ship, 3 return, 4 overdue). These are completed traversal commands, separate from ORDER commands/history/settlements; they do not claim a failed Order succeeded. A per-job PostgreSQL advisory transaction lock serializes cursor writers across processes; busy competitors skip that job. Per-Order SKIP LOCKED, rollback, business keys and financial transactions remain intact. Dry-run reads progress without writing or allocating IDs; scoped return retry does not change the queue cursor. Regressions prove broken-first/healthy-second with batch=1/max=1, bounded wrap/retry after Storage repair, competing cursor ownership, and four fresh CLI processes making progress despite repeated failure. No migration or competing escrow ledger was added.
3. **Malformed Unicode returns 422.** A RequestValidationError handler retains `detail` entries with `loc/msg/type`, omits untrusted raw `input` and `ctx`, and replaces unsafe characters in locations/messages before UTF-8 serialization. Existing Finish schema rejection remains enforced. Nine HTTP regressions cover high surrogate, low surrogate and NUL in reason/carrier/tracking_number, require 422 and compare all affected business/audit facts before/after. Another exercises a surrogate in an unknown field name. Valid Thai/emoji carrier, tracking and report reason are accepted and persisted unchanged.
4. **Admin reflects committed refunds.** Admin list performs one bounded REFUND-settlement read for its page; detail reads that Order's settlement. Both delegate to the same payment projection as customer reads: committed REFUND means REFUNDED; RELEASE stays PAID. The existing paid_at-based helper call remains compatible. Three regressions cover physical return refund, Admin dispute refund and Buyer RELEASE, comparing Admin list/detail with Buyer and preserving the original paid_at, Payment row and Receipt response.

Regression source: [test_pr124_regressions_postgres.py](../../../backend/tests/test_pr124_regressions_postgres.py).

## Executed verification

New owned PostgreSQL **18.6** cluster, **127.0.0.1:55484**, Python **3.13.5**, Windows. Fresh empty FINISH/INSPECT/reviewer databases; an owned Order test database reset only by its guarded localhost fixture. Private proof objects are synthetic temporary files. `DATABASE_URL=sqlite://` prevented `.env` selecting a real database, except the explicit read-only RLS check against the owned migrated localhost database. `PUBLIC_CERTIFICATE_BASE_URL=https://cert.example.test` is a synthetic HTTPS origin. The cluster was stopped after verification. No central Supabase/shared Storage or scheduler was touched.

Commands below run from `backend` with the corresponding separate localhost test URL. Reviewer tests instead run from repository root with PYTHONPATH pointing to backend.

| Check | Command | Final result | Evidence |
|---|---|---|---|
| Reviewer file, unchanged | `backend/.venv/Scripts/python.exe -m pytest <supplied-pr124-review-checks>/test_pr124_review.py -q --tb=short` | 4 passed | [JUnit](B-review-external-tests.xml) |
| New regressions | `.venv/Scripts/python.exe -m pytest tests/test_pr124_regressions_postgres.py -q --tb=short` | 19 passed | [JUnit](B-review-regression-tests.xml) |
| Existing FINISH HTTP/transactions/CLI | `.venv/Scripts/python.exe -m pytest tests/test_finish_flow_postgres.py -q --tb=short` | 45 passed | [JUnit](B-review-finish-tests.xml) |
| Existing INSPECT/CERT HTTP | `.venv/Scripts/python.exe -m pytest tests/test_inspection_flow_postgres.py -q --tb=short` | 46 passed | [JUnit](B-review-inspection-tests.xml) |
| Order/foundation/unpaid worker | `.venv/Scripts/python.exe -m pytest tests/test_orders_postgres.py tests/test_finish_foundation_postgres.py tests/test_unpaid_expiry_postgres.py -q -x --tb=short` | 77 passed | [JUnit](B-review-order-worker-tests.xml) |
| Local PostgreSQL RLS | `.venv/Scripts/python.exe -m pytest tests/test_database_security.py -q --tb=short` | 1 passed | [JUnit](B-review-database-security-tests.xml) |
| Default backend, specialized URL variables unset | `.venv/Scripts/python.exe -m pytest -q --tb=short` | 626 passed / 263 skipped | [JUnit](B-review-default-tests.xml) |

Total actual PostgreSQL checks: **192 passed**. Default skipped cases are not passes: they include specialized PostgreSQL cases and the RLS case subsequently verified separately. Compared with the earlier 627/243 default report, the 19 new PostgreSQL regressions are skipped without their URL and RLS is now skipped because default DATABASE_URL is explicitly SQLite. Existing test assertions were not removed or weakened. Existing Starlette/httpx and anyio deprecations remain; the default suite also reports its existing synthetic JWT key warning.

`alembic heads` remains the single `a02f20261002`; changed Python files compile; `git diff --check` passes. Migration predecessor rehearsals and mobile checks were not rerun for these backend corrections; their earlier results remain historical, not new acceptance evidence.

Initial runs caught setup/compatibility issues: the return test used a nonexistent RETURNING_TO_SELLER enum (corrected to the specified RESULT_NOTIFIED); removing the legacy payment helper broke an existing assertion (restored as a shared-projector wrapper); and an expanded Order run inherited a non-HTTPS certificate origin from `.env` (rerun with the explicit synthetic HTTPS origin). No assertion was relaxed to bypass these failures.

Machine results: [B-review-fixes-verification.json](B-review-fixes-verification.json). API/handoff/runbook and Task03–05 reports include correction addenda. This is source-level review readiness: A review, Android/shared Storage/Auth/QR, runtime scheduler activation, legacy audited return-snapshot repair and final release acceptance remain pending.
