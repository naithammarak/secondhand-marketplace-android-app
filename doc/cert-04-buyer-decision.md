# CERT-04 — อ่านผลตรวจและตัดสินใจของผู้ซื้อ

อ้างอิง [issue #104](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/104), [CERT contract #100](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/100#issuecomment-5848063380), INSPECT-00 #54 และ FINISH-00 #98 งานนี้ต่อจาก `feat/cert-03-public-page` commit `07e8aa6` (PR #111) ซึ่งมี CERT-01 schema จาก PR #109 และ CERT-02 atomic issuance จาก PR #110 อยู่ใน ancestry แล้ว ฐานและ schema เหล่านี้ยังต้อง merge ตามลำดับก่อน CERT-04 จะเข้า `main` ได้

## อ่านผล

`GET /orders/{order_id}/inspection` ต้องส่ง Bearer token; บัญชี BUYER หรือ SELLER ที่ `order.buyer_id` ตรงกับบัญชีอ่านได้ รวมถึงผู้ซื้อที่ได้รับอนุมัติเป็น SELLER หลังซื้อและบัญชีที่ไม่ ACTIVE แล้ว ผู้ขายของ Order ที่ไม่ใช่ผู้ซื้อได้ `403 not_order_buyer`; ผู้ไม่เกี่ยวข้องได้ `404 order_not_found`; ยังไม่มีผลสุดท้ายได้ `404 inspection_not_ready` ตรวจสิทธิ์ Order ก่อนตรวจผลเสมอ บัญชี staff ไม่ได้สิทธิ์ผู้ซื้อจากการเป็นเจ้าของ Order ในอดีต

```json
{
  "order_id": 42,
  "order_status": "RESULT_NOTIFIED",
  "result": "PASS",
  "summary": "ผู้เชี่ยวชาญตรวจแล้วว่าเป็นของแท้",
  "inspected_at": "2026-09-28T10:00:00Z",
  "evidence": [{"id": 7, "url": "/inspection-evidence/7", "expires_at": null}],
  "certificate": {"certificate_no": "CERT-EXAMPLE", "status": "ISSUED", "issued_at": "2026-09-28T10:00:00Z", "public_url": "https://api.example.test/certificates/<opaque-token>"},
  "decision": null,
  "can_decide": true,
  "next_action": "WAIT_BUYER_DECISION"
}
```

หลักฐานใช้ endpoint ที่ตรวจสิทธิ์ทุกครั้ง จึงมี `expires_at: null`; ไม่มี object key หรือ URL ของ Storage ในผลตอบรับ ผล `FAKE`/`NOT_AS_DESCRIBED` ไม่มี Certificate, `can_decide=false` และ `next_action=RETURN_TO_SELLER` ผลเข้าเกณฑ์แต่ Certificate หายหรือไม่ตรงกันตอบ `409 inspection_not_ready` แทนการเปิดปุ่มตัดสินใจ

## ตัดสินใจครั้งเดียว

`POST /orders/{order_id}/inspection/decision` ต้องเป็น BUYER หรือ SELLER ที่เป็นผู้ซื้อของ Order และยัง ACTIVE โดยตรวจบทบาท/สถานะจากฐานอีกครั้งหลังล็อก Order; Order ต้องเป็น `RESULT_NOTIFIED` พร้อมผล `PASS`/`MINOR_ISSUE` และ Certificate `ISSUED` เท่านั้น

```json
{"decision":"REJECT","reason":"สภาพสินค้าไม่ตรงที่คาด"}
```

ตอบ `200`:

```json
{"decision":{"decision":"REJECT","reason":"สภาพสินค้าไม่ตรงที่คาด","decided_at":"2026-09-28T10:05:00Z"},"next_action":"RETURN_TO_SELLER"}
```

`CONFIRM` ต้องไม่มี `reason` หรือเป็น `null`; `REJECT` จะไม่ใส่ reason ก็ได้ ข้อความจะถูก trim และข้อความว่างกลายเป็น `null` จำกัด 500 ตัวอักษรหลัง trim ส่ง payload เดิมซ้ำได้ record/เวลาเดิมพร้อม `200`; เปลี่ยนคำตอบหรือเหตุผลได้ `409 decision_already_recorded` ฐานข้อมูลมี unique และ guard กันแก้ย้อนหลัง คู่กับ Order row lock ใน API เพื่อจัดการคำขอพร้อมกัน

Error ใช้ `detail.code` และ `detail.fields` เช่น `inspection_not_ready`, `decision_not_allowed`, `account_inactive`, `not_order_buyer`, `order_not_found`, `validation_error`; คำตอบส่วนตัวทั้งสำเร็จและผิดพลาดส่ง `Cache-Control: no-store` ไม่มี token ได้ `401`

## นโยบายสิทธิ์ของหลักฐานส่วนตัว

| Endpoint | BUYER/SELLER ที่เป็น `order.buyer_id` | บัญชีผู้ซื้อที่ไม่ ACTIVE | Staff |
|---|---|---|---|
| `GET /orders/{id}/inspection` | อ่านผลสุดท้ายได้ | อ่านประวัติได้ แต่ `can_decide=false` | ไม่ได้สิทธิ์ผู้ซื้อ |
| `POST /orders/{id}/inspection/decision` | ACTIVE เท่านั้น; ตัดสินใจ/replay ได้หนึ่งครั้ง | ปฏิเสธทั้งการสร้างและ replay | ปฏิเสธ |
| `GET /inspection-evidence/{id}` | อ่านเฉพาะภาพที่เลือกแนบผลสุดท้าย | อ่านภาพประวัติที่เลือกได้ | Inspector ที่รับงานและ ACTIVE มีสิทธิ์ตามเดิม |
| `GET /shipment-delivery-proofs/{id}` | ACTIVE เท่านั้น | ปฏิเสธ | Courier/Inspector ที่เกี่ยวข้องและ ACTIVE มีสิทธิ์ตามเดิม |

SELLER ที่เป็น `order.seller_id` แต่ไม่ใช่ `order.buyer_id` และบัญชีอื่นไม่มีสิทธิ์หลักฐานส่วนตัว การซื้อสินค้าตัวเองยังตอบ `409 self_purchase`; SELLER ซื้อสินค้าของผู้อื่นได้

## ส่งต่อ FINISH

FINISH อ่าน final result และ Buyer decision จากฐานเองภายใต้ transaction ของงานส่งต่อ แล้วคำนวณ `next_action` ใหม่: ผลบวกที่ยังไม่ตอบ → `WAIT_BUYER_DECISION`; `CONFIRM` → `SHIP_TO_BUYER`; `REJECT` หรือผลลบ → `RETURN_TO_SELLER` ห้ามเชื่อ `next_action` จาก Mobile งาน CERT-04 ไม่สร้าง Shipment ไม่เปลี่ยน Escrow และไม่คืนเงิน การเดินงานต่อไม่แก้ Decision ที่บันทึกไว้

## ตรวจรับ

PostgreSQL integration test ใช้ฐานว่างแยกบน `127.0.0.1` และ flow ของ Order/Courier/Inspector จริง ตรวจสิทธิ์, ผลทั้งสี่, Certificate ไม่พร้อม, validation, replay, คำขอพร้อมกัน และผลข้างเคียงในฐาน; ไม่ใช้ Supabase กลาง
