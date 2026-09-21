# VERIFY-00: ข้อตกลงการยืนยันตัวตนผู้ขาย

เอกสารนี้เป็นข้อตกลงกลางสำหรับ Feature **อนุมัติผู้ขาย** ตาม SRS ข้อ FR-04 และใช้เป็นจุดอ้างอิงของงาน VERIFY-01 ถึง VERIFY-06

## อ่านส่วนนี้ก่อน

- ผู้ใช้เลือกบทบาท `SELLER` ตอนเข้าใช้ระบบครั้งแรก แต่ยังลงขายสินค้าไม่ได้จนกว่าคำขอยืนยันตัวตนจะเป็น `APPROVED`
- ผู้ขายส่งรูปบัตรประชาชน 1 รูป ชื่อธนาคาร ชื่อบัญชี และเลขบัญชี
- Prototype และข้อมูลทดสอบต้องใช้ข้อมูลสมมติเท่านั้น ห้ามใช้บัตรประชาชนหรือบัญชีธนาคารจริง
- Admin ตรวจเอกสารด้วยตนเอง แล้วเลือกอนุมัติหรือปฏิเสธพร้อมเหตุผล
- ผู้ขายที่ถูกปฏิเสธแก้ข้อมูลและส่งคำขอใหม่ได้ ระบบเก็บคำขอเดิมไว้เป็นประวัติ
- ผู้ขายที่มีคำขอ `PENDING` หรือคำขอล่าสุดเป็น `APPROVED` ส่งซ้ำไม่ได้

## State flow

![Seller verification state diagram](../diagrams/seller-verification-state.png)

ไฟล์ต้นฉบับของภาพอยู่ที่ [seller-verification-state.puml](../diagrams/seller-verification-state.puml)

`NOT_SUBMITTED` ใช้เฉพาะใน API และหน้าจอเมื่อยังไม่มีคำขอ ไม่ได้เก็บในฐานข้อมูล ส่วนค่าที่เก็บจริงมี `PENDING`, `APPROVED` และ `REJECTED`

## สิทธิ์ของแต่ละบทบาท

| การทำงาน | SELLER | ADMIN | BUYER / INSPECTOR |
| --- | --- | --- | --- |
| ส่งคำขอของตนเอง | ได้ เมื่อบัญชี `ACTIVE` | ไม่ได้ | ไม่ได้ |
| อ่านสถานะของตนเอง | ได้ | ไม่ได้ | ไม่ได้ |
| ดูคิวคำขอ | ไม่ได้ | ได้ เมื่อบัญชี `ACTIVE` | ไม่ได้ |
| เปิดรูปบัตร | ไม่ได้ | ได้ผ่านลิงก์ชั่วคราว | ไม่ได้ |
| อนุมัติหรือปฏิเสธ | ไม่ได้ | ได้ | ไม่ได้ |

Backend อ่านตัวตน บทบาท และสถานะบัญชีจาก Token ที่ตรวจแล้วเท่านั้น ห้ามเชื่อ `user_id`, role หรือสถานะที่ Mobile ส่งมา

## ข้อมูลที่ผู้ขายส่ง

`POST /verifications` ใช้ `multipart/form-data`

| Field | กติกา |
| --- | --- |
| `bank_name` | บังคับ ความยาว 2-255 ตัวอักษร |
| `bank_account_name` | บังคับ ความยาว 2-255 ตัวอักษร |
| `bank_account_number` | บังคับ ระบบตัดขีดและช่องว่างออก แล้วต้องเหลือตัวเลข 10-15 หลัก |
| `id_card_image` | บังคับ รองรับ JPG, PNG หรือ WEBP ขนาดไม่เกิน 5 MB และตรวจชนิดจากเนื้อไฟล์ |

ชื่อไฟล์จริงและข้อมูลส่วนตัวต้องไม่ถูกนำไปใช้เป็น object key ใน Storage

## API contract

### Seller

| Method | Path | ผลลัพธ์ |
| --- | --- | --- |
| `GET` | `/verifications/me` | สถานะคำขอล่าสุดของ Seller ที่ Login |
| `POST` | `/verifications` | ส่งคำขอใหม่และได้สถานะ `PENDING` |

ตัวอย่างเมื่อยังไม่เคยส่ง:

```json
{
  "status": "NOT_SUBMITTED",
  "can_submit": true
}
```

ตัวอย่างเมื่อถูกปฏิเสธ:

```json
{
  "id": 42,
  "status": "REJECTED",
  "bank_name": "ธนาคารตัวอย่าง",
  "bank_account_name": "ผู้ขาย ทดสอบ",
  "bank_account_last4": "7890",
  "reject_reason": "รูปบัตรไม่ชัด กรุณาถ่ายใหม่",
  "can_submit": true
}
```

Seller ได้รับเลขบัญชีเพียง 4 ตัวท้าย และไม่ได้รับ path หรือ URL ของรูปบัตรกลับมา

### Admin

| Method | Path | ผลลัพธ์ |
| --- | --- | --- |
| `GET` | `/admin/verifications?status=PENDING&limit=20&offset=0` | รายการตามสถานะพร้อมจำนวนทั้งหมด |
| `GET` | `/admin/verifications/{id}` | รายละเอียดคำขอ โดยเลขบัญชีแสดงเฉพาะ 4 ตัวท้าย |
| `GET` | `/admin/verifications/{id}/id-card` | Signed URL ของรูปบัตร อายุ 120 วินาที |
| `POST` | `/admin/verifications/{id}/decision` | บันทึก `APPROVED` หรือ `REJECTED` |

ตัวอย่างการอนุมัติ:

```json
{
  "decision": "APPROVED"
}
```

ตัวอย่างการปฏิเสธ:

```json
{
  "decision": "REJECTED",
  "reject_reason": "รูปบัตรไม่ชัด กรุณาถ่ายใหม่"
}
```

เหตุผลปฏิเสธต้องมี 5-500 ตัวอักษร หาก Admin สองคนตรวจคำขอเดียวกันพร้อมกัน จะสำเร็จเพียงคนเดียว อีกคนได้รับ `409 already_reviewed` พร้อมชื่อผู้ตรวจคนแรก

## รหัสตอบกลับที่ทีมต้องรองรับ

| HTTP | กรณี |
| --- | --- |
| `401` | ไม่มี Token, Token ผิด หรือหมดอายุ |
| `403` | บทบาทไม่ตรง หรือบัญชีไม่ `ACTIVE` |
| `404` | ไม่พบคำขอหรือไม่มีรูปบัตร |
| `409` | Seller ส่งซ้ำ หรือคำขอถูก Admin คนอื่นตรวจแล้ว |
| `422` | ข้อมูลหรือไฟล์ไม่ผ่าน validation |
| `502` | อัปโหลดหรือเปิดรูปจาก Storage ไม่สำเร็จ |
| `503` | Backend ยังไม่ได้ตั้งค่า private Storage |

ข้อความที่แสดงแก่ผู้ใช้ใช้ภาษาไทย และ Log ห้ามมี Token, เลขบัญชีเต็ม, Storage path หรือ Signed URL

## การเก็บข้อมูลและความปลอดภัย

- รูปบัตรเก็บใน Supabase Storage bucket แบบ private ชื่อเริ่มต้น `seller-verifications`
- Service role key อยู่ฝั่ง Backend เท่านั้น ห้ามใส่ใน Mobile, `EXPO_PUBLIC_*`, Log หรือ Git
- Admin ต้องกดเปิดรูปก่อน Backend จึงออก Signed URL อายุสั้น
- รายการ Admin และรายละเอียดคำขอไม่ส่งเลขบัญชีเต็มหรือ Storage path
- ตาราง `verifications` มี unique partial index เพื่อให้หนึ่ง Seller มีคำขอ `PENDING` ได้ครั้งละหนึ่งใบ แม้กดส่งพร้อมกันจากหลายอุปกรณ์
- คำขอ `REJECTED` เก็บเป็นประวัติ เมื่อส่งใหม่ Backend สร้างแถวใหม่เป็น `PENDING`
- `purge_at` ถูกตั้งไว้ 90 วันหลังส่งคำขอใน implementation ปัจจุบัน

## Acceptance criteria ของ VERIFY-00

- [x] ทีมรู้ข้อมูลที่ Mobile ต้องส่งและข้อมูลที่ API ตอบ
- [x] กำหนดสถานะและ transition ที่ใช้ร่วมกัน
- [x] กำหนดสิทธิ์ Seller และ Admin ฝั่ง Backend
- [x] กำหนด validation ของข้อมูลและรูป
- [x] กำหนดวิธีป้องกันส่งซ้ำและ Admin บันทึกผลทับกัน
- [x] กำหนดขอบเขตข้อมูลที่ Mobile และ Admin มองเห็น
- [x] มี State Diagram ที่ทีมเปิดดูบน GitHub ได้

## งานที่ยังต้องตามต่อ

หัวข้อนี้แยก “ข้อตกลงที่ต้องการ” ออกจากสิ่งที่มีใน `main` เพื่อไม่ให้ทีมเข้าใจว่าเสร็จแล้ว:

- SRS NFR-05 กำหนดให้ขอความยินยอมก่อนเก็บสำเนาบัตร แต่ implementation ปัจจุบันยังไม่มี `Consent` flow
- Class Diagram ระบุ `Seller 1 -- 0..1 SellerVerification` แต่ implementation ปัจจุบันเก็บหลายแถวเพื่อรักษาประวัติการส่งใหม่ โดยบังคับเพียงหนึ่ง `PENDING` ต่อ Seller เอกสารนี้ยึด behavior ใน tests และ code ตามกติกา repository
- ยังไม่มี `AuditLog` สำหรับเหตุการณ์ส่งคำขอและตรวจคำขอ
- ยังไม่มีงานอัตโนมัติที่ลบรูปเมื่อถึง `purge_at`
- API ลงขายสินค้าต้องตรวจว่า Seller มีคำขอล่าสุดเป็น `APPROVED` ในงาน PRODUCT-03

## เอกสารทดสอบที่เกี่ยวข้อง

- [ทดสอบหน้าส่งคำขอของ Seller](../../mobile/docs/testing/seller-verification.md)
- [ทดสอบหน้าตรวจคำขอของ Admin](../../mobile/docs/testing/admin-verification-review.md)
