# INSPECT-01 — แผนส่งต่อ implement agent

ผู้วางแผน: planer-inspect01 | วันที่: 2026-09-18

สถานะ: พร้อมส่งต่อเพื่อเตรียมงาน แต่ implementation ที่ขึ้นกับ schema/กติกาจริงต้องรอ INSPECT-00 #54 และ ORDER-01

## 1. หลักฐานและข้อจำกัด

- อ้างอิงงานต้นทาง: https://github.com/naithammarak/SA-Project/issues/54 และ `doc/inspect-contract.md` เวอร์ชัน 0.1 ซึ่งยังเป็นร่าง ไม่ใช่ข้อสรุปที่อนุมัติ
- อ่าน issue ผ่านเว็บไม่ได้ (404) จึงยังยืนยันรายละเอียดล่าสุดหรือการปิด #54 ไม่ได้; ยังไม่พบ ORDER-01 หรือ Order model ใน checkout นี้
- Backend ใช้ SQLAlchemy 2, Alembic และ PostgreSQL; users/products ใช้ integer ID
- `verifications` เป็นการยืนยันตัวตน ไม่ใช่ตารางตรวจสินค้า
- `app/models/__init__.py` และ `migrations/env.py` ปัจจุบันโหลดเพียง User/TestMessage จึงต้องจัดให้ metadata เห็น models และตารางที่อ้างอิงครบก่อน autogenerate
- `tests/test_user_migration.py` ผูก head กับ user revision เก่าและมี teardown ล้างฐานทดสอบ ห้ามนำ workflow นี้ไปใช้กับฐานข้อมูลทีม

## 2. เงื่อนไขก่อนเริ่ม implementation

ให้ implement agent บันทึกคำตอบพร้อมอ้างอิง contract/commit ที่อนุมัติใน PR:

1. Lead ปิดข้อตกลง #54: หน่วยตรวจ, enum สถานะ/ผล 4 ประเภท, reason, หลักฐาน, การโอนผู้ตรวจ, การแก้ผล และกติกาข้อมูลซ้ำ
2. ORDER-01 ส่งมอบ model/migration ที่ merge แล้ว: ชื่อตาราง/PK ของ order และ order item, ความสัมพันธ์สินค้า/ผู้ขาย, snapshot, eligibility และกติกายกเลิก/ลบข้อมูล
3. ยืนยันว่า 1 inspection ต่อ order item เป็นกติกาจริง หากเปลี่ยนเป็นต่อ order ต้องแก้ FK, unique, fixture และ test ทั้งชุดก่อนสร้าง migration
4. DB1/BE ตกลงเจ้าของตาราง audit, outbox, inbox deduplication และ idempotency หากมีส่วนกลางให้ใช้ร่วม ไม่สร้างซ้ำ; ยืนยันขอบเขต projection ของ Certificate/Return
5. Lead ระบุชื่อบุคคลหรือ GitHub handle ของ DB1 ผู้รัน migration ฐานกลางและผู้สำรองใน PR ก่อนนำขึ้นจริง ห้ามถือว่าการเสนอ role นี้คือมีผู้รับงานแล้ว

ระหว่างรอทำ ERD, constraint matrix, test cases และ fixture manifest ได้ แต่ห้ามสร้าง Order table สมมติ, อนุมัติ enum เอง หรือรัน migration ฐานกลาง

## 3. โครงสร้างข้อมูลที่เสนอ (ปรับตาม contract ที่อนุมัติ)

| Model / ตาราง | ข้อมูลหลักและความสัมพันธ์ |
|---|---|
| Inspection / inspections | PK; order_item_id FK + UNIQUE; product_id/seller_id FK หากต้องเก็บตาม contract; product snapshot; status; assigned_inspector_id FK users nullable; version >= 1; received_at; started_at; created_at/updated_at; projection certificate/return ตามข้อตกลง |
| InspectionShipment / inspection_shipments | inspection_id FK + UNIQUE สำหรับการส่งเข้าศูนย์หนึ่งครั้ง; carrier, tracking_number, shipped_at, recorded_by FK users; received_note อาจเก็บที่ Inspection |
| InspectionResult / inspection_results | inspection_id FK + UNIQUE; result; summary; reason_code; recorded_by FK users; recorded_at; revision หาก integration ใช้ |
| InspectionEvidence / inspection_evidence | inspection_id FK; private storage object key; category; caption; mime_type; size_bytes; uploaded_by FK users; uploaded_at; ข้อมูลสถานะ upload หากจำเป็น |
| InspectionResultEvidence / inspection_result_evidence | result_id, evidence_id, inspection_id; UNIQUE(result_id,evidence_id); composite FK ยืนยันว่าผลและรูปอยู่ inspection เดียวกัน |
| Audit / โครงสร้างส่วนกลางหรือ inspection_audit | inspection_id; actor; action; before/after; reason; request_id; occurred_at; เก็บแบบเพิ่มรายการ ห้ามเขียนทับ |
| Integration storage / ใช้ส่วนกลางก่อน | outbox ผลตรวจ, inbox event deduplication, idempotency records ตามขอบเขตที่ DB1/BE ตกลง |

- ความสัมพันธ์ Order อ่านผ่าน order item ได้; ถ้าเก็บ order_id ซ้ำต้องบังคับให้ตรงกับ order item ไม่ใช่ FK สองตัวที่ชี้คนละ order ได้
- seller/product snapshot ต้องมาจาก Order ที่เชื่อถือได้ และไม่เปลี่ยนตามประกาศภายหลัง
- เวลาเป็น timezone-aware UTC จาก server; started_at คือเวลาเริ่มตรวจครั้งแรก ไม่รีเซ็ตเมื่อโอนงาน; ประวัติการโอนเก็บ audit ผู้บันทึกผลแยกจากผู้รับผิดชอบปัจจุบัน
- ไม่เก็บ signed URL ที่หมดอายุเป็นหลักฐานถาวร ใช้ object key และสร้าง URL ตอนอ่านโดย BE
- สร้าง indexes ตามการค้นหา: seller_id/status/created_at/id, assigned_inspector_id/status และคิว status/created_at/id; ตรวจความจำเป็นก่อนเพิ่ม ไม่ซ้ำ unique indexes
- FK ของข้อมูลตรวจ/ผล/หลักฐานใช้ RESTRICT หรือ NO ACTION เป็นค่าตั้งต้นเพื่อคงประวัติ ไม่ cascade ลบตาม user/product/order โดยไม่มีกติกาที่อนุมัติ

## 4. ข้อบังคับและขอบเขตการบังคับใช้

ชื่อในส่วนนี้มาจากร่าง ต้องยืนยันก่อนใช้จริง:

- status: READY_TO_SHIP → SHIPPED_TO_INSPECTION → RECEIVED → INSPECTING → COMPLETED
- result: PASSED, NOT_AUTHENTIC, NOT_AS_DESCRIBED, INCONCLUSIVE

**บังคับในฐานข้อมูล**

1. FK ทุกตัวปฏิเสธ reference ที่ไม่มีจริง; NOT NULL สำหรับข้อมูลบังคับ
2. named CHECK หรือ non-native Enum ตามรูปแบบ User model ปฏิเสธ status/result/category ที่ไม่อนุญาต รวม raw SQL ไม่พึ่ง Python validation อย่างเดียว
3. CHECK ความเข้าคู่ result/reason: PASSED ต้อง NULL; อีกสามผลต้อง NOT NULL และอยู่ในรายการของผลนั้น ระวัง CHECK ที่ปล่อย SQL NULL ผ่านโดยไม่ตั้งใจ
4. UNIQUE หนึ่ง inspection ต่อหน่วยที่ตกลง, หนึ่ง result ต่อ inspection, หนึ่ง shipment ตามกติกา และ result/evidence pair; ไม่ตั้ง tracking number หรือ product_id เป็น global UNIQUE เอง
5. ป้องกันรูปข้ามงานด้วย composite FK ของ (result_id,inspection_id) และ (evidence_id,inspection_id) พร้อม UNIQUE รองรับที่ตารางแม่
6. CHECK ข้อจำกัดที่ตรวจได้ในแถวเดียว เช่น version, ขนาดไฟล์, ความยาวข้อความ และความสอดคล้อง status/received_at/started_at/assignee; เวลา received_at <= started_at เมื่อมีค่าทั้งคู่
7. event_id, idempotency scope และ outbox business key ต้องมี UNIQUE ตาม contract; retry certificate ไม่สร้างผลตรวจหรือ event ผลครั้งแรกซ้ำ
8. ตั้งสิทธิ์/RLS ของตารางใหม่ให้สอดคล้องแนวทาง backend เดิม ป้องกัน client เขียนข้าม BE; audit append-only และผล/รูปที่ผูกแล้ว immutable ต้องมีวิธีบังคับและ test ระบุชัด หากใช้ trigger ให้รวมใน migration

**บังคับใน service transaction ร่วมกับ BE**

- FK ยืนยันได้เพียงว่าผู้ใช้มีอยู่; role/status, ownership, eligibility และ state transition ต้องตรวจโดย service
- lock/conditional update ที่ Inspection พร้อม expected_version; claim/submit/upload/reassign ใช้ข้อตกลงเดียวกัน
- ส่งผลตรวจต้องตรวจ assignee, state, จำนวนรูป 3–10 และครบ OVERVIEW/IDENTIFIER/FINDING ตามร่าง; รูปสำเร็จและอยู่ในงานเดียวกัน; recorded_at >= started_at
- result + evidence links + COMPLETED + audit + outbox commit ใน transaction เดียว; rollback ต้องไม่เหลือข้อมูลบางส่วน
- CHECK ธรรมดาบังคับจำนวนรูปข้ามตารางหรือ transition จากค่าเก่าไม่ได้ ให้ระบุ service test และ/หรือ deferred trigger ที่เลือกใช้ ห้ามอ้างว่า enum CHECK ครอบคลุมแล้ว
- INSPECT-01 ส่งมอบ storage และ persistence interface ที่จำเป็น; HTTP API, upload processing, worker, CERT/Return implementation ให้เจ้าของงานที่เกี่ยวข้องทำ ไม่ขยายงานนี้โดยปริยาย

## 5. ลำดับงานและไฟล์ส่งมอบ

1. ยืนยัน dependencies ในข้อ 2 แล้วทำ mapping contract → column/constraint/test ให้ครบ รวม started_at ซึ่งร่าง response ยังไม่ได้แสดงชัดเจน
2. เพิ่ม models ใน `backend/app/models/inspection*.py` และปรับ model registration ใน `app/models/__init__.py` / `migrations/env.py` ให้ FK resolve ได้ครบ
3. เพิ่ม Alembic revision หลัง head ล่าสุดที่รวม ORDER-01 แล้ว ตรวจ graph จาก revision/down_revision จริง ไม่ยึดข้อความ docstring และไม่แก้ migration ที่ deploy แล้ว
4. ทบทวน migration ที่ generate: ห้ามมี DROP/ALTER ตารางนอกขอบเขตจาก metadata ที่โหลดไม่ครบ; ระบุ constraints/indexes/FK/security และ downgrade ย้อน dependency ให้ครบ
5. เพิ่ม persistence tests และ migration tests ใน `backend/tests/test_inspection_model.py`, `test_inspection_migration.py` และ seed tests; ปรับ test เดิมที่ hardcode head ให้ตรวจ graph ล่าสุดโดยยังรักษาการตรวจ user migration ของเดิม
6. เพิ่ม `backend/scripts/seed_inspections.py`, fixture manifest ใน `backend/test-data/` และคู่มือใน `backend/test-data/README.md`
7. ส่ง PR พร้อม ERD/field mapping, SQL review, ผลทดสอบ, วิธี seed, ข้อจำกัด และ rollout record; ไม่ deploy จากงาน planning นี้

## 6. ข้อมูลทดสอบที่รันซ้ำได้

ชุดขั้นต่ำ 8 งาน: READY_TO_SHIP, SHIPPED_TO_INSPECTION, RECEIVED, INSPECTING อย่างละ 1 และ COMPLETED แยกผลทั้ง 4 อย่างละ 1; แต่ละผลมีรูปตัวอย่างถูกต้องครบ 3 หมวด มีเหตุผลและเวลาครบ

- ใช้ namespace เช่น inspect01-v1 กับ scenario key คงที่ และ mapping ไป order items ที่จัดเตรียมโดย ORDER fixture; ห้ามใช้เลข PK ตายตัวที่อาจชนข้อมูลทีม
- แยกข้อมูล synthetic ในฐานทดสอบอัตโนมัติจากการ seed ฐานทีม: ฐานทีมใช้ user/order fixture ที่ระบุไว้และตรวจความเป็นเจ้าของ fixture ก่อนเปลี่ยนแปลง ไม่สร้าง Supabase identity ปลอม
- preview เป็นค่าเริ่มต้น; apply ระบุฐานเป้าหมายและ namespace ชัดเจน ใช้ transaction และ lock/unique key ป้องกันรัน seed พร้อมกัน
- ถ้าพบข้อมูลเดิมตรงกันให้รายงาน already-present; ถ้างานถูกทีมใช้งานจนเปลี่ยนไปแล้วให้รายงาน conflict ไม่ย้อนสถานะหรือแก้ผลที่ล็อกไว้ ใช้ namespace ใหม่สำหรับรอบใหม่
- ห้าม TRUNCATE, reset sequence, ล้าง users/orders หรือ downgrade ฐานทีม; cleanup ถ้ามีให้เลือกเฉพาะ namespace ที่ยืนยัน ownership และไม่ลบหลักฐานผลที่ใช้งานแล้ว
- ไม่ส่ง outbox ไปบริการจริงขณะ seed; ใช้ transport ทดสอบที่แยกหรือโหมด fixture ที่ไม่ถูก worker จริงหยิบ โดยตกลงกับ BE
- ทดสอบรันสองครั้งแล้วจำนวน/ID คงเดิม ข้อมูลนอก namespace ไม่เปลี่ยน และการล้มเหลวไม่เหลือ fixture ครึ่งชุด

## 7. เกณฑ์ตรวจรับ

| การตรวจ | ผลที่ต้องได้ |
|---|---|
| Round trip ทุกสถานะ/ผล | อ่านกลับครบ order/shipment/ผู้ตรวจ/สามเวลาหลัก/ผล/หลักฐาน ตาม contract ที่อนุมัติ |
| Reference ผิด | order item/user/product/evidence ไม่มีจริงถูกปฏิเสธ; evidence ต่างงานถูกปฏิเสธ |
| ข้อมูลซ้ำ | duplicate inspection/result/evidence link/event ถูกปฏิเสธหรือ replay ตามข้อตกลง; ไม่มีผลเพิ่ม |
| Invalid values | enum ผิด, reason ไม่เข้าคู่หรือ NULL ที่ห้าม, เวลา/ขนาด/ข้อความผิด ถูกปฏิเสธในชั้นที่กำหนด |
| Transaction/concurrency | submit/claim ซ้อนสำเร็จได้ตามกติกา; rollback ไม่เหลือ result/link/audit/outbox บางส่วน |
| Immutability | แก้/ลบผลและหลักฐานที่แนบแล้วไม่ได้ผ่านสิทธิ์ที่แอปใช้งานจริง |
| Migration | ทดสอบ PostgreSQL แยก: empty → head และ revision ก่อน INSPECT → head โดยข้อมูลเดิมอยู่ครบ; downgrade เฉพาะ INSPECT → upgrade ซ้ำสำเร็จ |
| Migration graph/security | head เดียวหลังรวม ORDER-01, metadata ครบ, ไม่มี unrelated destructive diff, สิทธิ์ตารางใหม่ผ่านการตรวจ |
| Seed ซ้ำ | สองรอบไม่เพิ่มข้อมูลซ้ำ ไม่ reset งานที่ทีมแก้แล้ว ไม่กระทบข้อมูลนอกชุด |

ใช้ PostgreSQL จริงสำหรับ FK/CHECK/locking/migration ไม่ใช้ SQLite เป็นหลักฐานแทน; skipped migration tests ไม่ถือว่าผ่าน ต้องแนบผลจากฐานทดสอบแยกก่อนปิดงาน

## 8. ผู้รับผิดชอบและการนำขึ้นฐานกลาง

- implement agent: model, migration, seed, tests และเอกสาร PR
- DB1: ผู้รับผิดชอบเสนอสำหรับ review/run migration ฐานกลาง; Lead ต้องระบุผู้รับงานจริงก่อน deploy
- BE: ทบทวน transaction boundaries, authorization, immutability และ integration storage
- QA1: ตรวจ scenario matrix และยืนยัน seed รันซ้ำได้
- Lead: ยืนยัน contract/dependencies และรายชื่อผู้ดำเนินการ

ก่อนนำขึ้น DB1 บันทึกชื่อ/handle, PR/commit, contract version, target environment แบบไม่เปิดเผย secret, current/target revision, ผล backup/restore readiness และช่วงดำเนินการ แล้วตรวจ upgrade บน staging ก่อน ฐานกลางใช้ forward migration; ไม่ downgrade เมื่อมีผลตรวจจริงโดยไม่มีแผนรักษาข้อมูล หลังรันตรวจ revision/FK/index/security และ smoke read-write พร้อมบันทึกผล ห้ามถือว่างานปิดจนมีผู้รับผิดชอบฐานกลางระบุตัวได้และผลตรวจ migration จริงครบ

งาน planning นี้ไม่ได้เปลี่ยน schema, seed ข้อมูล หรือยืนยันว่า dependency เสร็จแล้ว
