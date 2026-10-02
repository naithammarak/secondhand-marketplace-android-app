# 02 FINISH-01 — durable schema and seller return snapshot

Status: REVIEW_PENDING. Upstream `d98d4a0b4b5d0cbfdce842ac886ed0ffc0409b05`; implementation source `33f0eadd8c1739735434ee9f103a5f23398178ed`. Published review head is the documentation-only descendant reported in the review request/coordination state.

Migration: `a02f20261002` → parent `714f11c84d53`; one head. Next coordinated migrations are task07 then task08; B reuses these tables/models.

## Delivered

Final Order/Escrow states, original-money tuple constraints, finite Decimal money, one immutable terminal RELEASE/REFUND ledger across both kinds, exact allocations/parties/currency/source/reason, paired receipt/non-receipt fields, replay/history/resolution/access records and the immutable inspection-overdue marker. Deferred checks reject terminal Order/Escrow without matching settlement. Original Payment/Attempt/Receipt, paid Order money/address and terminal records are immutable.

Shipment keeps existing Courier/delivery fields, adds outbound destination snapshot/one-outbound index and immutable selected proof bindings. Same Shipment/Courier/timestamp is enforced with composite FKs. Confirmation binds 1–3 proofs in its first transaction; later additions/replacements/deletions/assignment/time rewrites fail. Existing storage checks are retained and refreshed under lock after I/O.

A-PROOF-01 compatibility: the retained bodyless TO_CENTER confirmation selects ALL currently uploaded valid private proofs (1–3) on the server, hashes `{}`, and freezes that exact same-shipment/current-assigned-Courier set. It does not parse client `proof_ids`; ignored body changes with the same key replay the historical command after active authorization checks. **PENDING — B/task03:** uniform strict `{proof_ids:[...]}` validation on the EXISTING shared confirmation route for all three legs, distinct integer same-shipment/current-Courier IDs, rejection of duplicate/missing/unknown/invalid inputs, canonical ordering, same-set replay/changed-set key conflict and atomic selected-only binding. B/E must coordinate the existing caller and explicitly test historical bodyless replay compatibility without rewriting original hashes or bindings. A selected-binding tests do not establish final strict-selector acceptance.

Strict private owning ACTIVE Seller return-address save/read is implemented, with stable canonical idempotency and no-store. Changes stop once Shipment starts; a database guard serializes insertion with address changes. Ship rejects missing destination and `now >= paid_at + 72h`, using fresh post-lock PostgreSQL wall clock and an insertion-time database check. Successful replay remains available after the deadline. Order expiry/payment/cancel/worker time guards and common existing-Order lock order are reconciled.

Concrete fields, routes, bodies/errors, scopes, snapshot rules and legacy compatibility are in `API-MAPPING.md`.

## Evidence

Fresh PostgreSQL install is proven by migration-backed API/constraint fixtures. Five migration checks cover supported 714f11c84d53/e8b2c490a713/d8b7c4e2910a upgrades with paid/unpaid/proof/inspection/certificate/decision rows, exact original-value preservation, unsafe cross-order preflight refusal/rollback, explicit downgrade refusal and anon/authenticated RLS denial even after accidental grants.

37 foundation checks cover canonical save/replay/update/freeze/privacy, strict input, FK/party/currency/amount/kind/source/allocation failures using nested savepoints, immutable original/terminal/proof records, opposing-kind uniqueness, full transaction rollback, save-versus-ship and real lock waits crossing expiry/shipping deadlines. Correct release allocations commit; shifting allocations while retaining the total rolls back. Round 2 adds 10 migration-backed Buyer/Seller list/detail cases spanning REFUNDED/RELEASED/HELD/unpaid/cancelled, retaining the identical original receipt. Round-2 Orders plus foundation: 63 passed; round 3 adds five deterministic checkout race cases (current total 68). Focused Orders API: 80 passed in both rounds. Prior INSPECT/CERT/worker checks remain round-1 evidence; see `A-test-evidence.json`.

## Compatibility and remaining ownership

Legacy addresses are not invented. Paid/unshipped legacy rows can save a valid destination but cannot evade the actual shipping deadline. In-flight missing destinations remain null/frozen; existing inbound reads/proof/inspection remain intact, while future return dispatch requires separately reviewed compatibility repair. Invalid financial/proof/assignment/outbound/nonfinite legacy data aborts migration with actionable preflight text. Downgrade is refused rather than discard audit facts.

Terminal ledger tests use synthetic database transactions to verify schema integrity. Proof-dependent final settlement services, final deadline workers and Admin resolution APIs belong to B; these tests do not claim their business journeys are implemented. New simulation guard defaults false and rejects production/unknown environments; B must reuse it for its money services/workers. Shared DB/bucket activation, real OAuth/Android/QR and final project acceptance remain unverified.
