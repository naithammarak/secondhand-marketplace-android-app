> Historical contract snapshot copied 1 Oct 2026. Current scope/gates: ../DOC-01-scope.md and ../FINISH-00-release-gates.md. Old baseline coordinates and proposed decisions do not override the selected submission rules. External local links not supplied in this packet are labeled historical references.

# FINISH — AI implementation session handoff

Prepared: 26 September 2026. Contract: **FINISH v1** in [FINISH-spec.md](FINISH-spec.md).

This is a handoff for a future coding session. The planning session has not implemented backend/mobile behavior, run migrations, created GitHub issues, or accepted the feature.

## First session: dependency and contract check

Paste this prompt into the implementation session:

```text
You are the implementation developer for the marketplace FINISH feature.

Workspace root: /home/tmk/project/market-place-mobile-app
Git repository: /home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app
Primary contract: /home/tmk/project/market-place-mobile-app/docs/project-plan/FINISH-spec.md
Read the linked FULFILLMENT-00, CERT, INSPECT and existing Order contracts as needed.

First complete FINISH-00 gates G0/G1/G2: inspect applicable instructions, actual
branch/head, dirty files, migration graph and integrated Order/Shipment/Inspection/
Certificate/decision/private proof code. The planning snapshot b342523... had only
initial Order/payment support and pre-existing mobile edits. Do not assume that
snapshot is current, that historical PRs have merged, or that the base is ready.

Produce a concrete readiness table: dependency, observed file/commit, implemented
behavior, missing acceptance and responsible task. Map actual model/field names to
FINISH v1. Check the missing Seller return-address snapshot, Courier provisioning,
all three proof legs, final decision uniqueness and worker environment guard.

If the required upstream code is present and contracts agree, proceed with
FINISH-01 and its focused disposable PostgreSQL verification. Keep DB2 as primary
FINISH-01 owner and coordinate DB1's shared migrations. Do not rewrite applied
migrations or reset shared data. Preserve unrelated changes.

If an upstream dependency is absent, document the exact required work and the
affected gate. Continue independent planning/fixture preparation, but do not
create a parallel shipment/certificate system or silently expand into implementing
the entire missing upstream feature. Report the concrete blocker for Lead routing.

Only edit code for the assigned slice. Do not create remote issues, publish,
deploy, merge, or apply shared migrations as part of this local implementation.
Report changed behavior/files, test results, migration impact and remaining gates.
```

## Subsequent issue sessions

Use one issue per coding session/branch. Replace `<ISSUE_ID>` and `<BASE_SHA>` with the selected task and verified integrated commit; do not treat placeholders as approved values.

```text
Implement <ISSUE_ID> from FINISH v1 at:
/home/tmk/project/market-place-mobile-app/docs/project-plan/FINISH-spec.md

Use the repository at:
/home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app

Expected integrated base: <BASE_SHA>. Verify it and all dependency gates before
editing; preserve unrelated work. Read applicable AGENTS.md and existing patterns.
Limit implementation to the assigned issue and its explicitly documented shared
interface changes. Record any contract mismatch before changing both consumers.

Hard invariants: inspection CONFIRM is not receipt confirmation; private Courier
proof precedes delivery; no release before Buyer receipt or eligible 72-hour worker;
timely missing report holds money for audited Admin resolution; one RELEASE OR
REFUND per Order/Escrow; full original-total refund; original receipts persist;
returned products never relist automatically; DB/server owns time and amounts.

Reuse one settlement service and existing shipment/proof infrastructure. Test real
PostgreSQL constraints/races/rollback in an isolated database. Add focused tests
for consequential behavior, reuse upstream regressions, and state exactly what
device/Storage/runtime acceptance remains pending. Do not call mock proof live QA.

Deliver a reviewable local change with exact base/head, changed files, behavior,
API examples, pass/fail/skip counts, migration/rollback notes and pending evidence.
No remote publishing, deployment, shared migration, or unrelated UI redesign.
```

## Order to hand out work

| Session | Task | Start condition |
|---|---|---|
| 1 | FINISH-00 readiness → FINISH-01 constraints | Actual integrated upstream schema verified |
| 2 | FINISH-02 fulfillment/proof integration | FINISH-01 and COURIER-01/02 ready; Seller return destination exists |
| 3 | FINISH-03 shared settlement/Buyer receipt/report/Admin RELEASE | FINISH-02 + immutable CERT decision; define REFUND service interface for next session |
| 4 | FINISH-04 REFUND branches and Admin REFUND wiring | Shared service from FINISH-03; physical return and no-ship predicates verified |
| 5 | TIMER-01 integration and COURIER-03 UI, separately assigned | Settlement/proof APIs available; all selected FINISH retry candidates included |
| 6 | FINISH-05 final Order UI integration | Contract fixtures can start earlier; live checks require integrated APIs |
| 7 | FINISH-06 acceptance, then Lead review | Combined SHA with test API/DB/private Storage/Android/worker |

Because BE owns several sequential slices, use the completed integrated predecessor as each session's base. Do not independently implement competing settlement services in parallel. FE fixture work and QA case preparation can proceed while upstream coding runs.

## Required completion report from each session

1. Assigned issue, spec revision, actual base/head and files changed.
2. Implemented acceptance criteria, with API/schema changes and error examples.
3. Exact validation commands and pass/fail/skip results; identify PostgreSQL versus mocked evidence.
4. Migration graph and supported upgrade/rollback paths, or “no migration.”
5. Remaining dependency/environment/device evidence, owner and whether it blocks issue/feature completion.

Lead reviews the integrated result against FINISH-spec section 9. This handoff supplies a plan; it is not a claim of implementation or acceptance.
