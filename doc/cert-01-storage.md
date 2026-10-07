# CERT-01 — Certificate and Buyer Decision storage

## ขอบเขตและฐานที่ใช้

- Issue: [#101](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/101)
- Contract: [CERT ใน #100](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/100#issuecomment-5848063380), INSPECT-00 #54
- ฐาน INSPECT จริง: `feat/inspect-01-storage` ที่ `d6a1a1a8f86b2bc1e3c2b5bcb0b0d1b34b3f8d59`; PR #108 กำลังนำเข้า main
- ตรวจ main `8254f8d224f62aa765f978f65f110139410a09ab` แยกจาก checkout ในเครื่อง
- Migration เดิม `c7e4b21a9d08` มี `certificates` อยู่แล้ว งานนี้ **ต่อเติมตารางเดิม** และเพิ่ม `buyer_inspection_decisions`
- Revision ใหม่ `d8b7c4e2910a` ต่อจาก `c7e4b21a9d08` โดยตรง ไม่แก้ migration เก่า
- ไม่สร้าง API ตัดสินใจ/เพิกถอน, หน้า HTML, QR หรือ shipment/การจ่ายเงินในงานนี้

PR นี้ใช้ฐาน INSPECT ร่วมจริงและทดสอบ PostgreSQL แยก ไม่ถือว่า ORDER/INSPECT/CERT ทั้ง Feature ผ่าน QA หรือถูก deploy แล้ว รอ #108 เข้า main ก่อนเปลี่ยน base PR นี้เป็น main

## ตารางและกติกา

### `certificates`

คง `id`, `order_id`, `inspection_id`, `certificate_no`, `public_token`, `result`, `issued_at` เดิม พร้อม unique ต่อ Order/Inspection/เลขใบรับรอง/token

เพิ่ม:

| คอลัมน์ | กติกา |
|---|---|
| `status` | `ISSUED` เป็นค่าเริ่มต้นจาก DB; อนุญาต `REVOKED` |
| `revoked_at` | null เมื่อ ISSUED; REVOKED ต้องมีเวลาไม่น้อยกว่า issued_at |
| `revocation_reason` | null ได้; หากมี ต้อง trim และยาว 1–500 ตัวอักษร; ISSUED ต้องเป็น null |

Composite FK `(inspection_id, order_id, result)` อ้าง tuple เดียวกันใน `inspections` จึงต้องเป็นผลสุดท้าย `PASS`/`MINOR_ISSUE` ของ Order นั้นจริง ไม่ยอมให้ snapshot PASS อ้างผล FAKE หรือผลที่ยังไม่จบ มี unique tuple ใน Inspection รองรับ FK นี้ โดยไม่เปลี่ยนผลตรวจเดิม

PostgreSQL trigger ห้ามเปลี่ยนตัวตน/Order/Inspection/result/เลขใบรับรอง/token/เวลาออกของใบเดิม อนุญาตเปลี่ยนข้อมูลสถานะตาม check ข้างต้นไว้รองรับอนาคต; **ยังไม่มี revoke API และยังไม่ได้กำหนด workflow การเพิกถอน**

### `buyer_inspection_decisions`

| คอลัมน์ | กติกา |
|---|---|
| `id` | PK |
| `order_id`, `inspection_id` | แต่ละคอลัมน์ unique; composite FK ต้องตรง Inspection และ Certificate คู่เดียวกัน |
| `buyer_id` | FK users; composite FK `(order_id,buyer_id)` ต้องตรงเจ้าของ Order |
| `decision` | `CONFIRM` หรือ `REJECT` |
| `reason` | CONFIRM ต้อง null; REJECT null ได้ หรือข้อความ trim 1–500 ตัวอักษร |
| `decided_at` | not null; default จาก DB `now()` |

เพิ่ม unique `(id,buyer_id)` ใน Orders และ `(inspection_id,order_id)` ใน Certificates เพื่อรองรับ composite FK ไม่มีการเปลี่ยนข้อมูล Order/Payment เดิม

Decision ต้องมี Certificate เข้าเกณฑ์ก่อน จึงไม่สามารถผูกกับผลลบ/งานที่ยังตรวจไม่จบได้ Unique ป้องกันการตัดสินใจซ้ำแม้คำขอพร้อมกัน และ trigger ปฏิเสธ UPDATE/DELETE หลังบันทึก; การส่งคำขอเดิมซ้ำต้องอ่านแถวเดิมกลับ ไม่สั่ง UPDATE

ทั้งสองตารางเปิด RLS และไม่มี policy ให้ `anon`/`authenticated` เข้าถึงโดยตรง Backend ใช้การเชื่อมต่อที่มีสิทธิ์และตรวจสิทธิ์ผู้เรียกอีกชั้น สิทธิ์ RLS ไม่ทดแทนสิทธิ์ API

## ส่งต่อ CERT-02 / CERT-04

### CERT-02 + INSPECT-03

1. ล็อก Order/Inspection และตรวจสิทธิ์/สถานะล่าสุดตาม INSPECT
2. บันทึกผลตรวจแล้ว flush ก่อนเพิ่ม Certificate เพื่อให้ FK ตรวจ result snapshot ได้
3. สร้าง token ด้วย `secrets.token_urlsafe(32)` ฝั่ง server และตรวจ public URL ตาม contract
4. บันทึก Certificate, ผลตรวจ, Order `RESULT_NOTIFIED` ใน transaction เดียว; flush ไม่ใช่ commit
5. หากขั้นใดล้มเหลว rollback ทั้งหมด; ผลลบไม่ออกใบรับรอง

ปรับ `issue_certificate()` เดิมเพียงเพิ่ม flush ก่อน insert เพื่อให้ทำงานกับ FK ใหม่ได้ ชุดทดสอบ INSPECT flow ใช้ HTTP API และ PostgreSQL จริง แต่จำลอง authentication/private storage และไม่ใช่การทดสอบบนมือถือหรือ Supabase

### CERT-04

DB บังคับความสัมพันธ์/unique/ค่าที่จัดเก็บ ส่วน BE ต้องตรวจภายใต้ Order/Inspection lock:

- ผู้เรียกคือ Buyer เจ้าของ Order และบัญชี ACTIVE; ใช้ข้อมูลจาก token/DB ไม่รับ buyer_id หรือ decided_at จาก client
- Order เป็น `RESULT_NOTIFIED`, ผลเข้าเกณฑ์ และ Certificate ยัง `ISSUED` ณ เวลาตัดสินใจ (FK ไม่ตรวจสถานะบัญชี/Order/ใบรับรอง)
- `CONFIRM` รับ reason omitted/null เท่านั้น ไม่แปลงข้อความที่ส่งมาให้หายไปเงียบ ๆ
- `REJECT`: trim แบบเดียวกันทุกคำขอ, blank เป็น null, หลัง trim ไม่เกิน 500 ตัวอักษร ก่อน insert/เทียบ replay; DB เก็บเฉพาะค่าที่ normalize แล้ว
- payload เดิมรวม normalized reason ให้ 200 พร้อม record เดิม; ค่าใดต่างให้ 409 ไม่แก้แถวเดิม
- `REJECT` ไม่เพิกถอนใบรับรอง; FINISH คำนวณ next_action จากผลและ Decision ฝั่ง server
- ข้อมูล private/public และ error response ให้ตรง #100; endpoint ตัดสินใจยังไม่รวมใน CERT-01

ตัวอย่างค่าที่เก็บ (ID เป็นตัวอย่าง ต้องมาจากข้อมูลจริงที่ตรงกัน):

```json
{"order_id": 10, "inspection_id": 4, "buyer_id": 2, "decision": "CONFIRM", "reason": null}
```

```json
{"order_id": 11, "inspection_id": 5, "buyer_id": 2, "decision": "REJECT", "reason": "สภาพไม่ตรงที่คาด"}
```

## วิธีทดสอบและ seed (เฉพาะ PostgreSQL แยกในเครื่อง)

สร้างฐานใหม่ว่างที่มีคำว่า `test` ในชื่อ กำหนด `CERT_TEST_DATABASE_URL` เป็น localhost และคนละฐานกับ `DATABASE_URL` ชุดทดสอบปฏิเสธฐาน remote/ฐานที่มีตารางอยู่แล้ว ไม่ใช้ `.env` ของระบบจริง

ผู้ดูแล cluster ทดสอบสร้าง roles `anon`, `authenticated` เป็น NOLOGIN/NOSUPERUSER/NOBYPASSRLS ก่อน ชุดทดสอบจะให้ table grants ภายใน transaction แล้วทดสอบการปฏิเสธจาก RLS โดยตรง ไม่ยอมรับ permission error จากการไม่มี grant ว่าผ่าน

รันจาก `backend` เมื่อ environment ชี้ฐานทดสอบแล้ว:

```powershell
python -m pytest tests/test_certificate_postgres.py -q --tb=short
```

การทดสอบ INSPECT regression ใช้ `INSPECT_TEST_DATABASE_URL` และ `INSPECT_FLOW_TEST_DATABASE_URL` เป็นฐานใหม่ว่างแยกอีกสองฐาน ชุดทั่วไปใช้ `DATABASE_URL` ของฐาน local ที่ migrate head แล้วเท่านั้น

Seed หลัง migrate head ในฐานทดสอบอื่น (ไม่ใช้ฐานว่างที่เตรียมให้ pytest):

```powershell
python -m scripts.seed_certificates --database-url $env:CERT_SEED_TEST_DATABASE_URL --namespace cert-demo
python -m scripts.seed_certificates --database-url $env:CERT_SEED_TEST_DATABASE_URL --namespace cert-demo --apply
python -m scripts.seed_certificates --database-url $env:CERT_SEED_TEST_DATABASE_URL --namespace cert-demo --apply
```

Preview ไม่เขียนข้อมูล/เลื่อน sequence; apply สร้าง 8 สถานการณ์ต่อจาก seed INSPECT พร้อม Order/Payment/Escrow/Receipt สมมติ โดย PASS มี Certificate + CONFIRM และ MINOR_ISSUE มี Certificate + REJECT; ผลลบไม่มี Certificate/Decision รันซ้ำใช้ ID เดิม และเมื่อ fixture ถูกเปลี่ยนจะปฏิเสธแทนเขียนทับ ใช้ namespace ใหม่หากต้องการชุดใหม่ รูปเป็น object key สมมติ จึงไม่ใช่หลักฐานการเปิดรูปจริง

## Upgrade / downgrade และผู้รันฐานกลาง

ทดสอบบนฐานแยกก่อน:

```powershell
python -m alembic current
python -m alembic upgrade d8b7c4e2910a
python -m alembic downgrade c7e4b21a9d08
python -m alembic upgrade d8b7c4e2910a
```

- Upgrade เติม ISSUED ให้ใบเดิมและตรวจ FK ของ snapshot เดิม หากพบใบเดิมอ้างผลผิดจะยกเลิก migration ทั้ง transaction ให้ตรวจข้อมูลก่อน ไม่ stamp ข้าม/ซ่อมผลเงียบ ๆ
- Downgrade ถ้ามี Decision หรือข้อมูลเพิกถอนจะปฏิเสธ เพื่อไม่ทำข้อมูลหาย และล็อกตารางขณะตรวจ/เปลี่ยน schema
- หากไม่มีข้อมูลใหม่ดังกล่าว downgrade จะคงใบรับรองและข้อมูล Order/Payment เดิม แต่เอาคอลัมน์/ข้อจำกัดใหม่ออก; อย่า downgrade ต่อผ่าน migration ใบรับรองเดิมขณะมีใบรับรองอยู่
- งานนี้ **ยังไม่ apply migration บน Supabase กลาง** ให้ผู้รับผิดชอบโปรเจคประสานชื่อผู้รันหนึ่งคนใน PR ก่อน deploy หลัง review พร้อม backup/restore และตรวจ revision จริง ห้าม reset หรือ stamp ฐานกลางเพื่อข้าม migration

## หลักฐานรอบนี้

ทดสอบ PostgreSQL 18 แยกบน 127.0.0.1: fresh upgrade, existing paid Order/PaymentAttempt/Payment/Escrow/Receipt และใบรับรองเดิมผ่าน upgrade/downgrade/upgrade โดยข้อมูลเท่าเดิม, ข้อมูล legacy ที่ผิดทำให้ migration rollback, FK/unique/check, RLS หลังมี grant, การตัดสินใจพร้อมกัน, snapshot/decision immutability และ seed ซ้ำ

ผลรวมและ commit ที่ตรวจบันทึกใน PR เพื่อไม่อ้างว่าผลทดสอบของ commit เก่าเป็นผลของ commit ใหม่ การทดสอบนี้ไม่ใช่การอนุมัติ deploy หรือการปิด CERT ทั้ง Feature
