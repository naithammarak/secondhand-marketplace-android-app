# PRODUCT-01: Product database migration

เอกสารนี้ใช้กับ migration ที่มีอยู่จริงใน branch `product01-migration` เท่านั้น
ห้ามใช้ production database หรือฐานกลางในการทดลอง ต้องทดลองกับ PostgreSQL test
 database ที่แยกจากฐานจริงและทิ้งได้ก่อนเสมอ ผู้ดูแลฐานกลางเท่านั้นเป็นผู้รัน
migration กับฐานกลาง หลัง review ผลทดสอบและแผน rollback แล้ว

## Migration chain ปัจจุบัน

ตรวจจาก `migrations/versions/` แล้วพบ migration ที่เกี่ยวข้องกับ Product,
ProductImage และ ProductUpload ดังนี้:

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
- `9a18d37ce520`: merge revision เดิมของ `54ca8e0731bd` กับ
  `e8a4f1c02d77`; เป็น merge ที่มีอยู่แล้ว ไม่ใช่ migration ใหม่ของงานนี้

จาก `python -m alembic heads` ใน repository ปัจจุบันมี 2 heads:

```text
9a18d37ce520 (head)
f02a03c91801 (head)
```

มี merge revision `9a18d37ce520` อยู่แล้ว แต่ยังไม่รวม `f02a03c91801` ดังนั้น
ห้ามสร้าง merge revision ใหม่เพียงเพื่อทำให้มี head เดียว ต้องให้ผู้ดูแล migration
review graph และตัดสินใจก่อน

ระหว่างการตรวจ branch นี้ `python -m alembic current` พบว่า database ที่
configuration ชี้อยู่มี `alembic_version` อ้างถึง `9446ec1a2c5d` ซึ่งไม่มีใน
branch ปัจจุบันและคำสั่งจึงล้มเหลวด้วย `Can't locate revision`. ห้ามแก้ด้วยการ
reset, drop ตาราง หรือรันคำสั่งใด ๆ กับฐานนั้นโดยพลการ ให้หยุดและให้ผู้ดูแลฐาน
ตรวจสอบฐานเป้าหมายก่อน

## Prerequisites และความปลอดภัย

1. ใช้ PostgreSQL test database ที่แยกจากฐานจริง ชื่อฐานควรมีคำว่า `test` และ
   ต้องเป็นฐานว่างสำหรับ integration test
2. ตั้ง `TEST_DATABASE_URL` เฉพาะใน shell ของการทดสอบ ห้าม commit URL,
   password, token หรือข้อมูลส่วนตัว
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
กราฟ และ `history --verbose` แสดง parent/merge ของแต่ละ revision ถ้า `current`
หา revision ไม่พบหรือ `heads` มีหลายตัว ให้หยุดตรวจฐานและ merge ที่มีอยู่ก่อน
ห้ามเดาชื่อ revision และห้ามแก้ฐานกลางเพื่อให้คำสั่งผ่าน

## Upgrade ฐานใหม่

ใช้ PostgreSQL test database ที่ว่างและแยกจากฐานจริง ตั้งค่า connection สำหรับ
Alembic ให้ชี้ไปยัง test database เท่านั้น จากนั้นทดสอบ Product chain ตามลำดับ:

```sh
cd backend
python -m alembic upgrade c6b19e0d4f2a
python -m alembic upgrade 7f4c2e91a6b0
python -m alembic upgrade 54ca8e0731bd
```

`9a18d37ce520` มี parent สองตัวคือ `54ca8e0731bd` และ `e8a4f1c02d77` จึงใช้ได้
เมื่อ branch Order ที่ `e8a4f1c02d77` อยู่ในฐานเดียวกันแล้วเท่านั้น การใช้
`upgrade head` ใน repository ที่มี 2 heads อาจไม่ให้ผลเป็นเป้าหมายเดียว ต้อง
review graph ก่อน:

```sh
cd backend
python -m alembic upgrade head
```

อย่าใช้ `upgrade heads` โดยไม่ review เพราะจะพาทั้ง Product และ Verify/Order
branches ไปด้วย

## Upgrade ฐานที่มีข้อมูลเดิม

ห้ามเริ่มจากฐานกลาง ให้ clone/restore เป็น PostgreSQL test database แยกก่อน
ยืนยันว่า revision ปัจจุบันอยู่ก่อน `7f4c2e91a6b0` และ snapshot ข้อมูลเดิมแล้ว
จึงทดสอบ:

```sh
cd backend
python -m alembic current
python -m alembic upgrade 7f4c2e91a6b0
python -m alembic upgrade 54ca8e0731bd
```

`54ca8e0731bd` เติม `sort_order` ให้ rows เดิมตาม `image_id`, เพิ่ม
`upload_id` เป็น nullable และไม่ลบ `product_images` หรือ URL เดิม ตรวจว่า
จำนวน rows, primary keys และ URLs หลัง upgrade ตรงกับ snapshot

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
  AND table_name IN ('product_images', 'product_uploads')
ORDER BY table_name, ordinal_position;

SELECT conname, contype
FROM pg_constraint
WHERE conrelid IN ('public.product_images'::regclass,
                   'public.product_uploads'::regclass)
ORDER BY conname;

SELECT product_id, image_id, image_url, upload_id, sort_order
FROM public.product_images
ORDER BY product_id, sort_order, image_id;
```

ตรวจว่ามี `product_uploads`, columns `upload_id`/`sort_order`, foreign keys ที่
คาดหมาย, unique `object_key`, unique upload binding และ unique ordering index
เมื่อ `sort_order` ไม่เป็น NULL รวมทั้งตรวจข้อมูลเดิมไม่หาย

## Rollback และตรวจข้อมูลเดิม

หยุดการเขียนข้อมูลใหม่และบันทึก snapshot ก่อน rollback จาก
`54ca8e0731bd` ไป revision ก่อนหน้า:

```sh
cd backend
python -m alembic downgrade 7f4c2e91a6b0
```

คำสั่งนี้ควรลบเฉพาะ `upload_id`, `sort_order`, constraints และ index ที่
`54ca8e0731bd` เพิ่ม โดยไม่ลบ `products`, `product_images` หรือ URL เดิม

หากต้องถอน `product_uploads` ที่สร้างโดย `7f4c2e91a6b0` ใน test database ด้วย:

```sh
cd backend
python -m alembic downgrade c6b19e0d4f2a
```

คำสั่งนี้ลบตาราง `product_uploads` และ metadata pending upload ในตารางนั้น
จึงต้องตรวจหรือ export metadata/object ที่เกี่ยวข้องก่อนใช้กับฐานที่มีข้อมูล

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
`product_images` เดิมต้องยังอยู่

## เมื่อ migration ล้มเหลว

หยุด deploy และเก็บ error, `current`, `heads`, revision ที่ล้มเหลว และผลตรวจ
transaction ห้าม drop table, reset ฐานกลาง หรือแก้ข้อมูลเดิมเพื่อกลบ error
ตรวจว่า PostgreSQL rollback transaction แล้ว จากนั้นแก้สาเหตุใน test database
หรือสร้าง test clone ใหม่และทดลองซ้ำด้วย revision ที่ review แล้ว

หาก failure เกิดหลังมีข้อมูลใน `product_uploads` ให้ตรวจ object storage และ
foreign-key references ก่อน rollback เพราะ downgrade ถึง `c6b19e0d4f2a` ลบ
metadata registry ได้ เมื่อแก้สำเร็จให้ตรวจ schema, row counts, URLs และ
`alembic current` อีกครั้ง

การรันกับฐานกลางทำได้โดยผู้ดูแลฐานกลางเท่านั้น หลังผ่าน PostgreSQL test
แล้วและมี backup, approval และ rollback plan ห้ามผู้พัฒนารันกับ production หรือ
ฐานกลางเอง

## Tests

รันจาก `backend`:

```sh
python -m pytest tests/test_product_upload_schema.py -q
```

PostgreSQL integration fixture ใช้ `TEST_DATABASE_URL` เท่านั้น ตรวจว่าเป็น
PostgreSQL, ชื่อฐานมี `test`, และฐานว่างก่อนเริ่ม หากไม่มี `TEST_DATABASE_URL`
จะ skip อย่างชัดเจนและไม่ fallback ไป `DATABASE_URL` การทดสอบใช้ revision:

- upgrade: `c6b19e0d4f2a` -> `7f4c2e91a6b0` -> `54ca8e0731bd`
- rollback: `54ca8e0731bd` -> `c6b19e0d4f2a`

ครอบคลุมตารางและ columns, product upload/image foreign keys, duplicate
`sort_order`, ข้อมูลเดิมหลัง upgrade และข้อมูลเดิมหลัง rollback
