# Final acceptance matrix

> **Backend candidate 2 ต.ค.:** R1–R4 ใช้ `EXTERNAL_V2` สำหรับ Order ใหม่และคง `LEGACY_V1` สำหรับข้อมูลเดิม ดู [API mapping](reports/EXTERNAL-SHIPPING-API-MAPPING.md) และ [รายงาน R1](reports/EXTERNAL-SHIPPING-R1.md) ผล local PostgreSQL ไม่ใช่ independent PASS, E UI, shared rollout หรือ Android acceptance

**ทุกแถวเป็นเกณฑ์ตรวจรับ ยังไม่ใช่ผล PASS** · วันที่เตรียม 1 ต.ค. 2026

บันทึกผลลง `reports/11-QA-01.md` และ TEST-REPORT สำหรับ release เดียวกัน: app/API SHA, migration head, APK hash, environment, เวลา, role, วิธีทดสอบและ evidence path ต้องระบุครบ ใช้ synthetic data บน target ที่อนุญาตเท่านั้น

## บังคับก่อนพร้อมส่ง

| Case | Requirement / task | หลักฐานที่ต้องมี |
|---|---|---|
| Q01 | FR-01/02/08/09, 01/12 | Android cold launch ไม่ต้อง Metro; guest browse/search/detail ใช้ API; ซื้อแล้วจึงขอ login |
| Q02 | FR-01/02/04, 01/07 | Google login จริงบน APK → BUYER ใหม่; profile ขอ SELLER → Admin approve; approved SELLER ยังซื้อได้; client เลือก ADMIN ไม่ได้ |
| Q03 | FR-05/06/07, PRODUCT #49/#50 | Approved Seller ลง/แก้/ยกเลิกตามสถานะ, private upload/ข้อจำกัดไฟล์จริง; Buyer ทำแทนไม่ได้; reserved stock ไม่เปิดซื้อผิดสถานะ |
| Q04 | FR-10–12/26, 01 | Buyer quote/create/payment จำลอง persisted; original receipt และ HELD total ถูก; retry/timeout/account switch ไม่จ่ายหรือสร้างซ้ำ |
| Q05 | NFR-10, ORDER #63/#65, 05 | Unpaid หมด 30 นาทีไม่มี HTTP; cancel/expiry/concurrent buyer กันซื้อสินค้าซ้ำและคืนสถานะถูก |
| Q06 | FR-13–15, 02/03/06 | Validated frozen Seller return snapshot; new TO_CENTER carrier/tracking and authorized actual Inspector receipt without Courier account/photo; legacy Courier contract preserved; client cannot select destination. |
| Q07 | FR-16–18/20/21, INSPECT | PASS/MINOR_ISSUE result+certificate atomic; duplicate/retry ไม่ออกซ้ำ; negative ไม่มี certificate; Storage failure ไม่ทำผลสำเร็จปลอม |
| Q08 | FR-19/20, CERT #105/#106 | Positive atomic availability+72h: owning Buyer CONFIRM/REJECT before cutoff; at/after reject; SYSTEM silence timeout permits only return with no fabricated decision/dispatch/money. Negative returns directly; committed replay stays readable. |
| Q09 | FR-22, 09/10/12 | QR เปิดจากอีกเครื่องไม่ login ใช้ HTTPS จริง; valid/invalid/revoked แสดงถูก; public data ไม่มี PII/private photo |
| Q10 | FINISH sale, 03/04/06 | Real Android new-policy sale: paid→center receipt→inspection→timely CONFIRM→Inspector TO_BUYER→actual Buyer receipt without mandatory carrier event→COMPLETED/RELEASED/SOLD; 5% commission and payout1,140; persisted C review and D revoke. |
| Q11 | FINISH return, 03/04/06 | Real Android new-policy rejection and silence each→frozen TO_SELLER→actual Seller or audited Admin return receipt→refund1,200 retained100/50. Negative returns refund full1,350; no return-carrier event alone refunds; original receipt unchanged; refund forbids review. |
| Q12 | FINISH return retry, 03–05 | Failure after durable actual return: RETURNED_TO_SELLER+HELD pending; restart/retry uses persisted policy/cause once. Bad allocation rolls back financial facts while keeping receipt; no duplicate fees or new upload. |
| Q13 | Receipt AUTO, 04/05 | Tracking alone never starts new AUTO; trusted Admin demo TO_BUYER event server time+72h; before/at/after cutoff; no report→one RELEASE without HTTP. Legacy readable-proof behavior preserved; worker outage remains pending. |
| Q14 | Non-receipt/Admin, 04/06 | Report after dispatch even before transport event→DISPUTED/HELD blocks later AUTO. Admin requires scoped same-case evidence/reason/audit; return confirmation exception is distinct from non-receipt resolution; wrong actors denied. |
| Q15 | Deadline/race, 04/05 | Real independent PostgreSQL locks: decision/receipt/report waiting across cutoff fails with fresh DB clock; CONFIRM-vs-timeout chooses one outcome/leg; receipt/report/AUTO/two-worker races and committed replay checked. |
| Q16 | Seller no ship, 03–05 | Paid+72h without timely shipment→full REFUND; timely committed shipmentกัน refund; late shipถูกปฏิเสธแม้ runnerหยุด |
| Q17 | Exactly once, 02/04/05 | One settlement; FK/policy/event/recipient/destination/allocation constraints reject invalid writes; held=refund+retained fees or release allocations; immutable original Payment/Receipt; no synthetic terminal journey evidence. |
| Q18 | Private evidence, 03/10 | Private inspection/identity and legacy proof Storage guards remain. New Admin demo event identity/source/leg/time cannot be forged/moved/backdated; default-deny event table; role/public reads redact addresses, fees and private audit notes. |
| Q19 | TIMER-01, 05/10 | Six bounded no-HTTP jobs with durable ownership/cursor fairness/restart/dry-run. Result timeout ID6 preserves prior IDs1–5, adds no Buyer decision/dispatch/settlement; inspection3workingdays escalates only. Runtime schedule activation separately evidenced. |
| Q20 | Profile FR-03, 07 | Name save→reload/reloginบน APK/API persists; injection/IDOR/invalid/inactive rejected; email/role/status readonly; account switchไม่ใช้cacheเก่า |
| Q21 | Privacy NFR-05 revised, 07 | Policyอ่านได้; acknowledgementversion/time persisted/replaystable; legacyไม่มีfakeaccept; ไม่มีปุ่มหรือคำสัญญาdelete/export/photo reuseที่ไม่ได้ทำ |
| Q22 | Reviews FR-37 revised, 08 | Owned completed RELEASE Order→one review→reload/public modal; duplicate/concurrent rejected; pending/refunded/foreign/inactiveไม่ผ่าน; SELLERที่ซื้อ reviewได้ |
| Q23 | Public reviews, 08 | Count/average/distribution/paginationถูก; zero = no rating; no mocked4.8/count29; public reviewerไม่มีrealname/ids/address; inputเป็นsafe text |
| Q24 | Revoke FR-23, 09 | Admin UI/API revokeจริงพร้อมreason/audit; nonAdmindenied; same-keyreplay; publicQR/native updated; no settlement/resultrewrite |
| Q25 | Migration/runtime, 01/02/07/08/10 | One head r01e20261002; actual legacy sale/refund/review/revoke data preserved; safe downgrade/re-upgrade with legacy-only data, explicit refusal with new data; isolated constraint/access checks; shared rollout has separate approval/evidence. |
| Q26 | APK NFR-06, 12 | Final APK package/version/hash/source/API matches manifest; cold launch/relogin/camera/gallery/back/keyboardบนจริง; screen5–7inch usable |
| Q27 | Handover, 13 | Setup/user guide, SRS+diagrams, test report, actualAPK, demo fixtures, PPTX/PDF/script/backup recording/rehearsalมีและชี้releaseเดียวกัน |
| Q28 | Scope acknowledgement, 00/13 | แจ้ง scope revision ที่ต่างจาก SRS เดิมให้อาจารย์; บันทึก accepted/pendingตามจริง; slideข้อจำกัดตรงกับสิ่งส่ง |

Q10/Q11ต้อง Android จริง ส่วน race/clock/failure cases ใช้ isolated PostgreSQL และ deterministic clock/adapter ได้ แต่ Q18/Google/QR ยังต้อง real service evidence อย่ารวมสองประเภทเป็น PASS เดียวเมื่อทำเพียงประเภทแรก

## Readiness decision

- Q01–Q26 เป็น technical gate ของ task11 หลัง APK candidate จาก task12; เมื่อผ่านให้ส่งต่อ task13 เป็น **TECHNICAL_READY_HANDOVER_PENDING** ไม่ต้องรอ slides ที่ task13 ยังไม่ได้ทำ
- Q27/Q28 เป็น final gate ของ task13/Lead; หลังจัด artifact และรับทราบ scope จึงรวมผลทั้งหมดเพื่อ READY ทั้งชุด
- **READY:** mandatory casesผ่านบน final candidate + finalAPK; teacher scope dispositionชัดตามเงื่อนไขส่งของวิชา
- **NOT_READY:** core flow/financial safety/private access/native buildล้มเหลว หรือ mandatoryintegrationยัง NOT_RUN/BLOCKED
- **Implementation complete, acceptance pending:** ใช้เมื่อ code/testsครบแต่ยังไม่มี actualdevice/service evidence ห้ามใช้แทน READY

Issue IDs ใน matrixเป็น acceptance follow-up จากแผนเดิม ตรวจ issue/currentPRจริงก่อนปิด งานเอกสารนี้ไม่ใช่การปิด issue
