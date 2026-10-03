# UI1 delivery — Customer / Seller (3 ตุลาคม 2026, Asia/Bangkok)

**Status: code + focused tests + local API smoke DONE on PR130 base. NOT combined with UI2 / not `E_BASE`. Shipping-client binding, Android, real Google, private Storage and public QR remain open (see Gates).**

## Source

| Item | Value |
|---|---|
| Base | PR130 `0ffff2de66d321ab37a0a725d4427716cbfecba3` (`codex/ab-external-shipping-2026-10-02`). Remote `refs/pull/130/head` was verified equal before starting. |
| Migration | `r01e20261002` after `c08f20261002`. Single head confirmed on the owned smoke DB. |
| Branch | `claude/ui1-customer-seller-2026-10-03` (separate worktree). The original live checkout was not edited, reset or read for env. |
| Milestone UI1-01 | `e1de4a5`, published first. See [UI1-01-SHELL-MILESTONE.md](UI1-01-SHELL-MILESTONE.md). |
| Commits | `e1de4a5` UI1-01 shell · `cde163e` UI1-05 journey · `857d8a5` UI1-02/03/04 trims · `aef575a` UI1-06 smoke/screens · this report |
| Latest frontend | `feat/marketplace-design-ui` @ `939e4f7` is an ancestor of PR130. The live checkout's uncommitted mobile WIP is an older copy of files already integrated in PR130; it was not used. |

## What changed

**UI1-01 shell.** One route table with UI2 staff targets (`mobile/src/navigation/routes.ts`), and every route registered in the root Stack. Shared primitives (`components/wondee/status.tsx`): StatusBanner, SimulationLabel, MoneyRow, SectionCard, ServerDeadline, ActionNotice and ReasonField. One server-driven error model (`orders/action-errors.ts`). Providers, auth, fonts and dependencies are unchanged.

**UI1-05 journey** (`orders/order-journey.ts`, `use-order-journey.ts`, `components/order-journey-sections.tsx`, `return-address-form.tsx`, rewritten `order-detail-screen.tsx`):

- Stages are derived from `order_status`, shipments, `can_*` flags, deadlines and settlement. Prototype labels are never sent back to the server.
- Buyer:
  - Positive results show the certificate, then CONFIRM/REJECT only when `can_decide`, with an informative 72h server countdown. Reaching zero refetches; it never decides anything locally.
  - Timeout shows "หมดเวลาตัดสินใจ ระบบจะดำเนินการส่งคืนผู้ขาย" and makes no acceptance on the Buyer's behalf.
  - Negative results have no certificate, no CONFIRM and no window.
  - Receipt/report actions come from server flags, including before the transport event. The report form takes only a 10–1000 reason (no complaint types, no photos). The recorded report and receipt states are shown.
  - The transport event (with a simulated label) and the recipient's receipt are shown as separate facts.
- Seller:
  - Seven-field return address is saved before ship-to-center and shown read-only and locked after shipment.
  - The confirm-return CTA appears only from `can_confirm_return`.
  - After receipt, "รับคืนแล้ว กำลังดำเนินการคืนเงิน" shows while `pending_processing`.
- Money comes only from server snapshots. Quotes ("ประมาณการ") and Seller estimates are labelled separately from settled amounts, and settled amounts carry their reference `#id`. There is no client arithmetic, and the original receipt is never altered.
- Commands keep one Idempotency-Key per identity across uncertain outcomes and always refetch afterwards. Data for one account or order is dropped on account switch.
- Legacy LEGACY_V1 orders parse and follow the server's `can_decide` with no invented deadline.

**Removed fake or out-of-scope UI** (D01–D03, D08–D10, D14, D15):

- Order detail: fabricated tracking numbers, the fabricated certificate number and URL, the relist workflow, hard-coded ฿50/฿100 fees, and "accept as-is" for negative results.
- Inspection views: the 3-item checklist, "save photo" and "copy link" toasts that did nothing, and an invented center address.
- Orders list: hard-coded failed order #37, the fake "24:13" countdown and the client-computed 30-minute deadline.
- Checkout and receipt: the decorative payment QR and the PromptPay fallback.
- Catalog and detail: the "ตรวจแล้ว" claim before inspection, "ตอบกลับเร็วมาก", and the dead "ดูร้านค้า" button.
- Profile and shell: the mascot avatar switcher and the always-on unread dot.

## Routes touched

`/orders/[orderId]`, `/orders/[orderId]/inspection`, `/orders/[orderId]/ship-to-center`, `/orders`, `/checkout/[productId]`, `/receipt/[orderId]`, `/profile`, `/products`, `/products/[id]`, `/product/new`. Staff route names are registered for UI2 only; their screens were not changed.

## Checks (from `mobile`)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS (exit 0) |
| `npm run test:logic` | 334/334 PASS (baseline at PR130: 313; new `ui1-shell.test.mjs` 5, `order-journey.test.mjs` 16) |
| `npx jest --runInBand` | 31 suites, 247/247 PASS (baseline 243). Prototype-behaviour tests were replaced by server-flag tests: order-detail 11, orders-list 13, inspection views/connected 19 |
| `npx eslint src` | 27 errors / 13 warnings, all pre-existing (PR130 base: 29 / 14). No new lint errors in changed files |

## Local API smoke (executed)

- **Environment:** PR130 API (uvicorn `127.0.0.1:8071`) on an owned PostgreSQL 16 container (`ui1-smoke-pg-20261003`, `127.0.0.1:55471`) after `alembic upgrade head`.
- **Auth:** synthetic HS256 test JWT using the public backend test constant. Not Supabase.
- **Storage:** inspection evidence uses the built-in `INSPECT_PRIVATE_STORAGE_DIR`. Product images and the ID card use [storage_stub.py](ui1-smoke/storage_stub.py).
- **Flags:** `APP_ENV=test`, PAYMENT/FULFILLMENT simulation and `EXTERNAL_SHIPPING_DEMO_ENABLED=true`, local process only.
- **Data setup:** INSPECTOR/ADMIN roles were set by SQL in the owned DB (staff provisioning), and one category plus one brand were inserted (no API exists for these). All order, payment, shipment, decision, receipt, return and settlement states were reached through normal API calls; no terminal seeds.
- **Clients:** [ui1-api-smoke.mjs](ui1-smoke/ui1-api-smoke.mjs) uses the real mobile `order-service`, `inspection-service`, `profile-service`, `review-service`, `product-catalog-service` and the UI1 `order-journey` parsers and derivation. A test-only HTTP adapter stands in for FulfillmentPort.

**Result: 7/7 PASS** ([output](ui1-smoke/smoke-output.txt)):

1. **Guest:** catalog search and detail work without login. Public seller reviews return count 0 and average `null`, so there is no fake score.
2. **Signup and profile:** signup creates a BUYER. `full_name` saves and reloads, an extra `role` field gets 422, and the policy ack replay keeps the original timestamp.
3. **Successful sale:**
   - Quote → Order: the same key replays the same Order, and the payment replay returns the same attempt. Receipt total 1350.00.
   - Ship-to-center without a saved return address gets 409. Then save address → ship with any carrier text and lowercase/space tracking → address frozen; a later save gets 409 `return_address_locked`.
   - PASS: certificate ISSUED before the decision, window = availability + 72h, stage `RESULT_DECISION_OPEN`. CONFIRM replays; REJECT afterwards gets 409 `decision_already_recorded` → `refetch`.
   - Dispatch with no event: stage `SHIPPING_TO_BUYER` and no receipt timer. After the Admin demo event: stage `DELIVERED_PENDING_BUYER`, deadline = event + 72h, transport is not recipient receipt, and the Seller has no receipt action.
   - Confirm receipt (replay header true) → `COMPLETED`. Seller settled 60.00 / 1140.00. Receipt unchanged; history shows `SETTLEMENT_RELEASE`.
   - Review: `can_review` true, then submitted. The public label is "ผู้ซื้อที่ยืนยันการซื้อ" and the real name is redacted.
4. **Positive REJECT:**
   - Return in transit: stage `RETURNING` with Buyer quote 1200/100/50, labelled as a quote. The Seller projection has no quote, and the Seller gets `can_confirm_return`.
   - The TO_SELLER demo event does not refund; the stage stays `RETURNING`.
   - Seller confirm-return → `RETURNED_TO_SELLER` → refetch shows `REFUNDED` with settlement #5 `BUYER_REJECTED_INSPECTION`: refund 1200.00, retained 100.00 and 50.00, Seller payout 0.00.
   - Receipt still 1350.00, certificate still ISSUED (no auto-VOID), and review gets 409 `order_not_reviewable`.
5. **Negative FAKE:** no certificate, `can_decide` false, no deadline. CONFIRM gets 409 `decision_not_allowed`. Return then actual receipt → `REFUNDED`, settlement #6 `INSPECTION_FAKE`, refund 1350.00 with no retained rows.
6. **Report before provider event:**
   - The report action is available after dispatch with no event. A 3-character reason gets 422; a valid reason → `DISPUTED`.
   - The Buyer sees their own reason; the Seller projection has `missing_report=null`.
   - Confirm-receipt then gets 409 → `refetch`.
7. **Account switch and Seller-as-Buyer:** another Buyer gets 404 on the Order and on the delivery read. An approved Seller buys another Seller's product (`viewer_role=buyer`, receipt 1350.00). Buying one's own product gets 409.

**Not executed live:**

- Positive result timeout, because the window is immutable at availability + 72h and a live run means a 72h wait or tampering.
- AUTO receipt.
- Return settlement failing into `pending_processing`; settlement committed immediately here.

These are covered by `order-journey.test.mjs` and the order-detail component tests using the accepted response shape, and by the backend's accepted 54-case suite. They are not claimed as live UI evidence.

## Screenshots of newly designed states

QA fixture renderings (`WONDEE_VISUAL_QA=1`, inert actions) of the real UI1 section components, 390 px wide, light theme, in [ui1-smoke/screenshots](ui1-smoke/screenshots/):

- Buyer decision window: `journey-decision`, `result-window`
- Timeout, no acceptance: `journey-timeout`, `result-timeout`
- Negative result: `result-FAKE`, `journey-refund-full`
- Shipping with no event, receipt/report allowed: `journey-shipping`
- Simulated delivered event and receipt window: `journey-delivered`
- Report recorded: `journey-disputed`
- Seller confirm-return CTA: `journey-seller-return`
- Buyer quote during return: `journey-buyer-returning`
- Received + HELD + pending processing: `journey-return-pending`, `journey-return-pending-buyer`
- Item-only refund 1200 + retained: `journey-refund-item`
- Seller payout 1140/60: `journey-seller-payout`
- Shipping client unbound: `journey-unavailable`
- 401/403/404/409/422/network notices: `journey-errors`
- Return-address form and locked address: `return-address-form`, `return-address-frozen`

These prove layout only. They are not Android or live-session evidence.

## For Lead (concrete items, work continued)

1. **E_BASE binding.** Screens consume `FulfillmentPort` (`orders/order-journey.ts`). Bind UI2's `createFulfillmentService` in `useBoundFulfillmentPort` in `orders/fulfillment-binding.tsx`; only that file changes. Until then, paid orders show `journey-unavailable`, and Seller ship-to-center is blocked because the return address is required. UI1 did not write a second HTTP client.
2. **API mapping mismatch.** `EXTERNAL-SHIPPING-API-MAPPING.md` names the Buyer flag `can_report_not_received`, but `GET /orders/{id}/delivery` (`backend/app/api/finish.py` `delivery_view` → `buyer_action_flags`) returns `can_report_missing`. Repro: smoke step 6, `GET /orders/{id}/delivery` as the owning Buyer after dispatch. UI1 reads either name; please correct the doc or the API, and tell UI2 for its DTO.
3. **Missing data, not invented.**
   - There is no server field for the Seller ship deadline. The UI shows the 72h policy text and `paid_at` without computing a deadline.
   - There is no source for the inspection center's address. The UI says it comes from the demo admin, and the earlier fabricated address was removed.
   - Decide whether these need API or config.
4. **Buyer result types.** `getBuyerResult`'s `BuyerResult` type (UI2) lacks the window fields. UI1 reads them through `parseResultWindow`, so no change is forced, but UI2-00 should add them.
5. **Out of UI1 scope, left as is:** the legacy Courier menu entry and screens, and the Inspector `Work` screen inside the mixed `connected-screens.tsx`. UI2 replaces these with new staff modules; the legacy exports remain.

## Remaining gates (not claimed)

- Composition with UI2 into `E_BASE` and a real shipping-client binding; combined review.
- Real Google OAuth login and account switch on a device.
- Private Supabase Storage (product, ID and evidence images).
- Public HTTPS certificate QR.
- APK build and Android interaction; shared DB migration; scheduler/worker activation.
- Live timeout, AUTO receipt and pending-retry journeys.
- Final documents.
