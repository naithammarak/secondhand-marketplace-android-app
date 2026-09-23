# INSPECT-01: contract comparison and rollout evidence

Prepared for [PR #93](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/93) and [issue #56](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/56), 2026-09-23. This is an evidence worksheet, **not DB1/DB2 or Lead sign-off**. Keep both remaining #56 criteria open and PR #93 in draft until the named reviewers record their answers.

## 1. INSPECT-00 comparison

Source checked: [issue #54](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/54), Lead v1, last updated **2026-09-23 14:49:49 UTC**. It is still marked as a draft awaiting FE/BE/DB/QA review; it has no acceptance comments or final Lead revision. Compare again against the **Lead-confirmed revision** before closing #56. If it changes, record the exact old/new rule and affected files here, update migration/models/tests and PR #93, and rerun PostgreSQL validation before seeking acceptance.

| #54 rule | PR #93 implementation/evidence | Assessment against draft v1 |
|---|---|---|
| Order has one product; keep two existing statuses and add `SHIPPING_TO_CENTER`, `RECEIVED_AT_CENTER`, `INSPECTING`, `RESULT_NOTIFIED` | `backend/migrations/versions/f3c1a09d8b56_inspect_01_storage.py` expands `ck_orders_status`; `backend/app/models/order.py` and `backend/app/schemas/order.py` accept all six; `backend/tests/test_orders_api.py` reads each new state through list/detail | Matches DB and Order-read scope; FE mobile decoder remains follow-up |
| One inbound `TO_CENTER` shipment per Order; carrier/tracking, delivery time and recipient | `backend/app/models/shipment.py` and migration: FK, unique `(order_id,leg)`, status/receipt/length CHECKs | Matches DB scope |
| One inspection per Order; nullable assignment until start; final result, summary and timestamp together | `backend/app/models/inspection.py` and migration: FK, unique `order_id` and `(id,order_id)`, assignment/final-result CHECKs; trigger freezes final fields | Matches DB scope |
| Evidence is private metadata tied to one inspection; selected result images cannot cross inspections or change after finalization | `inspection_evidence` and `inspection_result_evidence` have private object-key metadata, unique key and composite FK; triggers prevent late inserts, selected-image mutation and moves into finalized work | Matches DB scope; actual private storage and authorized image endpoint belong to BE |
| New public tables have RLS with no direct anon/authenticated access | Migration enables RLS on five tables; `backend/tests/test_inspection_postgres.py` checks direct access | Matches DB scope |
| Result submission selects 1–5 unique images from the same inspection and issues an eligible Certificate atomically | Composite FK and result-evidence association support this. Count, permissions, actual upload bytes, Certificate and atomic result endpoint are service/CERT work, not implemented in INSPECT-01 | Pending BE/CERT end-to-end evidence; do not claim full #54 behavior |

| Final `result` in #54 | DB value and fixture | Certificate / `next_action` required by #54 | Status |
|---|---|---|---|
| `PASS` | `PASS`; `result-pass` | Certificate; `WAIT_BUYER_DECISION` | DB stored/read in PostgreSQL seed test; CERT pending |
| `MINOR_ISSUE` | `MINOR_ISSUE`; `result-minor-issue` | Certificate; `WAIT_BUYER_DECISION` | DB stored/read in PostgreSQL seed test; CERT pending |
| `NOT_AS_DESCRIBED` | `NOT_AS_DESCRIBED`; `result-not-as-described` | No Certificate; `RETURN_TO_SELLER` | DB stored/read in PostgreSQL seed test; CERT pending |
| `FAKE` | `FAKE`; `result-fake` | No Certificate; `RETURN_TO_SELLER` | DB stored/read in PostgreSQL seed test; CERT pending |

No difference was found between **draft Lead v1** and the INSPECT-01 storage/result values reviewed here. This is not a statement that the draft is approved or that final-result HTTP reading is complete. The #54 distinction between `FAKE` and `NOT_AS_DESCRIBED`, and the no-fifth-result rule, are represented by the four-value DB CHECK; deciding ambiguous cases remains a service/workflow rule.

**Answers to collect before criterion 1:** Lead posts the final #54 revision and a decision on any changed rule; BE, DB1/DB2, FE1/FE2 and QA1/QA2 record acceptance or specific objections in #54. DB1 then records the final-revision comparison and links any corrective commit and retest in PR #93. As of this document, #54 has no such comments.

## 2. Rollout plan and evidence record

**Tested locally, not on staging:** branch commit `ab9e2f3` was tested on an isolated PostgreSQL 17.11 instance. Migration predecessor `9446ec1a2c5d` and target `f3c1a09d8b56`; all 11 INSPECT-01 PostgreSQL integration tests passed. The full backend suite passed 361 and skipped 31 unrelated tests. PostgreSQL tests cover an old Order through upgrade, empty-schema downgrade/upgrade, constraints, RLS, seed replay, final-evidence guards and concurrent writes. This does **not** establish the staging revision, restore readiness, or approval to migrate the central database.

| Required rollout evidence | Current answer | Evidence DB1/DB2 must attach |
|---|---|---|
| Staging environment, PostgreSQL version, source revision and target revision | **Unverified**; expected target `f3c1a09d8b56` | Timestamped `alembic current`/`heads` before and after, environment identifier and migration log, with secrets redacted |
| DB1 schema/data review | **No recorded sign-off** | Named reviewer, date, Order/Payment/Escrow/Receipt counts and sample preservation check, constraints/RLS/indexes, four-result readback |
| DB2 independent review | **No recorded sign-off** | Named reviewer, date, review of migration diff and staging verification, race/rollback observations |
| Backup and restore | **No staging/central drill recorded** | Backup artifact identifier, timestamp, retention location/owner, checksum, isolated restore log and checked row counts/revision |
| Central database migration operator | **Not named** | Real person's name/handle, role, change window, backup owner and recovery decision owner |

### Proposed staging sequence for DB1/DB2

1. Confirm Lead's final #54 revision, upstream ORDER-01 revision, app/FE status-reader compatibility, staging identity, maintenance window and named operator. Freeze Inspect writes during schema change. Do not point test commands or seed tooling at the shared database.
2. Record staging PostgreSQL version, `alembic current`, `alembic heads`, the `orders` status distribution and counts for Orders, Payments, Escrows and Receipts. The expected parent is `9446ec1a2c5d`; if actual head differs, stop and reconcile migrations before proceeding.
3. Take a consistent custom-format `pg_dump` backup of the target database using protected credentials; record artifact identifier, checksum and retention location. Restore it to a **separate empty database** with `pg_restore --no-owner --no-acl` and verify revision, row counts and sample Order/payment links. Record elapsed restore time and recovery owner. A backup file alone is insufficient evidence of restore readiness.
4. On staging, run `python -m alembic upgrade f3c1a09d8b56`. Record timestamp, command result and `alembic current`. Check five new tables, FK/UNIQUE/CHECK/indexes, RLS enabled and no anon/authenticated policy, old-data counts, six Order statuses and four result values using synthetic isolated fixture data. DB1 and DB2 review the results independently.
5. Keep write endpoints gated until compatible BE/FE and CERT atomic result handling are ready. Observe errors and migrations during the change window. Attach the logs and the named DB1/DB2 decisions to PR #93.

**Rollback decision:** On an empty Inspect schema with no new Order statuses, the migration's downgrade to `9446ec1a2c5d` is testable. Once any Inspect table has rows or an Order uses an Inspect status, downgrade intentionally **refuses** to run to protect data. Stop new writes, preserve the current database and logs, then have the named recovery owner choose a reviewed data-preserving forward fix or restore the verified pre-change backup under an agreed recovery window. Never force-drop the new tables or rewrite central data merely to make downgrade pass. Recheck application compatibility after either path.

**Answers to collect before criterion 2:** DB1 supplies staging revision/log and data checks; DB2 supplies independent sign-off and restore drill result; the team names the actual central database operator and recovery owner. Record names, dates and evidence links in PR #93. All fields above remain pending until those people respond.
