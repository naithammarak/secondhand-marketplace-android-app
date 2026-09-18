# INSPECT-01 test cases (pre-implementation)

สถานะ: test design only. Cases that use draft enum names become executable after the contract and ORDER-01 dependencies are approved.

## Persistence and constraints

| ID | Scenario | Expected |
|---|---|---|
| MODEL-01 | Persist one inspection with shipment, assignee, timestamps, snapshot, result and three evidence categories | One round trip returns every approved field with UTC timestamps |
| MODEL-02 | Insert a second inspection for the same approved order item | Database rejects the duplicate key |
| MODEL-03 | Insert result for a missing inspection or user | Database rejects the FK |
| MODEL-04 | Link an evidence row from inspection A to a result from inspection B | Composite FK rejects the cross-job link |
| MODEL-05 | Insert a second result for one inspection | Database rejects the duplicate result |
| MODEL-06 | Try invalid status, result, category, version, length, size, or timestamp ordering | Database rejects each row-level invalid value |
| MODEL-07 | Store PASSED with a reason, or a non-PASSED draft result without an allowed reason | Database rejects incompatible result/reason |
| MODEL-08 | Update or delete a result/evidence row after it is linked and completed | The approved immutability mechanism rejects the mutation |

## Service transaction and concurrency

| ID | Scenario | Expected |
|---|---|---|
| SERVICE-01 | Seller submits shipment for own READY_TO_SHIP inspection | Transition succeeds, shipment and version are committed atomically |
| SERVICE-02 | Admin receives shipped item; inspector claims received item | Each valid transition records server time and increments version |
| SERVICE-03 | Two inspectors claim the same RECEIVED inspection with the same current version | Exactly one succeeds; the other receives version/assignment conflict |
| SERVICE-04 | Inspector submits result with 2, 11, duplicate, or missing-category evidence IDs | Validation fails and no result, completion, audit, or outbox row remains |
| SERVICE-05 | Submit result and evidence links while a commit fails | Transaction rolls back all result-side effects |
| SERVICE-06 | Admin reassigns an INSPECTING job | Target is active inspector, reason is required, old assignee loses mutation rights, audit is append-only |
| SERVICE-07 | Retry a successful mutation with the same idempotency key and payload | Original status/body is replayed with no extra version/result/event |
| SERVICE-08 | Reuse an idempotency key with a different payload | Request is rejected and state is unchanged |
| SERVICE-09 | Submit two results with different keys concurrently | One commits; the other gets version conflict/locked result after reload |

## Permission and projection

| ID | Scenario | Expected |
|---|---|---|
| AUTH-01 | No token, inactive account, unsupported role | 401/403 according to the approved error contract |
| AUTH-02 | Seller reads another seller's inspection | 404 without revealing existence |
| AUTH-03 | Inspector reads a free RECEIVED queue item and own INSPECTING item | Allowed projections contain only permitted inspection data |
| AUTH-04 | Seller uploads evidence or records result | 403 and no state change |
| AUTH-05 | Any role edits/deletes completed result/evidence | Rejected; original data is unchanged |

## Integration and migration

| ID | Scenario | Expected |
|---|---|---|
| INT-01 | Eligible upstream event is delivered twice | One inspection is created; duplicate event is deduplicated |
| INT-02 | Stale ineligible/cancelled event arrives after a newer order state | It cannot create or reopen an inspection |
| INT-03 | PASSED result is committed | Exactly one outbox event is available for CERT-02; retry does not issue a second certificate |
| INT-04 | Non-PASSED result is committed | Exactly one return request event is available; no certificate event is created |
| MIG-01 | Upgrade empty database through ORDER-01 and INSPECT-01 heads | One head, all FKs/indexes/checks/security rules present |
| MIG-02 | Upgrade a database at the pre-inspection head | Existing users/products/order data survives; inspection tables are added |
| MIG-03 | Downgrade only INSPECT-01 on disposable database and upgrade again | Dependency order is respected and upgrade is repeatable |
| MIG-04 | Autogenerate against the approved head | No unrelated DROP/ALTER; all FK target models are registered |

## Seed

| ID | Scenario | Expected |
|---|---|---|
| SEED-01 | Preview `inspect01-v1` | No database mutation and a deterministic plan is printed |
| SEED-02 | Apply the namespace twice to approved fixtures | Second run reports already-present; IDs/counts remain stable |
| SEED-03 | Existing team fixture was changed after first seed | Seed reports conflict and does not reset status/result |
| SEED-04 | Seed fails halfway | Transaction leaves no partial fixture and does not publish real outbox work |
