# INSPECT-02 — API และสิทธิ์ฉบับเตรียมงาน

สถานะ: DRAFT อิง `inspect-contract.md` 0.1; #54 เสร็จแล้วตามคำยืนยันผู้ใช้ แต่ approved contract ยังไม่อยู่ใน checkout นี้ จึงต้อง sync ค่าจาก #54 ก่อน implement พบ ORDER-03 บน `origin/feat/orders-checkout` ที่ `6b94caf` แต่ยังไม่อยู่ใน main; blocker ที่ยังไม่พบ implementation คือ #56

## Endpoints

ทุก endpoint ใช้ Bearer token และตรวจบัญชี ACTIVE จาก DB; POST ต้องมี Idempotency-Key UUID และ expected_version integer >= 1; GET ไม่ต้องส่งทั้งสองค่า

| Method / path | Input | ผลสำเร็จ | ข้อผิดพลาดเฉพาะ |
|---|---|---|---|
| GET /inspections | status optional, limit=20 (1–100), cursor optional | 200 `{items, next_cursor}` ตามสิทธิ์ | 422 filter/cursor ผิด |
| GET /inspections/{id} | positive integer id | 200 Inspection projection | 404 ไม่พบ/อยู่นอกสิทธิ์ |
| POST /inspections/{id}/shipment | expected_version, carrier, tracking_number | 200 Inspection: SHIPPED_TO_INSPECTION | 409 INVALID_STATE/ORDER_NOT_ELIGIBLE |
| POST /inspections/{id}/receive | expected_version, received_note optional | 200 Inspection: RECEIVED | 409 INVALID_STATE |

carrier/tracking_number trim แล้ว 1–100 ตัวอักษร; received_note เป็น null หรือยาวไม่เกิน 1,000; reject extra fields เช่น seller_id, inspector_id, paid, status, recorded_by, received_at, created_at เป็น 422

ข้อเสนอ list: `(created_at ASC,id ASC)` กับ opaque cursor ที่ผูก actor/filter; ตรวจลายเซ็นหรือกลไกเทียบเท่าและ scope ใหม่ทุกครั้ง ขอบเขตสิทธิ์ถูกบังคับแม้ client เปลี่ยน query/cursor

## Permission matrix

| Actor | list/detail | shipment | receive |
|---|---|---|---|
| ACTIVE SELLER เจ้าของ | งานตนทุกสถานะที่ contract อนุญาต | เฉพาะ READY_TO_SHIP และ paid/eligible | 403 สำหรับงานที่ตนเห็น |
| ACTIVE SELLER คนอื่น | list ไม่ปรากฏ; detail 404 | 404 | 404 |
| ACTIVE INSPECTOR | RECEIVED ที่ยังไม่ assigned และงานที่ตนรับอยู่/ตรวจเสร็จ | ไม่อนุญาต | ใช้สิทธิ์ผู้รับของตาม approved contract จาก #54; ตารางนี้แสดงค่าร่างเดิมจนกว่าจะ sync |
| ACTIVE ADMIN | ทุกงาน | 403 | SHIPPED_TO_INSPECTION เท่านั้น |
| BUYER / role=null | 403 | 403 | 403 |
| SUSPENDED/CLOSED ทุก role | 403 ACCOUNT_INACTIVE | 403 | 403 |
| ไม่มี/ผิด token | 401 | 401 | 401 |

สำหรับบทบาทที่เข้าถึง Inspect ได้: งานนอก scope ตอบ 404 ก่อน action permission; ถ้าเห็นงานแต่ทำ action ไม่ได้ตอบ 403 ห้ามเผย current_status/current_version ใน 404 Inspector ไม่ได้รับสิทธิ์รับสินค้าเพียงเพราะชื่อ role สื่อว่าเป็นเจ้าหน้าที่

## Transition matrix

| สถานะก่อน | shipment โดยเจ้าของ | receive โดยผู้มีสิทธิ์ |
|---|---|---|
| READY_TO_SHIP | SHIPPED_TO_INSPECTION หาก paid/eligible | INVALID_STATE |
| SHIPPED_TO_INSPECTION | INVALID_STATE | RECEIVED |
| RECEIVED | INVALID_STATE | INVALID_STATE |
| INSPECTING | INVALID_STATE | INVALID_STATE |
| COMPLETED | INVALID_STATE | INVALID_STATE |

ตารางนี้ใช้หลังผ่าน permission และ expected_version แล้ว และไม่รวม same-key replay ซึ่งคืนผลสำเร็จเดิม ห้ามข้าม READY_TO_SHIP → RECEIVED และห้าม PATCH status โดยตรง

รายการไม่จ่ายที่ยังไม่มี Inspection: GET/POST ด้วย id ที่ไม่มีจริงตอบ 404; ถ้ามี Inspection ที่เห็นได้แต่ upstream กลายเป็น ineligible และ version/state ผ่าน ให้ shipment ตอบ 409 ORDER_NOT_ELIGIBLE โดยไม่มี write ไม่สร้าง Inspection เพื่อให้รายการไม่จ่ายแสดงใน queue

## Response และ Refresh

ใช้ Inspection response จาก contract กลาง โดยกำหนด projection จริงใน OpenAPI หลัง gate ผ่าน:

- ฟิลด์หลัก: id, order reference, product_id, seller_id, assigned_inspector_id, status, version, shipment, received_at, created_at, updated_at โดยชื่อ order reference ต้องแก้ตาม #56; ORDER-03 ปัจจุบันมี `orders.id` และไม่มี OrderItem
- shipment ก่อนแจ้งส่งเป็น null; หลังแจ้งส่งมี carrier/tracking_number; หากเพิ่ม shipped_at/received_by ต้องตกลงกับ schema owner
- result_record, certificate, return คงรูปแบบตาม contract จริง; ยังไม่มีผลเป็น null และสถานะ integration ใช้ค่าที่ตกลง ห้ามสร้างข้อมูลผลหรือใบรับรองจำลองเพื่อเติม response
- Seller เห็นเฉพาะงานตน และเห็นผล/หลักฐานที่ส่งแล้วเมื่อ COMPLETED; Inspector/Admin ตาม scope กลาง ไม่มีบัญชีธนาคาร บัตรประชาชน หรือข้อมูลผู้ซื้อที่ไม่จำเป็น
- uploaded_evidence เป็น extension ของ detail เฉพาะผู้มีสิทธิ์และเมื่อ evidence feature พร้อม; จัด ownership ร่วมงานนั้น ไม่เพิ่ม upload endpoint ใน INSPECT-02
- ใช้ server UTC timestamps และ Cache-Control: no-store; GET ล่าสุดหลัง POST commit ต้องเห็น version ใหม่จากแหล่งอ่านที่ไม่ล้าหลัง

## ตัวอย่างลำดับ (JSON ย่อ ไม่ใช่ response schema เต็ม)

เริ่มงาน 501 ของ Seller A ที่ READY_TO_SHIP/version=1 และ ORDER-03 ยืนยัน eligible

1. Seller A POST `/inspections/501/shipment` ด้วย key ใหม่:

```json
{"expected_version":1,"carrier":"Example Carrier","tracking_number":"DEMO-501"}
```

200 หลัง commit:

```json
{"id":501,"status":"SHIPPED_TO_INSPECTION","version":2,"shipment":{"carrier":"Example Carrier","tracking_number":"DEMO-501"},"received_at":null}
```

2. Admin POST `/inspections/501/receive` ด้วย key ใหม่:

```json
{"expected_version":2,"received_note":"รับพัสดุเข้าศูนย์แล้ว"}
```

200 หลัง commit:

```json
{"id":501,"status":"RECEIVED","version":3,"shipment":{"carrier":"Example Carrier","tracking_number":"DEMO-501"},"received_at":"2026-09-18T10:00:00Z"}
```

3. Seller GET detail เห็น RECEIVED/version=3; Inspector GET queue เห็น 501 หากยังไม่มีผู้รับงาน; Seller ส่ง shipment key/payload เดิมอีกครั้งได้ response เดิม version=2 แล้ว GET จึงอ่าน version=3

## Errors และ precedence

ใช้ envelope `{error:{code,message,fields,request_id}}`; VERSION_CONFLICT/INVALID_STATE อาจเพิ่ม current_version/current_status เฉพาะ actor ที่เห็นงาน

| เหตุการณ์ | HTTP / code |
|---|---|
| key หาย/รูปแบบผิด | 400 IDEMPOTENCY_KEY_REQUIRED / INVALID_IDEMPOTENCY_KEY |
| key เดิม payload ต่าง | 409 IDEMPOTENCY_KEY_REUSED |
| key เดิมกำลังทำงาน | 409 REQUEST_IN_PROGRESS พร้อม Retry-After: 2 |
| expected_version เก่า | 409 VERSION_CONFLICT |
| version ปัจจุบัน แต่ผิดขั้น | 409 INVALID_STATE |
| รูปแบบ request ผิด/ฟิลด์ต้องห้าม | 422 VALIDATION_ERROR |
| Order/DB unavailable ก่อน commit | 503 SERVICE_UNAVAILABLE; ไม่มี success record |

ตรวจ authentication/account → schema → scope/action → replay → version → state → business validation; เมื่อหลายเงื่อนไขผิดพร้อมกันใช้ลำดับนี้ Error ของ PostgreSQL/รายละเอียดภายในไม่ส่งถึง client
