# INSPECT-01 — แผนฐานข้อมูลขนส่ง งานตรวจ และหลักฐาน

สถานะ: แผนสำหรับ DB1/DB2, 23 กันยายน 2026

Issue: [INSPECT-01 #56](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/56)

สัญญาที่ใช้: [INSPECT-00 #54](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/54) ฉบับ Lead v1 ลงวันที่ 23 กันยายน 2026 และ `doc/orders/contract.md`

## ผลลัพธ์ที่ต้องส่งมอบ

Migration และ SQLAlchemy models ที่เก็บการส่งเข้าศูนย์ การรับของ งานตรวจ ผลสุดท้ายหนึ่งชุดต่อ Order และรูปหลักฐาน พร้อม constraint, index, RLS, fixture ทดสอบ และรายงานตรวจ migration บน PostgreSQL แยก งานนี้ไม่เปิด Inspect API และไม่เชื่อม CERT ใน production; INSPECT-02/03 และ CERT จะใช้ตารางที่เตรียมไว้ต่อ

หมายเหตุสำคัญ: INSPECT-00 ยังเปิดรอทีมทบทวนอยู่ จึงให้ DB1 ตรวจ revision ของ #54 ก่อนเริ่มเขียน migration และทวนอีกครั้งก่อน merge หากสัญญาเปลี่ยน ให้แก้แผนและ migration ใน PR เดียวกัน ห้ามใช้ร่างเก่าที่ใช้ `order_item_id`, ผล `PASSED/NOT_AUTHENTIC/INCONCLUSIVE` หรือออก CERT ภายหลังแบบ async เพราะขัดกับ #54

## ข้อมูลตั้งต้นที่ตรวจแล้ว

- ปัจจุบัน Order หนึ่งรายการมีสินค้าหนึ่งชิ้น ใช้ `orders.id` เป็น integer; ไม่มี `order_items`
- `orders.status` และ CHECK มีเพียง `WAITING_PAYMENT`, `WAITING_SELLER_SHIP`; การจ่ายสำเร็จมี `payments` และ `escrows.status=HELD`
- Migration head ที่ตรวจใน branch นี้คือ `9446ec1a2c5d`; ก่อนลงมือ DB1 ต้องรัน `alembic heads` อีกครั้ง เผื่อมี PR ใหม่ merge
- `GET /orders` และ detail สร้าง Pydantic `OrderStatus` จาก DB; ฝั่ง Mobile จำกัด enum สองค่า จึงอ่านสถานะใหม่ไม่ได้จน BE/FE ปรับ
- `backend/app/models/verification.py` เป็นข้อมูลยืนยันตัวตนผู้ขาย ห้ามนำมาใช้แทน `inspections`

## แบบตารางและ constraint

| ตาราง | ฟิลด์หลัก | ข้อบังคับที่ DB ต้อง enforce |
|---|---|---|
| `shipments` | `id`, `order_id`, `leg`, `status`, `carrier`, `tracking_number`, `shipped_at`, `received_at`, `received_by`, `received_note` | FK ไป orders/users; UNIQUE `(order_id, leg)`; `leg=TO_CENTER` สำหรับรอบนี้; status `IN_TRANSIT/DELIVERED`; carrier/tracking trim แล้ว 1–100 ตัว; `DELIVERED` ต้องมี received_at/by พร้อมกัน, `IN_TRANSIT` ต้องยังไม่มีทั้งสอง |
| `inspections` | `id`, `order_id`, `inspector_id`, `started_at`, `result`, `summary`, `inspected_at`, `created_at` | UNIQUE `order_id`; FK ไป orders/users; UNIQUE `(id, order_id)` สำหรับ CERT composite FK; result เป็น null หรือ `PASS`, `MINOR_ISSUE`, `NOT_AS_DESCRIBED`, `FAKE`; result/summary/inspected_at เป็น null พร้อมกันหรือครบพร้อมกัน; ผลสุดท้ายต้องมี inspector_id/started_at |
| `inspection_evidence` | `id`, `inspection_id`, `object_key`, `mime_type`, `size_bytes`, `sha256`, `uploaded_by`, `uploaded_at` | FK ไป inspections/users; UNIQUE `object_key`; MIME เป็น JPEG/PNG/WebP, size 1–5,242,880 bytes; SHA-256 รูปแบบ 64 ตัวอักษร hex; ห้ามเก็บ URL สาธารณะ |
| `inspection_result_evidence` | `inspection_id`, `evidence_id` | ตารางเชื่อมรูปที่ถูกเลือกเป็นผลสุดท้าย; PK คู่นี้และ composite FK ไป `(inspection_id, evidence_id)` ของ inspection_evidence เพื่อกันรูปข้ามงาน; BE ตรวจจำนวน 1–5 และบันทึกพร้อมผลใน transaction เดียว |
| `inspection_idempotency` | `order_id`, `actor_id`, `operation`, `idempotency_key`, `request_hash`, `response_status`, `response_body`, `created_at` | FK ไป orders/users; UNIQUE `(order_id, actor_id, operation, idempotency_key)`; key 8–100 ตัวตาม Order contract; เก็บผลสำเร็จพร้อม mutation ใน transaction เดียว; เป็นฐานให้ INSPECT-02/03 ทำ replay ไม่สร้างข้อมูลซ้ำ |

รายละเอียดที่ต้องออกแบบใน migration/model:

- เพิ่ม UNIQUE `(id, inspection_id)` ที่ `inspection_evidence` เพื่อรองรับ composite FK ของรูปผลสุดท้าย
- `inspection_result_evidence` ไม่ใช่รูปอัปโหลดทั้งหมด: Buyer จะเห็นเฉพาะรูปที่เลือกเมื่อผลสุดท้ายบันทึกสำเร็จ ต้องมี association นี้เพื่อไม่เปิดรูปค้างหรือรูปที่ไม่ได้เลือก
- เพิ่ม index สำหรับคิว Inspector บน `orders(status, created_at, id)` และ `inspections(inspector_id, created_at, id)` รวมถึง `shipments(order_id)`/`inspection_evidence(inspection_id)` ตาม query จริง; ไม่สร้าง index ซ้ำกับ UNIQUE โดยไม่จำเป็น
- จำกัดความยาวคอลัมน์ตาม #54: `summary` 10–2000 ตัวหลัง trim, `received_note` ไม่เกิน 1000, `carrier`/`tracking_number` 1–100; DB CHECK รองรับข้อมูลตรงพื้นฐาน ส่วนข้อความละเอียดและการ trim ให้ BE ตรวจด้วย
- ห้ามมี final result ก่อน `started_at`; `started_at` ต้องมี `inspector_id`; รูปผลสุดท้ายต้องผูกกับ inspection เดียวกันด้วย FK. การตรวจว่ามี payment+escrow, Order อยู่สถานะถูกต้อง, รูปครบ 1–5 และการเปลี่ยนหลายตารางพร้อมกันเป็นหน้าที่ service ภายใต้ Order row lock เพราะ CHECK ในตารางเดียวบังคับข้ามตารางไม่ได้
- ไม่เก็บ `seller_id`, `buyer_id`, `product_id`, order item หรือ product snapshot ซ้ำใน inspection เพราะ Order มีข้อมูลนี้อยู่แล้ว เว้นแต่ CERT-01 กำหนดข้อจำเป็นที่พิสูจน์ได้
- เปิด RLS สำหรับทุกตารางใหม่ใน `public` โดยไม่มี anon/authenticated policy; ให้ Backend ที่มีสิทธิ์ฐานข้อมูลเป็นทางผ่าน ตรวจการอ่านตรงด้วย role ทดสอบที่ไม่ใช่ owner

## ขยาย Order status

แก้ `ORDER_STATUSES` ใน model และ CHECK ใน migration โดยคงสองค่าเดิม แล้วเพิ่ม:

`SHIPPING_TO_CENTER`, `RECEIVED_AT_CENTER`, `INSPECTING`, `RESULT_NOTIFIED`

Schema DB ไม่อนุญาตสถานะอื่น. ตอน upgrade ต้อง drop CHECK เดิมแล้วสร้าง CHECK ใหม่โดยไม่แก้ข้อมูล Order เดิม; ตรวจว่า Order เดิมยังอ่านได้และจ่ายจำลองยังทำงาน. ตอน downgrade ให้ตรวจว่ามี Order ที่ใช้สถานะใหม่หรือมีข้อมูล Inspect หรือไม่; ถ้ามีให้หยุดด้วย error อธิบายว่าต้องย้าย/สำรองข้อมูลก่อน ไม่แปลงสถานะกลับโดยเงียบ ๆ ห้ามทดลอง downgrade บนฐานข้อมูลกลาง

DB1 ส่งรายการการเปลี่ยนสัญญาให้ BE/FE ใช้ใน INSPECT-02/04/05: backend `OrderStatus`, serializer และ Mobile enum/labels ต้องรู้จักค่าใหม่ก่อน deploy path ที่เปลี่ยนสถานะจริง โดยเฉพาะ `order_view` ที่ปัจจุบันให้ `shipping_address` แก่ Seller เฉพาะ `WAITING_SELLER_SHIP` ต้องรักษาสิทธิ์หลังเปลี่ยนเป็น `SHIPPING_TO_CENTER` ตามการใช้งาน; ไม่แก้ API/Mobile ใน PR ฐานข้อมูลโดยไม่มีการทดสอบทั้งฝั่ง

## ลำดับลงมือ

1. DB1 ตรวจ branch, worktree, #54/#56, `alembic heads`, model Order และรูปแบบ migration/RLS ล่าสุด แล้วบันทึก revision ต้นทางใน PR
2. เพิ่ม migration ใหม่ต่อจาก head ปัจจุบัน: ขยาย CHECK Order, สร้างตาราง/constraint/FK/index, เปิด RLS; ไม่แก้ migration Order เดิมที่เคยใช้งานแล้ว
3. เพิ่ม `backend/app/models/shipment.py`, `inspection.py` และ model หลักฐาน/ความสัมพันธ์/idempotency ตามโครงสร้างข้อบน; import ใน `app.models.__init__` เพื่อให้ Alembic เห็น metadata; ค่า constraint ใน model ต้องตรง migration
4. เขียน fixture factory/test-data แบบ synthetic สร้าง Buyer/Seller/Inspector/Order ที่จ่ายสำเร็จและ Escrow HELD บน DB ทดสอบเท่านั้น สร้าง Order แยกสำหรับแต่ละสถานะและ 4 ผล; rerun ต้องได้ชุดเดิมโดยไม่ล้างข้อมูลทีม (ใช้ alias/namespace คงที่, lookup/upsert ภายใต้ unique key; ห้ามอ้างอีเมลจริง)
5. DB2 ทดสอบ migration บน PostgreSQL แยกตั้งแต่ revision ก่อนหน้า → head ใหม่ → downgrade → upgrade กับข้อมูลสมมติและ Order เดิม; ตรวจ SQL, constraints, RLS, indexes, metadata และ Alembic single head
6. DB1/DB2 บันทึกผลตรวจ, migration revision, คำสั่งที่รัน, ขั้นตอน deploy/rollback และผู้รับผิดชอบนำขึ้นฐานข้อมูลกลางใน PR/เอกสาร handoff; การนำขึ้นฐานข้อมูลกลางเป็นงาน deploy แยกหลังผ่านการตรวจ

## Tests ที่ต้องผ่าน

| กรณี | ผลที่คาด |
|---|---|
| Upgrade จากข้อมูล Order เดิม | Order/payment/escrow/receipt เดิมคงเดิม; status เดิมอ่านได้ |
| Order status ทั้ง 6 ค่าและค่าหลุด enum | ค่าอนุญาตบันทึกได้; ค่าอื่นถูก CHECK ปฏิเสธ |
| shipment ซ้ำ `(order_id, leg)`/อ้าง order หรือ user ไม่อยู่ | UNIQUE/FK ปฏิเสธ |
| shipment DELIVERED แต่ไม่มี received_by/at หรือ IN_TRANSIT มีข้อมูลรับของ | CHECK ปฏิเสธ |
| inspection ซ้ำ Order / อ้าง FK ที่ไม่มี / result นอก 4 ค่า | UNIQUE/FK/CHECK ปฏิเสธ |
| result ครึ่งชุด เช่น มี result แต่ไม่มี summary หรือ inspected_at | CHECK ปฏิเสธ |
| รูปซ้ำ object_key / ขนาด 0 หรือ >5 MiB / MIME ผิด / FK ผิด | UNIQUE/CHECK/FK ปฏิเสธ |
| เลือกรูปจาก inspection อื่นเป็นรูปผล | composite FK ปฏิเสธ |
| คีย์ idempotency scope เดิมซ้ำ | UNIQUE ปฏิเสธ; คน/งาน/operation อื่นไม่ชนกัน |
| สอง transaction สร้าง shipment/inspection หรือ final result ของ Order เดียวกันพร้อมกัน | commit สำเร็จได้อย่างมากหนึ่งชุด; อีกคำขอได้ constraint failure ที่ BE จะแปลงเป็น replay หรือ 409 ตาม key/state |
| RLS ด้วย anon/authenticated | อ่านและเขียนตรงไม่ได้; Backend role ยังเข้าถึงได้ตามแผน deployment |
| fixture รัน 2 รอบ | จำนวน Order/shipment/inspection/evidence/result เท่าเดิม ไม่แตะข้อมูลทีม |
| downgrade บนฐานทดสอบว่างและฐานที่มีข้อมูลใหม่ | ว่างทำได้; มีข้อมูลใหม่หยุดอย่างชัดเจน ไม่ลบข้อมูลเงียบ ๆ |

แยก test ของ DB จริงจาก SQLite เพราะ RLS, composite FK, DDL และ race สำคัญของงานนี้ต้องพิสูจน์บน PostgreSQL. ไม่ใช้ Supabase กลางเป็น `TEST_DATABASE_URL` และไม่ล้างข้อมูลกลาง

## เกณฑ์ปิด INSPECT-01

- [ ] Model/migration เก็บและอ่านข้อมูลครบตาม INSPECT-00 revision ที่ Lead ยืนยัน
- [ ] Constraint/FK/UNIQUE/RLS ปฏิเสธข้อมูลอ้างอิงไม่มีจริงและข้อมูลซ้ำตามตารางด้านบน
- [ ] PostgreSQL แยกผ่าน migration และ regression ของ Order เดิม; DB2 ตรวจและมีผู้รับผิดชอบ deploy ที่ระบุชื่อ
- [ ] Fixture ทั้งสถานะและผล 4 ค่า rerun ได้โดยไม่ล้างข้อมูลทีม
- [ ] จุดเชื่อม BE/FE/CERT ที่ต้องปรับถูกส่งต่อใน PR/issue ต่อเนื่อง

ขอบเขตเปิดค้างจาก #54: Lead ยังต้องให้ FE/BE/DB/QA ทบทวนสัญญาก่อนปิด INSPECT-00. DB1 เริ่มทำ schema ตามร่างนี้ได้ แต่ห้ามอ้างว่า INSPECT-01 ผ่านเกณฑ์ “ตรงตาม #54” จน revision สุดท้ายได้รับการยืนยัน
