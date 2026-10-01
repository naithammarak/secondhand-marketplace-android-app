# Task delivery report

- Task ID / owner: 03 / FINISH-02 + COURIER-02 / package B, backend.
- Status: **BLOCKED** for final delivery integration; independent contracts/fixtures/tests prepared and verified.
- Repo / branch: `naithammarak/SA-Project` / `feat/package-b-delivery-settlement`.
- Upstream SHA: inspected preparatory parent `d98d4a0b4b5d0cbfdce842ac886ed0ffc0409b05`; accepted A release/task02 SHAs not supplied.
- Delivered SHA: preparatory code `7918fc26a40df7eb316850482309600d9051d325`; complete source inventory below. This is not an implemented task03 release.
- Migration predecessor/head: existing `714f11c84d53`; no B migration.
- Date / timezone: 2 October 2026 / Asia/Bangkok.

## What changed and why

Read the packet/work-package README, DOC-01, release gates, QA matrix, task03
prompt, FINISH-spec and FINISH-02/03/04 handoffs, and actual Order/Courier/proof/
inspection/payment code. Task02 API mapping and accepted model report are absent.
No applicable root/backend AGENTS file was found. Preserve current mobile work.

Prepared `backend/app/schemas/finish.py` for strict fulfillment and selected-proof
payloads, `backend/app/services/finish_policy.py` for server-derived leg/return
reason and deadline/access rules, and `backend/app/services/finish_proofs.py`
for current Shipment/Courier binding plus actual decoded byte/type/size/hash
readability checks. These consume existing infrastructure; no alternate Shipment,
address provider, Storage bucket or ORM model was introduced. They are not wired
to current routes while the accepted schema is missing.

`backend/tests/finish_helpers.py` supplies deterministic private Storage faults;
`test_finish_contract.py`, `test_finish_proofs.py`, `test_finish_fixtures.py` and
`test_finish_clock_postgres.py` verify the independent contracts. Synthetic
downstream examples are `backend/test-data/finish-contract.v1.json`, explicitly
labeled contract-only. The [A/E/C handoff](B-CONTRACT-HANDOFF.md) lists concrete
current routes, proposed additions and the shared return-refund interface.

## Verification performed

Commands run from `backend`; exact nonsecret environment setup is in the
[runbook](B-VERIFICATION-RUNBOOK.md).

| Check / exact command | Environment / DB isolation | Result / count | Evidence path |
|---|---|---|---|
| `.venv/Scripts/python.exe -m pytest tests/test_finish_contract.py tests/test_finish_proofs.py tests/test_finish_fixtures.py tests/test_finish_clock_postgres.py -q --tb=short --junitxml=../doc/submission-2026-10-08/reports/B-contract-tests.xml` | Independent contract/real decoded bytes; one actual PostgreSQL blocked-row deadline test, private local cluster55482 | 132 passed; includes all result/decision combinations and proof faults | [B-contract-tests.xml](B-contract-tests.xml) |
| `.venv/Scripts/python.exe -m pytest tests/test_inspection_flow_postgres.py -q --tb=short` | Empty local `package_b_inspect_test`, real migrations/API, private pytest directory | 40 existing upstream tests passed; 2 dependency warnings | [verification record](B-verification.json) |
| `.venv/Scripts/python.exe -m alembic heads` | Static graph; synthetic local DB variable set | One existing head `714f11c84d53` | [verification record](B-verification.json) |
| `git diff --check`; Python compileall on the four new modules | Local code checks | PASS | [verification record](B-verification.json) |

These are preparatory policy tests and existing inbound Courier regressions.
Actual final delivery, frozen destination enforcement, final-leg races, delivery
replay, durable return/refund-failure recovery, Android and shared Storage are
**NOT RUN**. No shared database or Storage objects were changed.

## Contract and safety checks

- Actual route reconciliation: retain `/courier/shipments`, `/courier/shipments/{id}/proofs`, `/courier/shipments/{id}/confirm-delivery`, `/admin/shipments/{id}/assign-courier`, `/shipment-delivery-proofs/{id}` and canonical `POST /inspections/{id}/receive`. They currently support inbound TO_CENTER only. No duplicate router/center-receipt mutation added.
- Final direction contract: positive CONFIRM→TO_BUYER; positive REJECT/negative-without-decision→TO_SELLER. Positive missing decision and fabricated negative decisions reject in prepared policy.
- Selected-proof checks: 1/3 real JPEG/PNG images pass; 0/4/duplicate/foreign-Courier/foreign-Shipment/missing/oversized/mismatched-hash/type/unreadable objects reject. Deterministic recovery succeeds only once the object becomes readable again. No delivery state is fabricated by the adapter.
- Prepared proof access matrix: owning Buyer including Seller-as-Buyer sees relevant legs; owning Seller only inbound/return; assigned active Courier/Inspector only their work; Admin only authorized audited case; unrelated/anonymous/inactive denied. Actual all-leg HTTP redaction/access integration remains pending.
- Buyer deadline derives solely from persisted TO_BUYER confirmation+72h. Acceptance of inspection alone grants no physical-receipt actions.
- Return interface: durable delivery/history/replay transaction first, then shared REFUND in another session/transaction; final worker retry must preserve the delivery on failure. No independent refund implementation exists here.
- No model/migration change, private configuration disclosure, shared data reset, mobile edit or real transfer.

## Remaining work / exact blocker

A has not supplied an accepted release SHA/task02 commit and the required
`reports/API-MAPPING.md`. Actual code lacks immutable Seller return snapshot,
final Order/Escrow states, destination/selected-proof binding and required replay/
history/settlement records. Return implementation cannot safely derive a frozen
Seller destination on this checkout. A's required model list is in the handoff;
do not add a parallel migration head or invent/backfill addresses.

After accepted upstream arrives, integrate final fulfillment/assigned Courier
extensions and seller ship deadline guard, then run all mandatory task03 tests
with real PostgreSQL transactions and deterministic Storage. Durable delivery
followed by refund failure must be tested against task04's actual service.

## Handoff

- A: integrate against the supplied release/task02 and maintain one schema chain.
- E: concrete routes/request types/action flags and synthetic views in [B-CONTRACT-HANDOFF](B-CONTRACT-HANDOFF.md); additions are not yet live APIs.
- C/task08: fixture COMPLETED/RELEASED is not review eligibility evidence; await implemented task04 state and accepted SHA.
- Tasks04/05: prepared `SettlementService.settle` transaction protocol in `finish_interfaces.py`; no implementation or false success stub.
- No recipient handles or session channel were supplied. The repository handoff is available; direct delivery is not claimed.
- Candidate merge/retest required after A upstream; Android/shared Storage/runtime acceptance remains pending with E/F/tasks10–12.
