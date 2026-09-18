# ORDER-00 — Contract กลาง: สั่งซื้อและจ่ายเงินจำลอง

> สถานะ: **v1 (ใช้สร้าง Schema, Mock และ Test ของ ORDER-01…06)**
> Source of truth ของโค้ด: `backend/app/services/order_pricing.py`, `backend/app/schemas/order.py`,
> `backend/app/models/order.py` — ถ้าเอกสารนี้กับโค้ดขัดกัน ให้ถือว่าเป็น Bug และแก้ให้ตรงกัน

## 1. บทบาทและสิทธิ์

ระบบปัจจุบันให้ผู้ใช้หนึ่งคนมีบทบาทเดียว (`users.role`) และมีสถานะบัญชี (`users.status`)

| การกระทำ | BUYER | SELLER | ADMIN | INSPECTOR |
|---|---|---|---|---|
| สร้าง Order (`POST /orders`) | ✅ ถ้า `status=ACTIVE` | ❌ 403 | ❌ 403 | ❌ 403 |
| ดูรายการ/รายละเอียด Order ที่ตนเป็นผู้ซื้อ | ✅ | – | – | – |
| ดูรายการ/รายละเอียด Order ที่ตนเป็นผู้ขาย | – | ✅ | – | – |
| จ่ายเงินจำลอง | ✅ เฉพาะ Order ของตน | ❌ 403 | ❌ | ❌ |
| ดูใบเสร็จ | ✅ เฉพาะ Order ของตน | ❌ 403 | ❌ | ❌ |

- สิทธิ์ตัดสินจาก **Token เท่านั้น** (`sub` → `users.supabase_user_id`) ไม่มี Endpoint ใดรับ `buyer_id` / `seller_id` / ยอดเงินจาก Client
- ผู้ที่ไม่เกี่ยวข้องกับ Order (รวมถึง ADMIN/INSPECTOR ในรอบนี้) ได้ **404** เสมอ เพื่อไม่ให้เดา ID แล้วรู้ว่ามี Order อยู่
- ผู้ขายของ Order ที่ขอใบเสร็จ/จ่ายเงิน ได้ **403** (รู้อยู่แล้วว่า Order มีอยู่ จึงไม่ต้องซ่อน)
- บัญชี `SUSPENDED` / `CLOSED` สร้าง Order หรือจ่ายเงินไม่ได้ (403) แต่ยังอ่าน Order เดิมของตนได้
- ADMIN/INSPECTOR ยังไม่มีมุมมอง Order ในรอบนี้ (ดู Decision Log D-03)

## 2. สถานะ

### Product (ส่วนที่ Order แตะ)
| สถานะ | ความหมาย |
|---|---|
| `AVAILABLE` | พร้อมขาย ซื้อได้ |
| `RESERVED` | ถูกจองโดย Order แล้ว |
| อื่น ๆ / `deleted_at IS NOT NULL` | ซื้อไม่ได้ |

### Order
```
            POST /orders                    pay SUCCESS
 (ไม่มี) ─────────────────▶ WAITING_PAYMENT ─────────────▶ WAITING_SELLER_SHIP
                              │     ▲
                              └─────┘ pay FAILED (สถานะไม่เปลี่ยน, สินค้ายังถูกจอง, ลองใหม่ได้)
```
- ไม่มีการหมดเวลาจ่ายอัตโนมัติและไม่มีการยกเลิกในรอบนี้ (D-05, D-06)
- สถานะ Order ห้ามถอยหลัง: เมื่อเป็น `WAITING_SELLER_SHIP` แล้ว คำขอจ่ายใด ๆ (SUCCESS/FAILED) ได้ 409

### Payment / Escrow
| ตาราง | สถานะ |
|---|---|
| `payment_attempts.outcome` | `SUCCEEDED`, `FAILED` |
| `payments` (เฉพาะที่สำเร็จ) | มีได้ 1 แถวต่อ Order |
| `escrows.status` | `HELD` (รอบนี้มีเท่านั้น) |
| `receipts` | มีได้ 1 ใบต่อ Order |

`payment_status` ใน Response: `UNPAID` (ยังไม่มี payment สำเร็จ) / `PAID`

## 3. เงิน

| รายการ | ค่า | ผู้จ่าย |
|---|---|---|
| สกุลเงิน | `THB` | – |
| ราคาสินค้า `item_price` | `products.price` ณ เวลาสร้าง Order | ผู้ซื้อ |
| ค่าขนส่ง `shipping_fee` | 50.00 คงที่ | ผู้ซื้อ |
| ค่าตรวจสินค้า `inspection_fee` | 100.00 คงที่ | ผู้ซื้อ |
| ค่าคอมมิชชัน `commission_fee` | 5% ของ `item_price` | หักจากผู้ขาย (ไม่รวมในยอดผู้ซื้อ) |

```
total_amount   = item_price + shipping_fee + inspection_fee
commission_fee = round_half_up(item_price × 0.05, 2)
seller_payout  = item_price − commission_fee
```
- ทุกจำนวนเป็น `Decimal` / `NUMERIC(12,2)` ปัดทศนิยม 2 ตำแหน่งแบบ **ROUND_HALF_UP** เฉพาะค่าคอมมิชชัน (ค่าอื่นเป็น 2 ตำแหน่งอยู่แล้ว)
- ใน JSON เงินเป็น **string** รูปแบบ `"1234.50"` เสมอ ห้ามแปลงเป็น number ฝั่ง Client เพื่อคำนวณ
- Server คำนวณครั้งเดียวตอนสร้าง Order แล้วเก็บเป็น Snapshot; การแก้ราคาสินค้าภายหลังไม่กระทบ Order
- Database มี CHECK ว่า `total_amount = item_price + shipping_fee + inspection_fee` และ Payment/Escrow = `total_amount`

## 4. ที่อยู่จัดส่ง (Snapshot ใน Order)

| ฟิลด์ | กติกา |
|---|---|
| `recipient_name` | 2–100 ตัวอักษร หลัง trim |
| `phone` | ตัวเลข 9–10 หลัก ขึ้นต้นด้วย `0` (ยอมให้มี `-` หรือช่องว่าง ระบบตัดออก) |
| `address_line` | 5–255 ตัวอักษร (บ้านเลขที่ ถนน ซอย) |
| `subdistrict` | 2–100 (ตำบล/แขวง) |
| `district` | 2–100 (อำเภอ/เขต) |
| `province` | 2–100 |
| `postal_code` | ตัวเลข 5 หลัก |

**ใครเห็นอะไร**
- ผู้ซื้อ: เห็นที่อยู่เต็มในหน้ารายละเอียด
- ผู้ขาย: เห็นที่อยู่เต็ม **เฉพาะเมื่อ Order เป็น `WAITING_SELLER_SHIP`** (ต้องใช้ส่งของ) ก่อนจ่ายเงินได้ `shipping_address: null`
- ผู้ขายไม่เห็นอีเมลหรือ ID ผู้ใช้ของผู้ซื้อ
- หน้ารายการ (`GET /orders`) **ไม่มีที่อยู่** สำหรับใครเลย

## 5. Idempotency-Key

- Header `Idempotency-Key` **บังคับ** สำหรับ `POST /orders` และ `POST /orders/{id}/payments/simulate`
- รูปแบบ: 8–100 ตัวอักษร `[A-Za-z0-9_-]` (Mobile ใช้ UUID v4)
- Scope:
  - สร้าง Order: ไม่ซ้ำต่อ `(buyer_id, key)`
  - จ่ายเงิน: ไม่ซ้ำต่อ `(order_id, key)`
- Server เก็บ SHA-256 ของ payload ที่ normalize แล้วคู่กับ key

| กรณี | ผล |
|---|---|
| key เดิม + payload เดิม | ได้ผลเดิม (Order เดิม / Attempt เดิม) ไม่สร้างแถวใหม่ Header `Idempotent-Replayed: true` |
| key เดิม + payload ต่าง | **409** `idempotency_key_reused` |
| จ่าย FAILED แล้วอยากลองใหม่ | ต้องใช้ **key ใหม่** (key เดิมจะได้ FAILED เดิมกลับมา) |
| key ใหม่ หลังจ่ายสำเร็จแล้ว | **409** `order_already_paid` ไม่มีเงินซ้ำ ไม่บันทึก Attempt |
| Timeout ไม่รู้ผล | ใช้ **key เดิม** ลองซ้ำได้อย่างปลอดภัย (หรือ `GET /orders/{id}` ตรวจก่อน) |

## 6. รูปแบบ Error

```json
{ "detail": { "code": "<machine_code>", "message": "<ข้อความภาษาไทย>", "...": "ข้อมูลเสริม" } }
```
Validation (422): `{ "detail": { "code": "validation_error", "fields": { "<field>": "<ข้อความไทย>" } } }`

| HTTP | code | เมื่อ |
|---|---|---|
| 401 | (ของ auth เดิม) | ไม่มี/หมดอายุ Token |
| 403 | `buyer_role_required` | ไม่ใช่ BUYER |
| 403 | `account_inactive` | บัญชีไม่ ACTIVE |
| 403 | `not_order_buyer` | ผู้ขายพยายามจ่าย/ดูใบเสร็จ |
| 403 | `payment_simulation_disabled` | Endpoint จำลองปิดอยู่ |
| 404 | `product_not_found` | ไม่มีสินค้า หรือถูก Soft-delete |
| 404 | `order_not_found` | ไม่มี Order หรือไม่มีสิทธิ์ |
| 404 | `receipt_not_found` | ยังไม่มีใบเสร็จ (ยังไม่จ่าย) |
| 409 | `self_purchase` | ซื้อสินค้าของตัวเอง |
| 409 | `product_unavailable` | สินค้าไม่พร้อมขาย / ถูกจองไปแล้ว (รวมผู้แพ้การแข่งจอง) |
| 409 | `already_ordered` | ผู้ซื้อคนนี้จองสินค้านี้ไว้แล้ว มี `order_id` ให้เปิด Order เดิม |
| 409 | `idempotency_key_reused` | key เดิม payload ต่าง |
| 409 | `order_already_paid` | จ่ายซ้ำหลังสำเร็จ |
| 422 | `validation_error` | ที่อยู่/`product_id`/`outcome`/`Idempotency-Key` ไม่ถูกต้อง |

## 7. API

ทุก Endpoint ต้องมี `Authorization: Bearer <supabase access token>`

### 7.0 `GET /orders/checkout-quote?product_id=12` (D-17)
เฉพาะ BUYER ที่ ACTIVE ใช้แสดงยอดในหน้า Checkout ก่อนกดยืนยัน (ไม่จองสินค้า ไม่สร้างอะไร)
Error เหมือน `POST /orders` (`product_not_found`, `self_purchase`, `product_unavailable`, `already_ordered`)
```json
{
  "product": { "id": 12, "name": "เสื้อแจ็กเก็ตมือสอง", "condition": "ดี", "size": "M" },
  "currency": "THB",
  "item_price": "1200.00",
  "shipping_fee": "50.00",
  "inspection_fee": "100.00",
  "total_amount": "1350.00"
}
```
ยอดที่ใช้จริงคือยอดใน Response ของ `POST /orders` (คำนวณใหม่จากแถวสินค้าที่ถูกล็อก)

### 7.1 `POST /orders`
Request
```http
POST /orders
Idempotency-Key: 3f0e8f7c-0a51-4c35-9d1e-5b8f0f0d1a11
Content-Type: application/json

{
  "product_id": 12,
  "shipping_address": {
    "recipient_name": "ผู้ซื้อ ทดสอบ",
    "phone": "081-234-5678",
    "address_line": "99/1 ถนนทดสอบ",
    "subdistrict": "แขวงทดสอบ",
    "district": "เขตทดสอบ",
    "province": "กรุงเทพมหานคร",
    "postal_code": "10110"
  }
}
```
ฟิลด์อื่น (เช่น `buyer_id`, `total_amount`) ถูก **ปฏิเสธ 422** (`extra="forbid"`) เพื่อให้เห็นชัดว่าไม่ถูกใช้

Response `201` (replay ก็ได้ `201` พร้อม `Idempotent-Replayed: true`) → `OrderDetail` (ดู 7.3)

### 7.2 `GET /orders?role=buyer|seller&limit=20&offset=0`
- `role` ไม่ใส่ = `buyer` ถ้าผู้เรียกเป็น BUYER, `seller` ถ้าเป็น SELLER, อื่น ๆ ได้รายการว่าง
- `role` เป็นแค่ตัวกรองมุมมอง: เงื่อนไข `buyer_id = <ผู้เรียก>` หรือ `seller_id = <ผู้เรียก>` ถูกบังคับเสมอ
- `limit` 1–100 (ค่าเริ่ม 20), `offset` ≥ 0; เรียง `created_at DESC, id DESC` (คงที่)

Response `200`
```json
{
  "items": [
    {
      "id": 41,
      "status": "WAITING_PAYMENT",
      "payment_status": "UNPAID",
      "viewer_role": "buyer",
      "product": { "id": 12, "name": "เสื้อแจ็กเก็ตมือสอง", "condition": "ดี", "size": "M" },
      "total_amount": "1350.00",
      "seller_payout": null,
      "currency": "THB",
      "created_at": "2026-09-18T10:00:00Z",
      "paid_at": null
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```
ผู้ขายเห็น `total_amount: null` และ `seller_payout: "1140.00"` แทน (ผู้ขายสนใจยอดที่จะได้รับ)

### 7.3 `GET /orders/{id}` → `OrderDetail`
```json
{
  "id": 41,
  "status": "WAITING_PAYMENT",
  "payment_status": "UNPAID",
  "viewer_role": "buyer",
  "product": { "id": 12, "name": "เสื้อแจ็กเก็ตมือสอง", "condition": "ดี", "size": "M" },
  "amounts": {
    "currency": "THB",
    "item_price": "1200.00",
    "shipping_fee": "50.00",
    "inspection_fee": "100.00",
    "total_amount": "1350.00",
    "commission_fee": null,
    "seller_payout": null
  },
  "shipping_address": { "recipient_name": "…", "phone": "0812345678", "address_line": "…",
                        "subdistrict": "…", "district": "…", "province": "…", "postal_code": "10110" },
  "last_payment_attempt": { "id": 7, "outcome": "FAILED", "amount": "1350.00", "created_at": "…" },
  "paid_at": null,
  "receipt_no": null,
  "can_pay": true,
  "created_at": "…",
  "updated_at": "…"
}
```
มุมมองผู้ขาย: `amounts.shipping_fee/inspection_fee/total_amount = null`, `commission_fee` และ `seller_payout` มีค่า,
`shipping_address = null` จนกว่าจะ `WAITING_SELLER_SHIP`, `last_payment_attempt = null`, `receipt_no = null`, `can_pay = false`
`can_pay` คำนวณที่ Server (ผู้ซื้อ + `WAITING_PAYMENT` + บัญชี ACTIVE) — Client ห้ามคิดเอง

### 7.4 `POST /orders/{id}/payments/simulate`
```http
POST /orders/41/payments/simulate
Idempotency-Key: 8d3c…
Content-Type: application/json

{ "outcome": "SUCCESS" }      // หรือ "FAILED"
```
Response `200` (ทั้ง SUCCESS และ FAILED เป็นผลทางธุรกิจ ไม่ใช่ HTTP error)
```json
{
  "attempt": { "id": 8, "outcome": "SUCCEEDED", "amount": "1350.00", "created_at": "…" },
  "order": { "...": "OrderDetail หลังจ่าย", "status": "WAITING_SELLER_SHIP", "payment_status": "PAID",
             "receipt_no": "RC-000041", "can_pay": false }
}
```
- ยอดที่จ่ายมาจาก `orders.total_amount` เสมอ (body ไม่มีฟิลด์ยอด)
- เปิดใช้เฉพาะเมื่อ `PAYMENT_SIMULATION_ENABLED=true` และ `APP_ENV` ไม่ใช่ `production`/`prod`

### 7.5 `GET /orders/{id}/receipt`
Response `200` (เฉพาะผู้ซื้อ, หลังจ่ายสำเร็จ)
```json
{
  "receipt_no": "RC-000041",
  "order_id": 41,
  "issued_at": "…",
  "payment_method": "SIMULATED",
  "currency": "THB",
  "product_name": "เสื้อแจ็กเก็ตมือสอง",
  "item_price": "1200.00",
  "shipping_fee": "50.00",
  "inspection_fee": "100.00",
  "total_amount": "1350.00"
}
```
ไม่มีที่อยู่ อีเมล หรือข้อมูลผู้ขายในใบเสร็จ

## 8. Decision Log

| # | เรื่อง | การตัดสินใจ | เหตุผล |
|---|---|---|---|
| D-01 | สถานะ Product/Login ใน Repo | Login พร้อม (Supabase JWT + `users`). Product มีแค่ Model/Migration ยังไม่มี API/หน้าจอ และไม่มีค่าสถานะที่ตกลงไว้ → Order กำหนด `AVAILABLE`/`RESERVED` เองในที่เดียว (`order_pricing.py`) | ไม่หยุดงานรอ PRODUCT; ค่าอยู่ที่เดียวเปลี่ยนง่าย |
| D-02 | ใครซื้อได้ | เฉพาะ `role=BUYER` ที่ `ACTIVE` | ระบบให้ผู้ใช้มีบทบาทเดียว; ปลอดภัยที่สุด |
| D-03 | ADMIN/INSPECTOR | ไม่มีสิทธิ์อ่าน Order รอบนี้ (404) | Least privilege; งานตรวจสินค้ายังไม่อยู่ใน Scope |
| D-04 | ค่าธรรมเนียม | ขนส่ง 50, ตรวจ 100 (ผู้ซื้อจ่าย), คอมมิชชัน 5% หักผู้ขาย, THB, ROUND_HALF_UP | ตัวเลขง่ายต่อการตรวจ Demo; คอมมิชชันไม่บวกในยอดผู้ซื้อจึงยอดชำระตรงกับที่แสดง |
| D-05 | Timer 30 นาที vs Prototype | **ไม่ทำ Timer ในรอบนี้** สินค้าถูกจองจนกว่าจะจ่ายสำเร็จ | Prototype ล่าสุดเลื่อนงานอัตโนมัติ; ไม่มี Scheduler ใน Repo; Timer ที่ไม่มีใครบังคับใช้จะทำให้ข้อมูลกับ UI ไม่ตรงกัน. ความเสี่ยง: ผู้ซื้อค้างจองได้ไม่จำกัด (บันทึกใน Risk) |
| D-06 | ยกเลิก Order | ไม่ทำรอบนี้ | ตามโจทย์ |
| D-07 | จองสินค้าระดับ DB | partial unique index `orders(product_id) WHERE status <> 'CANCELLED'` + conditional update `products.status AVAILABLE→RESERVED` ใน Transaction เดียว | ใช้ `<> 'CANCELLED'` เพื่อให้สถานะอนาคต (SHIPPED ฯลฯ) ถูกกันซ้ำโดยอัตโนมัติ |
| D-08 | แยก Attempt กับ Payment | `payment_attempts` เก็บทุกครั้ง (รวม FAILED); `payments` เก็บเฉพาะสำเร็จ `UNIQUE(order_id)` | ตามโจทย์ และ Constraint ง่าย |
| D-09 | Idempotency เก็บที่ไหน | เก็บ key + hash บนแถว `orders` และ `payment_attempts` ไม่แยกตาราง | Key ผูกกับทรัพยากรที่มันสร้าง; ไม่ต้องมีงานล้าง key |
| D-10 | key ใหม่หลังจ่ายแล้ว | 409 `order_already_paid` ไม่บันทึก Attempt | ไม่มีเงินซ้ำ; Client รู้ชัดว่าต้องไปดู Order |
| D-11 | Replay ของ create | คืน `OrderDetail` ปัจจุบัน (อาจจ่ายแล้ว) | Client ต้องการสถานะจริงล่าสุด |
| D-12 | ผู้ขายเห็นที่อยู่ | เฉพาะหลังจ่ายแล้ว | ผู้ขายต้องใช้ส่งของเท่านั้น |
| D-13 | Endpoint จำลอง | ปิดเป็นค่าเริ่มต้น (fail-closed) ต้องตั้ง `PAYMENT_SIMULATION_ENABLED=true` | กันเปิดทิ้งไว้บน Production |
| D-14 | เงินใน JSON | string | กันความคลาดเคลื่อนของ float ใน JS |
| D-15 | `already_ordered` | ถ้าผู้ซื้อจองสินค้านี้ไว้แล้ว (key ใหม่ เช่นกด Back แล้วเข้าใหม่) ตอบ 409 พร้อม `order_id` | Mobile พาไป Order เดิมแทนการสร้างซ้ำ |
| D-16 | ทางเข้า Checkout บน Mobile | ยังไม่มีหน้าสินค้า → เพิ่มทางเข้าชั่วคราว "ซื้อด้วยรหัสสินค้า" (Stub แยกไฟล์) ที่เปิด `/checkout/[productId]` | หน้าสินค้าจริงเรียก `router.push('/checkout/<id>')` ได้ทันทีเมื่อ PRODUCT พร้อม |
| D-17 | ข้อมูลก่อนสร้าง Order | เพิ่ม `GET /orders/checkout-quote?product_id=` คืนสินค้า + ค่าธรรมเนียมจาก Server | หน้า Checkout แสดงยอดจาก Server ได้ก่อนกดยืนยัน ไม่ต้องคำนวณเอง |
