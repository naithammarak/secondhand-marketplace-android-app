# แผนแก้ใหม่ — ขนส่งภายนอก + คืนเฉพาะค่าสินค้า

วันที่: 2 ตุลาคม 2026 · สถานะ: **แผนและ scope ที่เลือก; ยังไม่ได้แก้ backend/UI ตามแผนนี้**

แผนนี้ใช้ต่อจาก [PR129](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/129) ที่ตรวจผ่านตามกติกาเดิม ณ `b531bd1372c0d26b8492fa28ff29ab20a85d7578`, migration `c08f20261002` การเปลี่ยนกติกาต้องมี PR และ review ใหม่ ไม่ทำงาน A/B/C/D ที่เสร็จแล้วซ้ำทั้งหมด

**ข้อกำหนดล่าสุด:** เอกสารนี้ → [REFUND-DECISION-02](REFUND-DECISION-02.md) → DOC-01/RELEASE-DESIGN → task/reference เดิม เฉพาะเรื่องที่แก้ในเอกสารนี้; เรื่องอื่นคงสัญญาเดิม รายงาน review เดิมเป็นหลักฐานของ source และกติกาเดิม

## 1. กติกาที่ใช้สำหรับต้นแบบ

| เรื่อง | กติกาใหม่ |
|---|---|
| บริการขนส่ง | ผู้ขายเลือกบริษัทและกรอกเลขพัสดุเพื่อส่งไปศูนย์; เจ้าหน้าที่ศูนย์กรอกบริษัท/เลขพัสดุเมื่อส่งออกจากศูนย์ |
| บัญชีขนส่ง | ไม่ต้องออกแบบหรือเปิดใช้ Courier workspace ใน flow ใหม่; ไม่สร้างบัญชีให้พนักงานขนส่งภายนอก |
| สถานะจากบริษัท | ต้นแบบใช้ Admin จำลองเหตุการณ์ขนส่งผ่าน backend พร้อม audit และป้าย “จำลอง”; ยังไม่ต่อ API บริษัทขนส่งจริง |
| รูปการส่ง | ไม่บังคับบริษัทขนส่งถ่ายรูปกลับมาให้ผู้ขาย; รูปแพ็ก/ใบฝากส่งเป็นส่วนเสริม ไม่ใช่เงื่อนไขจำเป็นของ flow ใหม่ |
| ผู้รับยืนยัน | ศูนย์ยืนยันรับเข้า, Buyer ยืนยันได้รับสินค้า, Seller ยืนยันได้รับของคืน เป็นสิทธิ์ของผู้รับแต่ละช่วง |
| ผลตรวจ | Buyer ยอมรับหรือปฏิเสธผลตรวจภายใน 72 ชั่วโมงนับจากผลสุดท้ายพร้อมให้ดู; ไม่ใช่นับจากการเปิดหน้า |
| ไม่ยอมรับ/ไม่ตอบ | ปฏิเสธหรือไม่ตอบภายใน 72 ชั่วโมง → ส่งคืน Seller; ไม่ auto accept ผลตรวจและไม่ปล่อยเงินให้ Seller |
| เงินคืนสองกรณีนี้ | คืน **ค่าสินค้าเท่านั้น**; เก็บค่าตรวจและค่าส่งเดิมไว้ครั้งเดียว ไม่หักซ้ำจากค่าสินค้า |
| เงินคืนกรณีอื่น | FAKE/NOT_AS_DESCRIBED, Seller ไม่ส่ง และ Admin non-receipt refund คงกติกาคืนเต็มเดิม เป็นสมมติฐานที่จำกัดการแก้ตามคำขอ |
| ขายสำเร็จ | commission 5% ของค่าสินค้า หักจาก Seller payout ตาม snapshot เดิม |

ตัวอย่าง: สินค้า 1,200 + ตรวจ 100 + ส่ง 50 = จ่าย 1,350; Buyer ปฏิเสธ/หมดเวลาผลตรวจ → ได้คืน **1,200**, เก็บค่าตรวจ 100 และค่าส่ง 50; Seller payout/commission ของ refund = 0 ขายสำเร็จ → Seller ได้ 1,140 และ commission 60

**สมมติฐานเรื่องค่าส่ง:** เก็บ quote/snapshot ค่าส่งเดิมสำหรับเดโมก่อน ผู้ขายชำระบริษัทขนส่งภายนอกเองตามแนวคิดที่ระบุ แผนนี้ไม่ได้เปลี่ยนราคาค่าส่ง เพิ่มค่าขนส่งคืน หรือทำการเบิกคืนค่าขนส่ง การจัดสรรต้นทุนขนส่งจริงเป็นเรื่องที่ต้องตกลงก่อนนำไปใช้เงินจริง

## 2. ใครกดอะไรในแต่ละช่วง

| ช่วง | ผู้ส่ง/ผู้บันทึกเลขพัสดุ | ผู้ยืนยันรับจริง |
|---|---|---|
| Seller → ศูนย์ | Seller; ต้องมีที่อยู่ส่งคืนที่ล็อกไว้ก่อนส่ง | Inspector ของศูนย์ |
| ศูนย์ → Buyer | Inspector หลังผลที่ยอมรับได้และ Buyer ยอมรับทันเวลา | Buyer เจ้าของ Order |
| ศูนย์ → Seller | Inspector หลังผลลบ, Buyer ปฏิเสธ หรือ system result timeout | Seller เจ้าของสินค้านั้น |

- **ยอมรับผลตรวจ** อนุญาตให้ศูนย์ส่งให้ Buyer; **ยืนยันได้รับสินค้า** หลังรับของจริงจึง RELEASE ทั้งสองปุ่มอยู่คนละขั้น
- Buyer ยืนยันรับได้หลังมี outbound dispatch ที่ถูกต้อง แม้สถานะบริษัทมาช้า; ถ้ามี receipt deadline แล้วต้องผ่านกติกา deadline เดิม
- สถานะ “บริษัทแจ้งส่งถึง” และ “ผู้รับยืนยันแล้ว” เป็นคนละข้อมูล การกรอกเลขพัสดุของ Seller/Inspector ไม่เริ่ม receipt timer และไม่ปล่อยเงิน
- AUTO receipt 72h เริ่มได้เมื่อ backend รับ delivery event ที่เชื่อถือได้สำหรับ TO_BUYER (ต้นแบบ: Admin demo event ที่มี audit) หากไม่มี delivery event ให้คง HELD ไม่มีการเดาว่าส่งถึง; non-receipt report ระหว่างทางต้องทำได้และกัน AUTO เมื่อ event มาภายหลัง
- การคืนเงินเริ่มหลัง Seller ยืนยันรับคืนจริง หรือ Admin ยืนยันข้อเท็จจริงการรับคืนผ่านเคสที่มีเหตุผล/หลักฐานและ audit ไม่คืนเพราะครบเวลาผลตรวจหรือกรอกเลขพัสดุอย่างเดียว ไม่เพิ่ม auto-refund จาก Seller เงียบโดยไม่มีสัญญารองรับ
- ถ้า Seller ไม่ยืนยัน/มีปัญหาส่งคืน ให้คง HELD/pending และแสดงเคสให้ Admin ตรวจแบบจำกัด Order อย่าให้ปุ่ม Admin เลือกยอดหรือผู้รับเงินเอง
- รูปตรวจสินค้า/เอกสารยืนยันตัวตนยังเป็น private ตามสิทธิ์เดิม รูปขนส่งที่ไม่บังคับต้องไม่ทำให้ระบบ private Storage ทั้งหมดกลายเป็น public

## 3. ทำไมต้องแก้ backend และ migration

ที่ตรวจใน source PR129: `models/shipment.py` บังคับ Courier delivery สำหรับ receipt; `models/fulfillment.py` ผูก confirmed proofs กับ Courier และบังคับ `buyer_refund = held_amount`; `finish_core.py`/`order_settlement.py` ตรวจหลักฐานเดิม; `lifecycle_worker.py` มีห้างานแต่ยังไม่มี result-decision timeout ดังนั้นซ่อนหน้า Courier อย่างเดียวทำให้ flow ไม่จบ

ใช้ Shipment/Order/settlement เดิม เพิ่ม policy snapshot และข้อมูลสถานะ/ผู้รับยืนยันเท่าที่จำเป็น อย่าสร้างระบบ shipment/escrow/ledger ใหม่ ล็อกลำดับเดิม Order → Shipment → Escrow → Product, command replay และ one terminal settlement ต้องคงอยู่

รักษา rows ที่จบแล้ว, Payment/Receipt, ที่อยู่ snapshot, enum/FK และ Courier proof เก่าให้ตรวจย้อนหลังได้ ไม่ลบ COURIER enum หรือแก้ migration ที่ใช้แล้ว กติกาใหม่ใช้กับ Order ใหม่หลังเปิด policy ใหม่; Order เดิมใช้ snapshot เดิม ห้ามเปลี่ยนกติกา Order ที่จ่ายแล้วอย่างเงียบ ๆ ข้อมูลเดโมเก่าที่จำเป็นต้องย้ายต้องมีรายการ/การอนุมัติแยก

## 4. แบ่งงานแก้ 6 ส่วน

IDs R1–R6 เป็นงานแก้เพิ่มเติมในไฟล์นี้ **ยังไม่ได้สร้าง GitHub issues** เชื่อมกับ tasks เดิม 02–06/11/13 โดยไม่เปิดงาน A/B/C/D ใหม่ทั้งหมด

| งาน | ผู้รับแนะนำ | ผลที่ต้องส่ง | รอ |
|---|---|---|---|
| R1 สัญญา/schema | A/integration owner | Policy snapshot, migration หลัง c08, allocation/evidence constraints, API mapping + เอกสาร/diagram/QA ที่ตรงกัน | — |
| R2 ส่ง/รับภายนอก | B/backend | Tracking, center receive, Buyer/Seller receipt, Admin demo events/return exception แบบ audit | R1 |
| R3 เงินคืน | B/backend | คืน item-only ตาม cause/policy; cause อื่น full; หนึ่ง settlement + retry | R1; proof journey ใช้ R2 |
| R4 งานอัตโนมัติ | B/backend | Result timeout job + receipt AUTO ที่ใช้ trusted event + return retry | R1–R3 |
| R5 E/UI | frontend/เพื่อน | หน้าของ Buyer/Seller/Inspector/Admin, deadline/เงินจาก API, ตัด Courier flow ใหม่ | design/fixtures เริ่มได้; integration รอ R2–R4 |
| R6 QA/review/รวม | Lead + reviewer | สอง API journeys, migration/races/เงิน, reviewed combined SHA → F Android | R1–R5 |

ให้ backend owner คนเดียวทำ R2 → R3 → R4 เพราะชน `api/inspections.py`, `finish_policy.py`, `order_settlement.py` และ worker; ถ้าแบ่งคนให้ล็อก interface/file ownership และรวมตามลำดับ E ออกแบบพร้อมกันได้ เก็บ branch ของแต่ละคนและใช้ upstream SHA ที่ส่งมอบจริง

## 5. Prompt กลาง — ใช้ประกอบทุกงาน

คัดลอก prompt กลาง + prompt R ที่รับผิดชอบ เปิด AI ใน repo แล้วให้แพ็ก `doc/submission-2026-10-08` ทั้งโฟลเดอร์ ล่าสุด E ต้องมี PR/branch/folder ของเพื่อนเพิ่มเติม เพราะยังไม่ได้ระบุใน lead record

```text
Work on the secondhand marketplace Android prototype due 8 October 2026 Asia/Bangkok. Read doc/submission-2026-10-08/changes/EXTERNAL-SHIPPING-03.md, changes/REFUND-DECISION-02.md and coordination/EXTERNAL-SHIPPING-STATE.json first. These amendments override Courier-required delivery and blanket full-refund wording in older prompts/references only for the stated cases. Follow applicable AGENTS.md.

Historical reviewed base: PR129, b531bd1372c0d26b8492fa28ff29ab20a85d7578, migration c08f20261002. Fetch and verify the supplied source and later upstream commits before editing. Work in an isolated branch/checkout, preserve the original dirty UI/live servers and all private env copies. Never include secrets in patches, reports or PRs; never reset/stamp/migrate a shared DB. Reuse existing shipment/command/settlement infrastructure and preserve financial history, authorization, locking and replay. New policy applies to new Orders; existing paid/settled Orders retain their persisted policy.

Implement only your assigned R task, verify meaningful affected behavior and hand off code plus reports/EXTERNAL-SHIPPING-RN.md, exact upstream/head, migration revision, API examples, actual checks and pending gates. Use the existing task report template. Publish a separate reviewable branch/PR without force-push or merge, and attach a created PR in Codex when available. Missing upstream is a concrete dependency: prepare interfaces/fixtures and report it; do not create a competing subsystem. Local tests do not establish shared services, Android/OAuth/Storage/HTTPS QR or presentation readiness.
```

### R1 — Contract/schema (A)

```text
Execute R1. Inspect the actual PR129 models, services, migrations and existing read/write APIs. Define the smallest persisted policy/deadline and delivery event/recipient-confirmation schema to implement sections 1–3. External status includes source/provenance, correct order/shipment/leg, deduplication identity and persisted server times; clients cannot choose financial deadlines. Distinguish trusted Admin demo events from actual carrier integration. Retain legacy Courier proof relationships and full-refund history.

Add one descendant migration from the verified c08 head. Enforce compatible legacy/new delivery invariants, immutable recipient/policy snapshots and reason/policy-aware financial conservation: new reject/timeout refund = item snapshot; retained inspection/shipping snapshots; seller payout/commission zero. Other refunds retain full allocation; one Order/Escrow cannot both RELEASE and REFUND. Timeout is a SYSTEM audited outcome, never a fabricated Buyer CONFIRM/REJECT.

Reconcile active DOC-01, SRS-SUBMISSION, requirements.csv, RELEASE-DESIGN, diagrams and QA-MATRIX with the new cases; preserve historical reference/review artifacts. Publish reports/EXTERNAL-SHIPPING-API-MAPPING.md with existing routes reused, new concrete routes, role/action flags, payload/response/error examples, deadline/replay rules and migration chain. Rehearse upgrade from representative legacy rows and fresh install, downgrade/re-upgrade when safe, and invalid allocation/provenance constraints on a new owned PostgreSQL DB. Report unsafe legacy cases without converting settled money/history.
```

### R2 — Shipment/recipient receipt/demo events (B)

```text
Execute R2 after reviewed R1 schema/API mapping. Reuse Seller ship-to-center, Inspector receive/outbound dispatch and owning Buyer receipt routes where possible. Add owning Seller return receipt and minimal scoped Admin return exception support. Seller/Inspector choose carrier and tracking only for their authorized leg; never accept a changed Buyer destination or return snapshot. Center can receive without an external Courier account/photo. New recipient confirmations require the correct dispatched leg and authorized party; completed replays remain readable.

Add a bounded demo-only Admin shipping event adapter with auth, configuration guard, required shipment/event data, explicit simulation label, deduplication/replay and audit. Events cannot be forged by Seller/Buyer, moved between legs, backdate deadlines, reverse terminal states or independently settle money. No real carrier webhook integration is required. Buyer manual receipt after valid accepted-result dispatch can establish actual receipt while external status is late; if a deadline exists, apply existing strict deadline guards. A missing report during transit must block later AUTO events. TO_SELLER actual receipt commits durably then calls the existing retryable settlement interface; failure remains pending. Carrier-delivered return alone does not substitute Seller/Admin confirmed receipt.

Verify all three legs through normal API calls, recipient/cross-account/role denial, replay/key mismatch, late/wrong event denial, no-photo success, immutable addresses, report-before-event and durable return failure/recovery. Keep private inspection/identity and legacy proof authorization intact. Hand off concrete committed read models/action flags to E.
```

### R3 — Cause-aware refund (B)

```text
Execute R3 after R1 and coordinate R2. Extend the existing exactly-once settlement service, not a second refund path. For new policy Buyer rejection or 72h result silence, after confirmed physical return refund item_price_snapshot only: charged1350/item1200/inspection100/shipping50 gives refund1200, retained100+50, Seller payout0, commission0. Never subtract fees twice or add return fees. Preserve full refunds for negative inspection, no-ship and audited Buyer non-receipt Admin refund under their selected policy; never overwrite original Payment/Receipt or terminal settlements. Successful RELEASE still uses 5% item commission and existing snapshots.

Use persisted reason/policy and server money only, Decimal conservation constraints, existing lock order/replay and final-leg eligibility. Expose charged/refunded/retained/payout amounts, cause/policy and pending/settled state with role redaction. Durable return can retry after outage exactly once; no review for any refund. Verify normal API explicit reject and SYSTEM timeout return settlements, cross-policy legacy rows, unrelated full-refund causes, invalid allocation/amount injection, races/duplicates, unchanged receipt and successful-sale commission regression.
```

### R4 — Result timeout and worker changes (B)

```text
Execute R4 after R1–R3. Add a sixth bounded restart-safe no-HTTP job for the owning Buyer's positive inspection-result decision at persisted availability +72 consecutive hours. Verify whether inspected_at already means atomic final-result/certificate availability; otherwise use the R1 persisted availability/deadline. At cutoff with no timely committed acceptance/rejection create a SYSTEM timeout return outcome, authorizing TO_SELLER only; do not invent a Buyer decision, auto accept, dispatch physically or refund before return.

Guard CONFIRM/REJECT and timeout under the shared locks with fresh DB time after waits/I/O. Before cutoff a valid decision may commit; at/after cutoff fresh decisions fail; committed replay is readable. Opposing decision/timeout and two workers produce one outcome/leg. Preserve all five existing jobs, durable scan cursor ownership/fairness and pure dry run. Receipt AUTO uses trusted new TO_BUYER delivery event +72h for new policy, legacy proof rule for legacy policy; Seller tracking alone and missing/untrusted delivery never release. Timely reports block AUTO. Return retry uses the persisted cause/policy and actual recipient confirmation. Inspection overdue is still three working days escalation, distinct from the result deadline.

Test just before/at/after both deadlines, lock wait fresh-clock races, conflicting actions/two runners, outage/restart, failed-first starvation, report-before-delivery-event, dry-run purity and eventual one settlement with no HTTP activity. Provide runner/config handoff but do not activate a shared scheduler.
```

### R5 — E/Frontend

```text
Execute R5 on the owner's latest frontend source, preserving current theme, C Profile/Reviews and D revoke/public certificate behavior. Read coordination/E-NEXT-HANDOFF.md. Build no new Courier workspace, role selector or required delivery-photo UI. Seller has return address, carrier/tracking ship-to-center and return progress/confirm-return; Inspector has receive, inspection and correct final outbound carrier/tracking; Buyer has result decision/countdown, tracking, physical receipt, non-receipt and refund detail; Admin has scoped exceptions and labeled demo event controls only.

Keep accepting an inspection result distinct from confirming physical receipt. Show result deadline from API, no auto acceptance; reject/silence return statuses and refund item-only/retained fees for those causes. Other refunds render actual server cause/amount. Explain simulated shipping/payment/payout/refund and pending return processing honestly. Read server action flags/money/deadlines, stable retry keys, refetch ambiguous outcomes and clear account-sensitive data on account changes. Optional shipping images must not block flow.

Design/fixtures can start now; final API integration waits for R2–R4 exact delivered head and API mapping. Never calculate settlement locally or bypass unavailable server guards. Run focused changed-screen/service checks and typecheck; exercise normal API sale plus reject/timeout return on an owned DB when backend exists. Hand off latest E PR/head and remaining Android/Auth/Storage evidence.
```

### R6 — Independent review and release integration

```text
Execute R6 on the actual combined R1–R5 remote head. Verify one migration head and current upstream ancestry; review changed contracts, recipient/event authorization, legacy preservation, exact money allocation, races, timer fairness/restart and source truth. Exercise through normal APIs: sale -> receive/release -> review with 5% commission; reject and 72h silence each -> Seller return receipt -> item-only refund; negative inspection/no-ship/Admin cases retain full refund; original receipt unchanged, refunded review forbidden. Cover untrusted/wrong/late events, missing report before delivery, receipt/report boundary, failure after durable return, two-runner/opposing decisions and no mandatory Courier/photos in new flows.

Run meaningful isolated PostgreSQL migration/API checks and affected mobile/type checks. Record REQUEST_CHANGES with reproducible findings or PASS for the exact SHA; head changes require affected re-review. Preserve old PR129 review as historical evidence. After new code/UI review freezes a candidate, hand it to F for HTTPS/Auth/private Storage/worker deployment, APK, real Android/QR journeys and final docs/slides/rehearsal. Never mark those gates passed from local API/browser checks, merge automatically, mutate a shared DB or claim this planning file is implementation evidence.
```

## 6. เริ่มทำอะไรได้ตอนนี้

1. A/Lead เลือก schema/API contract R1; B เตรียม interfaces/tests บน source เดียวกัน
2. เพื่อน E ออกแบบหน้าข้างต้นได้ทันทีโดยไม่ต้องออกแบบขนส่งเป็นบัญชีอีก role
3. เมื่อ R1 ส่งมอบ B ทำ R2 → R3 → R4; E รับ concrete API/head แล้วต่อ UI
4. R6 review/รวม → F runtime/APK/เครื่องจริง/เอกสารพรีเซนต์ เป้าหมาย freeze 6 ต.ค. และตรวจจริง 7 ต.ค. เป็นเป้าหมายเวลา ไม่ใช่ผลผ่านแล้ว

ยังไม่แก้ app code, ยังไม่ apply migration และยังไม่เปลี่ยน server ที่เปิดอยู่ในขั้น planning นี้ ดู [สถานะงาน](../coordination/EXTERNAL-SHIPPING-STATE.json)
