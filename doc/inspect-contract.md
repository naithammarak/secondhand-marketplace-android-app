# Inspect — ข้อตกลงสถานะ สิทธิ์ ผลตรวจ และ API

ผู้รับผิดชอบ: Lead | ผู้ช่วย: BE, DB1, FE1, FE2, QA1

เวอร์ชัน: 0.1 | วันที่: 2026-09-18

สถานะ: ร่างข้อเสนอพร้อมใช้ทบทวนร่วมกัน ยังไม่ใช่ข้อตกลงที่ทีมอนุมัติ

## 1. ขอบเขตและหลักฐานจากโปรเจกต์

ครอบคลุมตั้งแต่พร้อมส่งเข้าศูนย์ตรวจ จนบันทึกผลและส่งงานต่อ CERT-02 หรือทางคืนสินค้า ไม่รวมการคืนเงินจริงหรือการจัดส่งออกจากศูนย์

- `backend/app/models/user.py` มี SELLER, INSPECTOR, ADMIN, BUYER และสถานะ ACTIVE, SUSPENDED, CLOSED; ID ผู้ใช้ในระบบเป็น integer
- `backend/app/models/product.py` มีเจ้าของสินค้า `user_id`; ให้คำสั่งซื้อเก็บ seller/product snapshot เพื่อไม่ให้การแก้ประกาศเปลี่ยนผู้มีสิทธิ์หรือเกณฑ์ตรวจย้อนหลัง
- `backend/app/models/verification.py` เป็นการยืนยันตัวตน/บัญชีธนาคาร ไม่ใช่ผลตรวจสินค้า ห้ามนำตารางนี้มาใช้แทน inspections
- `backend/app/main.py` ยังไม่มี Inspect API; endpoint และโครงสร้างด้านล่างเป็นสิ่งที่เสนอให้สร้าง
- ไม่พบข้อตกลงคำสั่งซื้อ การจ่ายจำลอง ชื่อผลตรวจเดิมทั้ง 4 ประเภท หรือ CERT-02 ในไฟล์ที่ตรวจ จึงไม่อ้างว่าชื่อ/นโยบายด้านล่างเป็นข้อสรุปเดิม

### จุดที่ต้องยืนยันก่อนปิด issue

| ข้อตกลง | ข้อเสนอในร่างนี้ | ผู้ยืนยัน |
|---|---|---|
| หน่วยการตรวจ | 1 inspection ต่อ 1 order item; unique order_item_id | Lead, BE, DB1 |
| เงื่อนไขเริ่มงาน | รายการซื้อยืนยันแล้ว จ่ายจำลองสำเร็จ ไม่ยกเลิก/คืนเงิน | ผู้ดูแล Order/Payment, Lead |
| ชื่อสถานะ upstream และการยกเลิก | map เป็น eligibility ภายใน; หลังสร้างงานห้ามยกเลิก/เปลี่ยน eligibility ผ่าน flow ทั่วไป | ผู้ดูแล Order/Payment, BE |
| ผลตรวจ 4 ประเภท | ใช้ตารางข้อ 4; ผ่านเท่านั้นออกใบรับรอง อีก 3 ผลคืนสินค้า | Lead, QA1 |
| ตรวจไม่ได้ | จบเป็น INCONCLUSIVE และเข้าทางคืนสินค้า ไม่มีตรวจซ้ำใน MVP | Lead |
| รูปหลักฐาน | JPEG/PNG/WebP, ไม่เกิน 5 MiB ต่อรูป, 3–10 รูปต่อผล | Lead, FE, BE |
| CERT-02 | asynchronous, unique inspection_id, retry ได้โดยไม่ออกซ้ำ | ผู้ดูแล CERT-02, BE, DB1 |
| คืนสินค้า | สร้างคำขอคืนด้วยผลตรวจ ไม่ถือว่าได้คืนของหรือคืนเงินแล้ว | ผู้ดูแล Return/Order, Lead |

ชื่อสถานะ Order/Payment จริงและช่องทาง event ต้องแนบภายหลัง ก่อนเริ่มเชื่อมระบบจริง ใช้ mock ตามร่างนี้ทำ FE/QA ได้

## 2. ตารางสถานะกลาง

`status` คือความคืบหน้าการตรวจ แยกจาก `result`, `certificate_status` และ `return_status` ห้ามใช้ผลตรวจเป็นสถานะการขนส่ง

| สถานะปัจจุบัน | คำสั่ง / ผู้ทำ | สถานะใหม่ | เงื่อนไขและข้อมูลบังคับ |
|---|---|---|---|
| ยังไม่มีงาน | ระบบรับ order item ที่ eligible | READY_TO_SHIP | upstream ยืนยัน eligibility; บันทึก order_item_id, product snapshot, seller_id |
| READY_TO_SHIP | Seller แจ้งส่ง | SHIPPED_TO_INSPECTION | เจ้าของรายการ; carrier, tracking_number |
| SHIPPED_TO_INSPECTION | Admin ยืนยันรับของ | RECEIVED | ได้รับสินค้าจริง; received_note เป็น optional |
| RECEIVED | Inspector รับงาน | INSPECTING | ยังไม่ถูกมอบหมาย; assignee เป็นผู้เรียก API |
| INSPECTING | Inspector บันทึกผล | COMPLETED | ผู้รับงานคนปัจจุบัน; result, summary, รูปหลักฐานครบ |
| INSPECTING | Admin โอนงาน | INSPECTING | target เป็น ACTIVE INSPECTOR; reason บังคับ; เก็บ audit |
| COMPLETED | ไม่มีคำสั่งแก้ผลใน MVP | — | อ่านได้; ผลและรูปที่แนบล็อกถาวร |

- ระบบสร้าง READY_TO_SHIP เพียงครั้งเดียว แม้ event ซ้ำ; หากยังไม่จ่ายสำเร็จจะยังไม่มีงานตรวจ ไม่ใช้สถานะพร้อมส่งแทนรอจ่าย
- ทุกการเปลี่ยนใช้ server time แบบ UTC ISO 8601 และเพิ่ม `version` ทีละ 1
- ห้ามข้ามขั้น ย้อนสถานะ หรือ PATCH status โดยตรง; Admin ไม่สามารถข้ามเงื่อนไข
- การโอนงานเก็บรูปที่อัปโหลดไว้ในงานเดิมให้ผู้รับใหม่อ่าน/ใช้ได้ ผู้รับเก่าหมดสิทธิ์ทันทีและบันทึกผลต่อไม่ได้
- การยกเลิกก่อนสร้างงานเป็นหน้าที่ Order; กรณีสูญหาย/ยกเลิกหลังเริ่มงานอยู่นอก MVP และต้องให้ Lead กำหนด flow เพิ่ม ห้ามสร้างสถานะปลายทางเอง

## 3. ตารางสิทธิ์และขอบเขตรายการ

สิทธิ์มาจากผู้ใช้ที่ผ่าน token verification และ role/status ใน DB ห้ามรับ role, seller_id หรือ inspector_id เพื่อกำหนดสิทธิ์จาก client

| การกระทำ | Seller | Inspector | Admin |
|---|---|---|---|
| รายการ/รายละเอียด | เฉพาะ seller_id ของตน | RECEIVED ที่ยังว่าง และงานที่ตนรับอยู่/ตรวจเสร็จ | ทุกงาน |
| แจ้งส่ง | ของตนที่ READY_TO_SHIP | ไม่ได้ | ไม่ได้ |
| ยืนยันรับของ | ไม่ได้ | ไม่ได้ | SHIPPED_TO_INSPECTION |
| รับงาน | ไม่ได้ | RECEIVED ที่ยังว่าง | ไม่ได้ |
| อัปโหลดรูป | ไม่ได้ | งานตนที่ INSPECTING | ไม่ได้ |
| บันทึกผล | ไม่ได้ | งานตนที่ INSPECTING | ไม่ได้ |
| โอนผู้ตรวจ | ไม่ได้ | ไม่ได้ | INSPECTING พร้อมเหตุผล |
| ดูผล/รูปที่ส่งแล้ว | งานตนเมื่อ COMPLETED | งานที่ตนรับผิดชอบ | ทุกงาน |
| ดูรูปที่ยังไม่ส่งผล | ไม่ได้ | งานตน | ทุกงานเพื่อกำกับดูแล |
| สั่ง retry ใบรับรอง | ไม่ได้ | ไม่ได้ | PASSED และ certificate_status=FAILED |
| แก้/ลบผลหลังส่ง | ไม่ได้ | ไม่ได้ | ไม่ได้ใน MVP |

- BUYER และ role=null ไม่มีสิทธิ์ Inspect API; สิทธิ์ผู้ซื้อดูใบรับรองให้กำหนดใน CERT-02
- SUSPENDED/CLOSED ถูกปฏิเสธทุก endpoint แม้เคยเป็นเจ้าของงาน
- งานนอกขอบเขตหรือไม่มีจริงตอบ 404 เหมือนกัน; มองเห็นงานแต่ทำ action ไม่ได้ตอบ 403
- Inspector เห็นในคิวเฉพาะข้อมูลสินค้าและการตรวจ ไม่เผยข้อมูลบัญชีธนาคาร/บัตรประชาชน หรือข้อมูลผู้ซื้อที่ไม่จำเป็น
- รูปเก็บ private storage; GET รายละเอียดให้ signed URL อายุ 5 นาที เฉพาะรูปที่ผู้เรียกมีสิทธิ์ ห้าม public bucket

## 4. ผลตรวจ 4 ประเภท (ชื่อที่เสนอ รอ Lead ยืนยัน)

| API enum | ชื่อแสดง | ความหมาย | ใบรับรอง | ทางต่อ |
|---|---|---|---|---|
| PASSED | ผ่านการตรวจ | ยืนยันของแท้และตรงรายละเอียด/สภาพตาม snapshot คำสั่งซื้อ | ออกผ่าน CERT-02 | รอใบรับรองพร้อม จึงส่งต่อขั้นส่งให้ผู้ซื้อ |
| NOT_AUTHENTIC | ไม่ผ่าน: ไม่ใช่ของแท้ | มีหลักฐานเพียงพอสรุปว่าไม่ใช่ของแท้ | ไม่ออก | RETURN_REQUESTED |
| NOT_AS_DESCRIBED | ไม่ผ่าน: ไม่ตรงรายละเอียด | ตรวจแล้วพบรุ่น ขนาด อุปกรณ์ หรือสภาพต่างจาก snapshot | ไม่ออก | RETURN_REQUESTED |
| INCONCLUSIVE | ไม่สามารถสรุปผลตรวจ | ข้อมูล/สภาพไม่เพียงพอยืนยันผล ไม่ถือว่าเป็นของปลอม | ไม่ออก | RETURN_REQUESTED |

หากพบหลายปัญหา ใช้ NOT_AUTHENTIC ก่อน; หากสรุปความแท้ไม่ได้แต่พบความไม่ตรงรายละเอียดแน่นอนให้ใช้ NOT_AS_DESCRIBED; หากไม่มีข้อสรุปที่ยืนยันได้ใช้ INCONCLUSIVE บันทึกข้อพบทั้งหมดใน summary ไม่ใช้ INCONCLUSIVE แทนฟอร์มที่กรอกไม่ครบ

## 5. ช่องข้อมูลและหลักฐาน

| ฟิลด์ | กติกา |
|---|---|
| expected_version | integer >= 1 บังคับทุกคำสั่งจากผู้ใช้ที่เปลี่ยนข้อมูล |
| carrier / tracking_number | string trim แล้ว 1–100 ตัวอักษรต่อช่อง บังคับตอนแจ้งส่ง |
| received_note | optional, null หรือ string ไม่เกิน 1,000 ตัวอักษร |
| result | 1 ใน 4 enum เท่านั้น บังคับตอนส่งผล |
| summary | บังคับทุกผล trim แล้ว 10–2,000 Unicode code points; อธิบายสิ่งที่ตรวจและข้อค้นพบ |
| reason_code | PASSED ต้องเป็น null; อีก 3 ผลบังคับตามชุดค่าด้านล่าง |
| evidence_ids | บังคับ 3–10 ID ไม่ซ้ำ เป็นรูปของงานนี้ที่อัปโหลดสำเร็จแล้ว |
| evidence.category | OVERVIEW, IDENTIFIER, FINDING; ผลหนึ่งต้องมีอย่างน้อยประเภทละ 1 รูป |
| evidence.caption | trim แล้ว 1–300 ตัวอักษร บังคับทุกรูป; กรณีไม่พบตำหนิใช้ FINDING แสดงจุดที่ตรวจแล้วผ่าน |
| reason สำหรับโอนงาน | trim แล้ว 10–1,000 ตัวอักษร |

reason_code: NOT_AUTHENTIC ใช้ AUTHENTICITY_MISMATCH; NOT_AS_DESCRIBED ใช้ MODEL_MISMATCH, SIZE_MISMATCH, CONDITION_MISMATCH, MISSING_ACCESSORY; INCONCLUSIVE ใช้ IDENTIFIER_UNREADABLE, INSUFFICIENT_REFERENCE, ITEM_UNINSPECTABLE เลือกเหตุหลักหนึ่งค่าและอธิบายข้ออื่นใน summary

ไฟล์อนุญาตเฉพาะ JPEG (`image/jpeg`), PNG (`image/png`), WebP (`image/webp`) แบบภาพนิ่ง ขนาดมากกว่า 0 และไม่เกิน 5,242,880 bytes ต่อรูป สูงสุด 10 รูปที่อัปโหลดสำเร็จต่อ inspection รวมไม่เกิน 50 MiB; backend ตรวจ signature และ decode จริง ไม่เชื่อนามสกุล/MIME จาก client ปฏิเสธ SVG, GIF, HEIC, PDF และภาพเคลื่อนไหว

อัปโหลดทีละรูปผ่าน backend; รูปเสียตอบ 422, ชนิดผิด 415, ใหญ่เกิน 413, เกินจำนวน 409; FE แปลงรูปจากมือถือเป็นชนิดที่รองรับก่อนส่ง ภาพที่อัปโหลดแต่ไม่ได้เลือกแนบไม่เป็นหลักฐานผล และไม่แสดงแก่ Seller ไม่มี API ลบรูปใน MVP จึงให้ FE ยืนยันรูปก่อนอัปโหลด

## 6. สัญญา API ที่เสนอ

Base path `/inspections`; ทุก endpoint ใช้ Bearer token. ID ของ inspection/order item/evidence/user เป็น integer บวก; integration event_id และ Idempotency-Key เป็น UUID. Client ห้ามส่ง created_at, recorded_by, status หรือ certificate_status; ฟิลด์ที่ไม่อยู่ใน schema ตอบ 422

ทุก POST ต้องมี `Idempotency-Key`; JSON POST ต้องมี expected_version; upload ใช้ multipart field expected_version. GET ไม่ต้องส่งทั้งสองค่า

### รูปแบบ Response

- `Inspection`: id, order_item_id, product_id, seller_id, assigned_inspector_id (nullable), status, version, shipment (nullable; carrier/tracking_number), received_at (nullable), result_record (nullable), certificate {status,id,last_error_code}, return {status,id}, created_at, updated_at
- `result_record`: result, summary, reason_code, evidence (array ของ Evidence), recorded_by, recorded_at; server สร้างผู้บันทึก/เวลาเอง
- `Evidence`: id, category, caption, mime_type, size_bytes, url, url_expires_at; รายละเอียดงานเพิ่ม uploaded_evidence เฉพาะผู้มีสิทธิ์ดูรูปที่ยังไม่ส่งผล
- certificate.status: NOT_APPLICABLE, PENDING, ISSUED, FAILED; id=null จน ISSUED และ last_error_code=null เมื่อไม่มีข้อผิดพลาด
- return.status: NOT_APPLICABLE, REQUESTED, CREATED, FAILED; id=null จน Return ยืนยันสร้างเคส ค่า FAILED แสดงว่าส่งต่อไม่สำเร็จ ไม่เปลี่ยนผลตรวจ
- projection ตามสิทธิ์ต้องระบุใน OpenAPI ตอน implement; response ห้ามมีข้อมูลส่วนตัวอื่นนอกฟิลด์ในสัญญานี้

### รายการ endpoint

| Method / path | Request | สำเร็จ | ข้อผิดพลาดเฉพาะ |
|---|---|---|---|
| GET /inspections | query status optional; limit=20 (1–100); cursor optional | 200 {items: Inspection[], next_cursor: string หรือ null}; เรียง created_at,id; กรองสิทธิ์ก่อนแบ่งหน้า | 422 filter/cursor ไม่ถูกต้อง |
| GET /inspections/{id} | ไม่มี body | 200 Inspection; เพิ่ม uploaded_evidence ตามสิทธิ์ | 404 งานไม่พบ/นอกขอบเขต |
| POST /inspections/{id}/shipment | {expected_version, carrier, tracking_number} | 200 Inspection ที่ SHIPPED_TO_INSPECTION | 409 INVALID_STATE, ORDER_NOT_ELIGIBLE |
| POST /inspections/{id}/receive | {expected_version, received_note?} | 200 Inspection ที่ RECEIVED | 409 INVALID_STATE |
| POST /inspections/{id}/claim | {expected_version} | 200 Inspection ที่ INSPECTING พร้อม assignee | 409 ALREADY_ASSIGNED, INVALID_STATE |
| POST /inspections/{id}/reassign | {expected_version, inspector_id, reason} | 200 Inspection พร้อม assignee ใหม่ | 422 INVALID_INSPECTOR; 409 INVALID_STATE, SAME_ASSIGNEE |
| POST /inspections/{id}/evidence | multipart: expected_version, file, category, caption | 201 {evidence: Evidence, inspection_version: integer} | 413 FILE_TOO_LARGE; 415 UNSUPPORTED_MEDIA_TYPE; 422 INVALID_IMAGE; 409 EVIDENCE_LIMIT, INVALID_STATE |
| POST /inspections/{id}/result | {expected_version, result, summary, reason_code, evidence_ids} | 200 Inspection ที่ COMPLETED; ใบรับรอง PENDING หรือคืนสินค้า REQUESTED | 422 VALIDATION_ERROR, INVALID_EVIDENCE; 409 INVALID_STATE, RESULT_LOCKED |
| POST /inspections/{id}/certificate/retry | {expected_version} | 202 Inspection ที่ certificate.status=PENDING | 409 CERTIFICATE_NOT_RETRYABLE |

ข้อผิดพลาดร่วมทุก endpoint: 401 UNAUTHENTICATED, 403 ACCOUNT_INACTIVE/FORBIDDEN, 404 NOT_FOUND สำหรับรายการนอกขอบเขต, 422 VALIDATION_ERROR, 503 SERVICE_UNAVAILABLE. ทุก POST เพิ่ม 400 IDEMPOTENCY_KEY_REQUIRED/INVALID_IDEMPOTENCY_KEY, 409 VERSION_CONFLICT/IDEMPOTENCY_KEY_REUSED/REQUEST_IN_PROGRESS. ถ้า dependency DB/storage ใช้งานไม่ได้ก่อน commit ตอบ 503 และไม่รายงานว่าสำเร็จ

ลำดับตรวจ: authentication/account → schema พื้นฐาน → ขอบเขต/สิทธิ์ action → idempotency replay → version → state → validation ทางธุรกิจ → commit. หาก version เก่าและสถานะผิดพร้อมกันตอบ VERSION_CONFLICT ก่อน; claim ที่ใช้ version ปัจจุบันแต่มี assignee แล้วตอบ ALREADY_ASSIGNED; result ที่ COMPLETED และ version ปัจจุบันตอบ RESULT_LOCKED

Error envelope กลาง (message ใช้แสดงผล, FE/QA ตัดสินจาก code):

```json
{"error":{"code":"VALIDATION_ERROR","message":"ข้อมูลผลตรวจไม่ครบ","fields":[{"field":"summary","code":"REQUIRED"}],"request_id":"req-demo-001"}}
```

VERSION_CONFLICT/INVALID_STATE เพิ่ม current_version และ current_status ใน error เฉพาะผู้มีสิทธิ์เห็นงาน; ไม่ส่ง stack trace หรือรายละเอียด storage ภายใน

## 7. ตัวอย่างที่ FE/BE/QA ใช้ร่วมกัน

ข้อมูลสมมติ: inspection=501, order_item=1001, product=101, seller=12, inspector=24, version=8. รูป 801/802/803 อัปโหลดสำเร็จครบ 3 ประเภทแล้ว

### สำเร็จ: ผู้ตรวจที่ได้รับมอบหมายส่งผลผ่าน

`POST /inspections/501/result` พร้อม Bearer ของ Inspector 24 และ Idempotency-Key ที่สร้างใหม่

```json
{"expected_version":8,"result":"PASSED","summary":"ตรวจจุดระบุตัวสินค้าและสภาพแล้ว ตรงกับรายละเอียดคำสั่งซื้อ","reason_code":null,"evidence_ids":[801,802,803]}
```

200 (ตัวอย่างย่อของ Inspection; API จริงส่งครบ schema):

```json
{"id":501,"order_item_id":1001,"status":"COMPLETED","version":9,"assigned_inspector_id":24,"result_record":{"result":"PASSED","summary":"ตรวจจุดระบุตัวสินค้าและสภาพแล้ว ตรงกับรายละเอียดคำสั่งซื้อ","reason_code":null,"recorded_by":24,"recorded_at":"2026-09-18T08:00:00Z","evidence":[{"id":801,"category":"OVERVIEW"},{"id":802,"category":"IDENTIFIER"},{"id":803,"category":"FINDING"}]},"certificate":{"status":"PENDING","id":null,"last_error_code":null},"return":{"status":"NOT_APPLICABLE","id":null}}
```

การตอบ 200 หมายถึงบันทึกผลสำเร็จ ไม่ได้หมายถึงใบรับรองออกแล้ว

### ข้อมูลไม่ครบ

```json
{"expected_version":8,"result":"NOT_AS_DESCRIBED","summary":"","reason_code":null,"evidence_ids":[]}
```

422 ไม่เปลี่ยนสถานะ/version และไม่สร้าง event:

```json
{"error":{"code":"VALIDATION_ERROR","message":"ข้อมูลผลตรวจไม่ครบ","fields":[{"field":"summary","code":"TOO_SHORT"},{"field":"reason_code","code":"REQUIRED"},{"field":"evidence_ids","code":"MIN_ITEMS"}],"request_id":"req-demo-002"}}
```

### ไม่มีสิทธิ์

Seller 12 ส่ง request สำเร็จข้างต้นเพื่อบันทึกผลของงานตน → 403:

```json
{"error":{"code":"FORBIDDEN","message":"บทบาทนี้ไม่สามารถบันทึกผลตรวจได้","fields":[],"request_id":"req-demo-003"}}
```

Seller คนอื่น GET /inspections/501 → 404 NOT_FOUND; Inspector ที่ไม่ได้รับงานและงานไม่อยู่ในคิวว่าง → 404 เช่นเดียวกัน

### ผิดสถานะ

Inspector 24 ส่งผลใหม่ด้วย key ใหม่และ expected_version=9 หลังงาน COMPLETED → 409:

```json
{"error":{"code":"RESULT_LOCKED","message":"บันทึกผลแล้ว ไม่สามารถแก้ไขได้","fields":[],"current_version":9,"current_status":"COMPLETED","request_id":"req-demo-004"}}
```

Admin ยืนยันรับของที่ READY_TO_SHIP ด้วย version ปัจจุบัน → 409 INVALID_STATE. คำสั่งใดใช้ expected_version=8 ขณะที่ข้อมูลเป็น version=9 → 409 VERSION_CONFLICT

ตัวอย่างผลที่เข้าทางคืนสินค้า (ใช้กับ fixture งาน INSPECTING อีกงานหนึ่ง):

```json
{"expected_version":8,"result":"NOT_AS_DESCRIBED","summary":"ขนาดบนป้ายสินค้าต่างจากขนาดในคำสั่งซื้อ มีภาพป้ายเทียบประกอบ","reason_code":"SIZE_MISMATCH","evidence_ids":[801,802,803]}
```

200: status=COMPLETED, result=NOT_AS_DESCRIBED, certificate.status=NOT_APPLICABLE, return.status=REQUESTED. NOT_AUTHENTIC และ INCONCLUSIVE ใช้ทางต่อเดียวกัน

## 8. กดซ้ำ ส่งพร้อมกัน และแก้ผล

- FE ปิดปุ่มระหว่างส่ง เก็บ key และ payload ของคำสั่งค้างไว้ ถ้า timeout ให้ retry ด้วย key/payload เดิมหรือ GET เพื่อดูสถานะ ห้ามสร้าง key ใหม่อัตโนมัติ
- BE เก็บ idempotency ตาม actor_id + method + path + key พร้อม payload hash (upload รวม hash bytes และ metadata); same key/same payload คืน HTTP status และ business response เดิม ไม่เพิ่ม version/ผล/event; signed URL สามารถออกใหม่ได้
- same key แต่ payload ต่างตอบ 409 IDEMPOTENCY_KEY_REUSED; คำขอเดิมยังประมวลผลตอบ 409 REQUEST_IN_PROGRESS พร้อม Retry-After: 2; การ replay ตรวจสิทธิ์ปัจจุบันเสมอ
- เก็บ key ของคำสั่งสำเร็จอย่างน้อยตลอดอายุงาน; 4xx ที่ไม่เปลี่ยนข้อมูลไม่จอง key ถาวร; DB transaction rollback ต้องไม่เหลือ success record
- ทุก mutation ตรวจ version และ state ภายใต้ row lock/conditional update เดียวกัน; claim พร้อมกันสำเร็จได้คนเดียว อีกคนได้ VERSION_CONFLICT แล้วโหลดใหม่
- ส่งผลสองคำขอด้วย key ต่างกัน: คำขอแรกสำเร็จ อีกคำขอได้ VERSION_CONFLICT; เมื่อโหลดใหม่แล้วส่งอีกได้ RESULT_LOCKED; unique inspection_id ใน result เป็นแนวป้องกันเพิ่มเติม
- อัปโหลด/โอนงาน/ส่งผลชนกันใช้ lock เดียวกัน; upload ไม่เพิ่มจำนวนหรือ version เมื่อ fail; รูปที่อัปโหลดสำเร็จเพิ่ม version จึงให้ FE อัปโหลดเรียงและใช้ version ล่าสุดก่อนส่งผล
- หลังบันทึกห้าม UPDATE/DELETE ผลและหลักฐานที่แนบ รวม Admin หากต้องแก้ผลจริงต้องเปิด issue เพิ่มเรื่อง revision, เพิกถอนใบรับรอง และผลต่อ Return ก่อน ไม่ปลดล็อกด้วยการแก้ DB ตรง

## 9. จุดเชื่อม Order/Payment, CERT-02 และ Return

### เริ่มงาน

Order ส่งข้อมูลที่เชื่อถือได้: event_id, order_id, order_item_id, product_id, seller_id, eligibility_version, payment_reference และ product snapshot. ใช้ service authentication ไม่เปิดรับคำสั่งสร้างงานจาก Seller. BE ตรวจ eligibility จากข้อมูลของ Order/Payment ที่เป็น authoritative ไม่เชื่อ boolean paid จากมือถือ

consumer ตรวจ event ซ้ำและ unique order_item_id ใน transaction; event เก่าต้องไม่ทำให้ order ที่ยกเลิกแล้วกลับมา eligible. ผู้ดูแล Order/Payment ต้องตกลงการ lock/atomic handoff ก่อนสร้าง READY_TO_SHIP และป้องกัน eligibility เปลี่ยนระหว่างสร้างงาน/แจ้งส่ง

### เมื่อบันทึกผล

transaction เดียวบันทึก result + COMPLETED + version + audit + outbox event. ถ้า commit ไม่สำเร็จทั้งหมดต้อง rollback. ห้ามเรียกออกใบรับรองแล้วค่อยบันทึกผลตรวจ

PASSED → certificate.status=PENDING และ event `inspection.passed.v1`:

```json
{"event_id":"00000000-0000-4000-8000-000000000001","type":"inspection.passed.v1","inspection_id":501,"result_revision":1,"order_item_id":1001,"product_id":101,"inspector_id":24,"result":"PASSED","recorded_at":"2026-09-18T08:00:00Z","evidence_ids":[801,802,803]}
```

- CERT-02 อ่าน immutable snapshot ผ่าน trusted service; ไม่ใช้ signed URL อายุสั้นเป็นข้อมูลหลักใน event
- CERT-02 enforce unique inspection_id และตรวจ result=PASSED; ส่งซ้ำคืน certificate เดิม ไม่ออกเลขใหม่
- ข้อตกลงผลตอบกลับผ่าน service-authenticated event: `certificate.issued.v1` {event_id, inspection_id, result_revision, certificate_id, issued_at} หรือ `certificate.failed.v1` {event_id, inspection_id, result_revision, error_code, retryable}; certificate_id เสนอเป็น string เพื่อรองรับรูปแบบ CERT-02
- consumer ตรวจงาน ผล revision และ event ซ้ำ; ใช้ lock เดียวกับ inspection และเพิ่ม version เมื่อเปลี่ยนข้อมูล; ISSUED ห้ามถูก late failed event เปลี่ยนกลับ
- ส่งครั้งแรกทันที; ข้อผิดพลาดชั่วคราว retry หลัง 1, 5, 15 นาที (สูงสุด 4 attempts ต่อรอบ); ระหว่างรอเป็น PENDING; permanent error หรือครบจำนวนเป็น FAILED
- timeout อาจออกใบรับรองสำเร็จไปแล้ว ต้องค้น/retry ด้วย inspection_id เดิมก่อนออกใหม่; CERT-02 ต้องรองรับ lookup นี้
- Admin retry เฉพาะ FAILED สร้างรอบใหม่ด้วย inspection_id/result_revision เดิม; error ถาวรต้องแก้สาเหตุก่อน retry ไม่มี API สั่งออกข้ามผลตรวจ
- ออกใบรับรองล้มเหลว: คง COMPLETED/PASSED, แสดง “บันทึกผลแล้ว แต่ออกใบรับรองไม่สำเร็จ”; ไม่เปิดทางส่งให้ผู้ซื้อ ไม่คืนสินค้าอัตโนมัติ และไม่ให้ Inspector ส่งผลซ้ำ

อีก 3 ผล → certificate.status=NOT_APPLICABLE, return.status=REQUESTED และ `inspection.return_requested.v1` {event_id, inspection_id, result_revision, order_item_id, seller_id, result, reason_code, recorded_at} ใน transaction เดียวกัน

Return consumer deduplicate ด้วย inspection_id; ยืนยันด้วย `return.created.v1` {event_id, inspection_id, return_id} แล้วเปลี่ยนเป็น CREATED; ใช้ retry schedule เดียวกัน หากหมดรอบเป็น FAILED และแจ้ง Admin ให้ดำเนินการผ่านระบบ Return. คืนสินค้าล้มเหลวไม่เปลี่ยนผลตรวจและห้ามออกใบรับรอง; การคืนเงิน/ปลายทางส่งคืนต้องเป็นข้อตกลง Return/Order

การ transport ของ event/worker และชื่อ Order status จริงยังรอยืนยัน; public Inspect API ไม่เปิด callback ที่ผู้ใช้ทั่วไปปลอมได้

## 10. งาน DB และการแบ่งงานทีม

| ผู้รับผิดชอบ | งานส่งมอบ |
|---|---|
| Lead | ยืนยันจุดค้างในข้อ 1 และผล 4 ประเภท; ประสาน Order/Payment, Return, CERT-02 |
| BE | OpenAPI ตามสัญญา, authorization, state/version checks, uploads, idempotency, outbox/consumers |
| DB1 | inspections, inspection_results, inspection_evidence, audit, outbox, idempotency; constraints/indexes และ migration |
| FE1 | Seller: รายการ/รายละเอียด/แจ้งส่ง/อ่านผล และสถานะใบรับรอง/คืนสินค้า |
| FE2 | Inspector queue/claim/form/evidence; Admin receive/reassign/retry; version conflict/timeout UX |
| QA1 | fixture และทดสอบตารางสถานะ/สิทธิ์/ผล/ข้อผิดพลาด/การแข่งขัน/CERT failure |

DB constraints ขั้นต่ำ: unique inspections.order_item_id; unique inspection_results.inspection_id; FK ไป users/products/order items; result enum และ reason compatibility; evidence FK ไป inspection; unique result-evidence pair; audit append-only; unique outbox (inspection_id,event type,result_revision) สำหรับผลครั้งแรก; certificate retry ใช้ attempt batch แยก; idempotency unique ตาม scope ข้อ 8. DB/BE ต้อง enforce จำนวน/หมวดรูปและสถานะภายใต้ transaction ไม่พึ่ง FE

เก็บ snapshot, shipment, assignee, version, timestamps, certificate/return status และ audit (actor, action, before/after, reason, request_id). Storage object ไม่ให้ client เขียนทับ; failed transaction หลัง upload ให้ลบ orphan ผ่านงาน cleanup; ไม่ลบรูปที่ถูกผูกกับผลตรวจ. จำกัดสิทธิ์ DB/storage เพื่อไม่ให้ client ข้าม backend ไปแก้สถานะหรือผล

## 11. Acceptance matrix และเกณฑ์ปิด issue

| กรณี QA | สิ่งที่ต้องยืนยัน |
|---|---|
| upstream ไม่ eligible / event ซ้ำ / event เก่า | ไม่สร้างงานผิดเงื่อนไขและไม่สร้างซ้ำ |
| happy path | READY_TO_SHIP → SHIPPED_TO_INSPECTION → RECEIVED → INSPECTING → COMPLETED |
| แต่ละบทบาทและแต่ละสถานะ | ใช้ทุกช่องในตารางข้อ 2–3 รวมดูรายการและ GET ตรง |
| result ทั้ง 4 | เฉพาะ PASSED เรียก CERT-02; อีก 3 ผลสร้าง Return request |
| ฟิลด์/รูป | ค่าว่าง, enum ผิด, reason ไม่เข้าคู่, 2/3/10/11 รูป, ขนาด 5 MiB และ +1 byte, ปลอม MIME, รูปเสีย/ต่างงาน/ID ซ้ำ, ขาดหมวด |
| ไม่มีสิทธิ์ | 401 ไม่มี token; 403 role/account ไม่อนุญาต; 404 นอกขอบเขต |
| กดซ้ำ/timeout | key เดิมได้ผลเดิม ไม่เพิ่มผล/รูป/ใบรับรอง/Return |
| race | claim พร้อมกัน, ส่งผลพร้อมกัน, upload/reassign ชน submit; สำเร็จเพียงฝ่ายที่ผ่าน version/lock |
| แก้หลังบันทึก | ทุก role ถูกปฏิเสธ ไม่มีข้อมูลเดิมถูกเขียนทับ |
| transaction ล้มเหลว | ไม่เหลือผลครึ่งเดียวหรือ outbox ที่ไม่มีผลตรวจ |
| CERT ล้มเหลว/ออกแล้ว response หาย | ผลยัง PASSED, retry ไม่ออกซ้ำ, ไม่ส่งสินค้าให้ผู้ซื้อก่อน ISSUED |
| event ซ้ำ/มาช้า | ISSUED ไม่ย้อนเป็น FAILED; Return ไม่สร้างเคสซ้ำ |

- [x] จัดทำร่างตารางสถานะและสิทธิ์สำหรับ FE/BE/DB/QA
- [x] มีตัวอย่างสำเร็จ ข้อมูลไม่ครบ ไม่มีสิทธิ์ และผิดสถานะ
- [x] ระบุข้อเสนอเส้นทางใบรับรองและคืนสินค้าของทุกผล
- [ ] Lead ยืนยันชื่อ/ความหมายผลทั้ง 4 และนโยบาย INCONCLUSIVE
- [ ] Order/Payment ยืนยัน eligibility, หน่วยงานตรวจ, mapping และ cancellation boundary
- [ ] CERT-02/Return ยืนยัน payload, transport, deduplication และ recovery
- [ ] FE, BE, DB1 และ QA1 ทบทวนแล้วใช้ contract เวอร์ชันเดียวกัน

เอกสารนี้เสร็จในฐานะร่าง planning; ยังไม่ปิด issue ว่า “ตกลงแล้ว” จน checklist การยืนยันครบ และไม่ได้เป็นหลักฐานว่า API ถูก implement หรือทดสอบแล้ว
