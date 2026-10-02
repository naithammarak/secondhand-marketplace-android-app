# Final acceptance matrix

> **แผนแก้ล่าสุด 2 ต.ค.:** อ่าน [ขนส่งภายนอก + เงินคืน / R1–R6](changes/EXTERNAL-SHIPPING-03.md) ก่อน กติกานี้แทน Courier-required flow และคืนเต็มในกรณี Buyer ปฏิเสธ/หมดเวลาผลตรวจ; implementation และการปรับ traceability/QA ทุกกรณียังเป็นงานถัดไป หลักฐานผ่านกติกาเดิมไม่ใช่ผ่านกติกาใหม่

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
| Q06 | FR-13–15, 02/03/06 | Valid seller return snapshot ก่อน ship; เมื่อส่งแล้วเปลี่ยนไม่ได้; assigned Courier private proof + Inspector center receive จริง |
| Q07 | FR-16–18/20/21, INSPECT | PASS/MINOR_ISSUE result+certificate atomic; duplicate/retry ไม่ออกซ้ำ; negative ไม่มี certificate; Storage failure ไม่ทำผลสำเร็จปลอม |
| Q08 | FR-19/20, CERT #105/#106 | Owning Buyer ตัดสินผลครั้งเดียว; CONFIRM positive → TO_BUYER; REJECT positive/negative result → TO_SELLER; ไม่มี auto decision |
| Q09 | FR-22, 09/10/12 | QR เปิดจากอีกเครื่องไม่ login ใช้ HTTPS จริง; valid/invalid/revoked แสดงถูก; public data ไม่มี PII/private photo |
| Q10 | FINISH sale, 03/04/06 | Real Android journey: paid→center→inspection→CONFIRM→private TO_BUYER proof→physical receipt→COMPLETED/RELEASED/Product SOLD; Seller เห็น payout 1,140 จาก example held1,350 |
| Q11 | FINISH return, 03/04/06 | Real Android journey: Buyer REJECT หรือ negative→TO_SELLER frozen address→return proof→REFUNDED full1,350/Product CANCELLED; receipt charge เดิมยังอยู่ |
| Q12 | FINISH return retry, 03–05 | Inject failure หลัง return delivery commit: RETURNED_TO_SELLER+HELD durable; restart worker คืนเต็มครั้งเดียวโดยไม่ upload ใหม่ |
| Q13 | Receipt AUTO, 04/05 | ก่อน/ที่/หลัง confirmed Buyer proof+72h; proof readable; no report → one AUTO RELEASE; no HTTP; outage/recovery ไม่แสดงสำเร็จก่อน scan |
| Q14 | Non-receipt/Admin, 04/06 | Timely report → DISPUTED/HELD กัน AUTO; Admin scoped evidence+reason+audit resolve RELEASE/REFUND ครั้งเดียว; unrelated actor ถูกปฏิเสธ |
| Q15 | Deadline/race, 04/05 | Real PostgreSQL concurrent report-vs-auto/receipt-vs-refund; DB clock after lock boundary; pre-deadline request ที่รอ lock ข้าม deadline ถูก409; committed replayยังอ่านได้ |
| Q16 | Seller no ship, 03–05 | Paid+72h without timely shipment→full REFUND; timely committed shipmentกัน refund; late shipถูกปฏิเสธแม้ runnerหยุด |
| Q17 | Exactly once, 02/04/05 | Independent connections release-vs-refund/double release/refund; unique/FK/money constraints; original Payment/Receipt immutable; one terminal outcome |
| Q18 | Private evidence, 03/10 | Real Storage upload/read and another-user denial/expired access/unreadable object; selected proof IDsผูก leg/courier; public/role responsesไม่มี keys/PIIเกินสิทธิ์ |
| Q19 | TIMER-01, 05/10 | Scheduled runnerไม่มี HTTP, two workers/restart/retry bounded; inspection3workingdays escalation once ไม่สร้าง result/decision/refund |
| Q20 | Profile FR-03, 07 | Name save→reload/reloginบน APK/API persists; injection/IDOR/invalid/inactive rejected; email/role/status readonly; account switchไม่ใช้cacheเก่า |
| Q21 | Privacy NFR-05 revised, 07 | Policyอ่านได้; acknowledgementversion/time persisted/replaystable; legacyไม่มีfakeaccept; ไม่มีปุ่มหรือคำสัญญาdelete/export/photo reuseที่ไม่ได้ทำ |
| Q22 | Reviews FR-37 revised, 08 | Owned completed RELEASE Order→one review→reload/public modal; duplicate/concurrent rejected; pending/refunded/foreign/inactiveไม่ผ่าน; SELLERที่ซื้อ reviewได้ |
| Q23 | Public reviews, 08 | Count/average/distribution/paginationถูก; zero = no rating; no mocked4.8/count29; public reviewerไม่มีrealname/ids/address; inputเป็นsafe text |
| Q24 | Revoke FR-23, 09 | Admin UI/API revokeจริงพร้อมreason/audit; nonAdmindenied; same-keyreplay; publicQR/native updated; no settlement/resultrewrite |
| Q25 | Migration/runtime, 01/02/07/08/10 | One Alembic head; supported predecessor data preserved; isolated backup/restore/constraint tests; shared rolloutที่จำเป็นมีapprovalและactual revision evidence |
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
