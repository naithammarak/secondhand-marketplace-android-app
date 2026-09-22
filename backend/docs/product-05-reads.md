# PRODUCT-05: รายการ ค้นหา รายละเอียด และตัวเลือกสินค้า

API นี้อ้างอิง [PRODUCT-00 Contract v1.0](https://github.com/naithammarak/SA-Project/issues/42) และ [PRODUCT-05 #47](https://github.com/naithammarak/SA-Project/issues/47) ใช้ข้อมูลจริงจากตารางสินค้า ผู้ขาย การอนุมัติ รูป หมวดหมู่ และแบรนด์ มี merge revision สำหรับเชื่อมประวัติ migration หลังรวม main ตามรายละเอียดท้ายเอกสาร

## สำหรับหน้าร้าน (ไม่ต้องเข้าสู่ระบบ)

```http
GET /products?q=เสื้อ&page=1&page_size=20
GET /products/101
GET /categories
GET /brands
```

ตัวอย่างรายการ:

```json
{
  "data": [
    {
      "id": 101,
      "product_name": "เสื้อเชิ้ตสีฟ้า",
      "price": "1190.00",
      "condition": "GOOD",
      "status": "AVAILABLE",
      "main_image": {
        "image_id": 802,
        "image_url": "https://storage.example.invalid/signed/802",
        "url_expires_at": "2026-09-18T10:10:00Z"
      }
    }
  ],
  "meta": {"page": 1, "page_size": 20, "total": 1, "total_pages": 1, "has_next": false}
}
```

หน้าร้านแสดงเฉพาะ `AVAILABLE` ที่ไม่ถูกลบ และเจ้าของยังเป็น `ACTIVE` `SELLER` ซึ่งผลอนุมัติล่าสุดเป็น `APPROVED` เท่านั้น รายละเอียดคืนข้อมูลสินค้าเต็มพร้อมรูปเรียง `sort_order` แต่ไม่มีข้อมูลส่วนตัวผู้ขาย รูปใน private bucket ใช้ signed URL อายุ 300 วินาที; หน้าแอปควรโหลดข้อมูลใหม่เมื่อ URL หมดอายุ

## สำหรับผู้ขาย

```http
GET /products/me?q=เสื้อ&status=CANCELLED&page=1&page_size=20
Authorization: Bearer <access_token>

GET /products/me/101
Authorization: Bearer <access_token>
```

ผู้ขาย `ACTIVE` เห็นรายการของตนทุกสถานะ รวม `CANCELLED` และ `RESERVED` โดยไม่ต้องมี approval ปัจจุบัน ตัวกรอง `status` เลือกได้ `AVAILABLE`, `RESERVED`, `SOLD`, `CANCELLED`; หากไม่ส่งจะเห็นทั้งหมด รายละเอียดของผู้อื่นและรายการที่ถูกลบตอบ `404 PRODUCT_NOT_FOUND`

`/categories` คืน `id`, `category_name`, `parent_category_id`; `/brands` คืน `id`, `brand_name` เรียง ID จากน้อยไปมาก หากไม่มีแถวจะคืน `{"data":[]}` ให้ฟอร์มปิดการส่งแทนการเดา ID

## ค้นหาและแบ่งหน้า

- `page` เริ่มที่ 1 ค่าเริ่มต้น 1; `page_size` 1–50 ค่าเริ่มต้น 20
- `q` ถูก trim ก่อนค้น; ช่องว่างล้วนหมายถึงไม่กรอง; ยาวได้สูงสุด 255 ตัวอักษร
- ค้นหาบางส่วนของ `product_name` แบบไม่แยกตัวพิมพ์เล็กใหญ่; `%`, `_`, `\` เป็นตัวอักษรจริง
- เรียง `created_at DESC, id DESC` เสมอ หน้าเกินข้อมูลคืน `200` พร้อม `data: []` และ `total` จริง
- รายการตรวจความถูกต้องของ approval, นับจำนวน, อ่านหน้าปัจจุบัน และอ่านรูปแบบรวม รวม 4 query ต่อหน้าที่มีสินค้า จึงไม่อ่านรูปทีละสินค้า
- ถ้ามีการสร้างหรือยกเลิกสินค้าระหว่างเปิดหน้าต่าง ๆ offset pagination ไม่รับประกัน snapshot เดิม แอปควรโหลดหน้าแรกใหม่เมื่อข้อมูลเปลี่ยน

ข้อผิดพลาดใช้ `{"error":{"code":"...","message":"...","fields":{},"request_id":"..."}}` เช่น `422` สำหรับพารามิเตอร์ผิด, `404 PRODUCT_NOT_FOUND`, `403 SELLER_ONLY`, `503 STORAGE_UNAVAILABLE` เมื่อสร้าง signed URL ไม่ได้

ทดสอบใน `backend`: `python -m pytest tests/test_product_reads.py -q`

หลังรวม main มี merge revision `a62f095d810e` เชื่อมประวัติ migration Product และ Verify ให้เหลือ head เดียว ตัว merge revision ไม่มีคำสั่งเปลี่ยนข้อมูล แต่การ upgrade จะรัน migration ที่ฐานนั้นยังขาดด้วย ผู้ดูแลฐานต้องตรวจรายการก่อนรัน; งานนี้ไม่ได้รัน migration บน Supabase

เมื่อ approval ผิดรูปแบบ ตอบ `503 APPROVAL_STATE_UNAVAILABLE`; เมื่ออ่านหมวดหมู่/แบรนด์จากฐานข้อมูลไม่ได้ ตอบ `503 PRODUCT_READ_UNAVAILABLE` พร้อม JSON error และ request_id
