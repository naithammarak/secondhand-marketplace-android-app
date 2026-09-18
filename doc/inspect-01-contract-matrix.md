# INSPECT-01 contract-to-storage matrix (pre-implementation)

สถานะ: working draft สำหรับ review โดยอิง `inspect-contract.md` 0.1 เท่านั้น ค่าที่มีเครื่องหมาย `draft` ห้ามนำไปสร้าง migration ก่อน Lead อนุมัติ

## State and result mapping

| Contract item | Proposed storage | Database rule | Service rule | Open dependency |
|---|---|---|---|---|
| `status` (draft) | `inspections.status` | named CHECK/non-native enum; no arbitrary strings | allow only the transitions in the contract; increment `version` | Lead/BE approve names and cancellation boundary |
| `result` (draft) | `inspection_results.result` | named CHECK/non-native enum | only assigned inspector in `INSPECTING`; one result per inspection | Lead approves four meanings and INCONCLUSIVE policy |
| result/reason pair | `inspection_results.reason_code` | PASSED => NULL; other draft results require an allowed reason | validate summary and reason together | Lead approves reason catalog |
| expected version | `inspections.version` | `version >= 1` | row lock/conditional update for every mutation | BE agrees transaction boundary |
| one inspection per unit | `inspections.order_item_id` | UNIQUE after ORDER-01 key is known | duplicate upstream event is idempotent | ORDER-01 confirms order item and eligibility |
| one result | `inspection_results.inspection_id` | UNIQUE | repeated submit returns idempotency replay or locked result | shared idempotency owner |

## Field mapping

| Table | Field | Draft type/limit | Constraint or index | Test coverage |
|---|---|---|---|---|
| `inspections` | `order_item_id` | positive integer | FK + UNIQUE; delete policy pending | missing/duplicate/order cancellation |
| `inspections` | `product_id`, `seller_id` | positive integer, optional until ORDER-01 | FK if retained; snapshot consistency | wrong reference, snapshot immutability |
| `inspections` | product/seller snapshot | ORDER-01-defined immutable values | NOT NULL for required snapshot fields | round trip and later source update |
| `inspections` | `status` | draft enum | CHECK | every valid/invalid transition |
| `inspections` | `assigned_inspector_id` | nullable FK `users.id` | FK; active inspector is service rule | claim/reassign/inactive user |
| `inspections` | `version` | integer >= 1 | CHECK | stale/concurrent mutations |
| `inspections` | `received_at`, `started_at` | UTC timezone-aware | `received_at <= started_at` when both exist | timestamp ordering |
| `inspections` | `created_at`, `updated_at` | UTC timezone-aware | server timestamps | round trip |
| `inspection_shipments` | `inspection_id` | positive integer | FK + UNIQUE | duplicate shipment |
| `inspection_shipments` | `carrier`, `tracking_number` | trimmed, 1-100 chars | NOT NULL + length checks | empty/overlong values |
| `inspection_shipments` | `shipped_at`, `recorded_by` | UTC timestamp, user FK | NOT NULL | round trip/reference |
| `inspection_shipments` | `received_note` | nullable, <= 1,000 chars | length check if stored here | null/overlong |
| `inspection_results` | `inspection_id` | positive integer | FK + UNIQUE | duplicate result |
| `inspection_results` | `summary` | trimmed, 10-2,000 Unicode code points | length check | empty/boundaries |
| `inspection_results` | `result`, `reason_code` | draft enums | result/reason compatibility CHECK | all four result cases |
| `inspection_results` | `recorded_by`, `recorded_at` | user FK, UTC timestamp | NOT NULL | wrong user/time |
| `inspection_evidence` | `inspection_id` | positive integer | FK | missing/wrong inspection |
| `inspection_evidence` | `object_key` | private storage key | NOT NULL; no signed URL as source of truth | key persistence |
| `inspection_evidence` | `category` | draft `OVERVIEW`, `IDENTIFIER`, `FINDING` | CHECK | missing category/invalid category |
| `inspection_evidence` | `caption` | trimmed, 1-300 chars | NOT NULL + length check | boundaries |
| `inspection_evidence` | `mime_type` | JPEG/PNG/WebP | service validates signature and decode | spoofed MIME/invalid image |
| `inspection_evidence` | `size_bytes` | 1-5,242,880 | CHECK | 0, limit, +1 byte |
| `inspection_evidence` | `uploaded_by`, `uploaded_at` | user FK, UTC timestamp | NOT NULL | reference/round trip |
| `inspection_result_evidence` | result/evidence/inspection IDs | positive integers | pair UNIQUE + composite FKs | cross-job and duplicate link |

## Deferred integration storage

Do not add these tables in INSPECT-01 until the shared owner is named:

- audit append-only records (actor, action, before/after, reason, request id, occurred time)
- outbox business key for `inspection.passed.v1` and `inspection.return_requested.v1`
- inbox/event deduplication and idempotency scope `(actor_id, method, path, key)`
- certificate/return projection ownership and retry attempt model

## Review blockers

- The current checkout has no `orders` or `order_items` table/model.
- The contract is explicitly draft 0.1; the four result values and all reason codes remain proposals.
- The current Alembic graph has no ORDER-01 revision to depend on.
- The current model registry does not import all existing models, so metadata registration must be corrected together with the approved dependency graph.
