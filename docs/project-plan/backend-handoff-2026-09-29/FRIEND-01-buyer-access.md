# F1 — Seller-as-buyer ใน INSPECT/CERT

เจ้าของ: เพื่อน Backend/CERT คนเดียว; ประสาน PR #112/#104 รหัสนี้เป็นงานเสนอ ไม่ใช่ Issue ที่สร้างแล้ว

ชื่อ Issue หาก Lead เลือกเปิด: `[Backend] รองรับ Seller-as-buyer ในผลตรวจ การตัดสินใจ และหลักฐานส่วนตัว`

## เริ่มงาน

อ่าน CONTEXT.md ฐาน: PR #112 commit `5e54428fbb46c616b51d14d18e9ddf17bc9f9174` ใน checkout แยก ทำ implementation ตอนนี้ได้ ไม่ต้องรอ UI ห้ามแก้ a234/mobile/migrations และห้ามรวม Wondee/CERT ทั้ง stack ใน task นี้

## Implementation prompt

```text
ทำ F1 ให้ครบจากฐาน CERT #112 ที่ระบุใน CONTEXT ตรวจ source ล่าสุดก่อนแก้
เป้าหมายคือบัญชี BUYER หรือ SELLER ที่เป็น order.buyer_id ต้องใช้เส้นทางผู้ซื้อ
ใน INSPECT/CERT ตาม account/status policy เดียวกันได้ โดยไม่มีการมอบสิทธิ์ให้คนอื่น

ตรวจ buyer result read, decision CONFIRM/REJECT, fresh-account recheck หลัง Order lock,
inspection evidence และ shipment proof read รวม helper viewer_role_for/load_order_for
ที่เรียกใช้ หาก helper มี role restriction เก่าที่บล็อก owner ให้แก้แบบแคบพร้อม tests
อย่าเปลี่ยน global staff/inspector/courier guard เพื่อให้ tests ผ่าน

ผลตรวจสาธารณะยังไม่เผย private evidence; Seller ของสินค้าที่ไม่ใช่ order.buyer_id
ยังไม่ได้สิทธิ์ดูผล/ตัดสินใจฝั่งผู้ซื้อ การซื้อสินค้าตัวเองยังถูกปฏิเสธ
รักษา one-time decision, normalized replay/conflict, certificate eligibility/revocation,
permission freshness และประวัติผลตรวจหลัง Order เดินหน้า ไม่แก้สถานะ/เงิน/Shipment จาก CERT

สำหรับ inactive account รักษา historical-read policy ตาม contract เดิมแต่ละ endpoint
และปฏิเสธ mutation/replay ที่ไม่มีสิทธิ์หลัง refresh ผู้ใช้ ให้บันทึก policy table ชัดเจน
รวมกรณีบัญชี BUYER ถูก promote เป็น SELLER หลังซื้อ ซึ่งต้องไม่ทำประวัติซื้อหาย

เพิ่ม regression ที่พิสูจน์ fail บน base และ pass บน fix โดยเฉพาะ Seller-as-buyer
ใช้ PostgreSQL แยกพิสูจน์ decision concurrency/account-change under lock
ทดสอบ regression ที่เกี่ยวข้อง แล้วส่ง scoped patch/commit และรายงาน
ถ้าฐานใหม่แก้แล้วให้ตรวจผลและรายงาน verified/no change ไม่สร้าง code ซ้ำ
```

## ขอบเขตไฟล์

- แก้ `backend/app/api/inspections.py`, helper ownership ใน `backend/app/api/orders.py` เท่าที่จำเป็น, helper permission ใหม่ถ้าทำให้เงื่อนไขเดียวกันชัดขึ้น
- เพิ่ม/แก้ focused backend tests เช่น `test_inspection_flow_postgres.py` หรือ test file เฉพาะ buyer access
- เอกสาร `doc/cert-04-buyer-decision.md` และรายงาน `doc/handoff/F1-buyer-access-report.md`
- ไม่เปลี่ยน schema, migration, signup/verification workflow, response shape หรือ error contract โดยไม่จำเป็น ถ้าต้องเปลี่ยน contract จริงให้อธิบาย consumer impact ให้ L1

Session เดิมกำลังเพิ่มรูปสินค้าใน Order API/schema/tests ตาม CONTEXT ให้เก็บงานส่วนนี้กับเจ้าของเดิม F1 แตะ Order helper เฉพาะ ownership ที่จำเป็น และส่งเป็น delta บนฐานที่ระบุให้ L1 รวมภายหลัง

## Acceptance

- [ ] BUYER owner และ SELLER owner อ่านผล/selected evidence/หลักฐานส่งที่ endpoint อนุญาตได้
- [ ] Owner ที่ promote BUYER→SELLER หลังซื้อยังใช้สิทธิ์ใน Order เดิมได้
- [ ] Active BUYER/SELLER owner CONFIRM/REJECT ผลที่อนุญาตได้; decision เดียวต่อ Order
- [ ] Replay คำตอบเดิมไม่เพิ่ม record; เปลี่ยนคำตอบ/เหตุผล conflict; negative/revoked/missing certificate ไม่เกิด decision ใหม่
- [ ] Seller ผู้ขายของ Order, คนอื่น, anonymous และ staff ที่ไม่ใช่ผู้ซื้อไม่ได้ private buyer capability
- [ ] Suspension/role change ระหว่าง request กับ lock ถูก recheck; บทบาท ADMIN/INSPECTOR/COURIER ไม่ถูกเปิดให้ตัดสินใจ
- [ ] สิทธิ์ Inspector/Courier เดิม, ประวัติผลตรวจ และ no-store behavior ยังตรง contract
- [ ] ไม่มี Shipment/Payment/Escrow mutation เพิ่มจากการตัดสินใจ
- [ ] ไม่มี diff ใน mobile หรือ migrations

## ส่งกลับ

Base/head, branch, patch/commit เฉพาะ F1, policy matrix ของแต่ละ endpoint, คำสั่งและผลทดสอบ, API examples ที่เป็น synthetic และรายการ integration tests ที่ L1/F3 ต้องตรวจบน Wondee จริง

งานจบระดับ F1 เมื่อ patch/tests ผ่านบนฐาน CERT และมี handoff; การใช้ร่วมกับ Wondee เป็น gate L1/F3 ไม่อ้างว่าผ่านจาก branch CERT อย่างเดียว
