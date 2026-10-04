# F — แก้ช่องแบรนด์ในหน้าลงขาย

วันที่: 4 ตุลาคม 2026 (Asia/Bangkok)

สถานะ: **PATCHED_LOCAL — แก้ฟอร์มและ API พร้อมตรวจในเครื่องแล้ว ยังไม่ได้ deploy API หรือสร้าง APK ใหม่**

Worktree: `/home/tmk/project/market-place-mobile-app/worktrees/e-ui-preview`

Branch: `claude/certificate-qr-2026-10-03` · HEAD: `d41720ae831afa5461fd839492aa83a9e046815f` · แพตช์อยู่ใน working tree

## ผลแก้

เดิมพิมพ์ชื่อที่ไม่มีในตัวเลือกแล้ว `brandId` ถูกล้าง ทำให้ validation ปิดการบันทึก ส่วนการโหลดตัวเลือกใหม่แทนชื่อที่พิมพ์ด้วย “ไม่ระบุแบรนด์” API เดิมรับเฉพาะ `brand_id` จึงต้องแก้ทั้งสองฝั่งเพื่อให้บันทึกชื่อจริงได้

- ฟอร์มยอมรับชื่อแบรนด์ที่พิมพ์เอง 1–255 ตัวอักษร เก็บชื่อผ่านการ reload ตัวเลือก และล้าง ID เดิมเมื่อชื่อเปลี่ยนเป็นแบรนด์อื่น
- สินค้าที่เลือกแบรนด์เดิมส่ง `brand_id`; ชื่อที่พิมพ์เองส่ง `brand_name` โดยไม่ส่ง ID คู่กัน ทั้ง create และ update
- API ตรวจและตัดช่องว่างหัวท้าย ใช้แบรนด์เดิมถ้าชื่อตรงกันตามการเทียบตัวพิมพ์ของฐานข้อมูล หรือเพิ่มแบรนด์ใน transaction เดียวกับสินค้า ถ้าการผูกรูป/signing/การบันทึกล้มเหลว แบรนด์ใหม่ถูก rollback ด้วย
- ผลลัพธ์และ GET owner/public detail ใช้รูปแบบเดิม `brand_id` และ `brand: { id, brand_name }` จึงเปิดกลับมาแก้ไข/ดูรายละเอียดและเปลี่ยนเป็นแบรนด์เดิมได้
- ใช้ตาราง `brands` เดิม ไม่มี migration หรือการแก้ schema บน DB ทีม PostgreSQL ใช้ transaction advisory lock ตามชื่อเพื่อกันสร้างชื่อเดียวกันพร้อมกันผ่านเส้นทางนี้ และใช้ case mapping ของ DB ให้ชื่อ Unicode สอดคล้องกัน
- การเพิ่มชื่อแบรนด์เกิดผ่าน product write ของผู้ขายที่ได้รับอนุมัติเท่านั้น ไม่เพิ่ม endpoint สร้างแบรนด์สาธารณะ และไม่เปลี่ยนสิทธิ์เจ้าของสินค้า
- อัปเดต OpenAPI, amendment ใน `mobile/docs/PRODUCT-06.md`, คิว F และเพิ่ม QA B1a

## ผลตรวจ

| การตรวจ | ผล |
|---|---|
| Backend create/update/cancel/read บน SQLite ในหน่วยความจำ | **120/120 ผ่าน** รวมแบรนด์ใหม่, reuse, เปิด owner/public detail, กลับไปแบรนด์เดิม, validation, rollback และสิทธิ์ |
| PostgreSQL 16 แยกชั่วคราว | **3/3 ผ่าน** ผู้ขาย 6 รายส่งชื่อเดียวกันพร้อมกัน ทั้ง Latin/Unicode ได้ ID เดียว และ rollback ไม่ทิ้งแถว/lock |
| Mobile logic product service/form/edit store/catalog | **80/80 ผ่าน** ทั้ง `brand_id` เดิมและ `brand_name` ใหม่, mapping ของ ID ที่ API คืน, validation, timeout และ edit recovery |
| Mobile component form/new-product/uploader | **23/23 ผ่าน** พิมพ์แบรนด์ใหม่ทั้ง create/edit, คงชื่อเมื่อ refresh และตัวเลือกเดิม/อัปโหลดรูป |
| TypeScript และ ESLint ไฟล์ที่แก้ | ผ่าน ไม่มี lint errors/warnings |
| Android Hermes export | ผ่าน **2,151 modules**, bundle ประมาณ **6.2 MB**, output `/tmp/2ndhand-f-brand-20261004-android` |
| `git diff --check` | ผ่าน |

รวม **226 tests ผ่าน** ชุด ProductForm มีคำเตือน `act(...)`; backend มี deprecation warnings ของ dependencies ไม่ได้ suppress หรือเปลี่ยน dependency เพื่อปิดคำเตือน

การทดสอบ API ใช้ TestClient, SQLite ในหน่วยความจำและ Storage signer จำลอง ส่วน PostgreSQL ใช้ container ที่สร้างเพื่อรอบนี้บน loopback กับ DB `f_brand_test`/schema ชั่วคราว และปิด container แล้ว ไม่ใช่ผลทดสอบ API/Storage ทีมบน Render หรือโทรศัพท์จริง

PostgreSQL advisory lock คุ้มครองการเพิ่มชื่อผ่าน product create/update นี้ ตารางเดิมไม่มี unique name constraint; ไม่ได้แก้ชื่อซ้ำเดิมหรือรับรอง writer นอกเส้นทางนี้

ทุกคำสั่ง Expo ใช้ `EXPO_NO_DOTENV=1`; backend tests ใช้ environment ที่ล้างและ `PYTHON_DOTENV_DISABLED=1` ซึ่งตรวจจากฟังก์ชันของ python-dotenv ที่ติดตั้งแล้วว่า skip การอ่านไฟล์ ไม่มีการอ่าน/แสดงค่า `.env`, push, deploy, เขียน DB/Storage ทีม หรือเปิด Cron

## คำสั่งตรวจซ้ำ

จาก `backend` (Python ที่มี dependencies ของ backend):

```bash
env -i PATH="$PATH" PYTHON_DOTENV_DISABLED=1 DATABASE_URL='sqlite:///:memory:' python -m pytest -q tests/test_products_create.py tests/test_products_update_cancel.py tests/test_product_reads.py
```

PostgreSQL tests ต้องใช้ container/DB แยกบน loopback ชื่อ `f_brand_test` ตาม guard ใน `tests/test_product_brands_postgres.py`; ห้ามชี้ URL ไป DB ทีม:

```bash
podman run --pull=never --rm --detach --name f-brand-pg-local --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_DB=f_brand_test --publish 127.0.0.1::5432 docker.io/library/postgres:16
podman port f-brand-pg-local 5432/tcp
podman exec f-brand-pg-local pg_isready --username postgres --dbname f_brand_test
```

เมื่อพร้อม ให้แทน `<PORT>` ด้วย port จากคำสั่งด้านบน:

```bash
env -i PATH="$PATH" PYTHON_DOTENV_DISABLED=1 DATABASE_URL='sqlite:///:memory:' F_BRAND_TEST_DATABASE_URL='postgresql+psycopg://postgres@127.0.0.1:<PORT>/f_brand_test' python -m pytest -q tests/test_product_brands_postgres.py
podman stop --time 3 f-brand-pg-local
```

จาก `mobile`:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/product-service.test.mjs tests/product-form.test.mjs tests/product-edit-store.test.mjs tests/product-catalog-service.test.mjs
EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npx --no-install jest --runInBand component-tests/product-form.test.tsx component-tests/new-product-screen.test.tsx component-tests/image-upload-service.test.tsx
EXPO_NO_DOTENV=1 npm run typecheck
EXPO_NO_DOTENV=1 npx --no-install eslint src/components/product-form.tsx src/products/product-form.ts src/products/product-write-validation.ts src/services/product-service.ts component-tests/product-form.test.tsx
EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npx --no-install expo export --platform android --output-dir /tmp/2ndhand-f-brand-20261004-android
```

## Gate ที่เหลือ

1. หลังผู้ใช้อนุมัติ ให้ push/deploy API ที่รับ `brand_name` ก่อนแจก APK ใหม่ API เดิมจะไม่รับฟิลด์นี้; clients เดิมที่ใช้ `brand_id` ยังใช้ API ใหม่ได้
2. สร้าง APK candidate ที่รวมแพตช์แบรนด์/รูปสินค้า/ยืนยันตัวตน และบันทึก source/API SHA กับ hash ให้ตรงกัน
3. Galaxy A02s และเครื่องเพื่อนตรวจ B1a: พิมพ์ชื่อใหม่ ลงขาย เปิดรายละเอียด/แก้ไขกลับมา ชื่อถูกต้อง แล้วเปลี่ยนเป็นแบรนด์เดิมและบันทึกอีกครั้ง พร้อมทดสอบ B1–B3 และ A6–A8 ตาม QA ของเพื่อน

ยังไม่บันทึก APK/device PASS และ Cron worker ยังเป็นคิวที่ต้องขออนุญาตตั้ง remote แยกต่างหาก

อ้างอิงกลไก lock: [PostgreSQL advisory locks](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS)
