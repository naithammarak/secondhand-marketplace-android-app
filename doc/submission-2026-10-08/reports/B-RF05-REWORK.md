# B-RF05 unpaid fairness correction

Scope: fix the independent review finding on B PR124 head `c87a502c259fff7ad97ad5f11fe90d69fe4f96b5`, in a separate branch/stacked PR. Independent re-review is pending. Accepted A/C/D records and teammate B history remain unchanged.

## Change

The five-job runner now supplies unpaid expiry with the existing serialized durable scan journal. Paid categories keep their stable job IDs1–4; unpaid uses positive ID5. Its saved traversal position contains both the timezone-aware `expires_at` and Order ID, preserving deadline-first ordering and same-deadline tie breaking. Failed/skipped visits advance the traversal, one bounded wrap returns to earlier candidates, and one traversal does not visit a candidate twice.

The journal/advisory transaction owns only progress; each business Order still locks and commits/rolls back independently through the existing expiry/payment/product guards. Dry-run reads the cursor without acquiring a write owner, allocating sequence IDs or changing data. A busy applying owner makes competitors skip this category. Scoped return retry does not touch unpaid progress. Existing standalone unpaid calls retain their original in-memory behavior when no lifecycle cursor is supplied. There is no migration, additional financial ledger or dependency change.

## Meaningful verification

An owned PostgreSQL16 container `b-unpaid-fix-pg-20261002`, loopback55453, provided separate empty local test databases. All processes selected explicit synthetic app DB/public origin before imports; private fixtures and fault triggers exist only in these databases. No shared DB, scheduled job, original checkout or A demonstration service was changed.

| Check | Result |
|---|---|
| Same two poison-row/deadline-order regressions on a separate clean c87 baseline checkout | 2 failed as expected: second bounded scan applied0 instead of1 |
| New unpaid progress suite at correction source | 5 passed: normal/reversed deadline order, repaired wrap, equal-deadline one traversal, cursor competitor + dry-run data/sequence purity, independent fresh CLI processes |
| Existing unpaid worker suite | 9 passed |
| Existing four-fix B regression suite, including paid cursor concurrency/recovery | 19 passed |
| Changed Python compilation and patch whitespace | PASS |

Commands from backend with the appropriate separate guarded URL:

```text
python -m pytest tests/test_unpaid_lifecycle_progress_postgres.py -q --tb=short
python -m pytest tests/test_unpaid_expiry_postgres.py -q --tb=short
python -m pytest tests/test_pr124_regressions_postgres.py -q --tb=short
```

Actual runtime: the existing primary `backend/.venv/bin/python`. New/regression suites use FINISH_TEST_DATABASE_URL; legacy unpaid uses ORDER_TEST_DATABASE_URL. DATABASE_URL is explicitly sqlite:///:memory:, except the test CLI's explicit owned local URL. All 33 focused checks passed without specialized skips. This does not claim a fresh complete B/Android/Storage/OAuth/QR run. Existing two dependency deprecation warnings remain.

Machine evidence: [B-RF05-evidence.json](B-RF05-evidence.json). Local full log/XML files are under this branch's `review-evidence/`; hashes in the machine record bind those artifacts to the observed results.

## Reproduction clarification

The original reviewer CLI reproduction intentionally asserted the old bug's observations: every fresh scan failed, and both Orders remained for repair. A successful fairness fix changes those intermediate observations. The new regression keeps the actual requirement and fault: scan1 fails on the poisoned row, scan2 cancels the healthy row while the poison persists, scan3 retries the poison; after repair only the remaining row is cancelled. It also checks a failure advances the journal and a later wrap recovers it. This report does not claim the original bug-observation assertions passed unchanged.

An initial baseline invocation pointed pytest at the correction test's external file and picked up that file's correction conftest/source path. Its green result was discarded as invalid baseline evidence and retained as `invalid-baseline-import-path.log/xml`. The confirmed baseline ran a byte-identical regression copy within a separate c87 worktree; both requirements failed. No test assertion was loosened to hide a source defect.

## Next gates

Re-review this exact published correction and B parent together. B remains REQUEST_CHANGES until the reviewer closes B-RF05. Then combine B/C/D/current E in a separate candidate, resolve main/router/cache/navigation composition and exercise normal API completed sale/RELEASE/review plus refund rejection. Native/shared/runtime activation and final submission remain separate gates. Do not merge or alter the shared database from this correction's focused results alone.
