# ORDER-01 / ORDER-08 — แผน Migration ก่อนนำขึ้นฐานข้อมูลกลาง

> สถานะ: **ยังไม่ได้รันกับฐานข้อมูลกลาง (Supabase)** ทดสอบแล้วบน PostgreSQL 16 แยกในเครื่องเท่านั้น
> ต้องให้ DB/Lead ตรวจก่อนรัน
> ปรับปรุงล่าสุด 2026-09-23: กราฟ migration เปลี่ยนไปหลังงาน PRODUCT เข้า main และเพิ่ม `b41d7ce09f35` ของ ORDER-08

## Revision ที่เกี่ยวข้อง

ปัจจุบันกราฟรวมเป็น **head เดียว** คือ `b41d7ce09f35` (ตรวจซ้ำได้ด้วย `alembic heads`
และมี test `tests/test_product_upload_schema.py::test_migration_graph_unifies_to_single_head` ยืนยัน)

| Revision | เรื่อง |
|---|---|
| `e8a4f1c02d77` | สร้างตาราง `orders`, `payment_attempts`, `payments`, `escrows`, `receipts` (ORDER-01) |
| `9a18d37ce520` | merge สาย product uploads กับสาย order |
| `f02a03c91801` | constraint และ RLS ของ verification |
| `f3862bffea77` | merge ก่อนงาน PRODUCT-01 |
| `daf675afc8fc`, `9446ec1a2c5d` | constraint/index ของ products และ product images |
| `b41d7ce09f35` | **ORDER-08**: เพิ่ม `expires_at`, `cancelled_at`, `cancel_reason` และสถานะ `CANCELLED` |

**ข้อควรระวัง:** `e8a4f1c02d77` ไม่ใช่ head อีกต่อไป มันอยู่กลางกราฟ คำสั่งเดิมในแผนเวอร์ชันก่อน
(`alembic upgrade e8a4f1c02d77`) จะข้าม migration ของ PRODUCT ไป **ห้ามใช้** ให้ upgrade ถึง `head` เท่านั้น

## สิ่งที่สร้าง / เปลี่ยน

### `e8a4f1c02d77` — ตารางใหม่ 5 ตาราง
| ตาราง | Constraint สำคัญ |
|---|---|
| `orders` | `uq_orders_active_product` (partial unique `product_id WHERE status <> 'CANCELLED'`), `uq_orders_buyer_idempotency_key`, `uq_orders_id_total_amount`, CHECK สถานะ/ยอดรวม/ยอดผู้ขาย/ห้ามซื้อของตัวเอง, index `(buyer_id, created_at, id)` และ `(seller_id, created_at, id)` |
| `payment_attempts` | `uq_payment_attempts_order_key (order_id, idempotency_key)`, composite FK `(order_id, amount) → orders(id, total_amount)` |
| `payments` | `UNIQUE(order_id)`, `UNIQUE(attempt_id)`, composite FK ยอด |
| `escrows` | `UNIQUE(order_id)`, `UNIQUE(payment_id)`, CHECK `status IN ('HELD')`, composite FK ยอด |
| `receipts` | `UNIQUE(order_id)`, `UNIQUE(payment_id)`, `UNIQUE(receipt_no)`, composite FK ยอด |

ทุกตารางเปิด **RLS** (ไม่มี policy) เพื่อไม่ให้ `anon`/`authenticated` อ่านผ่าน PostgREST ได้ —
Backend ต่อด้วย role เจ้าของตาราง (`postgres`) จึงไม่ถูกบล็อก **ตรวจให้แน่ใจว่า DATABASE_URL ของ Backend ใช้ role ที่เป็นเจ้าของตารางหรือมี BYPASSRLS**

### `b41d7ce09f35` — ยกเลิกและเส้นตายการจ่ายเงิน (ORDER-08)
แก้เฉพาะตาราง `orders` ไม่แตะตารางอื่นและไม่แตะแถวของ payment/escrow/receipt

| การเปลี่ยนแปลง | รายละเอียด |
|---|---|
| คอลัมน์ใหม่ | `expires_at timestamptz NOT NULL`, `cancelled_at timestamptz NULL`, `cancel_reason varchar(16) NULL` |
| Backfill | แถวเดิมได้ `expires_at = created_at + interval '30 minutes'` แล้วจึงตั้ง NOT NULL |
| `ck_orders_status` | drop แล้วสร้างใหม่ให้รับ `CANCELLED` เพิ่ม |
| `ck_orders_cancel_fields` | `CANCELLED` ต้องมี `cancelled_at` และ `cancel_reason IN ('BUYER','EXPIRED')` / สถานะอื่นต้องไม่มีทั้งคู่ |
| `ck_orders_cancel_not_paid` | `CANCELLED` ต้องมี `paid_at IS NULL` |

**ไม่ต้องสร้าง index ใหม่**: `uq_orders_active_product` ใช้เงื่อนไข `status <> 'CANCELLED'` มาตั้งแต่ ORDER-01
สินค้าจึงหลุดจากการจองทันทีที่ Order เปลี่ยนเป็น `CANCELLED`

ไม่มีการแก้ตารางเดิมของทีมอื่น (`products`, `users`) — งานสั่งซื้อเขียน `products.status`
ค่า `RESERVED` (ตอนจอง) และ `AVAILABLE` (ตอนยกเลิก/หมดเวลา) ผ่าน UPDATE เท่านั้น

## ขั้นตอนที่แนะนำ

1. สำรองข้อมูล (Supabase: Database → Backups หรือ `pg_dump --schema-only` + ตารางที่เกี่ยวข้อง)
2. ตรวจ revision ปัจจุบัน: `alembic current` — **บันทึกค่าที่ได้ไว้** เพราะต้องใช้ตอน rollback
3. `alembic heads` ต้องได้ `b41d7ce09f35` ค่าเดียว ถ้าได้หลายค่าแปลว่ามี branch ค้าง ให้หยุดและ merge ก่อน
4. ดู SQL ก่อนรัน: `alembic upgrade <current>:head --sql > order-migration.sql` แล้วให้ผู้ตรวจอ่าน
   **SQL ที่ได้จะรวม migration ของทีม PRODUCT ที่ยังไม่ได้รันด้วย** ถ้ามี ต้องให้เจ้าของงานนั้นตรวจร่วม
5. รัน: `alembic upgrade head`
6. ตรวจหลังรัน:
   - ตาราง 5 ตารางของ ORDER ครบ และ `relrowsecurity = true` ทุกตาราง
   - `uq_orders_active_product` เป็น partial index ที่มีเงื่อนไข `status <> 'CANCELLED'`
   - `orders` มีคอลัมน์ `expires_at` (NOT NULL), `cancelled_at`, `cancel_reason`
   - `ck_orders_status` รับค่า `CANCELLED` แล้ว และมี `ck_orders_cancel_fields`, `ck_orders_cancel_not_paid`
7. ตั้ง `products.status` ของสินค้าที่พร้อมขายเป็น `AVAILABLE` (ค่าตรงกับ `ck_products_status` ของทีม PRODUCT แล้ว ดู D-01)

## Rollback

| จาก | คำสั่ง | ผล |
|---|---|---|
| ORDER-08 | `alembic downgrade 9446ec1a2c5d` | ลบ 3 คอลัมน์และ CHECK ใหม่ **ปฏิเสธการทำงานถ้ามี Order สถานะ `CANCELLED` อยู่** ต้อง export และตัดสินใจก่อน |
| ORDER ทั้งหมด | `alembic downgrade d5c9e2a71b40` | ลบ 5 ตาราง **รวมข้อมูล Order/Payment ทั้งหมด** |

- ก่อน downgrade บนข้อมูลจริงต้อง export ตารางไว้ก่อน
- สินค้าที่ถูกตั้งเป็น `RESERVED` จะไม่ถูกคืนเป็น `AVAILABLE` อัตโนมัติ ต้องแก้ด้วยมือตามรายการ Order ที่ export ไว้

## หลักฐานการทดสอบ (ฐานข้อมูลแยก)
- `tests/test_orders_postgres.py::test_migration_downgrade_and_upgrade_round_trip` — upgrade → downgrade → upgrade,
  ตารางเดิมไม่ถูกแตะ, RLS เปิด, เงินเป็น `numeric(12,2)`
- `tests/test_orders_postgres.py::test_cancelled_order_frees_the_product_slot` — partial index ปล่อยสินค้าเมื่อ Order เป็น `CANCELLED`
- `tests/test_orders_postgres.py::test_cancel_fields_must_match_status` / `test_paid_order_cannot_be_marked_cancelled` — CHECK ใหม่ปฏิเสธข้อมูลที่ไม่สอดคล้อง
- Constraint ทุกตัวข้างต้นมี test ที่ยืนยันว่า INSERT ซ้ำ/ยอดไม่ตรงถูกปฏิเสธด้วย `IntegrityError`
- SQL ของ `b41d7ce09f35` ถูกสร้างและตรวจแบบ offline แล้ว (`alembic upgrade 9446ec1a2c5d:b41d7ce09f35 --sql`)
  ได้ DDL 8 คำสั่งใน transaction เดียว: ADD COLUMN x3 → backfill → SET NOT NULL → drop/add CHECK สถานะ → add CHECK ใหม่ 2 ตัว

> ชุด PostgreSQL ข้างต้น **ยังไม่ถูกรันหลังการแก้ของ ORDER-08** เพราะเครื่องที่แก้ไม่มี Docker/PostgreSQL
> ผู้ที่มีสภาพแวดล้อมครบต้องรันตามวิธีใน `doc/orders/qa-report.md` แล้วบันทึกผล
