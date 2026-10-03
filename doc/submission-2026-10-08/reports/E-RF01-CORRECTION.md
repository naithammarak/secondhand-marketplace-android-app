# PR133 E-RF01 correction — current account/Order owns asynchronous UI state

Status: **IMPLEMENTED_AND_TESTED; independent E re-review pending**. PR133 remains Draft/Open; no GitHub approval, merge, rollout or full-release acceptance is claimed.

- PR: https://github.com/naithammarak/secondhand-marketplace-android-app/pull/133
- Branch/worktree: `codex/e-ui-integration-2026-10-03`, `/home/tmk/project/market-place-mobile-app/worktrees/e-ui-integration`.
- Reviewed starting head: `49abbbd046f99ceb4b273c2186a49d8e7deed83f`, REQUEST_CHANGES E-RF01.
- Tested correction code: `626711acbc8f1276db1864cbc091c152230f1f85`. Final report/manifest is a documentation-only descendant; exact remote final head is delivered separately to planner and primary E-IMPLEMENT-STATE.json.
- Base/backend: accepted local AB PR130 `0ffff2de66d321ab37a0a725d4427716cbfecba3`. Migration `r01e20261002` unchanged; no backend/schema/dependency/lockfile changes.
- Date: 3 October 2026, Asia/Bangkok.

## Before and after

After Order7 receipt completion, an old reload could increment shared read generation and replace/hide freshly loaded Order8, or surface the old account's401/old Order409 on current controls. The original four reviewer tests were copied byte-for-byte as permanent regressions and reproduced4fail/0pass at the starting source. Their reviewer source was not modified.

`useOrderJourney` now validates the committed account/Order visit before a captured reload can start, increment generation, set loading or issue reads. Its result/error also validates that visit plus request generation. Layout cleanup invalidates callbacks at scope transition/unmount; a fresh visit token prevents A→B→A from reactivating older callbacks. Existing immediate scope hiding remains.

`useJourneyCommand` uses the same semantic account/Order visit, with a visit-owned ref holding lock and key map. New scopes immediately hide prior busy/failure and can start independently. Old completion touches only its own lock/key and cannot publish current errors or invoke obsolete refetch. It returns truthful successful server commitment even after navigation; it does not cancel or undo a transaction already sent.

The currently committed composed refresh is read through a ref. Ordinary callback identity churn therefore preserves busy/key and uses the current refresh after a current attempt. Ambiguous network/5xx failures retain the same canonical command key; definitive responses clear only their own key. Captured stale run/clear callbacks no-op after scope cleanup. Existing per-call current-token guard remains unchanged.

Both production callers were inspected and updated: OrderDetailScreen passes its route Order ID for `refreshAll`; Seller Ship passes its route ID for return-address commands. This keeps semantic ownership stable across data/status loading and routine rerenders rather than treating callback identity as a new scope. Direct journey.reload carries its scope for composed hook callers and existing regressions. No keyed-screen-only workaround was used.

## Verification

Exact commands, counts, test names/source hashes and local log hashes are in [verification JSON](E-RF01-VERIFICATION.json). Commands run from mobile with existing installed dependencies; no private env read/copied or server replaced.

| Check | Result |
|---|---|
| Unmodified reviewer reproduction on starting head |4 fail/0pass as expected|
| Final full component suite |36 suites,273pass/0fail/0skip|
| Focused cases within full suite |26pass: original4 + additional8 + existing binding/detail14; not double-counted|
| Final logic/service/store suite |347pass/0fail/0skip|
| TypeScript |PASS `npm run typecheck`|
| Changed-file ESLint |PASS,0errors/0warnings|
| Correction-only whitespace |PASS; inherited combined-PR historical smoke-log whitespace remains and is qualified separately|

Additional cases cover captured run denial, new-scope command availability while an old request is pending, late old completion not unlocking or erasing a newer key, uncertain same-key retry, callback churn/current refresh, immediate account-scope clearing, unmount/no obsolete HTTP/refetch, A→B→A visit invalidation, pending new-read generation and production-style explicit route/composed refresh.

These are real React hooks/root-bound provider/adapter with synthetic deferred service/auth responses. They prove UI callback composition and existing token-guard preservation; they do not prove deployed backend, Google, Storage, Android or a financial rollback. Existing broader components emit baseline React act warnings in Wondee motion tests; no failing tests or new dependency was introduced.

## Candidate authority and history

[Current release manifest](release-manifest.json) identifies PR133 correction source/base/r01 and independent E review pending. Its previous PR124/9e8474c8/a02 manifest is preserved byte-for-byte at [historical manifest](history/release-manifest-pr124-9e8474c8.json); existing provenance entries remain. FINISH-00 now distinguishes locally accepted AB PR130 from pending corrected E/native/shared release. No deployment or migration should use that old manifest as current authority.

Historical E Lead report/previous source remains [a supporting prior snapshot](E-UI-INTEGRATION-2026-10-03.md), not acceptance of this correction. Historical AB/CD/UI1/UI2 records/branches and live original checkout are preserved.

## Handoff and remaining gates

Planner receives exact final remote head/base, this report and verification, then dispatches independent re-review; implementation does not mark E accepted or duplicate reviewer dispatch. All4 E-RF01 failures are corrected locally. No known failing correction test remains.

Independent current-head normal API coverage, shared HTTPS/OAuth/private Storage/QR/worker rollout, native APK/device and full QA/teacher/presentation remain pending. No backend exhaustive rerun or Android export/install was performed for this state-hook-only correction. No shared DB migration/job, GitHub merge/force-push or live server change occurred.
