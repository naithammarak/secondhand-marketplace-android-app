# ORDER-00 — Contract กลาง: สั่งซื้อและจ่ายเงินจำลอง

> สถานะ: **v3 (เพิ่มมุมมอง Order ของผู้ดูแลระบบใน ORDER-09)**
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
| ยกเลิก Order ที่ยังไม่จ่าย | ✅ เฉพาะ Order ของตน | ❌ 403 | ❌ | ❌ |
| ดูใบเสร็จ | ✅ เฉพาะ Order ของตน | ❌ 403 | ❌ | ❌ |
| ดูรายการ/รายละเอียด Order ทั้งระบบ **แบบปิดบัง** (`/admin/orders`) | ❌ 403 | ❌ 403 | ✅ | ❌ 403 |
| ขอดูอีเมล/ที่อยู่เต็มของผู้ซื้อ (`/admin/orders/{id}/contact`) | ❌ 403 | ❌ 403 | ✅ ต้องมีเหตุผล + Audit Log | ❌ 403 |

- สิทธิ์ตัดสินจาก **Token เท่านั้น** (`sub` → `users.supabase_user_id`) ไม่มี Endpoint ใดรับ `buyer_id` / `seller_id` / ยอดเงินจาก Client
- ผู้ที่ไม่เกี่ยวข้องกับ Order ได้ **404** เสมอจาก Endpoint ใต้ `/orders` เพื่อไม่ให้เดา ID แล้วรู้ว่ามี Order อยู่
  (ADMIN ก็ได้ 404 เหมือนกัน เพราะมุมมองของผู้ดูแลอยู่คนละเส้นทางคือ `/admin/orders`)
- ผู้ขายของ Order ที่ขอใบเสร็จ/จ่ายเงิน ได้ **403** (รู้อยู่แล้วว่า Order มีอยู่ จึงไม่ต้องซ่อน)
- บัญชี `SUSPENDED` / `CLOSED` สร้าง Order หรือจ่ายเงินไม่ได้ (403) แต่ยังอ่าน Order เดิมของตนได้
- ADMIN มีมุมมองของตัวเองที่ `/admin/orders` ซึ่ง**ปิดบังข้อมูลส่วนบุคคลเป็นค่าตั้งต้น** (ดู 1.1 และ D-03/D-21)
- INSPECTOR ยังไม่มีมุมมอง Order ในรอบนี้ (งานตรวจสินค้า FR-15 ถึง FR-17 เป็นคนละ Feature)

## 1.1 ใครเห็นข้อมูลอะไร

| ฟิลด์ | Buyer | Seller | Admin | หน้า QR สาธารณะ |
|---|---|---|---|---|
| ยอดเงิน, สถานะ, Snapshot สินค้า | เห็น | เห็น | เห็น | ไม่เห็น |
| ที่อยู่จัดส่ง | เห็นเต็ม | เห็นเต็มเฉพาะหลังชำระเงิน (D-12) | **ปิดบังเป็นค่าตั้งต้น** เปิดดูเต็มได้ | ไม่เห็น |
| อีเมล Buyer | เห็นของตนเอง | ไม่เห็น | **ปิดบังเป็นค่าตั้งต้น** เปิดดูเต็มได้ | ไม่เห็น |
| ใบเสร็จ | เห็น | ไม่เห็นข้อมูลส่วนตัว | เห็นเท่าที่จำเป็น (เลขใบเสร็จ + ยอด ไม่มีข้อมูลส่วนบุคคล) | ไม่เห็น |

ฐานของตารางนี้: FR-42 กำหนดให้ผู้ดูแลจัดการคำสั่งซื้อ การคืนเงิน และข้อพิพาท การเห็นข้อมูล Order
จึงเป็นหน้าที่ตามข้อกำหนด ส่วนข้อห้ามแสดงข้อมูลส่วนบุคคลผูกกับ**หน้า QR สาธารณะ** ไม่ได้ห้ามผู้ดูแล
และ SRS มีแบบแผนสำหรับข้อมูลที่อ่อนไหวกว่านี้อยู่แล้ว (สำเนาบัตรประชาชน เข้าถึงได้เฉพาะแอดมินที่ได้รับสิทธิ์,
ประวัติแชท เข้าถึงได้เมื่อมีข้อพิพาทพร้อมบันทึกทุกครั้ง) ที่อยู่และอีเมลจึงใช้เกณฑ์เดียวกันได้

**หลักการบังคับ: ผู้ดูแลมีสิทธิ์เข้าถึง แต่ระบบไม่แสดงให้อัตโนมัติ**
- Response ค่าตั้งต้นส่งค่าที่ปิดบังแล้ว: อีเมลเป็น `s***@gmail.com` ที่อยู่เหลือจังหวัด รหัสไปรษณีย์
  และเลขท้ายโทรศัพท์ 4 ตัว
- การขอดูข้อมูลเต็มเป็น Endpoint แยก ต้องระบุเหตุผล และบันทึก Audit Log ทุกครั้ง (NFR-04)
- ถ้าทีมตัดสินภายหลังว่าผู้ดูแลไม่ควรเห็นเลย ปิดได้ด้วย `ADMIN_ORDER_CONTACT_REVEAL_ENABLED=false`
  โดยไม่ต้องแก้ Schema หรือหน้าจอ (D-21)
- Seller และหน้าสาธารณะ **ไม่เปลี่ยน**: ผู้ขายยังเห็นที่อยู่เฉพาะหลังชำระเงิน และไม่เห็นอีเมลผู้ซื้อเลย

## 2. สถานะ

### Product (ส่วนที่ Order แตะ)
ค่าเหล่านี้ตรงกับ `ck_products_status` ใน `backend/app/models/product.py` แล้ว (ดู D-01)

| สถานะ | ความหมาย |
|---|---|
| `AVAILABLE` | พร้อมขาย ซื้อได้ |
| `RESERVED` | ถูกจองโดย Order แล้ว |
| `SOLD` / `CANCELLED` / `deleted_at IS NOT NULL` | ซื้อไม่ได้ |

การยกเลิก Order และการหมดเวลาจ่ายเงินคืนสินค้าจาก `RESERVED` เป็น `AVAILABLE` เสมอ
สินค้าที่ถูกลบ (`deleted_at`) หรือเปลี่ยนสถานะไปแล้วจะไม่ถูกแตะ

### Order
```
            POST /orders                    pay SUCCESS
 (ไม่มี) ─────────────────▶ WAITING_PAYMENT ─────────────▶ WAITING_SELLER_SHIP
                              │     ▲
                              └─────┘ pay FAILED (สถานะไม่เปลี่ยน, สินค้ายังถูกจอง, ลองใหม่ได้)
                              │
                              │ POST /orders/{id}/cancel   → cancel_reason = BUYER
                              │ เลย expires_at (30 นาที)    → cancel_reason = EXPIRED
                              ▼
                          CANCELLED
```
- สถานะ Order ห้ามถอยหลัง: เมื่อเป็น `WAITING_SELLER_SHIP` แล้ว คำขอจ่ายหรือยกเลิกใด ๆ ได้ 409
- `CANCELLED` เป็นสถานะสุดท้าย จ่ายเงินไม่ได้อีก และผู้ซื้อสั่งซื้อสินค้าชิ้นเดิมใหม่ได้
- ฐานข้อมูลบังคับว่า `CANCELLED` ต้องมี `cancelled_at` และ `cancel_reason` เสมอ และต้องไม่มี `paid_at`
  (`ck_orders_cancel_fields`, `ck_orders_cancel_not_paid`)

### เส้นตายการจ่ายเงิน (D-05)
- `expires_at = created_at + 30 นาที` กำหนดครั้งเดียวตอนสร้าง Order การแก้ค่าหน้าต่างเวลาภายหลังไม่ย้ายเส้นตายของ Order เดิม
- **ไม่มี scheduler**: ระบบตรวจและยกเลิกให้ตอนมีคนมาแตะ Order นั้น (lazy expiry) ได้แก่
  `GET /orders/{id}`, `GET /orders`, การจ่ายเงิน และตอนมีผู้ซื้อรายอื่นขอซื้อสินค้าชิ้นนั้น
- จุดบังคับใช้ที่แท้จริงคือการจ่ายเงิน ซึ่งล็อกแถว Order อยู่แล้ว จึงไม่มีทางจ่ายสำเร็จหลังเลยเวลา
- Client ห้ามคิดเส้นตายเอง ให้แสดงเวลาที่เหลือจาก `expires_at` และถามสถานะจริงเมื่อนับถึงศูนย์

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
| ยกเลิก Order | **ไม่ต้องใช้ key** เพราะไม่สร้างแถวใหม่และเรียกซ้ำได้ผลเดิม (D-18) |
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
| 403 | (ข้อความ `Admin role is required`) | ไม่ใช่ ADMIN ที่ ACTIVE แต่เรียก `/admin/orders...` (ใช้ตัวตรวจสิทธิ์เดียวกับงานตรวจผู้ขาย) |
| 403 | `admin_contact_reveal_disabled` | ปิด Endpoint ขอดูข้อมูลเต็มไว้ในสภาพแวดล้อมนี้ |
| 409 | `self_purchase` | ซื้อสินค้าของตัวเอง |
| 409 | `sale_type_unsupported` | สินค้าไม่ได้ขายแบบราคาปกติ (เช่น ประมูล) ยังสั่งซื้อไม่ได้ในรอบนี้ (D-20) |
| 409 | `product_unavailable` | สินค้าไม่พร้อมขาย / ถูกจองไปแล้ว (รวมผู้แพ้การแข่งจอง) |
| 409 | `already_ordered` | ผู้ซื้อคนนี้จองสินค้านี้ไว้แล้ว มี `order_id` ให้เปิด Order เดิม |
| 409 | `idempotency_key_reused` | key เดิม payload ต่าง |
| 409 | `order_already_paid` | จ่ายซ้ำหลังสำเร็จ หรือขอยกเลิก Order ที่จ่ายแล้ว |
| 409 | `order_cancelled` | จ่ายเงิน Order ที่ถูกยกเลิกไปแล้ว |
| 409 | `order_expired` | จ่ายเงินหลังเลย `expires_at` (ระบบยกเลิก Order ให้ในคำขอเดียวกัน) |
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
      "expires_at": "2026-09-18T10:30:00Z",
      "cancel_reason": null,
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
  "can_cancel": true,
  "expires_at": "2026-09-18T10:30:00Z",
  "cancelled_at": null,
  "cancel_reason": null,
  "created_at": "…",
  "updated_at": "…"
}
```
มุมมองผู้ขาย: `amounts.shipping_fee/inspection_fee/total_amount = null`, `commission_fee` และ `seller_payout` มีค่า,
`shipping_address = null` จนกว่าจะ `WAITING_SELLER_SHIP`, `last_payment_attempt = null`, `receipt_no = null`,
`can_pay = false`, `can_cancel = false` (ผู้ขายเห็น `expires_at` และ `cancel_reason` ได้ เพราะต้องรู้ว่ารออะไรอยู่)
`can_pay` และ `can_cancel` คำนวณที่ Server (ผู้ซื้อ + `WAITING_PAYMENT` + ยังไม่เลย `expires_at` + บัญชี ACTIVE) — Client ห้ามคิดเอง
`cancel_reason` เป็น `BUYER` หรือ `EXPIRED` เท่านั้น

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

### 7.5 `POST /orders/{id}/cancel`
ยกเลิกคำสั่งซื้อที่ยังไม่ได้ชำระเงิน เฉพาะผู้ซื้อของ Order นั้นและบัญชีต้อง `ACTIVE`
ไม่มี Request body และไม่ต้องมี `Idempotency-Key` (D-18)

```http
POST /orders/41/cancel
Authorization: Bearer <token>
```

Response `200` → `OrderDetail` ที่ `status = "CANCELLED"`, `cancel_reason = "BUYER"`, `can_pay = false`, `can_cancel = false`

| กรณี | ผล |
|---|---|
| ยกเลิกซ้ำ | `200` พร้อมข้อมูลเดิม (`cancelled_at` ไม่เปลี่ยน) ไม่ถือเป็นข้อผิดพลาด |
| Order จ่ายเงินแล้ว | `409` `order_already_paid` |
| เลย `expires_at` ไปแล้วแต่ยังไม่มีใครกวาด | `200` และบันทึก `cancel_reason = "EXPIRED"` ตามความจริง |
| ผู้ขายของ Order | `403` `not_order_buyer` |
| คนอื่น | `404` `order_not_found` |
| บัญชีไม่ ACTIVE | `403` `account_inactive` |

ผลข้างเคียงเดียวคือสินค้ากลับเป็น `AVAILABLE` (เฉพาะชิ้นที่ยัง `RESERVED` และยังไม่ถูกลบ)
ไม่มีการแตะตาราง `payment_attempts` / `payments` / `escrows` / `receipts` เพราะ Order ที่ยกเลิกได้ต้องยังไม่จ่ายเงิน

### 7.6 `GET /orders/{id}/receipt`
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

### 7.7 `GET /admin/orders?status=&limit=20&offset=0` (ADMIN เท่านั้น)
รายการคำสั่งซื้อทั้งระบบ เรียง `created_at DESC, id DESC` ส่วน `status` เป็นตัวกรองที่ใส่หรือไม่ใส่ก็ได้
ระบบ **กวาด Order ที่หมดเวลาทั้งระบบก่อนอ่าน** ผู้ดูแลจึงไม่เห็นสถานะรอชำระเงินที่เลยเวลาไปแล้ว
```json
{
  "items": [
    {
      "id": 41,
      "status": "WAITING_PAYMENT",
      "payment_status": "UNPAID",
      "product": { "id": 12, "name": "เสื้อแจ็กเก็ตมือสอง", "condition": "ดี", "size": "M" },
      "buyer": { "id": 7, "name": "ผู้ซื้อ ทดสอบ", "email_masked": "s***@gmail.com" },
      "seller": { "id": 9, "name": "ผู้ขาย ทดสอบ", "email_masked": "k***@gmail.com" },
      "currency": "THB",
      "total_amount": "1350.00",
      "expires_at": "2026-09-18T10:30:00Z",
      "cancel_reason": null,
      "created_at": "2026-09-18T10:00:00Z",
      "paid_at": null
    }
  ],
  "total": 1, "limit": 20, "offset": 0
}
```
**ไม่มีที่อยู่ในระดับรายการเลย** ไม่ว่าจะเต็มหรือปิดบัง

### 7.8 `GET /admin/orders/{id}` (ADMIN เท่านั้น)
เหมือน 7.7 แต่มียอดแยกช่อง ที่อยู่แบบปิดบัง และเลขใบเสร็จ
```json
{
  "id": 41,
  "status": "WAITING_PAYMENT",
  "payment_status": "UNPAID",
  "product": { "id": 12, "name": "เสื้อแจ็กเก็ตมือสอง", "condition": "ดี", "size": "M" },
  "buyer": { "id": 7, "name": "ผู้ซื้อ ทดสอบ", "email_masked": "s***@gmail.com" },
  "seller": { "id": 9, "name": "ผู้ขาย ทดสอบ", "email_masked": "k***@gmail.com" },
  "amounts": { "currency": "THB", "item_price": "1200.00", "shipping_fee": "50.00",
               "inspection_fee": "100.00", "total_amount": "1350.00",
               "commission_fee": "60.00", "seller_payout": "1140.00" },
  "shipping_address_masked": { "province": "กรุงเทพมหานคร", "postal_code": "10110", "phone_masked": "***5678" },
  "receipt_no": null,
  "paid_at": null, "expires_at": "2026-09-18T10:30:00Z",
  "cancelled_at": null, "cancel_reason": null,
  "created_at": "…", "updated_at": "…",
  "contact_reveal_available": true
}
```
`contact_reveal_available = false` เมื่อ Endpoint 7.9 ถูกปิด — หน้าจอต้องซ่อนปุ่มขอดูข้อมูลเต็มตามค่านี้

### 7.9 `POST /admin/orders/{id}/contact` (ADMIN เท่านั้น, บันทึก Audit Log)
```http
POST /admin/orders/41/contact
Content-Type: application/json

{ "reason": "ตรวจสอบข้อพิพาทการจัดส่งตามคำร้องของผู้ซื้อ" }
```
- `reason` **บังคับ** 10–500 ตัวอักษรหลัง trim ไม่ผ่านได้ `422` `validation_error` (`fields.reason`)
- ทุกคำขอที่สำเร็จเขียนหนึ่งแถวลง `admin_access_logs`
  (`admin_id`, `action='ORDER_CONTACT_REVEAL'`, `target_type='ORDER'`, `target_id`, `reason`, `created_at`)
  และ **commit ก่อนสร้าง Response** ถ้าบันทึกไม่สำเร็จจะไม่มีการเปิดเผยข้อมูล
- ไม่ต้องใช้ `Idempotency-Key` แต่การเรียกซ้ำจะได้ Audit Log เพิ่มอีกแถวเสมอ (ตั้งใจให้เป็นเช่นนั้น)

Response `200`
```json
{
  "order_id": 41,
  "buyer_email": "somebody@gmail.com",
  "shipping_address": { "recipient_name": "…", "phone": "0812345678", "address_line": "…",
                        "subdistrict": "…", "district": "…", "province": "…", "postal_code": "10110" },
  "reason": "ตรวจสอบข้อพิพาทการจัดส่งตามคำร้องของผู้ซื้อ",
  "revealed_at": "…",
  "audit_log_id": 3
}
```

| กรณี | ผล |
|---|---|
| ไม่ใช่ ADMIN หรือ ADMIN ที่ถูกระงับ | `403` (ตัวตรวจสิทธิ์เดียวกับ `/admin/verifications`) |
| ไม่มี Order นั้น | `404` `order_not_found` และ **ไม่บันทึก Audit Log** |
| ปิด Endpoint ด้วย env | `403` `admin_contact_reveal_disabled` และ **ไม่บันทึก Audit Log** |

## 8. Decision Log

| # | เรื่อง | การตัดสินใจ | เหตุผล |
|---|---|---|---|
| D-01 | สถานะ Product/Login ใน Repo | ~~Order กำหนด `AVAILABLE`/`RESERVED` เองชั่วคราว~~ → **ปิดแล้ว**: งาน PRODUCT-01 เข้า main พร้อม `ck_products_status` = `AVAILABLE/RESERVED/SOLD/CANCELLED` และ `ck_products_sale_type` = `FIXED_PRICE` ค่าที่ ORDER ใช้ตรงกันทั้งหมด | ค่าที่เดาไว้ตรงกับของจริง ไม่ต้องแก้โค้ด |
| D-02 | ใครซื้อได้ | เฉพาะ `role=BUYER` ที่ `ACTIVE` | ระบบให้ผู้ใช้มีบทบาทเดียว; ปลอดภัยที่สุด |
| D-03 | ADMIN/INSPECTOR | ~~ไม่มีสิทธิ์อ่าน Order รอบนี้~~ → **แก้ใน ORDER-09**: ADMIN อ่านได้ผ่าน `/admin/orders` แบบปิดบังข้อมูลส่วนบุคคล ส่วน INSPECTOR ยังไม่มีสิทธิ์ และ ADMIN ยังเข้า `/orders/...` ไม่ได้ (404) | FR-42 ระบุให้ผู้ดูแลจัดการคำสั่งซื้อ การคืนเงิน และข้อพิพาท จึงไม่ต้องรอมติเพิ่ม ส่วนงานของ INSPECTOR ผูกกับ FR-15 ถึง FR-17 ซึ่งเป็นคนละ Feature |
| D-04 | ค่าธรรมเนียม | ขนส่ง 50, ตรวจ 100 (ผู้ซื้อจ่าย), คอมมิชชัน 5% หักผู้ขาย, THB, ROUND_HALF_UP | ตัวเลขง่ายต่อการตรวจ Demo; คอมมิชชันไม่บวกในยอดผู้ซื้อจึงยอดชำระตรงกับที่แสดง |
| D-05 | Timer 30 นาที | **ข้อกำหนดนี้มีผลบังคับ ทำแล้วใน ORDER-08** (บันทึกเดิมที่ว่า "เลื่อนไปรอบหน้า" ผิด สิ่งที่เลื่อนคือ Background Job เท่านั้น): เก็บ `expires_at = created_at + 30 นาที` บนแถว Order ตั้งแต่รอบนี้เพื่อไม่ต้อง Migration ซ้ำ, `GET /orders/{id}` และ `GET /orders` คืน `expires_at` ให้หน้าจอนับถอยหลังได้, ระบบยกเลิกและปล่อยสินค้าให้ตอนมีคนมาแตะ (lazy expiry) ไม่เพิ่ม Scheduler เข้า Repo | NFR-10 ระบุตรงตัวว่าผู้ซื้อต้องชำระภายใน 30 นาที ไม่เช่นนั้นระบบต้องยกเลิกและปลดล็อกสินค้ากลับสู่สถานะพร้อมขายอัตโนมัติ การเลื่อนทั้งข้อจึงขัดข้อกำหนด ส่วน lazy expiry บังคับใช้ที่จุดจ่ายเงินซึ่งล็อกแถวอยู่แล้ว จึงไม่มีทางจ่ายสำเร็จหลังเลยเวลา **ความเสี่ยงที่เหลือ:** ถ้าไม่มีใครแตะ Order นั้นเลย (ผู้ซื้อหายไป และไม่มีผู้ซื้อรายอื่นเปิดสินค้าชิ้นนั้น) สินค้าจะค้าง `RESERVED` จนกว่าจะมีคนมากวาด วิธีแก้ชั่วคราวคือรัน `python -m scripts.release_expired_orders --apply` เป็นงานประจำ และการเปิดหน้ารายการของผู้ดูแลก็กวาดให้ทั้งระบบเช่นกัน จนกว่าจะมี Background Job จริง |
| D-06 | ยกเลิก Order | **ทำแล้วใน ORDER-08**: `POST /orders/{id}/cancel` เฉพาะผู้ซื้อ เฉพาะ Order ที่ยังไม่จ่าย | โครงสร้างเดิมเผื่อไว้แล้ว (partial unique index ใช้ `status <> 'CANCELLED'` ตั้งแต่ ORDER-01) จึงเพิ่มได้โดยไม่ต้องสร้าง index ใหม่ |
| D-07 | จองสินค้าระดับ DB | partial unique index `orders(product_id) WHERE status <> 'CANCELLED'` + conditional update `products.status AVAILABLE→RESERVED` ใน Transaction เดียว | ใช้ `<> 'CANCELLED'` เพื่อให้สถานะอนาคต (SHIPPED ฯลฯ) ถูกกันซ้ำโดยอัตโนมัติ |
| D-08 | แยก Attempt กับ Payment | `payment_attempts` เก็บทุกครั้ง (รวม FAILED); `payments` เก็บเฉพาะสำเร็จ `UNIQUE(order_id)` | ตามโจทย์ และ Constraint ง่าย |
| D-09 | Idempotency เก็บที่ไหน | เก็บ key + hash บนแถว `orders` และ `payment_attempts` ไม่แยกตาราง | Key ผูกกับทรัพยากรที่มันสร้าง; ไม่ต้องมีงานล้าง key |
| D-10 | key ใหม่หลังจ่ายแล้ว | 409 `order_already_paid` ไม่บันทึก Attempt | ไม่มีเงินซ้ำ; Client รู้ชัดว่าต้องไปดู Order |
| D-11 | Replay ของ create | คืน `OrderDetail` ปัจจุบัน (อาจจ่ายแล้ว) | Client ต้องการสถานะจริงล่าสุด |
| D-12 | ผู้ขายเห็นที่อยู่ | เฉพาะหลังจ่ายแล้ว | ผู้ขายต้องใช้ส่งของเท่านั้น |
| D-13 | Endpoint จำลอง | ปิดเป็นค่าเริ่มต้น (fail-closed) ต้องตั้ง `PAYMENT_SIMULATION_ENABLED=true` | กันเปิดทิ้งไว้บน Production |
| D-14 | เงินใน JSON | string | กันความคลาดเคลื่อนของ float ใน JS |
| D-15 | `already_ordered` | ถ้าผู้ซื้อจองสินค้านี้ไว้แล้ว (key ใหม่ เช่นกด Back แล้วเข้าใหม่) ตอบ 409 พร้อม `order_id` | Mobile พาไป Order เดิมแทนการสร้างซ้ำ |
| D-16 | ทางเข้า Checkout บน Mobile | **ปิดแล้ว**: หน้าสินค้าจริง (`/products/[id]`) มีปุ่ม "ซื้อสินค้านี้" ที่เปิด `/checkout/[productId]` แล้ว ทางเข้าชั่วคราว "ซื้อด้วยรหัสสินค้า" เก็บไว้ทดสอบได้ แต่ต้องอยู่หลัง Feature Flag `EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY` ที่ปิดเป็นค่าตั้งต้น และเปิดไม่ได้เลยใน build production เพราะมีเงื่อนไข `__DEV__` ร่วมด้วย ทางเข้านี้ **ไม่นับว่าปิดงาน ORDER-04** | หน้าสินค้าสาธารณะแสดงเฉพาะสินค้าที่ `AVAILABLE` จึงมีปุ่มซื้อได้เสมอ ส่วนสิทธิ์ซื้อ (`self_purchase`, `buyer_role_required`) ให้ Server ตอบในหน้า Checkout |
| D-17 | ข้อมูลก่อนสร้าง Order | เพิ่ม `GET /orders/checkout-quote?product_id=` คืนสินค้า + ค่าธรรมเนียมจาก Server | หน้า Checkout แสดงยอดจาก Server ได้ก่อนกดยืนยัน ไม่ต้องคำนวณเอง |
| D-18 | Idempotency ของการยกเลิก | ไม่บังคับ `Idempotency-Key` สำหรับ `POST /orders/{id}/cancel` | คำขอนี้ไม่สร้างแถวใหม่และไม่มีเงินเกี่ยวข้อง เรียกซ้ำแล้วได้ผลเดิมอยู่แล้ว การบังคับ key จะเพิ่มงานให้ Client โดยไม่ได้ความปลอดภัยเพิ่ม |
| D-20 | `sale_type` | ออกแบบเป็น Enum และรอบนี้รับเฉพาะ `FIXED_PRICE` คำขอซื้อสินค้าที่ไม่ใช่ราคาปกติถูกปฏิเสธด้วย `409 sale_type_unsupported` ก่อนคิดราคา | SRS ระบุว่า Prototype จำกัด FR-06 ไว้ที่การขายแบบราคาปกติ และระบบประมูลอยู่นอกขอบเขต ปัจจุบัน `ck_products_sale_type` ยอมรับค่านี้ค่าเดียวอยู่แล้ว ด่านฝั่ง Order จึงเป็นชั้นที่สองที่ยังปฏิเสธการประมูลได้เองถ้าวันหนึ่งตารางสินค้าผ่อนเงื่อนไข |
| D-21 | ผู้ดูแลเห็นข้อมูลส่วนบุคคลของ Order | **มีสิทธิ์เข้าถึง แต่ระบบไม่แสดงอัตโนมัติ**: Response ปกติปิดบังทั้งอีเมลและที่อยู่ การดูข้อมูลเต็มเป็น Endpoint แยกที่ต้องมีเหตุผลและถูกบันทึกทุกครั้ง ปิดทั้งหมดได้ด้วย `ADMIN_ORDER_CONTACT_REVEAL_ENABLED=false` ค่าเดียว | FR-42 ให้สิทธิ์ผู้ดูแลจัดการคำสั่งซื้อและข้อพิพาท ส่วนข้อห้ามแสดงข้อมูลส่วนบุคคลผูกกับหน้า QR สาธารณะ การแยก Endpoint ทำให้ถ้าทีมเปลี่ยนใจภายหลังก็ปิดได้โดยไม่ต้องแก้ Schema หรือหน้าจอ |
| D-22 | Audit Log เก็บที่ไหน | ตารางกลาง `admin_access_logs` (`admin_id`, `action`, `target_type`, `target_id`, `reason`, `created_at`) ไม่ผูก foreign key กับเป้าหมาย และเขียนอย่างเดียว ไม่มีเส้นทางแก้หรือลบในระบบ | NFR-04 ต้องการบันทึกการเข้าถึงข้อมูลอ่อนไหว งานอื่นที่ SRS ระบุไว้แล้ว (สำเนาบัตรประชาชน, ประวัติแชทเมื่อมีข้อพิพาท) จะใช้ตารางเดียวกันได้โดยเพิ่มค่าใน CHECK เท่านั้น |
| D-23 | สิทธิ์ผู้ดูแลของงานสั่งซื้อ | ใช้ `require_admin` ตัวเดิมจาก `app/api/admin_verifications.py` (ADMIN + ACTIVE) ไม่สร้างกลไกใหม่ ข้อความ 403 จึงเป็น `detail` แบบข้อความ ไม่ใช่ `code` เหมือน Error อื่นของงานสั่งซื้อ | ห้ามมีการตรวจสิทธิ์ผู้ดูแลสองชุดในระบบเดียว ส่วนรูปแบบ Error ที่ไม่เข้ากันยอมรับได้ เพราะเป็นกรณีที่ Client ปกติไม่ควรเจอ |
| D-19 | หมดเวลาแล้วใช้สถานะอะไร | ใช้ `CANCELLED` ร่วมกับการยกเลิกของผู้ซื้อ แล้วแยกด้วย `cancel_reason` (`BUYER` / `EXPIRED`) ไม่สร้างสถานะ `EXPIRED` แยก | partial unique index `uq_orders_active_product` ผูกกับค่า `'CANCELLED'` อยู่แล้ว การเพิ่มสถานะใหม่ต้องแก้ index ด้วย ส่วนเหตุผลที่ต่างกันเก็บเป็นคอลัมน์ได้ถูกกว่า |
