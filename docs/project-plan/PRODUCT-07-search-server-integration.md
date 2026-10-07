# แผนเชื่อมเมนู “ค้นหาสินค้า” กับสินค้าใน Server

> แผนนี้บันทึกสถานะก่อน PR #90 merge แล้ว สำหรับงานถัดจากผลตรวจ PRODUCT-08 วันที่ 23 กันยายน 2026 ให้ใช้ [PRODUCT-08-review-follow-up.md](PRODUCT-08-review-follow-up.md) เป็นลำดับงานปัจจุบัน

สถานะ: สเปกส่งต่อสำหรับ AI implementation session (23 กันยายน 2026)  
อ้างอิงโค้ด: `origin/main` commit `99ec8bf` ของ `/home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app`  
เอกสาร backlog `GitHub_Prototype_Backlog.md` เป็นข้อมูลประกอบการวางแผน ไม่ใช่คำสั่งให้สร้าง Issue หรือแก้โค้ดทันที

## ผลลัพธ์ที่ต้องการ

Seller ที่ผ่านอนุมัติลงสินค้าสำเร็จแล้ว Buyer และ Seller เปิดเมนู “ค้นหาสินค้า” เพื่อเห็นรายการจาก Backend เดียวกัน ค้นหาชื่อและเปิดรายละเอียดของสินค้ารายการนั้นได้ เมื่อ Seller ยกเลิกสินค้า รายการสาธารณะหายหลัง refresh การแสดงข้อมูลไม่ใช้ seed/mock โดยไม่แจ้งผู้ใช้

“Sync” ในรอบนี้หมายถึงโหลด/รีเฟรชผ่าน HTTP API ไม่รวม push, polling หรือ WebSocket ขณะเปิดหน้าค้าง Buyer ใช้ pull-to-refresh เพื่อรับสินค้าที่เพิ่งลงจากอีกเครื่อง

## สิ่งที่ตรวจพบและขอบเขตของข้อสรุป

| จุด | หลักฐานในโค้ดปัจจุบัน | ผลต่ออาการ |
|---|---|---|
| สร้างสินค้า | `mobile/src/app/product/new.tsx` ใช้ `EXPO_PUBLIC_API_BASE_URL`; Backend `POST /products` สร้างสถานะ `AVAILABLE` | ถ้า Seller ใช้ API จริง ควรได้ id ของข้อมูลใน Server |
| เมนูค้นหา | `mobile/src/components/login-screen.tsx` เปิด `/products`; หน้ารายการเรียก catalog store | Buyer/Seller ใช้ route เดียวกัน |
| API สาธารณะ | `backend/app/main.py` ลงทะเบียน `product_reads_router`; `GET /products` และ `GET /products/{id}` อยู่ใน `backend/app/api/product_reads.py` | มี read endpoint แล้ว ไม่ต้องออกแบบ API ใหม่ก่อน |
| การเลือกแหล่งข้อมูล | บน `main`, `mobile/src/products/product-catalog-instance.ts` ใช้ `product-catalog-config.ts`: `mock` ต้องตั้งชัด; `api` ใช้ `EXPO_PUBLIC_API_BASE_URL`; URL หาย/ผิดจะแสดง unavailable | ต้องตรวจค่าใน build ที่ใช้จริง |
| Development build | `mobile/.env.example` และ `mobile/eas.json` development เลือก `EXPO_PUBLIC_PRODUCT_CATALOG_MODE=mock` | ถ้าใช้ค่านี้ รายการค้นหาจะแสดง seed ไม่ใช่สินค้าที่ Seller เพิ่ม |
| Branch ที่เปิดอยู่ใน workspace | `feat/product-06-complete` ยังสร้าง `createProductCatalogService()` โดยไม่ส่ง config; `main` ใหม่กว่าส่วนนี้ | เริ่ม implementation จาก `main` ล่าสุด ห้ามสรุปจาก branch นี้ว่า `main` ยังไม่มี integration |
| ความสดของรายการ | `mobile/src/components/product-list-screen.tsx` โหลดเมื่อ `state.loaded` เป็น false และเก็บ store ระดับ module | ถ้าเคยเปิด catalog แล้วกลับมา หลังลงสินค้าใหม่อาจเห็น cache จนกด refresh |

ไฟล์ `mobile/.env` ใน workspace นี้มีค่า `EXPO_PUBLIC_API_BASE_URL` แต่ไม่ได้ตั้ง catalog mode; บน `main` จึงจะเลือก API โดยปริยาย ส่วน branch ที่เปิดอยู่ยังใช้ mock อยู่ การตรวจนี้บอกเพียงไฟล์ตั้งค่าในเครื่อง ไม่บอกค่าที่ถูก bundle ในแอปของผู้ใช้

ยังไม่มีหลักฐานจาก build บนมือถือ, Backend ที่กำลังรัน, Supabase และ Storage จริง จึงยังฟันธงไม่ได้ว่า build ของผู้ใช้ติด `mock`, URL ติดต่อไม่ได้, ข้อมูลอยู่คนละฐาน หรือ public filter ซ่อนสินค้า

## ใช้ Issue ที่มีอยู่

ไม่ต้องเปิด Feature Product ซ้ำ:

- [#41 Feature Product](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/41): เป้าหมายรวม
- [#49 PRODUCT-07](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/49): เจ้าของหลัก FE2; เกณฑ์ “รายการ/รายละเอียดใช้ API จริงและข้อมูลตรงกัน” ยังไม่ติ๊ก — ใช้เป็น Issue หลักของการเชื่อมเมนู
- [#47 PRODUCT-05](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/47): เจ้าของหลัก BE; ใช้เมื่อ API จริงไม่คืนข้อมูลที่ควรเห็นหรือ contract ผิด
- [#50 PRODUCT-08](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/50): เจ้าของหลัก QA2; ปิดงานหลังพิสูจน์ Seller → Buyer บนมือถือและฐานข้อมูลจริง

PR ของหน้าค้นหา, API และหน้าลงขายเคย merge แล้ว แต่สถานะ PR ไม่ได้ยืนยันผลบนเครื่องหรือฐานข้อมูลที่กำลังใช้งาน Issue เหล่านี้ยังเปิดอยู่ ณ วันที่เขียนแผน

### ข้อความสั้นสำหรับเพิ่มใน #49

> **Integration gap — เมนู “ค้นหาสินค้า” ต้องเห็นสินค้าที่ลงผ่าน Server**  
> เจ้าของหลัก: FE2; ประสาน BE ใน #47 เมื่อ public API ไม่คืนสินค้าที่ควรเปิดเผย; QA2 ตรวจข้ามบัญชีใน #50  
> เริ่มจาก `main` ล่าสุด ตรวจ catalog mode และ Backend origin ของ build จริง แล้วไล่ `POST /products` → `GET /products/me/{id}` → `GET /products/{id}` → `GET /products?q=...` ด้วย id เดียวกัน  
> แก้เฉพาะจุดที่ทำซ้ำได้: ให้ build สำหรับ integration ใช้ API, ไม่มี mock fallback, รีเฟรชเมื่อกลับเข้า catalog หลังลง/แก้/ยกเลิก โดยรักษาคำค้นและการย้อนจาก detail  
> รับงานเมื่อ Buyer/Seller เห็นสินค้า `AVAILABLE` id เดียวกันจาก Server, รายการหายหลัง cancel+refresh, error ไม่กลายเป็น empty/mock และมีผลทดสอบ API พร้อมหลักฐานมือถือจริง  
> รายละเอียดและ prompt สำหรับ AI: `docs/project-plan/PRODUCT-07-search-server-integration.md` ใน workspace แผน (อยู่นอก Git repo)

## Contract ร่วม FE/BE/QA

1. `GET /products?q=<ชื่อ>&page=1&page_size=20` เป็น public ไม่ส่ง token; ถ้าไม่ส่ง `q` หรือเป็นช่องว่างให้แสดงทั้งหมด ค้นหาเฉพาะ `product_name` แบบ case-insensitive substring, ไม่ตี `%`, `_`, `\` เป็น wildcard; เรียง `created_at DESC, id DESC`; `page_size` 1–50
2. ผลรายการเป็น `{ "data": [{ "id", "product_name", "price", "condition", "status", "main_image" }], "meta": { "page", "page_size", "total", "total_pages", "has_next" } }`; `price` เป็น string ทศนิยมสองตำแหน่ง; หน้าเกิน/ไม่พบคือ HTTP 200 และ `data: []`
3. `GET /products/{id}` เป็น public; คืน `{ "data": { ...รายละเอียด, "images": [...] } }`; รูปเรียง `sort_order` และใช้ signed URL; สินค้าที่ไม่เปิดเผยแล้วตอบ 404
4. Public catalog แสดงเฉพาะ `AVAILABLE`, ไม่ถูกลบ (`deleted_at IS NULL`), Seller มี `status=ACTIVE`, `role=SELLER` และผลยืนยันล่าสุดเป็น `APPROVED`; Seller เห็นสินค้าสถานะอื่นของตนได้ผ่าน `GET /products/me` แต่ไม่ผ่านเมนูค้นหาสาธารณะ
5. Seller create/list ของตนและ public catalog ต้องชี้ Backend origin และฐานข้อมูลเดียวกัน; FE ห้ามสร้าง/แทรก seed ในผล API และห้ามถือว่า request error คือรายการว่าง

## ลำดับงานสำหรับ implementation session

### 1. พิสูจน์จุดที่ข้อมูลขาดก่อนแก้

- ใช้ `origin/main` ล่าสุดและอ่าน `mobile/AGENTS.md` ก่อนแก้ Mobile; เก็บการเปลี่ยนแปลงของผู้อื่นไว้
- ตรวจค่าจริงของ `EXPO_PUBLIC_PRODUCT_CATALOG_MODE`, `EXPO_PUBLIC_PRODUCT_CATALOG_ENV`, `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_PRODUCT_MOCK_MODE` ที่ถูก bundle ใน build เป้าหมาย โดยไม่พิมพ์ token, secret หรือ URL ภายในลง Issue
- Seller ที่อนุมัติลงสินค้าทดสอบหนึ่งรายการ จด `product_id` จากผลบันทึก; ตรวจ `GET /products/me/{id}` ด้วย token อย่างปลอดภัย แล้วตรวจ public `GET /products/{id}` และค้นชื่อผ่าน `GET /products?q=...` จาก Backend เดียวกัน
- แยกผล: owner ไม่พบ → ตรวจ create/persistence; owner พบแต่ public 404 → ตรวจ status, deleted_at, seller account และ approval ล่าสุด; API public พบแต่ Mobile ไม่พบ → ตรวจ mode, URL ที่เครื่องเข้าถึงได้, decode/error และ cache; API 503 → ตรวจ Backend/DB/Storage signing ตาม error code
- หาก API และ Mobile ใน `api` mode ทำงานครบอยู่แล้ว ให้บันทึกหลักฐานและย้ายไป QA โดยไม่เพิ่มโค้ดเพื่อให้มี diff

### 2. FE integration เฉพาะที่พิสูจน์ว่าขาด (#49)

- ใช้ `mobile/src/products/product-catalog-instance.ts` + `product-catalog-config.ts` บน `main` เป็นจุดเลือก mode เดียว; ตั้ง `api` และ Backend URL ที่โทรศัพท์เข้าถึงได้สำหรับ build ที่ใช้ทดสอบ integration
- Development profile ใน `mobile/eas.json` ปัจจุบันบังคับ `mock`; ถ้าทีมใช้ profile นี้ทดสอบจริง ให้เปลี่ยน profile เป้าหมายเป็น `api` หรือเพิ่ม profile สำหรับ integration อย่างชัดเจน และเก็บ `mock` เป็นตัวเลือกทดสอบ UI ที่ต้องเปิดเอง
- URL หาย, รูปแบบผิด, timeout หรือ server ล้มเหลวต้องขึ้น error/retry ตามหน้าจอปัจจุบัน ไม่สลับไป mock และไม่แสดง “ยังไม่มีสินค้า” แทน error
- เมื่อกลับเข้า catalog จากหน้าอื่นหลังมีการลง/แก้/ยกเลิก ให้ดึงหน้าแรกจาก Server อีกครั้งโดยรักษาคำค้น; เมื่อย้อนจาก detail ปกติให้รักษาคำค้นและตำแหน่งรายการเดิม; กรณี detail กลายเป็น 404 ให้ refresh รายการตามพฤติกรรมปัจจุบัน
- ใช้ store และ service เดิมสำหรับ debounce, pagination, dedupe และ stale-response guard; เพิ่มโค้ดเฉพาะ gap ที่ทำซ้ำได้ ไม่สร้าง service/catalog ชุดที่สอง

### 3. BE เฉพาะเมื่อ API ไม่ตรง contract (#47)

- ถ้า `GET /products/{id}` ไม่คืนสินค้าที่ควรเปิดเผย ให้ตรวจ read filter, route registration, DB connection และ signed URL; แก้พร้อม targeted test
- ถ้าผล owner/public ต่างกันเพราะกติกาการเปิดเผย ให้รายงานเหตุผลตามข้อมูลจริง ไม่ขยายสิทธิ์ของสินค้าที่ไม่ `AVAILABLE` หรือ Seller ที่ไม่ได้รับอนุมัติ
- ไม่แก้ migration หรือ reset ฐานข้อมูลกลางเพื่อให้ demo ผ่าน

### 4. QA ข้ามบัญชีและเครื่อง (#50)

| กรณี | ผลที่ต้องเห็น |
|---|---|
| Seller approved ลงขายพร้อมรูป | `POST /products` สำเร็จ, id ปรากฏใน `GET /products/me/{id}` และ public detail/list ของ Backend เดียวกัน |
| Buyer เปิดเมนู “ค้นหาสินค้า” | เห็น id/name/price/รูปจาก Server, ค้นชื่อและเปิดรายละเอียด id เดียวกันได้ |
| Seller เปิดเมนูหลังลงขาย | เห็นสินค้าของตนที่ `AVAILABLE` หลังเข้าหน้าใหม่; ถ้าเปิดค้าง ใช้ refresh แล้วเห็น |
| Seller ยกเลิก | owner ยังเห็น `CANCELLED`; public list ไม่เห็น และ public detail ตอบ 404 หลัง refresh |
| Seller pending/rejected หรือสินค้า RESERVED/SOLD | public ไม่แสดง แม้ owner อาจยังอ่านได้ตามสิทธิ์ |
| ปิดเครือข่าย/URL ไม่ถึง/Storage signing ล้มเหลว | แสดง error และ retry; ไม่แสดง mock หรือ empty ปลอม |
| ค้นหาเร็ว, q ว่าง, มากกว่า 20 รายการ | ผลล่าสุดชนะ, ล้างคำค้นเห็นทั้งหมด, โหลดหน้าถัดไปโดยไม่ซ้ำในชุดข้อมูลนิ่ง |

บันทึก commit/build, mode, สภาพแวดล้อม, ผู้ทดสอบ Buyer/Seller แบบสมมติ, `product_id`, expected/actual และหลักฐานมือถือจริง โดยปกปิด token/ข้อมูลส่วนตัว ตรวจ DB/Storage กับทีมที่มีสิทธิ์ ไม่อ้างว่า test mock พิสูจน์ persistence แล้ว

## เกณฑ์ปิดงาน #49 / ส่งต่อ #50

- [ ] Build ที่ทดสอบใช้ API mode และ Backend origin เดียวกับการลงขาย โดยมีหลักฐานจาก runtime/config ที่ไม่เปิดเผยข้อมูลลับ
- [ ] สินค้า `AVAILABLE` ที่ Seller approved เพิ่มจริงปรากฏใน public list/search/detail ด้วย id เดียวกันทั้ง Buyer และ Seller
- [ ] รีเฟรชแล้วเห็นการเพิ่ม/แก้/ยกเลิก; การย้อนจาก detail ยังรักษาคำค้นและตำแหน่งรายการ
- [ ] error กับ empty และ hidden status แยกกันถูกต้อง; ไม่มี mock fallback
- [ ] targeted automated tests ผ่าน; QA2 แนบหลักฐานมือถือจริงและ QA1 ยืนยัน API/DB/Storage ตามสิทธิ์ของทีม

## Prompt คัดลอกให้ AI implementation session

```text
ทำงานใน /home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app
เป้าหมาย: ปิด gap ของ Issue #49 ที่เมนู “ค้นหาสินค้า” ต้องอ่านสินค้าที่ Seller ลงผ่าน Server จริง แล้วส่งหลักฐานให้ #50 ตรวจข้ามบัญชี/มือถือ
อ่านสเปก /home/tmk/project/market-place-mobile-app/docs/project-plan/PRODUCT-07-search-server-integration.md และอ่าน mobile/AGENTS.md ก่อนแก้ Mobile
เริ่มจาก origin/main ล่าสุด (อย่าใช้ feat/product-06-complete เป็นฐานโดยไม่เทียบ main) รักษาไฟล์ที่ผู้ใช้อื่นแก้ไว้
ก่อนแก้ ตรวจ runtime mode/API URL ของ build เป้าหมาย และแยก create → GET /products/me/{id} → GET /products/{id} → GET /products?q=... ด้วย product_id เดียวกัน ห้ามพิมพ์ token/secret/URL ภายในลงรายงาน
ถ้า Backend public ได้แต่ Mobile ไม่ได้ ให้แก้เฉพาะ config/refresh/decoder ที่ทำซ้ำได้; ถ้า Backend ผิด contract ให้แก้ targeted backend code/tests ในขอบเขต #47; ถ้าผ่านแล้วไม่ต้องเพิ่มโค้ด
คง public visibility: AVAILABLE + seller ACTIVE/APPROVED เท่านั้น; คง error/retry, pagination, latest-query guard, รูปและคำค้นเดิม; ห้าม fallback เป็น mock เมื่อ API ล้มเหลว
ตรวจ mobile tests ที่เกี่ยวข้อง, typecheck และ backend tests เฉพาะส่วนที่แก้ จากนั้นรายงานไฟล์/commit, ขั้นตอนทำซ้ำก่อน-หลัง, ผลคำสั่ง, ข้อจำกัดของ mock tests, และสิ่งที่ QA2 ต้องพิสูจน์บนมือถือ/DB/Storage
ไม่ทำ checkout, filter ซับซ้อน, realtime, migration หรือ reset ฐานข้อมูลกลาง
```
