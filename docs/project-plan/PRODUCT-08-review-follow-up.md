# PRODUCT-08 — แผนหลัง reviewer ขอแก้

วันที่: 23 กันยายน 2026  
ฐานที่ตรวจซ้ำ: `origin/main` commit `40e5468` หลัง [PR #90](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/90) merge; PR งานแก้ #48 ล่าสุดคือ [#91](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/91) head `02a804b` (OPEN, รอ review, ไม่มี CI checks ณ เวลาตรวจ)  
Repository: `/home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app`  
ขอบเขต: วางแผนจากข้อความรีวิวที่ได้รับถึง finding 3 และสรุปข้อ 4–6; ส่วนท้ายอีกประมาณ 70 บรรทัดยังไม่ได้รับ

## คำตัดสิน

คง [PRODUCT-08 #50](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/50) และ [Feature Product #41](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/41) เป็น OPEN ต่อ ผล `346 backend`, `257 mobile logic`, `94 component` และ typecheck/lint ที่ reviewer รายงานเป็นหลักฐานอัตโนมัติ แต่ยังไม่แทน PostgreSQL แยก, API จริง, Storage หรือมือถือจริง

`main` มี API catalog แล้ว PR #90 รวม commit `33d7ba8` ที่ทำให้ `mockMode=true` มีผลก่อนอ่าน API URL ในบริการสินค้าและอัปโหลดรูป รวมทั้งเพิ่มคำอธิบาย Metro/`.env`; PR นี้ **MERGED** แล้ว แม้รายงานเดิมจะระบุว่ายัง Draft และ [Issue #49](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/49) ยังเปิดรอหลักฐาน API/มือถือจริง

ข้อท้วงติงด้านข้อมูลที่เขียนและ timeout มีโค้ดแก้เสนอแล้วใน PR #91 แต่ยังต้อง review และตรวจผลทดสอบก่อนนับว่าแก้เสร็จ ไฟล์ `mobile/.env` ใน workspace ชี้ loopback จึงไม่ใช้เป็นหลักฐานว่ามือถือจริงเรียก API ได้

## ลำดับที่ควรทำ

| ลำดับ | เจ้าของ / Issue | งานและหลักฐานส่งมอบ |
|---|---|---|
| 1 — blocker ของ write flow | FE1 / [PRODUCT-06 #48](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/48) | Review [PR #91](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/91) เทียบ contract ราคา, description, size ทั้ง create/edit; รัน targeted tests และให้แก้ finding ก่อน merge |
| 2 — blocker ของ retry | FE1 / #48; BE ร่วมตัดสิน contract หากต้องการ retry อัตโนมัติ | Review timeout ของ upload/create/update/cancel ว่าครอบ headers **และ body**, abort lifecycle, uncertain create และ owner re-fetch; อย่าอ้างว่า PR เปิดเท่ากับผ่าน acceptance |
| 3 — environment gate | ผู้ดูแล environment + BE / [PRODUCT-05 #47](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/47) | ตั้ง Backend origin ที่มือถือจริงเข้าถึงได้และเชื่อมฐานเดียวกับ Seller create; ตรวจ public API จากเครื่องจริง; แนบผล API/status code โดยปิด token/URL ภายใน |
| 4 — DB gate | DB1/DB2 + QA1 / #47, #50 | รัน PostgreSQL integration/migration tests 31 รายการกับ `TEST_DATABASE_URL` ที่เป็นฐานทดสอบแยกและว่าง; บันทึก pass/fail/skip จริง; ไม่ reset ฐานกลาง |
| 5 — end-to-end gate | FE2 / [PRODUCT-07 #49](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/49), QA2 / #50 | Seller approved ลงขาย → Buyer/Seller ค้นพบ id เดียวกัน → เปิดรายละเอียด/รูป → Seller ยกเลิก → public ไม่พบหลัง refresh; มีคลิปหรือภาพมือถือจริงและผล DB/Storage จากผู้มีสิทธิ์ |

Review PR #91 และเตรียม environment/ฐานทดสอบทำคู่กันได้ งาน 5 เริ่มตรวจหลัง build ใหม่และ Backend เข้าถึงได้ ไม่ควรติ๊ก Issue จาก mock หรือ TestClient เพียงอย่างเดียว

## เกณฑ์ตรวจ PR #91 ก่อน merge

1. **ราคา:** `mobile/src/products/product-form.ts`, `mobile/src/components/product-form.tsx`, `mobile/src/services/product-service.ts` ต้องรักษาราคาเป็น string ในเส้นทาง form → API; อย่าใช้ `Number(priceText)` หรือ `toFixed(2)` กับค่าที่ผู้ใช้กรอกก่อนส่ง ตรวจรูปแบบเดียวกับ `backend/app/schemas/product.py`: ไม่มี exponent/comma/ทศนิยมเกินสองตำแหน่ง, มากกว่า 0, ไม่เกิน `9999999999.99` ส่ง `"1"` หรือ `"1.2"` ได้เพราะ Backend normalize เป็นสองตำแหน่งโดยไม่ปัด ค่า `0.01` และ `9999999999.99` ผ่าน; `1.001`, `1e2`, `1,000`, `0`, ค่าติดลบ/เกินเพดานไม่ผ่าน ตรวจ create **และ** edit รวมข้อมูลที่โหลดกลับมา
2. **ฟิลด์บังคับ:** trim แล้ว `description` ต้องยาว 1–1000 และ `size` 1–100 ตัวอักษร แสดง error รายฟิลด์ก่อนส่ง ห้าม fallback description เป็นชื่อหรือ size เป็น `M` ถ้าต้องการ “ไม่ระบุขนาด” ต้องให้ผู้ใช้เลือกอย่างเห็นได้ชัด
3. **Timeout:** ใน `product-service.ts` และ `image-upload-service.ts` ใช้ timeout/cancel ที่จบทั้งการรอ headers และการอ่าน body; แยก timeout จาก offline/network และยกเลิกเมื่อออกหน้า/สลับบัญชี โดยไม่แสดงว่ายกเลิกฝั่ง Server สำเร็จจากการ abort ฝั่ง Mobile เพิ่ม tests แบบ promise ค้างและ abort จริง
4. **Create response หาย:** เมื่อ POST อาจ commit แล้วแต่ client ไม่ได้รับผล ให้ UI บอกว่า “ยังยืนยันผลไม่ได้” และเปิดทางไป `GET /products/me`/“สินค้าของฉัน” เพื่อตรวจรายการล่าสุดก่อนลงซ้ำ คง draft ที่กรอกไว้ ห้าม retry create อัตโนมัติหรือบอกว่าล้มเหลวแน่นอน Update/cancel ที่ timeout ให้โหลด owner detail ใหม่ก่อนเสนอ retry
5. **ขอบเขตความปลอดภัยของข้อ 4:** การดู owner list ช่วยให้ผู้ใช้ตรวจเอง แต่ **ยืนยันแบบอัตโนมัติไม่ได้** เมื่อมีสินค้าซ้ำชื่อ/รายละเอียด หากต้องการปุ่ม retry ที่รับประกันไม่สร้างซ้ำ ต้องเพิ่ม client request id / idempotency key ที่ Backend เก็บถาวรและตอบผลเดิมตาม key นั้นเป็นงาน contract ใหม่ ไม่ใช้การ match ชื่อ/ราคาอย่างเดียว

เสร็จเมื่อมี tests สำหรับค่าขอบราคา, required/length, create/edit body จริง, timeout headers/body, abort และ uncertain create UI; typecheck, lint และ mobile tests ที่เกี่ยวข้องผ่าน ไม่มีการแก้ส่วน catalog/read โดยไม่มี finding ใหม่

## วิธีเปิดทาง QA จริง

- สร้าง build สำหรับ integration ที่ใช้ `EXPO_PUBLIC_PRODUCT_CATALOG_MODE=api` และ Product write ใช้ API เดียวกัน ตรวจ build/runtime จริง; ค่าใน `.env` ของเครื่องพัฒนาไม่ได้ยืนยันค่าใน build ที่ reviewer ทดสอบ
- Backend ต้องฟังบน origin ที่อุปกรณ์เข้าถึงได้; `localhost`/`127.0.0.1` ของเครื่องพัฒนาไม่ใช่ Backend ของโทรศัพท์จริง หลีกเลี่ยงการใส่ token, secret หรือ private URL ใน Issue/ภาพหลักฐาน
- QA1 ตรวจ `POST /products` กับ `GET /products/me/{id}` ด้วย Seller token และ public `GET /products/{id}`, `GET /products?q=...` ด้วย id เดียวกัน ถ้า owner พบแต่ public ไม่พบให้ตรวจ `AVAILABLE`, seller ACTIVE/APPROVED และฐานที่ API ใช้ ก่อนกล่าวว่าเมนูค้นหาเสีย
- จัด isolated PostgreSQL test DB ที่ชื่อมี `test`, ว่าง และทิ้งได้ตาม guard ใน `backend/tests/test_product_upload_schema.py`; รัน suite ที่ reviewer เห็น skip ซ้ำและแนบผลจริง ไม่ใช้ฐานกลางหรือ production
- QA2 ทดลอง Buyer/Seller บนมือถือจริงพร้อมรูปจาก private Storage; ทดสอบ timeout/offline, ไม่กดซ้ำจนเกิดสินค้าซ้ำ, แก้ไข, cancel, public refresh และ navigation/state แนบ build SHA/อุปกรณ์/expected/actual

## ข้อความสั้นส่งทีม/Reviewer

> PR #90 merge แล้วและ P1 เรื่อง mock ส่งคำขอไป API มี regression test; #49 ยังเปิดรอ API/มือถือจริง ส่วน finding เรื่อง write/timeout อยู่ใน PR #91 ที่รอ review จะคง #48, #50 และ #41 เปิดไว้ระหว่างตรวจ PR #91 และเตรียม Backend ที่โทรศัพท์เข้าถึงได้กับ PostgreSQL ทดสอบแยก จากนั้น FE2/QA1/QA2 เก็บหลักฐาน API → DB/Storage → มือถือจริงของสินค้า id เดียวกันใน #47/#49/#50

## Prompt สำหรับ AI ที่ตรวจ PR #91

```text
ทำงานใน /home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app จาก origin/main ล่าสุด รักษาการแก้ไขของผู้อื่น อ่าน mobile/AGENTS.md และ Expo v57 docs ก่อนแก้ Mobile
เป้าหมาย: review PR #91 / head 02a804b ที่เสนอแก้ PRODUCT-06 #48 ตาม reviewer finding ราคา, description/size, timeout และ create response หาย อ่านเกณฑ์ใน /home/tmk/project/market-place-mobile-app/docs/project-plan/PRODUCT-08-review-follow-up.md
เทียบ diff กับ backend contract และทำ targeted reproduction จริง โดยตรวจราคา string ใน form → API, การ validation ทั้ง create/edit, required fields และ request body ที่ส่ง
ตรวจ timeout+abort สำหรับ upload/create/update/cancel ว่าครอบ headers/body, account/page lifecycle, create ที่ผลไม่แน่นอนและทางไปตรวจสินค้าของฉัน โดยไม่ retry POST อัตโนมัติ; update/cancel ต้อง re-fetch owner detail ก่อน retry
รัน targeted logic/component tests, typecheck, lint แล้วรายงาน finding พร้อมไฟล์/บรรทัดและผลทดสอบ แยกผลตรวจโค้ดจาก QA บนมือถือจริง; ถ้าพบ defect ให้แก้เฉพาะจุดใน branch PR #91 และทดสอบซ้ำ
อย่าแตะ shared/production DB, checkout, filter หรือปิด #48/#50 จาก tests mock อย่างเดียว
```
