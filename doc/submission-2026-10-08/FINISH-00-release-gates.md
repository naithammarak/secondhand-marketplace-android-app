# FINISH-00 — versioned backend candidate and release gates

**2 October 2026:** PR130 is the R1–R4 backend candidate, based on unchanged composed PR129 `b531bd1372c0d26b8492fa28ff29ab20a85d7578`. Migration head `r01e20261002` follows `c08f20261002`. Independent final acceptance remains pending; historical A/B/CD/BCD PASS applies only to their recorded sources/policies. Shared runtime, E frontend and Android gates remain separate.

Read [amendment scope](coordination/AB-AMENDMENT-SCOPE.md), [external shipping](changes/EXTERNAL-SHIPPING-03.md), [refund decision](changes/REFUND-DECISION-02.md), [current API mapping](reports/EXTERNAL-SHIPPING-API-MAPPING.md) and [R1](reports/EXTERNAL-SHIPPING-R1.md) through [R4](reports/EXTERNAL-SHIPPING-R4.md) before historical references. The [1 October baseline](manifests/baseline-2026-10-01.json) is retained as history, not a current checkout/acceptance claim.

| Gate | Candidate status / evidence needed |
|---|---|
| G0 policy/source | New server Orders EXTERNAL_V2; migrated Orders LEGACY_V1. PR130 must be reviewed on its exact remote head, with PR129 parent preserved. |
| G1 transport/recipient | New actual center/Buyer/Seller receipt and scoped Admin demo events; no Courier account/photo required. Legacy Courier/private selected-proof rules remain. R2 local API/auth/race checks; shared provider and E screens pending. |
| G2 return address/schema | Owning Seller validated/frozen snapshot; one migration head; actual legacy upgrade and safe/unsafe downgrade evidence in R1. No shared migration applied. |
| G3 exactly-once money | One existing service and ledger; positive rejection/timeout item-only refund after actual return, other specified/legacy causes full; RELEASE keeps5%. R3 constraints/retry/normal API evidence; real payment providers excluded. |
| G4 no-HTTP recovery | Six bounded jobs with old IDs1–5 retained and result timeout ID6. Local dry-run/race/fairness/restart checks in R4; scheduler activation/monitoring remains task10. |
| G5 E and C/D integration | C profile/reviews and D revoke preserved/tested through actual API journeys. E result/receipt/return/admin UI wiring remains task06; backend local PASS does not establish native behavior. |
| G6 release/device | Tasks10–13 require reachable HTTPS/Auth/Storage/QR, actual APK/device and both complete journeys, evidence and teacher scope acknowledgement. NOT READY until actual gates are run. |

Keep canonical `POST /inspections/{id}/receive`, existing fulfillment/settlement routes and one shared Order→Shipment→Escrow→Product lock order as applicable. Fresh DB clock after locks/I/O guards both independent72h windows. A result timeout only permits return; transport return-delivered only records transport; actual recipient return commits before a separate financial attempt.

Migrations and historical accepted reports are preserved. Do not merge overlapping stacked PRs blindly, reset/stamp shared databases, publish private env copies or treat MERGED as proof of main ancestry. Record each exact base/head, migration and actual command; independent reviewer PASS and planner confirmation are still required before A/B amendment acceptance.
