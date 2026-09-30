# INSPECT-00 — สัญญากลางการส่งเข้าศูนย์และตรวจสินค้า

วันที่ปรับ revision: 27 กันยายน 2026 | **INSPECT-00 v2: กติกาผลิตภัณฑ์ตามมติ 26 ก.ย.; รอ FE/BE/DB/QA ทบทวนสัญญาทางเทคนิคก่อนปิด Issue**  
เจ้าของ: Lead | ผู้ใช้สัญญานี้: DB1/DB2, BE, FE1/FE2, QA1/QA2  
GitHub: [Feature #52](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/52), [INSPECT-00 #54](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/54)

ปรับแผน 26 กันยายน 2026: [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md) กำหนดให้ Courier ที่ได้รับมอบหมายถ่ายรูปและยืนยันส่งถึงศูนย์ก่อน Inspector กดรับ; หลักฐานนี้เป็นคนละชุดกับรูปผลตรวจ. ข้อเดิมที่บอกว่ารูปรับสินค้าเป็นทางเลือกหรือไม่มี timer ถูกแทนที่เฉพาะจุดนี้. Issue #54 ยังรอทีมตรวจสัญญา. ณ 27 ก.ย. PR #93 head `e7bde70` รายงานว่าเพิ่ม Courier schema/guards และต่อ migration จาก PR #92 แล้ว; BE/FE ต้องตรวจและทำส่วน API/หน้าจอต่อโดยไม่สร้าง schema ซ้ำ. ผลทดสอบใน PR เป็นหลักฐานที่ผู้ทำรายงาน ยังไม่ใช่ผลรันทวนของ Lead.

## 1. เป้าหมายและลำดับแหล่งอ้างอิง

เส้นทาง Prototype: Order จ่ายจำลองสำเร็จ → Seller แจ้งส่งเข้าศูนย์ → Courier ถ่ายรูป/ยืนยันส่งถึง → Inspector รับของ → เริ่มตรวจ → อัปโหลดรูปหลักฐาน → บันทึกผล 1 ครั้ง → ผู้ซื้ออ่านผล โดยผลที่เข้าเกณฑ์ต้องมีใบรับรองก่อน API ตอบว่าสำเร็จ งานส่งต่อผู้ซื้อ/คืนผู้ขายและรายการเงินเป็น FINISH ไม่ใช่ INSPECT

สัญญานี้ยึด `GitHub_Prototype_Backlog.md` หัวข้อ 2, 4, 6 และ `CERT-spec.md` เป็นพฤติกรรม Prototype; ยึด `secondhand-marketplace-android-app/doc/orders/contract.md` กับโค้ด Order ปัจจุบันเป็น upstream ที่มีจริง ชื่อเส้นทาง/ฟิลด์และขีดจำกัดด้านล่างเป็น **ข้อเสนอทางเทคนิคของ Lead สำหรับ v2** ให้ FE/BE/DB/QA ตรวจร่วมกันก่อนใช้เป็นสัญญาปิด INSPECT-00 หากโค้ดที่ merge ภายหลังต่างจากนี้ ให้แก้สัญญาและ PR ที่เกี่ยวข้องร่วมกันก่อนเปิด endpoint จริง

SRS PDF เดิมระบุใบรับรองหลังผู้ซื้อยืนยัน และนับ 72 ชั่วโมงหลังแจ้งผลตรวจ; class/state diagram source ปรับตามแผนล่าสุดแล้ว. ข้อตกลงล่าสุดให้ออกใบรับรองทันทีพร้อมผลเข้าเกณฑ์, บังคับ Courier proof รูป 1–3 ภาพก่อนรับเข้าศูนย์, บังคับรูปผลตรวจอย่างน้อย 1 ภาพ และใช้ 72 ชั่วโมงหลัง Courier ส่งถึงผู้ซื้อเพื่อปล่อยเงินอัตโนมัติถ้าไม่มีรายงานว่าไม่ได้รับ Lead ต้องปรับ SRS ฉบับส่งอาจารย์ให้ตรง

## 2. ขอบเขตและข้อเท็จจริงก่อนเริ่ม

- Baseline เดิมที่ใช้ร่างสัญญา 23 ก.ย. (ไม่ใช่สถานะล่าสุดของ PR #93): `orders` มี 1 สินค้าต่อ Order, `orders.id` เป็น integer, สถานะ `WAITING_PAYMENT`/`WAITING_SELLER_SHIP`; จ่ายสำเร็จมี `payments`, `escrows.status=HELD` และใบเสร็จอย่างละ 1 แถวตาม ORDER-03 ไม่มี `order_item_id` หรือ Inspect API/Model ใน checkout ที่อ่าน
- ก่อนเปิด transition ใหม่ ต้องขยาย CHECK ของ `orders.status` ใน INSPECT-01 (DB1), Pydantic `OrderStatus` และ Order serializer (BE), Mobile decoder/label (FE1/FE2) ให้รับค่าใหม่พร้อมกัน ไม่ใช้สถานะใหม่เฉพาะ API เพราะ `GET /orders/{id}` และแอปจะอ่านไม่ผ่าน
- ไม่เชื่อ `seller_id`, `inspector_id`, `paid`, `order_status`, `result_at` หรือ URL รูปจากมือถือ; ระบุตัวผู้ทำจาก Bearer token และเวลา UTC จาก Server
- ใช้ข้อมูลและพัสดุสมมติ ไม่มีผู้ให้บริการขนส่งจริง, ระบบอุทธรณ์, การแก้ผลย้อนหลัง, การมอบหมาย/โอน Inspector โดย Admin, Push หรือการจ่าย/คืนเงินจริงในรอบ INSPECT. การมอบหมาย Courier, รูปส่งถึง, scheduler และการจ่าย/คืนเงินจำลองอยู่ใน FULFILLMENT/FINISH

## 3. สถานะและสิทธิ์

Order เป็นสถานะหลักเพียงชุดเดียว; shipment เก็บสถานะการส่งเข้าศูนย์แยกต่างหาก ห้ามใช้ผลตรวจเป็น shipment status

| ก่อน | ผู้ทำ / คำสั่ง | หลัง | เงื่อนไข |
|---|---|---|---|
| `WAITING_SELLER_SHIP` | Seller เจ้าของแจ้งส่ง | `SHIPPING_TO_CENTER` | มี Payment สำเร็จและ Escrow `HELD`; สร้าง shipment `TO_CENTER` และ inspection work อย่างละ 1 |
| `SHIPPING_TO_CENTER` | Inspector รับเข้าศูนย์ | `RECEIVED_AT_CENTER` | Courier ที่ได้รับมอบหมายยืนยันส่งถึงศูนย์พร้อมรูป 1–3 ภาพแล้ว; Inspector บันทึก `received_by`, `received_at` |
| `RECEIVED_AT_CENTER` | Inspector เริ่มตรวจ | `INSPECTING` | Inspector คนแรกที่ล็อก Order สำเร็จเป็น `inspector_id`; คนอื่นทำต่อไม่ได้ |
| `INSPECTING` | Inspector เจ้าของงานบันทึกผล | `RESULT_NOTIFIED` | มี summary และรูปหลักฐานครบ; ผลเข้าเกณฑ์ต้องออก Certificate ใน transaction เดียวกัน |

`RESULT_NOTIFIED` หมายถึงมีผลให้อ่านแล้ว ยังไม่ใช่การยืนยันของผู้ซื้อ การกด `CONFIRM`/`REJECT` และ `next_action` อยู่ใน CERT; shipment ออกศูนย์/คืนของและปล่อยเงิน/คืนเงินอยู่ใน FINISH ไม่มีการข้ามขั้นหรือย้อนสถานะ การรับของไม่เท่ากับเริ่มตรวจ

| การกระทำ | Seller | Buyer | Inspector | Courier | Admin |
|---|---|---|---|---|---|
| อ่าน Order/progress ของตน | เจ้าของ Order | เจ้าของ Order | ใช้คิว Inspect แทน | เห็นเฉพาะ Shipment ที่มอบหมาย | ไม่มีมุมมองเพิ่ม |
| แจ้งส่งเข้าศูนย์ | เฉพาะเจ้าของ, `ACTIVE` | ไม่ได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ |
| อัปโหลดรูป/ยืนยันส่งถึงศูนย์ | ไม่ได้ | ไม่ได้ | ไม่ได้ | เฉพาะที่มอบหมายและ `ACTIVE` | ไม่ได้ |
| ดูคิว/รายละเอียดงานตรวจ | ไม่ได้ | ไม่ได้ | `ACTIVE`; งานที่ยังไม่เริ่มหรือที่ตนรับแล้ว | ไม่ได้ | ไม่ได้ |
| รับของ | ไม่ได้ | ไม่ได้ | `ACTIVE`, งานใน `SHIPPING_TO_CENTER` หลัง Courier proof | ไม่ได้ | ไม่ได้ |
| เริ่มตรวจ/อัปโหลด/บันทึกผล | ไม่ได้ | ไม่ได้ | `ACTIVE`; หลังเริ่มแล้วเฉพาะ `inspector_id` | ไม่ได้ | ไม่ได้ |
| อ่านผลและหลักฐานหลังจบ | ผ่านขอบเขตที่ Order อนุญาตเท่านั้น | ผ่าน CERT endpoint ของ Order ตน | ผู้ตรวจเจ้าของงาน | ไม่ได้ | ไม่มีสิทธิ์เพิ่ม |

บัญชี `SUSPENDED`/`CLOSED` ทำ mutation หรือดูคิวเจ้าหน้าที่ไม่ได้ รวมถึง Courier; Buyer/Seller อ่าน Order/progress เดิมของตนได้เหมือน Order contract ผู้ไม่เกี่ยวข้องกับ Order ได้ `404 order_not_found`; role ที่รู้ว่าตนเกี่ยวข้องแต่ทำ action นั้นไม่ได้ได้ `403` การให้ Admin ช่วยแก้ข้อมูลเป็นงานแยกพร้อม audit ไม่เปิด bypass งานตรวจสินค้าใน Prototype

## 4. ผลตรวจและจุดเชื่อม CERT

ผลสุดท้าย **หนึ่งชุดต่อ Order**; `inspections.order_id` unique และเมื่อบันทึกแล้วห้ามแก้/ลบผ่าน API นี้

| `result` | ความหมาย | ใบรับรอง | `next_action` เมื่อจบ INSPECT |
|---|---|---|---|
| `PASS` | ของแท้และตรงสาระสำคัญของ snapshot สินค้า | ออกทันที | `WAIT_BUYER_DECISION` |
| `MINOR_ISSUE` | ของแท้ มีข้อสังเกตเล็กน้อยที่อธิบายให้ผู้ซื้อตัดสินใจ | ออกทันที โดยระบุผลตามจริง | `WAIT_BUYER_DECISION` |
| `NOT_AS_DESCRIBED` | ขนาด/รุ่น/สภาพ/อุปกรณ์ต่างจาก snapshot อย่างมีนัยสำคัญ | ไม่ออก | `RETURN_TO_SELLER` |
| `FAKE` | ผู้ตรวจมีหลักฐานพอสรุปว่าไม่ใช่ของแท้ | ไม่ออก | `RETURN_TO_SELLER` |

ถ้าพบทั้งของปลอมและไม่ตรงรายละเอียด ใช้ `FAKE` และอธิบายทั้งหมดใน summary กรณีตัดสินไม่ได้ยังไม่มีผลชนิดที่ 5: ผู้ตรวจคงงาน `INSPECTING` และแจ้ง Lead เพื่อกำหนดทางแก้ ห้ามใช้ `PASS` หรือผลลบแทนความไม่แน่ใจ

`INSPECT-03` กับ `CERT-02` เป็น **atomic gate**: lock Order, ตรวจสิทธิ์/หลักฐาน, บันทึก final result, สร้าง Certificate สำหรับ `PASS`/`MINOR_ISSUE`, เปลี่ยน Order เป็น `RESULT_NOTIFIED`, แล้ว commit ครั้งเดียว หากออกใบรับรอง/token/URL ไม่ได้ ต้อง rollback ผลและสถานะทั้งหมดและตอบ `503 certificate_unavailable` เพื่อ retry คำขอเดิมได้ ผลลบ commit ผลและสถานะโดยไม่มี Certificate ไม่มีสถานะ `PENDING` ที่ผู้ซื้อเห็นเป็นผลสำเร็จ ไม่มี background issuance หรือ final result ที่เข้าเกณฑ์แต่ยังไม่มี QR

CERT อ่าน final result โดย `order_id` และใช้ผล 4 ค่านี้ตรง ๆ; ไม่แปลง `PASSED`/`NOT_AUTHENTIC`/`INCONCLUSIVE` แบบเงียบ ๆ ปุ่มผู้ซื้อและเว็บ QR ใช้ [CERT-spec.md](CERT-spec.md) เป็นสัญญาต่อ

## 5. ข้อมูลและข้อบังคับฐานข้อมูล

| ตาราง/ข้อมูล | ข้อบังคับขั้นต่ำของ INSPECT-01 |
|---|---|
| `shipments` | `id`, `order_id` FK, `leg=TO_CENTER`, `status=IN_TRANSIT/DELIVERED`, `carrier`, `tracking_number`, `shipped_at`, `delivered_at` จาก Courier proof, `received_at`/`received_by` จาก Inspector; unique `(order_id, leg)`; photo rows/assigned Courier อยู่ใน FULFILLMENT-00 |
| `inspections` | `id`, `order_id` FK และ unique, `inspector_id` FK nullable, `started_at`, `result` nullable (4 ค่า), `summary` nullable, `inspected_at`; unique `(id, order_id)` ให้ CERT ใช้ composite FK ได้ |
| `inspection_evidence` | `id`, `inspection_id` FK, `object_key` private และ unique, `mime_type`, `size_bytes`, `sha256`, `uploaded_by` FK, `uploaded_at`; รูปถูกผูกกับ inspection เดียวเสมอ |
| `orders.status` | ขยาย CHECK ให้มี `SHIPPING_TO_CENTER`, `RECEIVED_AT_CENTER`, `INSPECTING`, `RESULT_NOTIFIED` และคงค่าสถานะเดิมทั้งหมด |

ผลสุดท้ายต้องมี `summary` และ `inspected_at` ครบพร้อมกัน; ใช้ CHECK/constraint เท่าที่เหมาะสมและ service ตรวจ state ข้ามตารางใต้ lock การสร้างพร้อมกันต้องอาศัย unique constraint ไม่อาศัย SELECT ก่อน INSERT อย่างเดียว ตารางใหม่ใน Supabase `public` เปิด RLS และไม่ให้ anon/authenticated อ่านตรงโดยไม่มี policy; Backend เป็นทางผ่านที่ตรวจสิทธิ์ Migration ต้องทดสอบ upgrade/downgrade และข้อมูล Order เดิมใน PostgreSQL แยก ไม่ reset ฐานข้อมูลกลาง

`carrier`/`tracking_number`: trim แล้ว 1–100 ตัวอักษรทั้งคู่; เป็นข้อมูลจำลอง ไม่ส่งไปผู้ให้บริการจริง `note` ตอนรับของเป็นทางเลือก, trim แล้วไม่เกิน 1000 ตัวอักษร `summary`: trim แล้ว 10–2000 ตัวอักษร อธิบายความแท้ สภาพ และความตรงกับ snapshot; ห้ามใส่ข้อมูลบุคคล รูปผลตรวจ: 1–5 ภาพ JPEG/PNG/WebP แบบภาพนิ่ง, มากกว่า 0 และไม่เกิน 5 MiB ต่อภาพ ตรวจ MIME และเนื้อไฟล์จริง Backend เก็บใน bucket private; ไม่ส่ง object key/raw Storage path ใน API รูปที่ยังไม่ถูกนำไปใช้และรูปค้างจากคำขอล้มเหลวต้องมีวิธี cleanup ที่ปลอดภัย **รูปรับเข้าศูนย์** เป็น Courier delivery proof 1–3 ภาพ JPEG/PNG ภาพนิ่ง ภาพละไม่เกิน 5 MiB ใน private storage ก่อน Inspector กดรับ; ไม่ใช้รูปผลตรวจแทนรูปส่งถึง

หลังเริ่มตรวจ เฉพาะ Inspector ที่ได้รับงานอัปโหลดได้ ผลสุดท้ายอ้าง `evidence_ids` 1–5 ค่าไม่ซ้ำ ซึ่งต้องเป็นภาพของ inspection เดียวกันและอัปโหลดสำเร็จแล้ว เมื่อ final result สำเร็จ ห้ามเพิ่ม/ลบรูปในงานนั้น Buyer เห็นเฉพาะรูปของ final result ผ่าน endpoint ที่ตรวจสิทธิ์หรือ signed URL อายุสั้นหลังตรวจสิทธิ์ ห้ามนำรูปหลักฐานขึ้นหน้า QR สาธารณะโดยอัตโนมัติ

## 6. API contract สำหรับ BE/FE/QA

ทุก API ส่วนตัวใช้ Bearer token เดิม; mutating POST ต้องส่ง `Idempotency-Key` รูปแบบเดียวกับ Order (8–100 ตัว `[A-Za-z0-9_-]`) และ payload เดิม/key เดิมต้องคืนผลเดิมโดยไม่เพิ่มแถว/เวลา/สถานะ key เดิมแต่ payload ต่างตอบ `409 idempotency_key_reused`; key ใหม่หลัง action สำเร็จตอบ `409 invalid_state` หรือ `result_locked` แล้วแต่ action เก็บผลสำเร็จคู่ key/hash ใน DB transaction เดียวกับ action; คำขอที่ rollback หรือได้ 4xx/503 ไม่จอง key สำเร็จถาวร Client เก็บ key เดิมเมื่อ timeout และ Refresh ก่อนเริ่ม action ใหม่ ใช้ transaction + Order row lock สำหรับการแข่งกัน; unique เป็นด่านสุดท้าย

| Endpoint | ผู้เรียก | Request | Success |
|---|---|---|---|
| `POST /orders/{order_id}/ship-to-center` | Seller เจ้าของ | `{carrier, tracking_number}` | `200` progress, Order → `SHIPPING_TO_CENTER` |
| `GET /orders/{order_id}/inspection-progress` | Buyer/Seller เจ้าของ | — | `200` progress; ก่อนแจ้งส่ง shipment เป็น `null` |
| `GET /inspections?status=&limit=20&offset=0` | Inspector `ACTIVE` | query filter optional, limit 1–100 | `200 {items,total,limit,offset}` คิวที่รับได้และงานตน เรียงเวลาสร้าง/ID แน่นอน |
| `GET /inspections/{inspection_id}` | Inspector ที่เห็นงาน | — | `200` work detail; ไม่คืนที่อยู่/ข้อมูลผู้ซื้อ |
| `POST /inspections/{id}/receive` | Inspector `ACTIVE` | `{note?}` | `200` work detail, Order → `RECEIVED_AT_CENTER`; ปฏิเสธถ้า TO_CENTER ยังไม่มี Courier proof ที่ยืนยันแล้ว |
| `POST /inspections/{id}/start` | Inspector `ACTIVE` | `{}` | `200` work detail, Order → `INSPECTING` และ assign ผู้เรียก |
| `POST /inspections/{id}/evidence` | Inspector ผู้รับงาน | multipart `file` | `201 {evidence:{id,mime_type,size_bytes},...}` |
| `POST /inspections/{id}/result` | Inspector ผู้รับงาน | `{result,summary,evidence_ids}` | `200` work detail + `next_action`; certificate สำหรับผลเข้าเกณฑ์ |
| `GET /inspection-evidence/{id}` | Buyer เจ้าของหลัง final / Inspector ผู้รับงาน | — | รูปจาก private storage หลังตรวจสิทธิ์, `Cache-Control: no-store` |

`progress` สำหรับ Buyer/Seller: `{order_id,order_status,shipment:{carrier,tracking_number,shipped_at,received_at}|null,inspection:{status,started_at,inspected_at}|null}` โดย `inspection.status` ใช้ค่า Order ที่เกี่ยวกับ Inspect; หลังจบ ผู้ซื้อไป `GET /orders/{id}/inspection` ตาม CERT เพื่ออ่านผล/QR Seller ไม่ได้รับ URL รูปหรือข้อมูลผู้ตรวจจาก progress ต้องขยาย `GET /orders/{id}` และรายการ Order ให้ serialize สถานะใหม่ได้ แม้ client ยังไม่เปิดหน้าตรวจ

`work detail` สำหรับ Inspector: `{id,order_id,order_status,product:{id,name,condition,size},shipment,inspector_id,started_at,result,summary,inspected_at,evidence:[{id,mime_type,size_bytes,url,expires_at}]}`; ก่อนจบ `result/summary/inspected_at` เป็น `null` และ evidence คือรูปที่อัปโหลดแล้ว `url` เป็น API URL ที่ตรวจสิทธิ์และ `expires_at:null` จาก origin ที่ Server ตั้งค่าเอง ไม่ประกอบจาก Host header; หลังจบอ้าง result ตามตารางข้อ 4 และ certificate `{certificate_no,public_url}` เฉพาะผลเข้าเกณฑ์ (URL ตาม CERT)

ตัวอย่างแจ้งส่ง:

```http
POST /orders/42/ship-to-center
Authorization: Bearer <token>
Idempotency-Key: 3f0e8f7c-0a51-4c35-9d1e-5b8f0f0d1a11
Content-Type: application/json

{"carrier":"Demo Express","tracking_number":"DEMO-42"}
```

ตอบ `200`: `{"order_id":42,"order_status":"SHIPPING_TO_CENTER","shipment":{"carrier":"Demo Express","tracking_number":"DEMO-42","shipped_at":"2026-09-23T10:00:00Z","received_at":null},"inspection":{"status":"SHIPPING_TO_CENTER","started_at":null,"inspected_at":null}}`

ตัวอย่างบันทึกผลหลังอัปโหลดภาพ `id=7`:

```json
{"result":"MINOR_ISSUE","summary":"ตรวจความแท้และขนาดแล้วตรงกับคำสั่งซื้อ พบเพียงรอยใช้งานเล็กน้อยตามรูป","evidence_ids":[7]}
```

ตอบ `200`: `order_status=RESULT_NOTIFIED`, `result=MINOR_ISSUE`, `next_action=WAIT_BUYER_DECISION`, `certificate.public_url` ไม่เป็น null; ผล `NOT_AS_DESCRIBED`/`FAKE` ได้ `certificate=null`, `next_action=RETURN_TO_SELLER` การสร้าง certificate สำเร็จต้องเกิดก่อน response นี้

Error ใช้รูป Order API: `{"detail":{"code":"invalid_state","message":"..."}}`; validation ใช้ `detail.fields` เมื่อระบุช่องได้ ตัวอย่าง: `422 {"detail":{"code":"validation_error","fields":{"evidence_ids":"ต้องมีรูปหลักฐานอย่างน้อย 1 รูป"}}}`, `403 {"detail":{"code":"inspector_role_required","message":"ต้องเป็นผู้ตรวจสอบ"}}`, `409 {"detail":{"code":"invalid_state","message":"ต้องรับสินค้าเข้าศูนย์ก่อนเริ่มตรวจ"}}` รหัสหลัก: `401` auth เดิม, `403 account_inactive`/role required/`not_assigned_inspector`, `404 order_not_found`/`inspection_not_found`, `409 invalid_state`/`result_locked`/`idempotency_key_reused`/`evidence_limit`, `413 file_too_large`, `415 unsupported_media_type`, `422 validation_error`, `503 storage_unavailable`/`certificate_unavailable` อย่าส่ง stack trace หรือ private object key ใน error

## 7. การกดซ้ำและการทดสอบรับงาน

- ทุก transition และการบันทึกผลล็อก Order แถวเดียวกันใน PostgreSQL; ตรวจ role, เจ้าของ, state และ key ใต้ transaction; แถว shipment/inspection/ผล/Certificate ไม่ซ้ำเมื่อสองคำขอชนกัน
- อัปโหลดรูปต้องไม่สร้าง DB row ที่ชี้ object ที่เขียนไม่สำเร็จ; เมื่อ DB fail หลัง storage สำเร็จต้อง cleanup หรือมี cleanup job ที่ตรวจได้ การ replay key เดิมของ upload ต้องคืนภาพเดิม ไม่เพิ่มจำนวน
- Failure ของ CERT ตอนผลเข้าเกณฑ์ต้องคง Order `INSPECTING`, final result ว่าง, ไม่มี certificate; retry key เดิมหลังแก้สาเหตุได้ผลสำเร็จหนึ่งชุด ผลลบไม่มี Certificate แม้กดซ้ำ
- QA ใช้บัญชีสมมติ Buyer, Seller เจ้าของ/อื่น, Courier ที่ได้รับมอบหมาย/ไม่ได้รับ, Inspector สองคน, Admin; ทดสอบไม่จ่าย, รับเข้าศูนย์ก่อน Courier proof, ผิดลำดับ, inactive, รูปผิดชนิด/ใหญ่/ข้ามงาน, summary ว่าง, ผลทั้ง 4, timeout/replay, ส่งพร้อมกัน, rollback Certificate และข้อมูล DB จริง
- QA2 ทดสอบมือถือ: Seller แจ้งส่งแล้ว Refresh เห็นสถานะจริง; Courier ถ่ายรูปและกดส่งถึงศูนย์; Inspector รับ → เริ่ม → อัปโหลด → บันทึก; Buyer Refresh อ่านผลจริงและ QR ใน CERT; สลับบัญชีไม่เห็นข้อมูลค้าง ไม่ใช้ mock เป็นหลักฐานปิด Feature

## 8. ลำดับมอบหมายและเกณฑ์ปิด INSPECT-00

ใช้ชื่อ revision **INSPECT-00 v2 (27 ก.ย. 2026)** คู่กับ FINISH-00 #98. แต่ละฝ่ายบันทึกชื่อผู้ตรวจ, commit ที่เทียบ, ยอมรับหรือข้อทักท้วงเฉพาะข้อ และลิงก์หลักฐาน; ห้ามถือว่าการไม่ตอบคือยอมรับ. Checklist ด้านล่างคงว่างจนมีหลักฐานจริง.

1. DB1 ทำ [INSPECT-01 #56](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/56): migration/model, Order status, FK/unique/RLS; DB2 ตรวจ PostgreSQL แยกและเตรียมข้อมูล
2. DB1/BE/FE1 ทำ COURIER-01…03 ส่วน role/มอบหมาย/รูป TO_CENTER ก่อนเกณฑ์รับงาน [INSPECT-02 #58](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/58); จากนั้น BE ทำแจ้งส่ง/รับ/คิว/progress ตามสัญญา; FE1 เตรียม [INSPECT-04 #62](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/62) และ FE2 เตรียม [INSPECT-05 #64](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/64) ด้วย JSON นี้ก่อนเชื่อม API
3. BE ทำ [INSPECT-03 #60](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/60) และ CERT-02 เป็น atomic gate หลัง CERT-01 schema พร้อม; ห้าม merge เปิด result endpoint ที่ตอบสำเร็จสำหรับ `PASS`/`MINOR_ISSUE` โดยยังไม่มี Certificate
4. QA1/QA2 ทำ [INSPECT-06 #65](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/65) หลังเชื่อมจริง และ Lead ตรวจเส้นทางผลลบ → FINISH ก่อนปิด Feature #52

**INSPECT-00 เสร็จ** เมื่อ FE, BE, DB และ QA อ่านสัญญานี้แล้วบันทึกข้อทักท้วง/การยอมรับใน Issue #54, Lead แก้ข้อขัดแย้งและยืนยัน revision สุดท้าย แล้วทุกทีมใช้ state, สิทธิ์, 4 results, หลักฐาน, JSON/error, retry และ CERT gate ชุดเดียวกัน Issue นี้เป็นงานวางแผน; การผ่าน migration/API/มือถือเป็นเกณฑ์ของ Issue ถัดไปและ Feature

- [ ] BE ตรวจลำดับสถานะ, API/error, transaction และ CERT gate
- [ ] DB1/DB2 ตรวจ Order FK, constraint, RLS, migration และ private evidence
- [ ] FE1/FE2 ตรวจ JSON, หน้าจอ, รูปหลักฐานและการ Refresh/retry
- [ ] QA1/QA2 ตรวจ test cases ทั้งสี่ผล, สิทธิ์, race และ rollback
- [ ] Lead สรุปข้อทักท้วงและประกาศ revision ที่ทีมใช้ร่วมกันใน Issue #54

### ข้อความมอบหมาย AI implementation session

> Implement INSPECT-01…06 ตาม `/home/tmk/project/market-place-mobile-app/docs/project-plan/INSPECT-spec.md` และ `CERT-spec.md` ใน repo `/home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app` ทีละ Issue เริ่มจากตรวจ branch, working tree, Order contract/Model/Migration จริง, GitHub issue/PR ล่าสุด และ `mobile/AGENTS.md` ก่อนแก้; อย่าใช้ร่าง `origin/chore/inspect-02-preparation:doc/inspect-contract.md` เป็นสัญญา เพราะใช้ order item, result enum และ async CERT ที่ขัดกับ v2 นี้ ทำ INSPECT-01 schema/Order statuses ก่อน, แล้ว INSPECT-02, จากนั้น INSPECT-03 พร้อม CERT-02 แบบ atomic ทดสอบ PostgreSQL แยกสำหรับ migration/race/rollback, ไม่ reset DB กลาง และรายงานหลักฐาน API/DB/มือถือจริงแยกจาก mocks
