# PRODUCT-01: Product database migration

เอกสารนี้ใช้กับ migration ของ PRODUCT-01 (Issue #43)
ห้ามใช้ production database หรือฐานกลางในการทดลอง ต้องทดลองกับ PostgreSQL test
database ที่แยกจากฐานจริงและทิ้งได้ก่อนเสมอ ผู้ดูแลฐานกลางเท่านั้นเป็นผู้รัน
migration กับฐานกลาง หลัง review ผลทดสอบและแผน rollback แล้ว

## Migration chain และ Alembic Graph ปัจจุบัน

ตรวจจาก `migrations/versions/` ลำดับ migration ที่เกี่ยวข้องกับ User, Product,
ProductImage, ProductUpload, Verification และ Order มีดังนี้:

- `da43dcf1f8fd`: สร้าง `products` และ foreign keys ไป `users`, `categories`
  และ `brands`
- `b3f13a88f22a`: สร้าง `product_images` โดยมี primary key คู่
  `(product_id, image_id)` และ foreign key ไป `products`
- `c6b19e0d4f2a`: เพิ่ม PostgreSQL identity ให้ `product_images.image_id`
  และตั้ง sequence จากค่า `image_id` สูงสุดเดิม โดยไม่ลบ rows เดิม
- `7f4c2e91a6b0`: สร้าง `product_uploads` พร้อม primary key, foreign keys ไป
  `users` และ `products`, unique `object_key`, state/MIME/file-size/expiry/
  attachment checks และ indexes รวมถึงเปิด RLS
- `54ca8e0731bd`: เพิ่ม nullable `upload_id` และ `sort_order` ใน
  `product_images`, เพิ่ม foreign key ไป `product_uploads`, unique upload binding
  และ partial unique index `(product_id, sort_order)` เมื่อ `sort_order IS NOT NULL`
  โดยเติมลำดับให้ image เดิมตาม `image_id` และเก็บ URL/rows เดิมไว้
- `9a18d37ce520`: merge revision ของ `54ca8e0731bd` กับ `e8a4f1c02d77`
- `f02a03c91801`: เพิ่ม check constraints, queue indexes และเปิด RLS บน `verifications`
- `f3862bffea77`: **Merge heads ก่อนหน้า** (`9a18d37ce520` และ `f02a03c91801`) รวมกราฟให้เป็นเส้นเดียว
- `daf675afc8fc`: เพิ่ม constraints และ indexes ของ `products`:
  - `ck_products_price_positive`: `price > 0`
  - `ck_products_sale_type`: `sale_type = 'FIXED_PRICE'`
  - `ck_products_condition`: `condition IN ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR')`
  - `ck_products_status`: `status IN ('AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED')`
  - `ix_products_public_status_created_id`: index ค้นหาสินค้า `(status, created_at, id)` เมื่อ `deleted_at IS NULL`
  - `ix_products_owner_user_created_id`: index สินค้าของผู้ขาย `(user_id, created_at, id)` เมื่อ `deleted_at IS NULL`
- `9446ec1a2c5d`: **(Head ปัจจุบัน)** ปรับปรุง `product_images`:
  1. **Backfill `sort_order`**: จัดการ rows เดิมที่ `sort_order IS NULL` ให้มีลำดับต่อจากเดิม
  2. **Normalize `photo_type`**: แปลงข้อมูลรูปเดิมก่อนเพิ่ม constraint:
     - `sort_order = 0` ปรับเป็น `'MAIN'`
     - `sort_order > 0` ปรับเป็น `'GALLERY'`
     - รักษา `product_id`, `image_id`, `image_url`, `file_size`, `upload_id` และความสัมพันธ์เดิมทุกประการ
  3. **Alter column**: กำหนด `sort_order` เป็น `nullable=False`
  4. **Add constraints**:
     - `ck_product_images_sort_order`: `sort_order >= 0 AND sort_order <= 9`
     - `ck_product_images_photo_type`: `(sort_order = 0 AND photo_type = 'MAIN') OR (sort_order > 0 AND photo_type = 'GALLERY')`

เมื่อรัน `python -m alembic heads` ใน repository จะได้ **Single Head** เพียงตัวเดียว:

```text
9446ec1a2c5d (head)
```

## Prerequisites และความปลอดภัย

1. ใช้ PostgreSQL test database ที่แยกจากฐานจริง ชื่อฐานควรมีคำว่า `test` และ
   ต้องเป็นฐานว่างสำหรับ integration test
2. ตั้ง `TEST_DATABASE_URL` เฉพาะใน shell ของการทดสอบ ห้าม commit URL,
   password, token หรือข้อมูลส่วนตัวลง repository
3. อย่าตั้ง `DATABASE_URL` ไปยัง production หรือฐานกลางเพื่อรัน test
4. บันทึกจำนวน rows และ key ของ `products`/`product_images` ก่อน upgrade หาก
   ทดสอบฐานที่มีข้อมูลเดิม รวมถึง `product_id`, `image_id` และ `image_url`
5. สำรองฐานและตรวจสิทธิ์สำหรับ foreign keys, indexes, identity, RLS และ
   transaction ก่อน migration
6. ตรวจ migration files และ revision graph ที่ checkout อยู่ให้ตรงกับที่ review
   แล้วเท่านั้น

## ตรวจ Alembic revision

รันจาก `backend`:

```sh
cd backend
python -m alembic current
python -m alembic heads
python -m alembic history --verbose
```

`current` ตรวจ revision ที่ฐานเป้าหมายบันทึกไว้, `heads` แสดงปลายทางทั้งหมดของ
กราฟ และ `history --verbose` แสดง parent/merge ของแต่ละ revision ยืนยันว่ามีเพียง head เดียวคือ `9446ec1a2c5d`

## Upgrade ฐานใหม่

ใช้ PostgreSQL test database ที่ว่างและแยกจากฐานจริง ตั้งค่า connection สำหรับ
Alembic ให้ชี้ไปยัง test database เท่านั้น จากนั้นทดสอบ Upgrade ไปยัง head ล่าสุด:

```sh
cd backend
python -m alembic upgrade head
```

หรือระบุ revision ตามลำดับ:

```sh
cd backend
python -m alembic upgrade c6b19e0d4f2a
python -m alembic upgrade 7f4c2e91a6b0
python -m alembic upgrade 54ca8e0731bd
python -m alembic upgrade f3862bffea77
python -m alembic upgrade daf675afc8fc
python -m alembic upgrade 9446ec1a2c5d
```

## Upgrade ฐานที่มีข้อมูลเดิม (Legacy Data)

ห้ามเริ่มจากฐานกลาง ให้ clone/restore เป็น PostgreSQL test database แยกก่อน
ยืนยันว่า revision ปัจจุบันอยู่ก่อน `7f4c2e91a6b0` และ snapshot ข้อมูลเดิมแล้ว
จึงทดสอบ:

```sh
cd backend
python -m alembic current
python -m alembic upgrade head
```

ในขั้นตอนนี้:
- `condition` เดิมภาษาไทย (`'ใหม่'`, `'เหมือนใหม่'`, `'ดี'`, `'พอใช้'`) จะถูก normalize เป็น `'NEW'`, `'LIKE_NEW'`, `'GOOD'`, `'FAIR'`
- `status` ที่มีความหมายตรงกัน (`'พร้อมขาย'`, `'จองแล้ว'`, `'ขายแล้ว'`, `'ยกเลิก'`) จะถูก normalize เป็น `'AVAILABLE'`, `'RESERVED'`, `'SOLD'`, `'CANCELLED'`
- **ความปลอดภัยของสถานะสินค้า**: หากพบสินค้าที่มีสถานะไม่รู้จักหรือไม่พร้อมขาย (เช่น `'DRAFT'`, `'HIDDEN'` หรือ `NULL`) ระบบจะ **หยุด (abort) migration ทันที** พร้อมแจ้งรายการ id ที่ต้องจัดการ เพื่อป้องกันไม่ให้สินค้าฉบับร่างหรือสินค้าที่ซ่อนอยู่ถูกเปิดเป็นพร้อมขาย (`AVAILABLE`) โดยเจ้าของไม่ได้สั่งเผยแพร่
- `sort_order` ที่ยังว่างจะถูก backfill ให้เรียงลำดับต่อเนื่อง 0, 1, 2...
- `photo_type` เดิมที่เป็น MIME เช่น `image/jpeg` จะถูก normalize เป็น `MAIN` (สำหรับ sort_order 0) และ `GALLERY` (สำหรับ sort_order > 0)
- ข้อมูล `product_id`, `image_id`, `image_url`, `file_size`, จำนวนแถว และ foreign key references ทั้งหมดจะคงเดิม ไม่มีการลบหรือแก้ไขคีย์

## ตรวจ schema และข้อมูลหลัง upgrade

ตรวจ revision และ schema ด้วยคำสั่ง read-only:

```sh
cd backend
python -m alembic current
```

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('products', 'product_images', 'product_uploads');

SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('products', 'product_images', 'product_uploads')
ORDER BY table_name, ordinal_position;

SELECT conname, contype
FROM pg_constraint
WHERE conrelid IN ('public.products'::regclass,
                   'public.product_images'::regclass,
                   'public.product_uploads'::regclass)
ORDER BY conname;

SELECT product_id, image_id, image_url, upload_id, sort_order, photo_type
FROM public.product_images
ORDER BY product_id, sort_order, image_id;
```

ตรวจว่า:
- มี constraints `ck_products_price_positive`, `ck_products_sale_type`, `ck_products_condition`, `ck_products_status` บน `products`
- มี indexes `ix_products_public_status_created_id` และ `ix_products_owner_user_created_id` บน `products`
- มี constraints `ck_product_images_sort_order` และ `ck_product_images_photo_type` บน `product_images`
- `sort_order` ของ `product_images` เป็น NOT NULL และอยู่ในช่วง 0–9
- รูปแรก (`sort_order = 0`) มี `photo_type = 'MAIN'` และรูปลำดับถัดไป (`sort_order > 0`) มี `photo_type = 'GALLERY'`
- ข้อมูลและ URL เดิมไม่สูญหาย

## Rollback และตรวจข้อมูลเดิม

เมื่อต้องการทดสอบ Rollback จาก `9446ec1a2c5d`:

```sh
cd backend
# ถอน constraints ของ product_images
python -m alembic downgrade daf675afc8fc

# ถอน constraints และ indexes ของ products
python -m alembic downgrade f3862bffea77

# ถอนตาราง product_uploads
python -m alembic downgrade c6b19e0d4f2a
```

ตรวจหลัง rollback:

```sh
cd backend
python -m alembic current
```

```sql
SELECT count(*) FROM public.products;
SELECT count(*), min(product_id), max(product_id)
FROM public.product_images;
SELECT product_id, image_id, image_url
FROM public.product_images
ORDER BY product_id, image_id;
```

จำนวน rows, primary keys และ URLs ต้องตรงกับ snapshot ก่อน upgrade หาก rollback
ถึง `c6b19e0d4f2a` ต้องไม่มี `product_uploads` แต่ข้อมูล `products` และ
`product_images` เดิมต้องยังอยู่ครบถ้วน

## เมื่อ migration ล้มเหลว

หยุด deploy และเก็บ error, `current`, `heads`, revision ที่ล้มเหลว และผลตรวจ
transaction ห้าม drop table, reset ฐานกลาง หรือแก้ข้อมูลเดิมเพื่อกลบ error
ตรวจว่า PostgreSQL rollback transaction แล้ว จากนั้นแก้สาเหตุใน test database
หรือสร้าง test clone ใหม่และทดลองซ้ำด้วย revision ที่ review แล้ว

การรันกับฐานกลางทำได้โดยผู้ดูแลฐานกลางเท่านั้น หลังผ่าน PostgreSQL test
แล้วและมี backup, approval และ rollback plan ห้ามผู้พัฒนารันกับ production หรือ
ฐานกลางเอง

## Tests

รันจาก `backend`:

```sh
python -m pytest tests/test_product_upload_schema.py tests/test_user_migration.py -v
```

PostgreSQL integration fixture ใช้ `TEST_DATABASE_URL` เท่านั้น ตรวจว่าเป็น
PostgreSQL, ชื่อฐานมี `test`, และฐานว่างก่อนเริ่ม หากไม่มี `TEST_DATABASE_URL`
จะ skip อย่างชัดเจนและไม่ fallback ไป `DATABASE_URL` การทดสอบครอบคลุม:

- single Alembic head (`9446ec1a2c5d`)
- upgrade: `c6b19e0d4f2a` -> `9446ec1a2c5d`
- legacy data: รูปเดิม `photo_type='image/jpeg'` ถูก normalize เป็น `MAIN`/`GALLERY` ตามลำดับ, `condition` ภาษาไทยถูก normalize เป็น `'NEW'`/`'LIKE_NEW'`/`'GOOD'`/`'FAIR'`, และ `status` ภาษาไทยถูก normalize เป็น `'AVAILABLE'`
- status safety: สินค้าที่มี `status` ไม่รู้จัก (เช่น `'DRAFT'`, `'HIDDEN'`) จะระงับ migration ทันที ไม่เปลี่ยนเป็น `'AVAILABLE'` โดยพลการ
- constraints: price > 0, condition, sale_type, status, sort_order 0–9, photo_type ตาม sort_order
- rollback: `9446ec1a2c5d` -> `c6b19e0d4f2a` ข้อมูลเดิมไม่สูญหาย
