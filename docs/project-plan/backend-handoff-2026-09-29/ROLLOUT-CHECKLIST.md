# L3 — pre-FINISH rollout and test runbook

Prepared 2026-09-29 15:30 ICT; updated with F3 QA on final PR #115 head. **Current gate: READY FOR DEVICE QA on exact head `f72a0e5`; final acceptance remains open.** Android/OAuth, private Storage, unauthenticated phone QR, shared DB migration and worker runtime are **NOT RUN**. No shared database or Storage inspection, migration, staff role change, deploy, worker start or merge was performed by L3. Execute write steps only after the owner selects an approved demo target and the named operator accepts the checklist. Read [LEAD-ACCEPTANCE.md](LEAD-ACCEPTANCE.md) for scenario IDs and expected state.

## 1. Capture one immutable test manifest

Fill before the first test mutation; repeat this section for every rebuild/redeploy.

| Field | Value / evidence |
|---|---|
| Test run ID and date/time zone | `________` |
| Scope and explicit exclusions | Product, Order, INSPECT, CERT, unpaid expiry worker; **FINISH settlement/receipt confirmation/refund/outbound/return and its 72h timer excluded** |
| API repository branch + full commit SHA | PR #115 `f72a0e51debc32c59d6086f231a0f5fdddbad3a2`, child of `442c4b84974e763d2efac31bd5920a8f23b54108`, backend ancestor L1 `370831bd08073dcfa5b51d5a3c6064bbb817bbdd`; deployed SHA `________` |
| Mobile branch + full commit SHA; Android build ID/version/signature | PR #115 `f72a0e51debc32c59d6086f231a0f5fdddbad3a2`; Android build ID/version/signature `________` |
| L1 integration report and contract; F1/F2/F3 revision/report | `7c5f/doc/handoff/L1-integration-report.md`, `L1-frontend-contract.md`; F1 `ac597b9cc974cf2bce6161d392a4c59c9e9da244`; F2 `2febd19a6a9ff8dad59ac85079dd6e162ef598db`; F3 report commit `b9b7d23989bb78bc9187f7f9453ba6b6a244cb67` in `7183/doc/handoff/F3-qa-report.md`, verdict **READY FOR DEVICE QA**, saved-decision P2 cleared in components |
| Environment label/API origin/public certificate origin | `________` (origins only; no credentials) |
| DB target identifier/current Alembic revision/target revision | Target current `________`; L1 candidate has single head `714f11c84d53` on isolated PostgreSQL only |
| Storage project and **private** bucket names; access policy check | `________` |
| Worker artifact SHA, mode, schedule, operator, logs/health location | F2 included in L1 `370831bd`; target mode/schedule/operator/logs/health `________` |
| Android device/OS/network and second no-login QR phone/browser | `________` |
| Synthetic IDs: B1, B2, S1, S2, A1, I1, C1; test products | `________` (IDs only) |
| Owner, QA, DB migrator, Storage/staff operator, worker operator | `________` |

F3's exact-head `f72a0e5` run passed **15 focused components (included in 180 full components)** and typecheck, with 0 failures/skips. **307 backend and 305 mobile logic** passed on direct parent `442c4b8`; that evidence carries forward because `f72a0e5` changes only four mobile view/test files, with no backend or logic changes. One Alembic head is `714f11c84d53`. The four earlier consumer defects and saved-decision feedback P2 are cleared in automated checks. Current PR heads checked for this update: #108 `894ce7228f82c58e9f2751f0b2be7fcae19eafa5`, #109 `f532164f97d37251233ff668cae2843f74b44913`, #110 `a9ecb11c7dd1c6b9623a937b7c50d183a74be740`, #111 `2c59505add94973737f922f12de16cf04b38a665`, #112 `1493a43b29458459976dd0d5bde5c88fe6847411`, #113 `9a3313757675848fe542085e3173fd5ea34fd445`, #114 `b6667c2cc4c8beabd2de11ffb0c11206e2b444ad`, #115 `f72a0e51debc32c59d6086f231a0f5fdddbad3a2` (OPEN/Draft). Recheck before action; Draft/CLEAN is not merge approval.

## 2. Read-only preflight now or on test day

Run from a local clone; these commands inspect GitHub/local metadata and do not connect to the app database. Do not run tests, install packages, switch branches, or write in a234.

```sh
git -C /home/tmk/.codex/worktrees/a234/secondhand-marketplace-android-app status --short --branch
git -C /home/tmk/.codex/worktrees/a234/secondhand-marketplace-android-app rev-parse HEAD
gh pr list --state open --limit 30 --json number,headRefOid,baseRefName,isDraft,mergeStateStatus,reviewDecision,url
gh pr view 108 --json headRefOid,baseRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup
gh pr view 112 --json headRefOid,baseRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup
gh pr view 113 --json headRefOid,baseRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup
gh pr view 114 --json headRefOid,baseRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup
gh pr view 115 --json headRefOid,baseRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup
```

For #109–#111, also capture `gh pr view N` with the same fields. At this update #108 remained open with `REVIEW_REQUIRED/BLOCKED`; #111–#115 were Draft. Requery before any merge decision; `CLEAN` or an empty checks list is not approval. L1's report in `/home/tmk/.codex/worktrees/7c5f/secondhand-marketplace-android-app/doc/handoff/L1-integration-report.md` records included PR/F1/F2 SHAs and local results. F3's final report in `/home/tmk/.codex/worktrees/7183/secondhand-marketplace-android-app/doc/handoff/F3-qa-report.md` records exact PR #115 revision, separate disposable PostgreSQL evidence, full components and focused saved-decision tests. The four prior mobile consumer defects and saved-decision feedback P2 are cleared in automated checks. Device/live gates remain open; SELLER buyer history still needs device verification.

## 3. Migration and infrastructure gate — DB owner

1. Record the **actual** `alembic_version` row(s) from the selected target using a DB owner approved read-only connection. Record a tested backup artifact reference and a restore rehearsal, including owner/time and how secrets are held. Never paste a connection string or backup URL here.
2. L1 reports one canonical head `714f11c84d53`, a no-op merge of existing Wondee/INSPECT and CERT branches, and disposable PostgreSQL adoption/data-preservation tests from each applied history. DB owner compares its predecessor map with actual target history. If the target history differs, stop and request a supported additive path; no `stamp`, reset, downgrade over live data, or guess based on the filename. Downgrading only this merge would restore two heads, not a complete single-branch rollback.
3. One nominated migrator schedules a maintenance window, records before/after revisions and a rollback decision point, then applies the approved migration exactly once. This packet does **not** authorize applying it. Restore may be required if migration/data changes cannot be reversed safely by code rollback.
4. Check that private `inspection-evidence` and `shipment-delivery-proofs` storage are available, policies deny public object reads, and backend service access works. Keep Storage provisioning and staff role changes with their authorized owners.
5. Stage matching backend SHA and frontend build. Confirm `PUBLIC_CERTIFICATE_BASE_URL` is the final external HTTPS origin and public route yields HTML; confirm the Android consumer's route/media contract. Enable simulated payment only in the approved nonproduction environment. Capture deployment identifiers and a simple read-only health response before test writes.

**Read-only DB query examples for the authorized operator** (bind IDs in that operator's client; the queries are templates and were not executed here):

```sql
SELECT version_num FROM alembic_version;
SELECT id, buyer_id, seller_id, product_id, status, expires_at,
       paid_at, cancelled_at, cancel_reason, total_amount
FROM orders WHERE id = :order_id;
SELECT id, status FROM products WHERE id = :product_id;
SELECT id, order_id, outcome FROM payment_attempts WHERE order_id = :order_id;
SELECT id, order_id, amount FROM payments WHERE order_id = :order_id;
SELECT id, order_id, amount, status FROM escrows WHERE order_id = :order_id;
SELECT id, order_id, receipt_no FROM receipts WHERE order_id = :order_id;
SELECT id, order_id, leg, status, courier_id, courier_delivered_at,
       received_at, received_by FROM shipments WHERE order_id = :order_id;
SELECT id, order_id, inspector_id, result, inspected_at
FROM inspections WHERE order_id = :order_id;
SELECT id, order_id, inspection_id, result, status FROM certificates WHERE order_id = :order_id;
SELECT id, order_id, inspection_id, buyer_id, decision, decided_at
FROM buyer_inspection_decisions WHERE order_id = :order_id;
```

Check candidate columns against L1's migration report before running these. For private photo checks, query metadata counts/relationships only; do not dump `object_key` or image bytes into logs. Capture row counts and redacted evidence linked to the scenario ID.

## 4. Device/demo run order

1. Use PR #115 head `f72a0e5` as the QA source, then provision synthetic accounts with the authorized operator and verify roles/status by a safe account read. Staff account creation or promotion is a separate authorized task. Create listed test products under S1 and S2 with public catalog images and separate product IDs for each outcome.
2. Build Android from the frozen PR #115 SHA (or a later revision with its own F3 check). Record signed build hash/ID and backend deployed SHA. On a real Android device, start logged out and execute G1–G4. Capture OAuth browser return and account default role without recording tokens or personal data. Run browser-only evidence separately.
3. Execute S1–S2 using a fresh S1 item for S2's purchase. Execute H1–H3 with A1/C1/I1, including H2b Courier pagination on an approved >100-job synthetic dataset. Keep the proof and evidence files synthetic. Verify private Storage reads as the assigned actor and denials as unrelated B2/anon.
4. Execute C1, then C2 on a separate phone/browser with no app/login and C2b in the native app. Execute C3 CONFIRM and REJECT on separate positive Orders, including same-request retry and conflicting request; after CONFIRM reload and record C3b saved-choice/next-step feedback. Execute C4 on separate negative Orders and C4b on the buyer Order list. Verify read-only DB state after every step, including no settlement or outbound/return Shipment.
5. Execute P1 after positive evidence exists. Clear/switch the app account, restart and expire a session. Record UI state and independent API responses. Do not treat a hidden button alone as permission proof.
6. Execute E1 on a separately approved disposable/dedicated demo target with a near-boundary synthetic Order. Use F2's documented CLI and explicit URL variable, target-name/environment guard, `--apply --confirm-target` and remote acknowledgement where required; first dry-run, then owner-approved apply in that target, with no HTTP traffic until after the worker has swept. Record before/at/after deadline, `scanned/eligible/cancelled/failed/skipped/batches/limit_reached`, restart/repeat, paid-order negative control and product release. The F2 version included in L1 does not run orphan repair. Do not use the old a234 script for this test.
7. F3 supplied local PostgreSQL race/rollback evidence and 305 mobile logic tests on parent `442c4b8`, then 180 component tests and typecheck on exact head `f72a0e5`. Attach its final report and both SHAs. Mobile checks still use mock auth/fetch/component rendering; Android taps cannot establish backend concurrency properties, and automated checks cannot establish real OAuth/Storage/QR behavior.

## 5. Worker operations after owner approval

F2's delivered runbook is `/home/tmk/.codex/worktrees/7c5f/secondhand-marketplace-android-app/doc/orders/unpaid-expiry-runbook.md`. It documents `python -m scripts.release_expired_orders --url-env ORDER_EXPIRY_DATABASE_URL --target <database_name> --environment <label>` as dry-run, with `--apply --confirm-target <database_name>` for writes, and `--allow-remote` for a remote target. `--repeat` scans immediately then every 300 seconds; a scheduler can instead invoke one approved single run every five minutes. The owner and worker operator must fill the runtime values before enabling either form:

| Control | Required value/evidence |
|---|---|
| Artifact and command, dry-run and explicit apply flags | L1 `370831bd`; F2 command above; selected runtime invocation `________` |
| Environment/DB target guard and credential owner | Dedicated URL variable, matching target/confirm name and environment; selected target/owner `________` |
| Immediate startup scan, interval (planned 5 minutes), batch limit (planned 100) | Delivered default: immediate, 300 seconds, 100 per batch and 10 batches per scan; runtime choice `________` |
| Scheduler owner, single/multi-instance policy, process ID/service unit | `________` |
| Health/last success time, scanned/eligible/cancelled/failed/skipped/batches/limit_reached counters, log location | CLI emits per-scan counts; runtime monitor/location `________` |
| Graceful stop, restart and retry/failure alert procedure | SIGTERM/SIGINT finish current Order; failed row rolls back for retry. Runtime alert/owner `________` |
| Stop criteria and rollback: disable schedule first; preserve paid Order/Receipt/Escrow history | `________` |

F2 covers **unpaid** expiry only. A working unpaid runner does not prove seller no-ship, return refund or 72-hour FINISH settlement timers.

## 6. Release decision and handoff

| Decision | Evidence threshold | Action |
|---|---|---|
| `BLOCKED` for final acceptance | No authorized environment/staff/Storage/runtime proof, mismatched deployed/build SHA, or required device evidence missing. | Do not infer live acceptance from local tests; assign named owner and collect missing evidence. |
| `REQUEST CHANGES` — historical L1-only | F3 tested `370831bd` and found four frontend path defects. | Superseded for device readiness by PR #115; do not carry this verdict onto a different SHA. |
| `READY FOR DEVICE QA` — **current** | PR #115 `f72a0e5`: 180 components/typecheck passed on exact head; 307 backend/305 logic passed on unchanged parent and carry forward; four prior defects and saved-decision P2 cleared in components. | Schedule Android, OAuth, Storage and runtime checks. PR #115 remains Draft; this is not final feature or merge approval. |
| `Saved-decision feedback` — cleared locally | Saved CONFIRM and REJECT choices and next steps pass 15 focused component tests on exact head. | Verify C3b on a physical Android device before final acceptance. |
| `CONDITIONAL DEMO` | Named rows passed, all missing rows visible, no private/financial invariant failure in shown path. | Show only passed scope, identify blocked flows and mark FINISH excluded. No Issue closure based solely on this. |
| `ACCEPT pre-FINISH` | All included scenario rows and layer evidence passed on matching deploy/build/DB revisions; reviewers and owner sign off. | Owner decides remote merge/deploy/Issue acceptance separately, after rechecking CI/reviews/branch protection. |

For an approved rollout, recheck each PR's exact head, review decision, CI and branch protection; merge in dependency order chosen by L1, never infer readiness from `MERGEABLE/CLEAN`. Record deploy SHA and `alembic_version` after migration. Monitor API errors, certificate page, private image denial, worker last success, and paid-order safety. If an issue occurs, stop the worker/deploy traffic per the operator plan, preserve evidence and decide code rollback versus data restore with DB owner; do not delete Payment/Receipt/Decision records to make a rollback look clean.

**Pending owner assignments:** Android/QR tester and approved demo environment for exact PR #115 `f72a0e5`; frontend/QA for saved-decision feedback, SELLER purchase-history and >100 Courier-job device observations; authorized staff/Storage operator; DB target history/backup/restore/migration operator; worker scheduler/alert operator; remote reviewer. Record each name, artifact and time in the manifest before claiming a pass.
