# ORDER-01 — แผน Migration ก่อนนำขึ้นฐานข้อมูลกลาง

> สถานะ: **ยังไม่ได้รันกับฐานข้อมูลกลาง (Supabase)** ทดสอบแล้วบน PostgreSQL 16 แยกในเครื่องเท่านั้น
> ต้องให้ DB/Lead ตรวจก่อนรัน

## Revision
- `e8a4f1c02d77_create_order_payment_tables.py` — `down_revision = d5c9e2a71b40`
- **ข้อควรระวัง:** `d5c9e2a71b40_add_verification_reviewed_by.py` ยังเป็นไฟล์ที่ยังไม่ commit ใน branch `feat/seller-verification`
  ต้อง merge งาน seller verification ก่อน (หรือแก้ `down_revision`) ไม่เช่นนั้น Alembic จะหา parent ไม่เจอ

## สิ่งที่สร้าง
| ตาราง | Constraint สำคัญ |
|---|---|
| `orders` | `uq_orders_active_product` (partial unique `product_id WHERE status <> 'CANCELLED'`), `uq_orders_buyer_idempotency_key`, `uq_orders_id_total_amount`, CHECK สถานะ/ยอดรวม/ยอดผู้ขาย/ห้ามซื้อของตัวเอง, index `(buyer_id, created_at, id)` และ `(seller_id, created_at, id)` |
| `payment_attempts` | `uq_payment_attempts_order_key (order_id, idempotency_key)`, composite FK `(order_id, amount) → orders(id, total_amount)` |
| `payments` | `UNIQUE(order_id)`, `UNIQUE(attempt_id)`, composite FK ยอด |
| `escrows` | `UNIQUE(order_id)`, `UNIQUE(payment_id)`, CHECK `status IN ('HELD')`, composite FK ยอด |
| `receipts` | `UNIQUE(order_id)`, `UNIQUE(payment_id)`, `UNIQUE(receipt_no)`, composite FK ยอด |

ทุกตารางเปิด **RLS** (ไม่มี policy) เพื่อไม่ให้ `anon`/`authenticated` อ่านผ่าน PostgREST ได้ —
Backend ต่อด้วย role เจ้าของตาราง (`postgres`) จึงไม่ถูกบล็อก **ตรวจให้แน่ใจว่า DATABASE_URL ของ Backend ใช้ role ที่เป็นเจ้าของตารางหรือมี BYPASSRLS**

ไม่มีการแก้ตารางเดิม (`products`, `users`) — งานสั่งซื้อเขียน `products.status` ค่า `RESERVED` ผ่าน UPDATE เท่านั้น

## ขั้นตอนที่แนะนำ
1. สำรองข้อมูล (Supabase: Database → Backups หรือ `pg_dump --schema-only` + ตารางที่เกี่ยวข้อง)
2. ตรวจ revision ปัจจุบัน: `alembic current` ต้องเป็น `d5c9e2a71b40`
3. ดู SQL ก่อนรัน: `alembic upgrade d5c9e2a71b40:e8a4f1c02d77 --sql > order-migration.sql` แล้วให้ผู้ตรวจอ่าน
4. รัน: `alembic upgrade e8a4f1c02d77`
5. ตรวจ: ตาราง 5 ตาราง, `relrowsecurity = true`, index `uq_orders_active_product` เป็น partial
6. ตั้ง `products.status` ของสินค้าที่พร้อมขายเป็น `AVAILABLE` (ตกลงกับทีม PRODUCT ก่อน ดู D-01)

## Rollback
`alembic downgrade d5c9e2a71b40` ลบ 5 ตารางนี้ **รวมข้อมูล Order/Payment ทั้งหมด**
- ก่อน downgrade บนข้อมูลจริงต้อง export ตารางไว้ก่อน
- สินค้าที่ถูกตั้งเป็น `RESERVED` จะไม่ถูกคืนเป็น `AVAILABLE` อัตโนมัติ ต้องแก้ด้วยมือตามรายการ Order ที่ export ไว้

## หลักฐานการทดสอบ (ฐานข้อมูลแยก)
- `tests/test_orders_postgres.py::test_migration_downgrade_and_upgrade_round_trip` — upgrade → downgrade → upgrade,
  ตารางเดิมไม่ถูกแตะ, RLS เปิด, เงินเป็น `numeric(12,2)`
- Constraint ทุกตัวข้างต้นมี test ที่ยืนยันว่า INSERT ซ้ำ/ยอดไม่ตรงถูกปฏิเสธด้วย `IntegrityError`
