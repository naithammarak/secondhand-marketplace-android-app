> Historical contract snapshot copied 1 Oct 2026. Current scope/gates: ../DOC-01-scope.md and ../FINISH-00-release-gates.md. Old baseline coordinates and proposed decisions do not override the selected submission rules. External local links not supplied in this packet are labeled historical references.

# FINISH upstream and runtime dependency briefs v1 — 29 September 2026

Use [readiness](FINISH-00-readiness.md) for current source SHAs and [decision register](FINISH-contract-decisions.md) for product authority. These are narrow handoffs, not new GitHub issues or claims of acceptance.

## DB1 + INSPECT owner — Seller return-address snapshot

**Why:** At #112/#113/a234, `orders.ship_*` is only the Buyer destination. `ship-to-center` takes carrier/tracking only; `shipments` has no destination. Return delivery cannot safely choose a Seller address.

**Scope:** Add a validated `return_address` object to the authenticated Seller's `POST /orders/{id}/ship-to-center`, using the existing Order shipping-address validator's shape and limits: `recipient_name`, `phone`, `address_line`, `subdistrict`, `district`, `province`, `postal_code`. Store an immutable Seller return snapshot on the Order (`return_*` nullable columns or an equivalent one-to-one immutable snapshot), captured in the **same transaction** as the TO_CENTER shipment. For new ship commands it is required; coordinate the Seller mobile ship form and API decoder before enabling that validation so existing clients do not silently fail. The Seller must own the Order; no Inspector/Courier override, no current profile lookup at return time, no Buyer-address fallback. Exclude this private address from Buyer/QR/public reads. FINISH-02 copies the snapshot to a private immutable TO_SELLER shipment destination. Add DB immutability guard after capture and tests for malformed, cross-owner, replay, concurrent ship, and address changes after shipping. Coordinate field names/migration with DB1's shared Order/Shipment lineage and DB2 FINISH-01; do not silently backfill old paid Orders. Legacy Order with no valid snapshot must fail outbound return with `409 fulfillment_destination_missing`, remain HELD, and be routed to explicit Seller re-attestation/admin case handling approved separately. If an integrated candidate already has an equivalent immutable sender snapshot, map it and close this task without adding duplicate columns.

**Base/stop:** Work from L1 candidate when available; while waiting, DB1/INSPECT can review validator and draft migration in isolation. Stop if the candidate graph is unknown or an address would be invented for historical users. No shared DB mutation in this planning scope.

## COURIER-01/02/03 — extend one existing implementation

**DB1 COURIER-01:** Existing `UserRole.COURIER`, `Shipment` legs and `ShipmentDeliveryProof` mean the role/table foundations are partly present. On the candidate, inspect operator provisioning and migration constraints/RLS; add only missing all-leg destination snapshot, at-most-one outbound leg, selected-proof confirmation/immutability and assignment audit constraints. Preserve TO_CENTER semantics and existing proof objects. DB2 reviews migration.

**BE COURIER-02:** Current endpoints live in `backend/app/api/inspections.py` at `/admin/shipments/{id}/assign-courier` and `/courier/shipments*`; `_courier_shipment`, assignment and queue hardcode TO_CENTER. Extend those routes/helpers to all three legs with active assigned Courier recheck, private current-leg destination, 1–3 same-shipment selected readable proof IDs, idempotent confirm and immutable confirmation timestamp. Keep `POST /inspections/{id}/receive` as sole center receipt. Return delivery must commit even if FINISH-04 settlement later fails. Coordinate file ownership with FINISH-02.

**FE1 COURIER-03:** Android assigned queue, photo capture/upload, confirm and refresh against the real all-leg API. Start UI from [fixtures](FINISH-api-fixtures.md); live acceptance waits for account, private Storage, API and device checks. Do not treat a web/mock screenshot as proof.

## TIMER-01 / BE + DB — one runner using the shared service

**Dependencies:** FINISH-03/04 service and DB constraints; FINISH-02 return proof; confirmed deadline ordering in #98; no-ship guard in INSPECT Seller ship route. Existing `services/order_expiry.py` and `scripts/release_expired_orders.py` only cover unpaid expiry/orphan repair. F2's unpaid-expiry work is not FINISH TIMER acceptance.

**Scope:** A scheduled process every five minutes, independent of API traffic, with startup catch-up, bounded 100-row scan, stable ordering, independent per-Order transactions and concurrency safe locks. Candidates: (1) `DELIVERED_PENDING_BUYER`, DB time ≥ fixed deadline, no report, readable confirmed TO_BUYER proof → AUTO RELEASE; (2) `RETURNED_TO_SELLER` + HELD, readable confirmed return proof → full REFUND; (3) `WAITING_SELLER_SHIP`, DB time ≥ `paid_at + 72h`, no committed timely TO_CENTER shipment → full REFUND. Invoke FINISH-03/04 shared service and simulation guard; no separate worker ledger or force endpoint. Leave HELD on Storage/DB failure, record non-private attempt/failure signals, retry with same operation identity, and provide manual retry/runbook. Do not turn on unrelated orphan-product repair by reusing its script blindly.

**Acceptance:** Two worker processes, restart, no API traffic, exact boundary, stuck return after delivery commit, Storage outage/recovery and no-ship versus Seller ship race on disposable PostgreSQL and test private Storage. One terminal settlement and original Payment/Receipt preserved. Scheduled deployment and alerting are separate environment evidence; running a one-off script is insufficient.

## Work that can start before L1 supplies the combined candidate

FINISH-00 contract review, this fixture set, QA cases, FE1 view components against fixtures, DB2 settlement constraint design, and DB1/INSPECT Seller-address validator/migration design can proceed independently. FINISH-01 migration publication and FINISH-02…04 integration wait for a single reviewed candidate with G0/G1/G2 evidence. TIMER worker coding can design its scan/service interface, but its race/deployment acceptance waits for FINISH service and the common deadline rule. Every implementer should pin and report the actual new base SHA; the SHAs above are evidence coordinates, not permanent implementation bases.
