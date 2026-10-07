# F2 — recurring worker หมดเวลาจ่ายและปลดจอง

เจ้าของ: เพื่อน Backend; เริ่มคู่กับ F1 ได้ ฐาน PR #113 `9a3313757675848fe542085e3173fd5ea34fd445`

ชื่อ Issue ที่เสนอ: `ORDER-EXPIRY-01 — worker ยกเลิก unpaid Order และปลดจองโดยไม่รอ API traffic` เป็นส่วน unpaid ของ ORDER-08/TIMER-01 ไม่ปิด TIMER-01 ทั้ง feature

## Implementation prompt

```text
อ่าน CONTEXT แล้ว implement F2 ใน checkout/worktree แยกจากฐาน #113
ตรวจ service order_expiry.py, release_expired_orders.py, cancellation/payment locking
และ PostgreSQL tests ก่อนแก้ ใช้ business logic เดียวกับ API ห้ามทำสำเนากติกาอีกชุด

ทำ command/runner ที่สแกน unpaid Order ครบกำหนดทุก 5 นาที และสแกนทันทีเมื่อเริ่ม/restart
รองรับ single run สำหรับ automation และ recurring mode ที่หยุดอย่างเรียบร้อยได้
dry-run เป็นค่าเริ่มต้น; mutation ต้อง explicit apply และ target/environment guard ชัดเจน
ตรวจค่าฐานทดสอบ/target ที่เลือก ไม่พิมพ์ URL/password หรือใช้ frontend .env โดยอัตโนมัติ

ใช้เวลาจาก server และ persisted expires_at: WAITING_PAYMENT ที่หมดอายุเท่านั้น
ต้องไม่ยกเลิก paid Order หรือปลดสินค้าที่มี valid active Order ผูกอยู่
ยกเลิกด้วย CANCELLED+EXPIRED และปลดจองใน transaction เดียว
อ่านและรอ row locks อย่างถูกต้องแล้ว recheck เมื่อแข่งกับ payment/cancel/worker อื่น

ทำ bounded batches ค่าเริ่มต้น 100 ลำดับ deterministic และล็อกที่ปลอดภัยกับหลาย worker
หนึ่งรายการล้มเหลวต้องมี rollback/retry/report และไม่ทำให้รายการอื่นค้างถาวร
ห้ามเรียก helper ที่ commit เองในขณะถือ lock แล้วสมมติว่า lock ยังอยู่
ปรับ API service อย่างแคบได้ถ้าจำเป็นเพื่อ reuse โดยรักษา callers เดิม

เก็บ scan/eligible/cancelled/failed counts และออกสถานะผิดพลาดให้ operator เห็น
แยก orphan repair ใน script เดิมออกจาก automatic worker อย่าเปิด cleanup กว้างโดยปริยาย
เตรียม runbook/ตัวอย่าง deployment แต่ไม่ติดตั้ง scheduler หรือรันกับบริการ/ฐานของทีม

ไม่ทำ seller-no-ship refund, 72h auto-release, FINISH settlement หรือเพิ่ม state การเงิน
พิสูจน์ no-HTTP worker, repeat/restart, expiry boundary, race และ rollback ด้วย PostgreSQL แยก
ส่ง implementation ที่ตรวจได้พร้อม tests/runbook ไม่หยุดแค่เสนอให้ใช้ cron
```

## ขอบเขตไฟล์

- `backend/app/services/order_expiry.py`, `backend/scripts/release_expired_orders.py` และ worker module ใหม่ที่เกี่ยวข้อง
- `backend/app/api/orders.py`/`product_reads.py` เฉพาะปรับการเรียก service ถ้าจำเป็น ไม่เปลี่ยน public API contract
- tests เฉพาะ worker/expiry และ regression ของ Order/Product ที่ได้รับผล
- `doc/handoff/F2-unpaid-expiry-report.md` และ runbook ใต้ `doc/orders/`
- ไม่แก้ `inspections.py`, CERT, mobile, migrations หรือ global test fixtures โดยไม่จำเป็น

Session เดิมกำลังแก้ Order image serialization/schema/tests ตาม CONTEXT ห้ามแก้ส่วนนั้นใน F2; service/worker เป็นขอบเขตหลัก และ L1 จะรวมกับ commit ล่าสุดของเจ้าของเดิม

## Acceptance

- [ ] ไม่มี HTTP request ก็ยกเลิก/ปลดจองรายการ eligible ได้
- [ ] ก่อน deadline ไม่เปลี่ยน; ณ/หลัง deadline เปลี่ยนได้ตาม server predicate
- [ ] เกินหนึ่ง batch ทำต่อได้; crash/restart ตามรายการค้างได้
- [ ] Worker สองตัว / worker vs payment / worker vs cancel มีผลถูกต้องหนึ่งครั้ง ไม่มี paid order ถูกยกเลิก
- [ ] Inject failure ระหว่าง Order กับ Product update แล้ว rollback ทั้งคู่; retry ได้
- [ ] รายการผิดพลาดไม่ starve งานอื่น; log ไม่เผยข้อมูลส่วนตัว/credentials
- [ ] Dry-run/target guard/stop behavior ทดสอบแล้ว และไม่รัน orphan repair โดยปริยาย
- [ ] Existing API expiry, catalog reservation และ payment tests ที่เกี่ยวข้องผ่าน
- [ ] อธิบาย commit boundary ของ helper ที่แก้ และยืนยันไม่มี schema change

## ส่งกลับ

Local commit/patch, base/head, CLI usage ตัวอย่างที่มีแต่ localhost dummy credentials, test results, process/restart proof บนฐานแยก, failure/retry notes และขั้นตอน deployment สำหรับ L3 ที่ยังไม่ได้ apply
