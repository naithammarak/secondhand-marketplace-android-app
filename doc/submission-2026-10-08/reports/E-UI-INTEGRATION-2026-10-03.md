# E — composed UI1/UI2 Lead verification

**Decision: CONDITIONAL_PASS_COMPOSED_LOCAL_CODE_API.** UI1/PR131 and UI2/PR132 are composed with production API binding and integration fixes. Independent review and runtime/device/release gates remain open. This Lead session implemented the fixes, so this is not independent approval.

## Source

- Backend PR130: `0ffff2de66d321ab37a0a725d4427716cbfecba3`; migration `r01e20261002` after `c08f20261002`.
- UI1 PR131: `6c37ec3c7ff41a01f6cdd67a9bf4616b50b258fd`.
- UI2 PR132: `691a69da262bdbac37f0469bed6f666e88f9f82f`.
- Merge: `96130c46d0870d5693fde9d9a075c2148932e42f`; verified code commit: `7233f1e79764b3855480ff126d6462ae83d9fcc8`.
- Branch: `codex/e-ui-integration-2026-10-03`; checkout `/home/tmk/project/market-place-mobile-app/worktrees/e-ui-integration`.
- All three inputs are ancestors. No backend/schema/dependency/lockfile edits; original dirty checkout and live servers preserved. Team worktrees' uncommitted tsconfig changes were not copied.

## Integration fixes and review findings

1. UI1 deliberately shipped an unbound FulfillmentPort. Added one production adapter over UI2's existing client, mounted below AuthProvider. Buyer receipt/report, Seller return and frozen-address commands now use the actual shared client. Authorization is read per call, keys/errors propagate, and no second HTTP client exists.
2. Journey data could render the prior account/order during the render before its clearing effect. Tagged results by scope, hid mismatched scope immediately and invalidated pending reads on cleanup. Deferred-response regressions cover account switch and order navigation.
3. Corrected API mapping `can_report_not_received` to the actual `can_report_missing`; legacy alias parsing remains.
4. Registered UI2's legacy Admin route without making external Courier a new-role requirement.
5. Prepared explicit preview APK output, correct 2NDHAND launcher brand and camera/gallery copy covering product, inspection and identity flows. No signing/environment secret included.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Logic | 347 passed / 0 failed | [log](e-ui-smoke/mobile-test-output.txt) |
| Components | 34 suites / 261 passed | [log](e-ui-smoke/component-test-output.txt) |
| Final binding/account regression after last code cleanup | 14 passed | [log](e-ui-smoke/binding-regression-output.txt) |
| Typecheck | PASS | [log](e-ui-smoke/typecheck-output.txt) |
| Changed-file ESLint | PASS, no warnings | [log](e-ui-smoke/changed-files-lint-output.txt) |
| Combined customer API journeys | 7/7 PASS | [output](e-ui-smoke/combined-api-output.txt), [harness](e-ui-smoke/combined-api-smoke.mjs) |
| Combined staff/Admin API journeys | 7/7 PASS | [output](e-ui-smoke/combined-staff-output.txt), [harness](e-ui-smoke/combined-staff-api-smoke.mjs) |
| Android production-router Hermes export | PASS, one bundled entry | [evidence](e-ui-smoke/android-bundle-evidence.json), [output](e-ui-smoke/android-export-output.txt) |

API tests used this combined checkout, ordinary persisted business journeys, the production adapter and owning-role projections. Only roles and category/brand setup used SQL. No terminal outcomes were seeded. Tested normal sale (1200 → 60 commission / 1140 Seller), positive rejection (1350 charged → 1200 refunded / retained 100+50 after actual return), negative-result full 1350 refund, pre-event non-receipt report, Admin exclusive full REFUND or RELEASE, actual Admin return exception and public revoked certificate privacy.

The first combined harness attempt failed because it expected raw mutation bodies while UI2 returns `{result,replayed}`. Corrected only the harness's two assertions; the production command consumers refetch persisted state. Both final outputs pass. Existing component suites emit baseline React act warnings; they do not replace device checks.

## Boundaries / next steps

Local PostgreSQL migration reached one head `r01e20261002`. Test authentication was synthetic; product/identity Storage was a local stub and inspection files were local/private. No shared migration, worker activation, real OAuth/private Supabase Storage, public HTTPS phone QR or APK installation was performed. New live timeout/AUTO/pending-retry demonstrations remain unexecuted; existing accepted backend evidence and UI fixtures are not those runtime demonstrations.

See [E integration state](../coordination/E-INTEGRATION-STATE.json), [runtime report](10-ENV-01.md) and [APK preparation](12-APK-01.md). Remaining sequence: independent candidate review → authorized runtime target → standalone APK → actual Android QA → final presentation/handover.
