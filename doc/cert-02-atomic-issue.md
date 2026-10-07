# CERT-02 — ออกใบรับรองพร้อมผลตรวจ

Issue [#102](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/102) ใช้ [CERT contract ใน #100](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/100#issuecomment-5848063380), INSPECT-00 #54 และ FINISH-00 #98

## ฐานที่ตรวจ

- งานนี้ต่อจาก `feat/cert-01-storage` commit `ded56e93b7ca6b7331a0e488cb1daac5e297f5eb` (PR #109); Alembic head `d8b7c4e2910a`
- CERT-01 ต่อจาก `feat/inspect-01-storage` commit `d6a1a1a8f86b2bc1e3c2b5bcb0b0d1b34b3f8d59` (PR #108) ซึ่งมี INSPECT-03 API และ schema จริง
- ORDER มี paid Order, Payment, Escrow และ API จำลองชำระเงินสำหรับ integration test; INSPECT-03 มี Seller→Courier→Inspector flow จริงใน PostgreSQL ทดสอบแยก
- `feat/cert-01-storage` และ `feat/inspect-01-storage` ยังเป็น PR ที่เปิดอยู่ในขณะทำ CERT-02; เปลี่ยน base PR ตามลำดับเมื่อ upstream merge แล้ว
- งานนี้ต่อเติม route `POST /inspections/{inspection_id}/result` เดิม ไม่สร้าง route ออกใบรับรองซ้ำ
- Mobile Order service/list/detail รับสถานะ `SHIPPING_TO_CENTER`, `RECEIVED_AT_CENTER`, `INSPECTING`, `RESULT_NOTIFIED` ตาม backend และแสดงข้อความภาษาไทยตรงสถานะ; สถานะในอนาคตยังมี fallback `UNKNOWN`

## พฤติกรรม

Inspector ที่ได้รับมอบหมายและยัง ACTIVE ส่งผลได้เมื่อ Order เป็น `INSPECTING`, มีหลักฐานผลตรวจ 1–5 รูปในงานเดียวกัน และยังไม่มีผลสุดท้าย Endpoint ล็อก Order และอ่านสิทธิ์ Inspector ปัจจุบันซ้ำก่อนเขียน

| ผล | Certificate | Order หลังสำเร็จ | `next_action` |
|---|---|---|---|
| `PASS`, `MINOR_ISSUE` | หนึ่งใบ `ISSUED`, snapshot ตรง Inspection | `RESULT_NOTIFIED` | `WAIT_BUYER_DECISION` |
| `NOT_AS_DESCRIBED`, `FAKE` | ไม่มี | `RESULT_NOTIFIED` | `RETURN_TO_SELLER` |

การผูกหลักฐานที่เลือก, บันทึกผล, ออก Certificate, เปลี่ยน Order และบันทึก idempotency key อยู่ใน PostgreSQL transaction เดียว `flush()` ที่ใช้ให้ FK เห็นผลสุดท้ายยังไม่ใช่ commit ถ้า token, URL, insert Certificate หรือ commit ล้มเหลว ก่อนยืนยัน commit จะ rollback ทั้งหมด และตอบ `503 certificate_unavailable` สำหรับความล้มเหลวด้าน Certificate การตอบรับ commit ที่สูญหายอาจทำให้ผลฝั่ง server สำเร็จไปแล้ว; client ส่ง key เดิมซ้ำหรืออ่านผลก่อนตัดสินใจส่งใหม่

Certificate number ใช้ UUID แบบสุ่มและ unique constraint; public token ใช้ `secrets.token_urlsafe(32)` (256 บิตสุ่ม) ฝั่ง server ไม่ใช้ Order ID หรือเลขใบรับรองเป็น token Composite FK และ unique ใน CERT-01 ป้องกันผล/ใบรับรองผิดคู่หรือซ้ำเมื่อมีคำขอพร้อมกัน ผลตรวจที่จบแล้วแก้ย้อนหลังไม่ได้ตาม trigger INSPECT-01

CERT-02 ไม่สร้าง Shipment ใหม่ ไม่ปล่อย Escrow และไม่คืนเงิน การตัดสินใจของ Buyer เป็น CERT-04 ส่วนหน้าเว็บจาก QR เป็น CERT-03

## ตั้งค่า URL สาธารณะ

Backend ต้องมี `PUBLIC_CERTIFICATE_BASE_URL` เป็น **HTTPS origin** ที่เข้าถึงได้จากเครื่องที่จะเปิดใบรับรอง เช่น `https://api.example.test` ไม่มี path, userinfo, query หรือ fragment; อนุญาต `/` ท้าย URL และ normalize ออก ระบบตรวจตอน startup หากไม่มีหรือผิดรูปแบบจะเริ่มเซิร์ฟเวอร์ไม่สำเร็จ ตัวอย่างอยู่ใน `backend/.env.example`

ตัวอย่างสำหรับ PowerShell ก่อนรัน Backend:

```powershell
$env:PUBLIC_CERTIFICATE_BASE_URL = "https://your-public-api.example"
```

URL สำหรับ QR ประกอบจากค่านี้กับ token ใน DB เท่านั้น ไม่อ่าน Host header ของ request ค่าทดสอบ `cert.example.test` ใช้พิสูจน์รูปแบบและธุรกรรม ไม่ใช่หลักฐานว่าเครื่องอื่นเปิดได้ ต้องใช้ HTTPS origin จริงในการทดสอบ demo

## ตัวอย่าง API สำหรับ FE / QA

หลังอัปโหลดหลักฐานและได้ `evidence.id` ของ Inspection นี้แล้ว:

```http
POST /inspections/42/result
Authorization: Bearer <inspector-token>
Idempotency-Key: result-order-42-v1
Content-Type: application/json

{"result":"PASS","summary":"ตรวจแล้วสินค้าตรงกับรายละเอียดที่ลงขาย","evidence_ids":[7]}
```

สำเร็จ `200` ตัวอย่างฟิลด์หลัก (response จริงมีข้อมูลสินค้า, Shipment, Inspector และหลักฐานเพิ่มเติม):

```json
{
  "id": 42,
  "order_id": 11,
  "order_status": "RESULT_NOTIFIED",
  "result": "PASS",
  "summary": "ตรวจแล้วสินค้าตรงกับรายละเอียดที่ลงขาย",
  "inspected_at": "2026-09-28T10:00:00Z",
  "certificate": {
    "certificate_no": "CERT-0123456789ABCDEF01234567",
    "status": "ISSUED",
    "issued_at": "2026-09-28T10:00:00Z",
    "public_url": "https://api.example.test/certificates/<opaque-token>"
  },
  "next_action": "WAIT_BUYER_DECISION"
}
```

ผล `FAKE`/`NOT_AS_DESCRIBED` สำเร็จ `200` เช่นกัน แต่ `certificate` เป็น `null` และ `next_action` เป็น `RETURN_TO_SELLER` ผู้ซื้อยังอ่านผล/หลักฐานตามสิทธิ์เดิมได้

ข้อผิดพลาดที่ใช้ทดสอบ:

| กรณี | HTTP / code |
|---|---|
| ไม่ login | `401` จาก Auth |
| ไม่ใช่ Inspector, บัญชีถูกระงับ, ไม่ได้มอบหมาย | `403` (`inspector_role_required` / `not_assigned_inspector`) หรือ `404 inspection_not_found` ตามการมองเห็นงาน |
| Order ไม่พร้อมตรวจหรือมีผลแล้ว | `409 result_locked` |
| result/summary/evidence_ids ไม่ถูกต้อง | `422 validation_error` พร้อม `detail.fields` |
| key เดิมแต่ payload เปลี่ยน | `409 idempotency_key_reused` |
| token/URL/Certificate ล้มเหลว | `503 certificate_unavailable`; ผลตรวจยังไม่จบและ retry key เดิมได้ |

ตัวอย่าง error แบบที่ endpoint ส่ง:

```json
{"detail":{"code":"certificate_unavailable","message":"Certificate could not be issued; retry the same key"}}
```

คำขอเดิมที่สำเร็จแล้วและใช้ key เดิมตอบ `200` พร้อม `Idempotent-Replayed: true` โดยไม่สร้าง Certificate อีกใบ คำขอแข่งขันที่ใช้ผลต่างกันมีได้เพียงหนึ่งผลสำเร็จ

## ผลทดสอบและส่งต่อ

ทดสอบ PostgreSQL 18 แยกบน `127.0.0.1` โดยสร้างฐานว่างคนละฐานให้ CERT, INSPECT schema และ API flow รวม backend suite รวมถึง:

- PASS/MINOR_ISSUE/ผลลบทั้งสองแบบผ่าน HTTP API บน paid Order จริงในฐานทดสอบ
- ตรวจ status, issued_at, result snapshot, token และ Order/Inspection/Certificate หลัง commit
- จำลอง token/URL/SQL insert ล้มเหลว ตรวจว่าไม่มีผล/รูปที่เลือก/Certificate/สถานะใหม่ค้าง และใช้ idempotency key เดิมลองใหม่สำเร็จ
- ทดสอบคำขอซ้ำพร้อมกันทั้งผลเดียวกันและผลต่างกัน ตลอดจนการระงับสิทธิ์ Inspector ระหว่างคำขอ
- ตรวจ URL ที่หาย, HTTP, userinfo, path, query, fragment และ port ผิดรูปแบบว่าจะหยุดตั้งแต่ startup

ผลทดสอบเฉพาะ commit และ merged snapshot ดูที่ PR ของ CERT-02 หลังเปิด PR การทดสอบใช้ auth และ private storage จำลองร่วมกับ PostgreSQL จริง ยังไม่ยืนยันการเปิด public URL จากมือถือจริง; งาน CERT-03/QA รับช่วงทดสอบนั้น
