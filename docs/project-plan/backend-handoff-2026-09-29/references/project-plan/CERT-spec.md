# [Feature] CERT — ใบรับรอง QR และการตัดสินใจของผู้ซื้อ

วันที่: 23 กันยายน 2026; ปรับแผน 26 กันยายน 2026 | สถานะ: **สเปกสำหรับมอบหมายงาน; ORDER และ INSPECT ยังไม่เสร็จตามสถานะที่ Lead แจ้ง จึงยังไม่พร้อมปิดหรือทดสอบ CERT แบบ end-to-end**

**ข้อตกลงผลิตภัณฑ์ล่าสุด:** [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md) ยืนยันให้ออกใบรับรองเมื่อผลตรวจเป็น `PASS`/`MINOR_ISSUE` ใน transaction เดียวกัน. `CONFIRM` ในเอกสารนี้หมายถึง **ยอมรับผลตรวจ** เท่านั้น; “ยืนยันว่าได้รับสินค้า” หลังผู้ขนส่งถ่ายภาพเป็น FINISH อีก action หนึ่ง. หลังส่งถึงผู้ซื้อครบ 72 ชั่วโมงโดยไม่มีรายงานว่าไม่ได้รับ จึงปล่อยเงินอัตโนมัติ; ไม่มี auto-CONFIRM ผลตรวจ.

**วิธีอ่าน:** พฤติกรรมหลักในข้อ 1 และตารางผลตรวจข้อ 3 มาจาก Backlog; ชื่อ API, schema, error และ security controls ในข้อ 4–5 เป็น **สัญญาที่ Lead เสนอให้ทีมใช้ร่วมกัน** โดย ORDER และ [INSPECT-spec.md](INSPECT-spec.md) ยังเป็น dependency ที่ไม่ผ่านเกณฑ์ปิด Feature ตามสถานะที่ Lead แจ้ง ก่อน implement ส่วนที่ขึ้นต่อกันให้ตรวจ Order contract/PR และปิดข้อขัดแย้งของ INSPECT-00 ใน Issue #54 กับโค้ดที่ merge จริง ห้ามให้แต่ละ AI session เลือกคนละ contract

อ้างอิง: `GitHub_Prototype_Backlog.md` หัวข้อ 2, 4, 6 และหมายเหตุท้ายหัวข้อ 6; `secondhand-marketplace-android-app/doc/orders/contract.md`; `docs/state-diagram/Order State Diagram.puml`

## 1. เป้าหมายและขอบเขต

เมื่อผู้ตรวจบันทึกผล `PASS` หรือ `MINOR_ISSUE` ระบบต้องบันทึกผลและออกใบรับรองในธุรกรรมเดียวกันก่อนตอบว่าสำเร็จ ผู้ซื้อเปิดผลจริงในแอป เห็น QR ที่พาไปหน้าเว็บสาธารณะ และเลือก `CONFIRM` หรือ `REJECT` ได้ครั้งเดียว หากผลเป็น `NOT_AS_DESCRIBED` หรือ `FAKE` จะไม่มีใบรับรองและเข้าสู่ทางส่งคืนโดยไม่ต้องรอการตัดสินใจของผู้ซื้อ

หน้าเว็บจาก QR เปิดในเบราว์เซอร์ทั่วไปโดยไม่ต้องเข้าสู่ระบบหรือติดตั้งแอป และแสดงเฉพาะข้อมูลการตรวจที่เผยแพร่ได้ ใบรับรองยืนยัน **ผลการตรวจ ณ วันที่ออก** ไม่ยืนยันว่าผู้ซื้อรับสินค้าแล้วหรือเป็นเจ้าของสินค้า

Feature นี้จบที่ผลตรวจ ใบรับรอง การตัดสินใจ **เกี่ยวกับผลตรวจ** และสัญญาณทางเดินต่อให้ FINISH; งานสร้าง shipment ไปผู้ซื้อ/คืนผู้ขาย หลักฐานการส่งถึง การยืนยันรับสินค้า การปล่อยเงินและคืนเงินเป็น FINISH-02…04/TIMER-01 ไม่มี PDF ใบรับรอง, ลายเซ็นดิจิทัล, Push, การยืนยันผลตรวจอัตโนมัติ หรือระบบอุทธรณ์ในรอบนี้

## 2. สิ่งที่ตรวจจากโค้ด ณ วันที่เขียน

- Checkout ที่ตรวจมีฐาน Order/Payment/Escrow/Receipt, `GET /orders/{id}`, หน้ารายละเอียด Order และ Auth; Order ยังมีเพียง `WAITING_PAYMENT`, `WAITING_SELLER_SHIP` ใน Model, Migration, Pydantic และ Mobile type **การมีโค้ดบางส่วนไม่ใช่หลักฐานว่า ORDER-01…06/07 หรือ Feature ORDER เสร็จ**; Lead แจ้ง 26 ก.ย. ว่า ORDER ยังไม่เสร็จ ต้องตรวจสถานะ PR, migration และ QA ของงานต้นทางก่อนเริ่ม CERT integration
- ยังไม่พบ Model/Migration/API ของ Inspection, Certificate หรือ Buyer Decision ใน checkout นี้; Lead แจ้งว่า INSPECT ยังไม่เสร็จ แม้มี remote-tracking branches ของงาน INSPECT ก็ไม่นับเป็น integration ที่ merge แล้ว จึงต้องเชื่อม CERT กับ INSPECT-01…03 และขยายสถานะ Order อย่างประสานกัน อย่าให้ AI session สร้างผลตรวจจำลองแทนข้อมูลจริงเพื่อปิดงาน
- `backend/requirements.txt` มี Jinja2 อยู่แล้ว จึงใช้ FastAPI + template HTML/CSS สำหรับหน้าเว็บสาธารณะได้โดยไม่ต้องตั้ง web app อีกตัว
- พบ **ร่าง** `doc/inspect-contract.md` ที่ local remote-tracking branch `origin/chore/inspect-02-preparation` (commit `0acf006`, 18 ก.ย. 2026) ซึ่งระบุเองว่ายังไม่อนุมัติ ร่างนั้นใช้ `order_item_id`, ผล `PASSED`/`NOT_AUTHENTIC`/`NOT_AS_DESCRIBED`/`INCONCLUSIVE` และออกใบรับรองแบบ asynchronous; ทั้งสามเรื่องขัดกับ Backlog/สเปก CERT นี้ ห้ามนำร่างนั้นไป implement ตรง ๆ
- ร่าง INSPECT-00 v1 อยู่ใน [INSPECT-spec.md](INSPECT-spec.md); รอข้อสรุปจาก FE/BE/DB/QA ใน Issue #54 Issue/PR ที่ merge ภายหลังและฐานข้อมูลกลางต้องตรวจอีกครั้งเมื่อเริ่มงาน branch ร่างที่กล่าวถึงเป็น snapshot ในเครื่อง ไม่ใช่สถานะ GitHub ปัจจุบัน

## 3. กติกากลางที่ให้ทุกทีมใช้

**ลำดับแหล่งอ้างอิงสำหรับ Prototype:** ข้อตกลง [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md) วันที่ 26 ก.ย. 2026 และสเปกนี้ใช้กับพฤติกรรม CERT เฉพาะจุด. SRS PDF หน้า 12, 14 (`FR-20`) ยังระบุว่าออกใบรับรองหลังผู้ซื้อยืนยัน ซึ่งขัดกับข้อตกลงล่าสุด; class/state diagram source ปรับแล้ว แต่ Lead ยังต้องแก้ SRS ฉบับส่งอาจารย์. อย่าให้แต่ละทีมเลือกกติกาคนละแบบ

**Gate จาก ORDER:** ยืนยัน branch/commit ที่จะเป็นฐานรวม, Order contract ที่ทีมใช้จริง, migration ของ `orders`/Payment/Escrow, การสร้างและจ่าย Order จนได้ `WAITING_SELLER_SHIP`, สิทธิ์ Buyer และ `GET /orders/{id}` จากข้อมูลจริงบน PostgreSQL แยกก่อนผูก CERT เข้ากับ Order งาน ORDER ที่ยังไม่ผ่าน QA ให้ระบุเป็น dependency ค้างไว้; ห้ามให้ CERT แก้แทนจนกลบข้อผิดพลาดของ ORDER

**Gate จาก INSPECT ก่อนเขียน CERT-01/02/04 ที่พึ่ง schema/result:** เทียบ [INSPECT-spec.md](INSPECT-spec.md), migration/Model ของ INSPECT-01 และ API ของ INSPECT-03 กับโค้ดที่ merge จริงให้ตรงกัน: 1 Order มีผลสุดท้าย 1 ชุด, FK อ้าง `orders.id`, ใช้ enum 4 ค่าด้านล่าง และการบันทึกผลเข้าเกณฑ์กับ Certificate อยู่ใน PostgreSQL transaction เดียว ถ้า INSPECT ที่ merge แล้วใช้ชื่อ/โครง/ธุรกรรมต่างกัน ให้แก้ INSPECT contract และ implementation ร่วมกันก่อน; อย่าสร้าง adapter ที่แปลง `PASSED` เป็น `PASS` เงียบ ๆ หรือออกใบรับรองใน background เพราะทำให้ invariant ของ Backlog พัง

| ผลตรวจสุดท้าย | ใบรับรอง | ปุ่มผู้ซื้อ | ทางเดินถัดไป |
|---|---|---|---|
| `PASS` | ออกทันที | `CONFIRM` / `REJECT` | รอการตัดสินใจ |
| `MINOR_ISSUE` | ออกทันที พร้อมระบุผลตามจริง | `CONFIRM` / `REJECT` | รอการตัดสินใจ |
| `NOT_AS_DESCRIBED` | ไม่ออก | ไม่มี | ส่งคืนผู้ขาย |
| `FAKE` | ไม่ออก | ไม่มี | ส่งคืนผู้ขาย |

- การบันทึกผลครั้งแรกเกิดจาก Inspector ที่มีสิทธิ์และ Order อยู่สถานะ `INSPECTING` เท่านั้น ผลสุดท้ายหนึ่งชุดต่อ Order ใน Prototype นี้; ห้ามแก้ผลย้อนหลังผ่าน API นี้
- `INSPECT-03` + `CERT-02` เป็น **หนึ่ง atomic commit**: ผลเข้าเกณฑ์ต้องมี Certificate, Order เปลี่ยนเป็น `RESULT_NOTIFIED`, แล้วจึงตอบสำเร็จ หากสร้างใบรับรองหรือ token/URL ไม่สำเร็จ ให้ rollback ผลตรวจและสถานะ Order ทั้งหมด ผลลบ commit ผลตรวจและ `RESULT_NOTIFIED` โดยไม่มี Certificate
- `RESULT_NOTIFIED` หมายถึงมีผลให้ผู้ซื้ออ่านแล้ว ไม่ได้แปลว่าผู้ซื้อยืนยันแล้ว สำหรับผลลบหรือ `REJECT` ให้ส่งต่อ `next_action=RETURN_TO_SELLER`; `CONFIRM` ให้ `next_action=SHIP_TO_BUYER`; ยังไม่เปลี่ยนเป็นสถานะ Shipment จน FINISH-02 ทำงาน
- Certificate `ISSUED` ยังคงเป็นบันทึกว่าตรวจผ่าน แม้ผู้ซื้อ `REJECT`; หน้าเว็บสาธารณะไม่แสดงการตัดสินใจหรือสถานะการขาย หากอนาคตมีการเพิกถอน ต้องแสดง `REVOKED` ชัดเจน; endpoint เพิกถอนเป็นงานนอก Prototype รอบนี้
- ไม่มีการยืนยัน **ผลตรวจ** อัตโนมัติหลัง 72 ชั่วโมง; หากผู้ซื้อไม่ตอบให้แจ้งเจ้าหน้าที่ติดตามและคงเงินพัก. เวลา 72 ชั่วโมงที่มีผลต่อการปล่อยเงินเริ่มหลัง Courier ส่งถึงผู้ซื้อพร้อมรูปและกดยืนยันตาม [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md) เท่านั้น

## 4. สัญญาข้อมูลและฐานข้อมูล

### 4.1 ข้อมูลขั้นต่ำจาก INSPECT-01…03

Inspection ต้องผูก `order_id` กับ `orders.id` โดยตรง และมี `result`, `summary/detail` ที่ผู้ซื้ออ่านได้, `inspected_at`, `inspector_id`, รูปหลักฐานผลตรวจอย่างน้อย 1 รูปที่เข้าถึงได้เฉพาะผู้มีสิทธิ์ พร้อม unique สำหรับผลสุดท้ายของหนึ่ง Order ชื่อ Model/field จริงให้ใช้ตาม PR ของ INSPECT แต่ความหมายข้างต้นต้องตรงกัน ถ้า INSPECT แยกงานกำลังตรวจจาก final result ให้ Certificate/Decision อ้าง ID ของ **final result** ที่ล็อกแล้วและยังคง unique ต่อ Order

Order status ที่เกี่ยวข้อง: `INSPECTING` → `RESULT_NOTIFIED`; `INSPECT-01/03` ต้องเพิ่มค่าที่จำเป็นใน DB check, schema และ Mobile type ร่วมกับสถานะขนส่งที่ใช้จริง ห้ามแก้เพียงชั้นใดชั้นหนึ่งหรือใช้ string ที่ DB ปฏิเสธ

### 4.2 CERT-01: `certificates`

| Field/constraint | กติกา |
|---|---|
| `id`, `order_id`, `inspection_id` | PK และ FK; `order_id`/`inspection_id` unique เพื่อไม่ออกซ้ำ |
| `certificate_no` | เลขอ้างอิงสำหรับคนอ่าน unique; ไม่ใช้เป็นตัวป้องกันการเดา URL |
| `public_token` | unique, สุ่มด้วย CSPRNG อย่างน้อย 128 บิต (แนะนำ `secrets.token_urlsafe(32)`); ไม่ใช้ Order ID หรือเลขใบรับรองเป็น token |
| `result` | snapshot ผลตรวจเพื่อให้ใบเดิมไม่เปลี่ยนตามข้อมูลที่แก้ภายหลัง |
| `status`, `issued_at` | เริ่ม `ISSUED`; schema รองรับ `REVOKED` และเวลา/เหตุผลเพิกถอนสำหรับการแสดงผลในอนาคต แต่ยังไม่มี API เพิกถอนในรอบนี้ |

Certificate ต้องสัมพันธ์กับ Inspection/final result ที่มีผล `PASS`/`MINOR_ISSUE` และ Order เดียวกัน ใช้ composite FK `(inspection_id, order_id)` เมื่อ schema INSPECT รองรับ unique คู่ดังกล่าว; มิฉะนั้นตรวจความสัมพันธ์ใต้ lock ใน service/transaction และมี PostgreSQL integration test ยืนยัน invariant ห้ามอ้างว่า unique แยกสองคอลัมน์พิสูจน์ความสัมพันธ์ข้ามตารางได้ การสร้างพร้อมกันต้องได้หนึ่งแถวจาก unique constraint ไม่อาศัย SELECT ก่อน INSERT อย่างเดียว

### 4.3 CERT-01: `buyer_inspection_decisions`

| Field/constraint | กติกา |
|---|---|
| `id`, `order_id`, `inspection_id`, `buyer_id` | PK/FK; `order_id` unique และ `inspection_id` unique |
| `decision` | `CONFIRM` หรือ `REJECT` เท่านั้น |
| `reason` | `CONFIRM` รับเฉพาะ omitted/null; `REJECT` เลือกกรอกได้ สูงสุด 500 ตัวอักษรหลัง trim และแปลงค่าว่างเป็น null; ไม่เผยแพร่ใน QR |
| `decided_at` | timestamp จาก Server |

ตรวจ `buyer_id == orders.buyer_id`, `order_id` ของ Decision ตรงกับ Inspection และผลเข้าเกณฑ์ก่อนเขียน; ใช้ composite FK เมื่อ schema รองรับ มิฉะนั้นตรวจใต้ lock พร้อม integration test DB FK/unique ช่วยกันซ้ำ แต่สิทธิ์ต้องตรวจที่ Backend เปิด RLS ให้ตารางใหม่ใน public schema และไม่มี policy ที่ให้ anon/authenticated เข้าถึงโดยตรง ตามแนวทางตาราง Order ปัจจุบัน; Backend เป็นทางเข้าที่ตรวจสิทธิ์

## 5. API contract (ชื่อเส้นทางและ JSON ที่ให้ FE/BE ใช้ตรงกัน)

ทุก endpoint ส่วนตัวใช้ Bearer token ตาม Auth ปัจจุบัน; `GET /certificates/{public_token}` เป็น HTML สาธารณะเท่านั้น ตัวอย่างตัด field ของ INSPECT ที่ไม่เกี่ยวข้องออกเพื่อให้ implementation ใช้ชื่อจริงตาม contract INSPECT เมื่อ error มาจาก FastAPI ให้ใช้รูป `{"detail":{"code":"...","message":"..."}}` ตาม Order API ปัจจุบัน (validation แบบรายช่องใช้ `detail.fields`); อย่าให้ FE ต้องเดารูป error หลายแบบ

### 5.1 อ่านผลของผู้ซื้อ

`GET /orders/{order_id}/inspection` — เฉพาะผู้ซื้อเจ้าของ Order; Seller ที่เกี่ยวข้องแต่ไม่มีสิทธิ์อ่านผลผ่าน endpoint นี้ได้ `403`, ผู้ไม่เกี่ยวข้องรวม Admin/Inspector ได้ `404` code `order_not_found`; ตรวจสิทธิ์ Order ก่อนเช็กว่ามีผลหรือไม่ ยังไม่มีผลได้ `404` code `inspection_not_ready` ผู้ซื้อที่บัญชีไม่ ACTIVE ยังอ่าน Order/ผลเดิมของตนได้ตาม Order contract แต่ส่ง Decision ใหม่ไม่ได้ ตั้ง `Cache-Control: no-store`

```json
{
  "order_id": 42,
  "order_status": "RESULT_NOTIFIED",
  "result": "MINOR_ISSUE",
  "summary": "พบรอยใช้งานเล็กน้อย",
  "inspected_at": "2026-09-23T10:00:00Z",
  "evidence": [{"id": 7, "url": "https://api.example.test/inspection-evidence/7", "expires_at": null}],
  "certificate": {
    "certificate_no": "CERT-000042",
    "status": "ISSUED",
    "issued_at": "2026-09-23T10:00:00Z",
    "public_url": "https://cert.example.test/certificates/<opaque-token>"
  },
  "decision": null,
  "can_decide": true,
  "next_action": "WAIT_BUYER_DECISION"
}
```

สำหรับ `NOT_AS_DESCRIBED`/`FAKE`: `certificate=null`, `decision=null`, `can_decide=false`, `next_action=RETURN_TO_SELLER` และยังแสดงผล/หลักฐานให้ผู้ซื้ออ่าน สำหรับผลเข้าเกณฑ์ที่ตัดสินแล้ว: `decision={"decision":"CONFIRM","reason":null,"decided_at":"..."}`, `can_decide=false`, `next_action=SHIP_TO_BUYER` หรือ `RETURN_TO_SELLER` ตามคำตอบ ถ้าพบผลเข้าเกณฑ์แต่ไม่มี Certificate ให้ fail closed ด้วย `409 inspection_not_ready` และบันทึกเหตุขัด invariant ห้ามส่ง `can_decide=true` ค่า `public_url` ต้องเป็น URL HTTPS ที่เปิดได้จากเครื่องอื่นในสภาพแวดล้อม demo; ใช้ `PUBLIC_CERTIFICATE_BASE_URL` ฝั่ง Server เป็น origin ที่ไม่มี userinfo/query/fragment ตรวจรูปแบบตั้งแต่ startup และไม่ประกอบ URL จาก Host header ที่ผู้เรียกควบคุม

`evidence` แต่ละรายการมี `id`, `url`, `expires_at` (`null` ถ้าเป็น endpoint ที่ตรวจสิทธิ์) ต้องเป็น URL อายุสั้นที่ออกหลังตรวจสิทธิ์ หรือ endpoint รูปที่ตรวจสิทธิ์ ห้ามส่ง Storage path/private key หรือ URL ถาวรสาธารณะของหลักฐานการตรวจ ถ้าใช้ signed URL ตาม INSPECT ให้ใช้ TTL ที่ INSPECT อนุมัติและขอ URL ใหม่เมื่อหมดอายุ; CERT response ใช้ชื่อ `expires_at` แม้ model INSPECT ภายในเรียก `url_expires_at`

### 5.2 ตัดสินใจ

`POST /orders/{order_id}/inspection/decision`

```json
{"decision":"REJECT","reason":"สภาพสินค้าไม่ตรงที่คาด"}
```

ตอบ `200` ด้วย JSON รูป `{"decision":{"decision":"REJECT","reason":"สภาพสินค้าไม่ตรงที่คาด","decided_at":"2026-09-23T10:05:00Z"},"next_action":"RETURN_TO_SELLER"}` และ `Cache-Control: no-store` ใช้ row lock/transaction กับ Order หรือ Inspection และ unique constraint: ผู้ซื้อเจ้าของ Order ที่บัญชี ACTIVE, Order `RESULT_NOTIFIED`, ผลเข้าเกณฑ์และ Certificate `ISSUED` เท่านั้นจึงตัดสินใจได้ ส่งคำตอบเดิมและ reason เดิมหลัง trim ซ้ำให้ `200` พร้อม record เดิมโดยไม่เขียนเพิ่ม; เปลี่ยน decision หรือ reason หลังบันทึกแล้วให้ `409` code `decision_already_recorded`; ผลลบให้ `409` code `decision_not_allowed`; ยังไม่มีผล/Certificate ที่ควรมีให้ `409` code `inspection_not_ready`; ไม่มี token ให้ `401`; Seller ที่เกี่ยวข้องได้ `403` code `not_order_buyer`, ผู้ไม่เกี่ยวข้องรวม Admin/Inspector ได้ `404` code `order_not_found`; บัญชีผู้ซื้อไม่ ACTIVE ได้ `403` code `account_inactive`; JSON ผิดให้ `422` ใช้ `validation_error` และ `detail.fields` เมื่อระบุช่องที่ผิดได้

ห้าม endpoint นี้สร้าง shipment, release escrow หรือ refund เอง FINISH-02 คำนวณ `next_action` ฝั่ง Server จาก final result + Decision ที่บันทึกแล้วภายใต้สิทธิ์และ transaction ของตน ไม่เชื่อ `next_action` ที่ Mobile ส่ง และทำรายการต่อแบบ idempotent ค่าตัดสินใจที่บันทึกแล้วไม่เปลี่ยนตามการส่งต่อของ FINISH

### 5.3 เว็บใบรับรองสาธารณะและ QR

`GET /certificates/{public_token}` ส่ง `text/html` (`200`) ไม่มี Auth, query ด้วย token เท่านั้น; token ไม่พบส่งหน้า `404` ทั่วไปโดยไม่เผย Order ID ผู้ชมเห็นเลขใบรับรอง, สถานะ, ผล `PASS`/`MINOR_ISSUE`, วันเวลาออก และรูปสินค้าที่ตรวจว่าเผยแพร่ใน catalog ได้อยู่แล้วถ้ามี รูปไม่มีได้ หน้า `REVOKED` ต้องบอกว่าใช้ยืนยันไม่ได้หากมีสถานะนี้ในอนาคต

ห้ามแสดงชื่อ/ID/อีเมล/เบอร์/ที่อยู่ของ Buyer, Seller หรือ Inspector, ชื่อสินค้าที่ผู้ใช้กรอกเอง, ราคา/เงิน, เหตุผลที่ผู้ซื้อปฏิเสธ, บันทึก Inspector แบบดิบ, รูปหลักฐานส่วนตัว หรือ signed URL ของ Storage หน้า HTML ต้อง escape ค่า text, ไม่ฝัง third-party script, ไม่ส่ง token ไป analytics; ตั้ง `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` เพื่อเลี่ยง cache/การเผยแพร่ URL โดยไม่จำเป็น

QR encode **absolute `public_url` นี้เท่านั้น** ไม่ encode JSON ที่มีข้อมูลส่วนตัว ไม่ encode mobile deep link; FE2 แสดง QR และปุ่ม “เปิดในเบราว์เซอร์” จาก URL เดียวกัน ไม่มีแอปก็เปิดหน้าสาธารณะได้

## 6. หน้าจอและการเชื่อมระบบ

- **FE1 / CERT-03:** ทำ template HTML/CSS ที่ Backend serve ผ่านเส้นทางข้อ 5.3 ร่วมกับ BE; แสดงสถานะอ่านง่ายบนหน้าจอมือถือและกรณีใบรับรองไม่พบ/ถูกเพิกถอน ไม่วางปุ่มตัดสินใจบนหน้าเว็บสาธารณะ
- **FE2 / CERT-05:** จาก Order detail ของ Buyer เปิดหน้าผลตรวจ เรียก API จริง แสดง loading/error/refresh, ผลทั้งสี่, summary และหลักฐานที่มีสิทธิ์; แสดง QR เฉพาะกรณีมี Certificate; แสดงปุ่มตัดสินใจเฉพาะ `can_decide=true`; ส่งแล้ว lock ปุ่มและ Refresh; กรณี timeout ให้ GET อ่านผลก่อนส่งซ้ำ; logout/เปลี่ยนบัญชีต้องล้างข้อมูลเดิม
- **BE / CERT-02/04:** รับผิดชอบธุรกรรมบันทึกผลพร้อม Certificate, API ส่วนตัว, route HTML และการส่งค่า `next_action` ให้ FINISH; ไม่เชื่อค่า buyer/order/result จาก Mobile ที่ใช้ข้ามสิทธิ์
- **DB1 / CERT-01:** Model/Migration/constraints/RLS ของสองตาราง; DB2 ตรวจ migration และช่วย seed เคส; ผู้ดูแลฐานข้อมูลกลางเพียงคนเดียวเป็นผู้ apply หลังรีวิว

**จุดเชื่อมที่ต้องแก้/ทบทวนใน checkout นี้:** `backend/app/models/order.py` และ migration เดิมมี CHECK สถานะเพียงสองค่า; `backend/app/schemas/order.py` กับ `backend/app/api/orders.py` สร้าง `OrderStatus(order.status)` ตอนอ่าน Order จึงต้องรู้สถานะใหม่ก่อนเปิด INSPECT/CERT route; `mobile/src/services/order-service.ts` ตรวจ enum ขาเข้า และ `mobile/src/orders/order-format.ts`/`mobile/src/components/order-ui.tsx` มี mapping แบบครบทุกสถานะ ต้องขยายพร้อมกันเพื่อไม่ให้ Order detail พังเมื่อ Refresh `backend/app/main.py` ยังไม่ลงทะเบียน route INSPECT/CERT และ `doc/orders/contract.md` ต้องบันทึกสิทธิ์/สถานะใหม่เมื่อ contract เห็นตรงกัน

## 7. ลำดับงานและเกณฑ์รับราย Issue

| ลำดับ | Issue / เจ้าของ | ต้องมีจากงานต้นทางก่อน integration | งานส่งมอบและเกณฑ์ตรวจ |
|---|---|---|---|
| 0 | Lead + ORDER/INSPECT owners | ตรวจสถานะ ORDER และ INSPECT จริง; ปิด contract ที่ขัดกันใน INSPECT-00/#54 | กำหนด base branch/commit, contract, เจ้าของ migration และรายการ dependency ที่ยังค้าง; ให้ FE/BE/DB/QA ทบทวนก่อนเปิด CERT integration |
| 1 | CERT-01 / DB1 | Order schema ที่ใช้จริง + INSPECT-01 schema/final-result FK ที่ merge หรืออยู่ใน base ร่วม | Model + migration Certificate/Decision, unique/FK/check/RLS; DB2 ตรวจ upgrade/downgrade และข้อมูลเดิมบน PostgreSQL แยก ถ้า schema ต้นทางยังไม่มีให้ทำเพียง design/patch draft; ห้ามนับว่าผ่านหรือ apply ฐานกลาง |
| 2 | CERT-02 / BE ร่วม INSPECT-03 | CERT-01 migration พร้อม + Order จ่ายสำเร็จจริง + INSPECT-03 transaction ที่แก้ร่วมกันได้ | บันทึกผลเข้าเกณฑ์และออกใบรับรองใน commit เดียว; ผลลบไม่มีใบรับรอง; retry/concurrent ไม่ซ้ำ; ตอบ error เมื่อออกไม่ได้ |
| 3 | CERT-03 / FE1 + BE | CERT-02 route/data สำหรับทดสอบจริง; HTML layout เตรียมล่วงหน้าได้ | HTML public ผ่าน QR เปิดได้บนเบราว์เซอร์โทรศัพท์ที่ไม่มีแอปและไม่เผยข้อมูลส่วนตัว |
| 4 | CERT-04 / BE | Order ownership/Auth + final result และ Certificate จาก CERT-02 | GET ผลตามสิทธิ์, POST ตัดสินใจครั้งเดียว, `next_action` สำหรับ FINISH; ครอบคลุม retry/race/error |
| 5 | CERT-05 / FE2 | ORDER-05/detail navigation ที่ใช้จริง + CERT-04 API | หน้า Buyer อ่านข้อมูลจริง, QR, ตัดสินใจ และ Refresh ตามสิทธิ์/สถานะ |
| 6 | CERT-06 / QA2, QA1 + DB2 | ORDER/INSPECT flow ที่ทดสอบด้วยข้อมูลจริง + CERT-01…05 | ทดสอบ API/DB, ผลทั้งสี่, มือถือและเครื่องไม่มีแอป, หลักฐานไม่รั่ว, บันทึกผลจริง/bug |

ระหว่าง ORDER/INSPECT ยังไม่เสร็จ งานที่เริ่มได้คือ review contract, schema/API design, public HTML layout, FE mock ตาม JSON ข้อ 5 และ QA test plan; ให้รายงานว่าเป็น **preparation** ไม่ปิด CERT Issue จาก mock การปิด Feature ต้องเชื่อม ORDER/INSPECT/Backend/DB จริง CERT-01 ที่มี FK ไป Inspection ต้องรอ INSPECT-01 schema จริง; ห้ามสร้าง migration ที่อ้างตารางสมมติ CERT-02 กับ INSPECT-03 ควร review และ merge เป็นชุดที่ไม่เปิดช่วงเวลาซึ่ง `PASS` ถูกบันทึกสำเร็จโดยไม่มี Certificate หากแยก PR ให้คง endpoint บันทึกผลที่เข้าเกณฑ์ปิดไว้จนทั้งคู่พร้อม

**ลำดับ dependency:** ORDER contract + schema/จ่ายจริง/อ่าน Order ได้ → INSPECT-00 contract ที่ resolve แล้ว + INSPECT-01 schema/สถานะ Order → CERT-01 → INSPECT-03/CERT-02 atomic gate → CERT-04 API → CERT-05 integration → CERT-06; INSPECT-02 flow ส่ง/รับต้องพร้อมก่อน QA end-to-end CERT-03 template/QR layout เตรียมคู่ขนานได้ แต่ทดสอบ public URL จริงหลัง CERT-02 และ route BE พร้อม

## 8. ชุดทดสอบขั้นต่ำและเกณฑ์ปิด Feature

- [ ] บันทึก base commit/contract และผลตรวจ ORDER + INSPECT dependency: paid Order, ownership/detail, migration และการบันทึกผลผ่าน flow จริง; งาน upstream ที่ค้างยังไม่ถูกนับว่าเสร็จเพราะมี branch หรือ mock
- [ ] PostgreSQL แยก: migration upgrade/downgrade, FK/unique/check/RLS; การบันทึก `PASS`/`MINOR_ISSUE` อย่างละหนึ่งครั้งได้ Certificate หนึ่งใบ; ผลลบทั้งสองแบบได้ศูนย์ใบ
- [ ] จำลอง Certificate insert ล้มเหลวแล้ว Inspection/Order ไม่เปลี่ยน; ส่งบันทึกผลซ้ำและพร้อมกันแล้วไม่มีสองใบหรือผลต่างกันค้าง
- [ ] Buyer A อ่าน/ตัดสินใจ Order ตนได้; Buyer B, Seller, Admin และ anonymous ข้ามสิทธิ์ไม่ได้; ผลลบไม่มีปุ่มและ API ปฏิเสธ `CONFIRM`
- [ ] `CONFIRM`/`REJECT` แต่ละแบบสร้าง decision หนึ่งแถว; request เดิมซ้ำคืนผลเดิม; request ตรงข้ามหรือพร้อมกันไม่กลับผล; `next_action` ถูกต้องและยังไม่มีเงินจริง/Shipment จาก CERT
- [ ] หน้าเว็บเปิดจาก QR บนโทรศัพท์อีกเครื่องที่ไม่มีแอป/ไม่ Login ได้จาก URL HTTPS จริง; token เดาไม่ได้; token ผิดได้ 404; ตรวจ HTML และ network ว่าไม่มีข้อมูลส่วนตัว/หลักฐาน private
- [ ] FE2 เชื่อม API/DB จริง ครบ loading, refresh, session หมดอายุ, timeout หลัง POST, เปลี่ยนบัญชี และผลทั้งสี่; QA บันทึกคาดหวัง/ผลจริง แยกหลักฐาน automated, DB, web และโทรศัพท์

**Feature เสร็จเมื่อ** INSPECT-03 + CERT-02 ผ่าน atomic gate, CERT-01…06 ผ่านบนระบบที่ทีมใช้ร่วมกัน, QR เปิดได้จากเครื่องที่ไม่มีแอป, ผู้ซื้อจริงตัดสินใจได้ครั้งเดียว และ Lead ตรวจเส้นทางต่อไป FINISH-02 จาก `next_action` โดยไม่อ้าง mock เป็นหลักฐาน

## 9. ข้อความส่งให้ AI implementation session

> Implement Feature CERT ตาม `/home/tmk/project/market-place-mobile-app/docs/project-plan/CERT-spec.md`, `INSPECT-spec.md`, `FULFILLMENT-00-delivery-proof-and-deadlines.md` และ `GitHub_Prototype_Backlog.md` (CERT-01…06) ใน repo `/home/tmk/project/market-place-mobile-app/secondhand-marketplace-android-app`. Lead แจ้ง 26 ก.ย. ว่า ORDER และ INSPECT ยังไม่เสร็จ: เริ่มด้วยตรวจ branch/working tree, AGENTS.md, ORDER/INSPECT Issue-PR/contract/Model/Migration/QA ที่ merge จริง แล้วรายงาน dependency ที่พร้อมกับที่ค้าง อย่าถือว่าการมี Order code หรือ INSPECT branch แปลว่า Feature เสร็จ ร่าง INSPECT ใน `origin/chore/inspect-02-preparation` ขัดกับสเปก INSPECT-00 v1 เรื่อง enum/Order FK/async จึงห้ามใช้เป็น source of truth ระหว่าง dependency ค้าง ให้ทำเฉพาะงาน CERT preparation ที่ไม่ต้องอ้าง schema/API จริง; อย่าสร้าง migration ที่อ้าง Inspection สมมติหรืออ้างว่า mock ปิด Issue ได้ เมื่อ Order/INSPECT base พร้อมจึงทำ CERT-01 แล้วเชื่อม `INSPECT-03 + CERT-02` เป็น atomic gate ก่อนเปิดผลตรวจที่เข้าเกณฑ์ รักษาสิทธิ์/API/ผลทั้งสี่/QR สาธารณะ/decision-once ตามสเปก ห้าม reset ฐานข้อมูลกลาง แยกหลักฐาน automated, PostgreSQL, web และโทรศัพท์ แล้วรายงานไฟล์ที่แก้, ผลทดสอบ, dependency ที่ยังค้าง และข้อขัดแย้งกับสเปก
