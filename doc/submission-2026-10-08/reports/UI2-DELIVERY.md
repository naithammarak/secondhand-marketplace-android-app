# UI2 delivery — Staff / Admin / Certificates (3 ตุลาคม 2026, Asia/Bangkok)

**Status: client contract + staff screens + focused tests + local API smoke DONE on PR130 base. NOT composed with UI1 into `E_BASE`. Android, real Google, private Storage and HTTPS/other-device QR remain open (see Gates).**

## Source

| Item | Value |
|---|---|
| Base | PR130 `0ffff2de66d321ab37a0a725d4427716cbfecba3`. Remote `refs/pull/130/head` was verified equal before starting. Migration `r01e20261002` after `c08f20261002`. |
| Branch | `claude/ui2-staff-certificates-2026-10-03` (separate worktree). The live checkout, its env files and shared DB were not touched. |
| Milestone UI2-00 | `9e34d07`, published first. See [UI2-00-CLIENT-MILESTONE.md](UI2-00-CLIENT-MILESTONE.md) for exact exports and usage. |
| Commits | `9e34d07` UI2-00 client · `bd1612b` UI2-01/02/03 staff screens · `9ad5d88` UI2-04 cert message · `39b5e4a` UI2-06 smoke/screens · this report |
| Ownership | No UI1-owned file edited: `inspection/views.tsx`, `connected-screens.tsx`, order detail, profile, navigation, theme, `_layout.tsx` and `visual-tests/app/index.tsx` are all unchanged. No backend, migration, dependency or Expo-config change. |

## What changed

**UI2-00 client** (`services/fulfillment-service.ts`, `fulfillment/contract.ts`, `fulfillment/fixtures.ts`):

- One `createFulfillmentService`, with the 14 OWNERSHIP methods plus `listAdminOrders`/`getAdminOrder` (existing Admin order reads, used to find shipment IDs).
- Conventions:
  - Bearer token on every call; caller-held `Idempotency-Key` on every mutation.
  - Canonical strict bodies: reason 10–1000, carrier/tracking trimmed to 1–100 with no normalization, issued-ref patterns, sorted distinct refs, RELEASE or REFUND only.
  - `{result, replayed}` results.
  - `FulfillmentServiceError{status, code, fields, uncertain}`, where `uncertain` covers status 0 and 5xx.
- DTOs keep the server's snake_case fields, so nothing is dropped.
- `inspection-service` gains the result-window, timeout, policy and `server_time` fields, plus Inspector `can_create_fulfillment`/`fulfillment`/`buyer_decision`. All additions are optional, so existing callers are unaffected.
- `receive` now sends `{}` when there is no note.
- `useFulfillmentApi()` shares the current-account token guard and 401 refresh, and `inspectionError` has Thai messages for the new codes.

**UI2-01/02 Inspector** (`components/staff/inspector-queue.tsx`, `inspector-work.tsx`, routes `/inspections`, `/inspections/[inspectionId]`):

- Queue filters, including history, showing server-derived hints and the overdue flag.
- Actual center receipt with an optional note:
  - EXTERNAL_V2 needs no provider-arrived or Courier prerequisite.
  - LEGACY_V1 keeps the Courier proof rule.
- Start, then private evidence: pick, select 1–5, and retry the same file with the same key.
- Final result:
  - The payload is exactly `{result, summary, evidence_ids}`.
  - The three checklist rows only insert text into the summary and are labelled as not persisted scores.
- Result outcomes:
  - Positive shows "ออกใบรับรอง" (certificate issued) and the Buyer decision deadline or timeout.
  - Negative shows no certificate and no Buyer acceptance.
- Outbound:
  - Carrier/tracking only, shown only when `can_create_fulfillment` is true.
  - The destination is described by server `next_action`. The Inspector never sees or edits the address.
  - No photo. Once dispatched, the screen states that delivery and receipt are confirmed by the recipient or a transport event, not by the center.

**UI2-03 Admin** (`components/staff/admin-delivery.tsx`, route `/admin-deliveries`):

- Non-receipt:
  - Case list → audited review with a reason → the private report and issued refs are shown → only issued refs are selectable.
  - Exclusive REFUND or RELEASE, each with a policy explanation (REFUND: full refund, no Seller payout or commission) → reason → confirm.
- Return exception:
  - Order picker → audited return review → locked return recipient and issued refs. Both `return-shipment` and `delivery-audit` refs are required.
  - Reason → confirm. Then show "รับคืนแล้ว กำลังดำเนินการคืนเงิน" (returned, refund in progress), with no amount selection.
- Demo transport event:
  - Labelled as simulated and config-gated; picks the shipment from the server and generates an event id.
  - Shows `recipient_confirmed=false` together with the server's source and time.
- Legacy Courier assignment moved to `/admin-legacy-couriers` through the existing export.

**UI2-04/05** reuse the D and seller-verification code unchanged, plus a public `certificate_not_found` message. The smoke run re-verified the public 4-field JSON, revoke replay, REVOKED status, the private reason staying private, and the private ID-review queue.

## Checks (from `mobile`)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:logic` | 323/323 PASS (PR130 base 313; new `fulfillment-service.test.mjs` 7, `inspection-service-ui2.test.mjs` 3) |
| `npx jest --runInBand` | 33 suites, 254/254 PASS (base 243; new `staff-inspector` 7, `staff-admin-delivery` 4) |
| `npx eslint src` | 29 errors / 14 warnings, identical to the PR130 base; 0 in UI2 changed files |

## Local API smoke (executed)

- **Environment:** PR130 API on `127.0.0.1:8081` with an owned PostgreSQL 16 container `ui2-smoke-pg-20261003` (`127.0.0.1:55481`) after `alembic upgrade head`.
- **Auth and storage:** synthetic HS256 test JWT (the public backend test constant). Inspection evidence uses `INSPECT_PRIVATE_STORAGE_DIR`; product images and the ID card use [storage_stub.py](ui2-smoke/storage_stub.py).
- **Data setup:** ADMIN and two INSPECTOR roles set by SQL in the owned DB; one category and one brand inserted. Everything else, including seller approval through the Admin verification queue, went through normal API calls.

**Result: 7/7 PASS** ([output](ui2-smoke/smoke-output.txt), harness [ui2-api-smoke.mjs](ui2-smoke/ui2-api-smoke.mjs)):

1. **Center receipt and positive result:**
   - Center receipt with no courier/provider event.
   - PASS issues the certificate ISSUED before the Buyer decision; window = 72h; `can_create_fulfillment=false` until the decision.
   - A second Inspector gets 404 (assigned scope). The Seller gets 404 on the private evidence image. The Buyer result exposes `can_decide`, `server_time` and the deadline.
2. **Outbound to Buyer:**
   - After CONFIRM, `SHIP_TO_BUYER`. Carrier/tracking are only trimmed ("th-0001 x" kept). Same-key replay → `replayed=true`; a changed body on the same key → 409 `idempotency_key_reused`; a Seller attempt → 403.
   - Report allowed before any event.
   - The Admin TO_BUYER event: `ADMIN_DEMO`, `recipient_confirmed=false`; recipient still null; receipt deadline = event + 72h. A wrong leg → 409 `shipping_leg_mismatch`; a Buyer posting an event → 403.
   - The Buyer report → `DELIVERY_DISPUTED`.
3. **Non-receipt REFUND:**
   - A Buyer gets 403 on the case list. Resolving before review → 409 `delivery_review_required`.
   - Review shows the report reason. An invented ref → 422 `invalid_evidence_reference`. REFUND with issued refs → `REFUNDED`.
   - A second resolution → 409. Buyer refund 1350.00; Seller payout and commission 0.00; the Seller cannot see the report.
4. **Non-receipt RELEASE:** `COMPLETED`; Seller 1140.00 and commission 60.00; Buyer refund 0.00.
5. **Negative result and Admin return exception:**
   - NOT_AS_DESCRIBED: no certificate; Buyer CONFIRM → 409 `decision_not_allowed`; outbound TO_SELLER.
   - The TO_SELLER Admin event does not refund (order stays `RESULT_NOTIFIED`, no settlement).
   - Return review issues `delivery-audit` and `return-shipment` refs; an invented ref → 422.
   - The Admin confirmation records `recipient_source=ADMIN` and `settlement_attempt=SEPARATE` → `REFUNDED` 1350.00. A later Seller confirm → 409.
6. **Certificates:**
   - Public JSON has exactly 4 fields; an unknown token → 404 `certificate_not_found`.
   - Admin revoke and a same-key replay give identical results → public REVOKED. The private reason appears in neither the JSON nor the HTML, and no email appears.
   - The result stays PASS/CONFIRM and the 1350 refund stays unchanged. A Buyer revoking → 403.
7. **Wrong role/account:** another Buyer gets 404 on delivery; an Inspector gets 403 on delivery review; a Buyer gets 403 on the Inspector queue; a Seller gets 403 on the Admin order read.

**Demo flag off:** on a separate local API (same owned DB, `EXTERNAL_SHIPPING_DEMO_ENABLED=false`), the event returns 403 `shipping_demo_disabled` before any write ([check](ui2-smoke/demo-disabled-check.mjs), [output](ui2-smoke/demo-disabled-output.txt)).

**Not executed live:** the return-settlement failure that leaves `pending_processing` and the worker retry (settlement committed immediately here), the positive result timeout (needs a real 72h wait), and AUTO receipt. The UI copy for these is covered by fixtures and component tests only.

## Screenshots of newly designed states

QA fixture route `visual-tests/app/staff.tsx` (`/staff?scene=…`, inert actions), 390 px wide, light theme, in [ui2-smoke/screenshots](ui2-smoke/screenshots/):

- Inspector receipt, new and legacy rule: `inspector-receive`, `inspector-receive-legacy`
- Start: `inspector-start`
- Evidence, result and checklist helper: `inspector-inspecting`
- Waiting for the Buyer with the deadline: `inspector-wait-decision`
- Outbound to Buyer: `inspector-outbound-buyer`
- Negative result returning to the Seller: `inspector-outbound-return`
- Timeout returning to the Seller: `inspector-timeout-return`
- Dispatched, with a revoked certificate shown: `inspector-shipped`
- Admin non-receipt review: `admin-case-review`
- Admin return exception: `admin-return-review`
- Demo event intro, recorded and disabled: `admin-demo-event`
- Denied for other roles: `staff-denied`

These prove layout only, not Android or a live session.

## For Lead

1. **E_BASE binding.** UI1 consumes this client through `FulfillmentPort` in `mobile/src/orders/fulfillment-binding.tsx` (UI1 branch). Bind it there with `useFulfillmentApi()` and pass `(orderId, …, key)` through to these methods; DTO field names already match UI1's parsers.
2. **API mapping mismatch.** The doc says `can_report_not_received`, but PR130 `GET /orders/{id}/delivery` returns `can_report_missing` (`backend/app/api/finish.py`). Repro: smoke step 2, `getDelivery` as the Buyer after dispatch. `canReportNotReceived()` reads either name.
3. **No list endpoint for open return exceptions.** The Admin picks from `GET /admin/orders?status=RESULT_NOTIFIED`, and the server decides eligibility (409 `return_case_closed`). If a scoped "pending returns" list is wanted, that is backend scope.
4. **Shared primitives.** Staff screens use a small staff-local kit (`components/staff/staff-ui.tsx`) on the existing theme, because UI1's shared status primitives are not in this base. They can switch after E_BASE with no behaviour change.

## Remaining gates (not claimed)

- E_BASE composition and combined review.
- Real Google login and account switch on a device.
- Private Supabase Storage for evidence and ID cards.
- Public HTTPS certificate QR on another device.
- APK and Android camera/picker permissions; shared DB migration; scheduler/worker activation.
- Live timeout, AUTO receipt and pending-retry journeys.
- Final documents.
