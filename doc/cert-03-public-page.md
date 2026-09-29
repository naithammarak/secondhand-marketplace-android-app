# CERT-03 — หน้าใบรับรองสาธารณะ

อ้างอิง [issue #103](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/103) และ [CERT contract #100](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/100#issuecomment-5848063380) งานนี้ต่อจาก CERT-02: `public_url` ที่ออกพร้อมผลตรวจชี้มาที่ `GET /certificates/{public_token}` เดิม แต่ route นี้คืน `text/html` แล้ว เปิดจากเบราว์เซอร์บนมือถือได้โดยไม่ต้อง login หรือมีแอป

ฐานที่ใช้: `feat/cert-02-atomic-issue` commit `f958f8424a2b5707ed2113fb21acf3519ecaa7b6` (PR #110) ซึ่งมี Certificate/public URL และ schema Alembic head `d8b7c4e2910a` จาก CERT-01 แล้ว สเปกต้นทางคือ issue #103 กับ CERT spec #100; integration test ใช้ Certificate ที่ออกจากผลตรวจจริงบน PostgreSQL ทดสอบแยก

## เนื้อหาที่เห็น

| สถานะ | หน้าเว็บ |
|---|---|
| `ISSUED` + `PASS` | เลขใบรับรอง, “ของแท้”, เวลาออก และข้อความอธิบายขอบเขต |
| `ISSUED` + `MINOR_ISSUE` | เลขใบรับรอง, “พบข้อสังเกตเล็กน้อย”, เวลาออก และข้อความอธิบายขอบเขต |
| `REVOKED` | แสดงชัดว่าเพิกถอนและใช้ยืนยันไม่ได้ พร้อมผลตรวจเดิมและเวลาออก; ไม่แสดงเหตุผลภายใน |
| token ไม่พบ | HTTP 404 กับหน้า “ไม่พบใบรับรอง” แบบทั่วไป ไม่สะท้อน token/Order ID |

ทุกหน้าระบุว่าใบรับรองยืนยัน **ผลตรวจ ณ วันที่ออก** ไม่ยืนยันว่าผู้ซื้อได้รับสินค้าหรือเป็นเจ้าของสินค้า หน้าเว็บไม่มีปุ่มตัดสินใจของ Buyer, JavaScript, analytics หรือทรัพยากรจากภายนอก

การที่ Buyer ปฏิเสธสินค้าภายหลังไม่เปลี่ยนสถานะใบรับรอง `ISSUED` ของผลตรวจเดิม หน้านี้อ่านสถานะจาก Certificate เท่านั้น; `REVOKED` ใช้เมื่อใบรับรองถูกเพิกถอนด้วยกระบวนการที่ได้รับอนุญาตแยกต่างหาก

หน้าใบรับรองไม่ดึง Order/Inspection/ผู้ใช้มา join ใช้เฉพาะแถว Certificate ที่หาได้จาก opaque token และ render ด้วย Jinja autoescape จึงไม่แสดงชื่อ/ข้อมูลติดต่อ/ที่อยู่/ราคาหรือชื่อสินค้าที่ผู้ใช้กรอก, เหตุผลตัดสินใจของ Buyer, บันทึก Inspector, รูปหลักฐานส่วนตัว หรือ Storage signed URL ขณะนี้ยังไม่มีสินทรัพย์รูป catalog ที่ตรวจแล้วว่าเผยแพร่ได้โดยเฉพาะ จึงไม่แสดงรูปบนหน้าสาธารณะ

## Headers และตัวอย่าง

ทั้ง `200` และ `404` ส่ง `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `X-Content-Type-Options: nosniff` และ Content Security Policy ปิดทรัพยากรภายนอก อนุญาตเฉพาะ CSS ภายใน HTML

```http
GET /certificates/<opaque-token>

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: no-store
Referrer-Policy: no-referrer
X-Robots-Tag: noindex
```

`PUBLIC_CERTIFICATE_BASE_URL` ต้องตั้งเป็น HTTPS origin จริงที่เครื่องอื่นเข้าถึงได้ตาม [CERT-02](cert-02-atomic-issue.md#ตั้งค่า-url-สาธารณะ) ลิงก์ที่ API ส่งให้ FE สำหรับ QR และปุ่มเปิดเบราว์เซอร์คือ `certificate.public_url`; FE ไม่ควรประกอบ token/URL เอง

## ตรวจรับด้วยเครื่องจริง

1. บนฐานทดสอบที่มี CERT-01 และ CERT-02 ออกใบรับรองจากผล `PASS` และ `MINOR_ISSUE` จาก Inspector แล้วคัดลอก `certificate.public_url` ที่ได้จาก API ผลตรวจ
2. เปิด URL เดียวกันบนมือถืออีกเครื่องด้วยเครือข่ายที่เข้าถึง HTTPS origin ได้ โดยไม่ login และไม่เปิดแอป ตรวจว่าหน้ากว้างพอดี อ่านสถานะ/เลข/ผล/เวลาได้
3. ตรวจ `REVOKED` จากข้อมูลทดสอบที่ถูกเพิกถอนโดยวิธีดูแลฐานที่ได้รับอนุญาต และลอง token ที่ไม่มีจริง หน้าแรกต้องบอกว่าใช้ยืนยันไม่ได้ ส่วน token ผิดต้องได้ 404 แบบทั่วไป
4. ใช้ browser DevTools ดู HTML, Network และ response headers ต้องไม่มีข้อมูลส่วนตัว รูปหลักฐาน private, signed URL, สคริปต์, analytics หรือคำขอทรัพยากรภายนอก
5. ตรวจ responsive ที่ความกว้างประมาณ 360 px และ desktop; บันทึกภาพหน้า `ISSUED`, `MINOR_ISSUE`, `REVOKED`, และ 404 สำหรับ QA ก่อน merge

ชุดทดสอบอัตโนมัติอยู่ใน `backend/tests/test_certificate_public_page.py` และ `backend/tests/test_inspection_flow_postgres.py` โดยชุดหลังใช้ PostgreSQL ทดสอบแยกเท่านั้น การทดสอบ local ใช้ `https://cert.example.test` เป็นค่าประกอบ URL และพิสูจน์ route ผ่าน HTTP test client; **ยังไม่ใช่หลักฐานว่า URL สาธารณะจริงเปิดได้จากมือถืออีกเครื่อง** ต้องทำข้อ 2–5 ในสภาพแวดล้อม deploy ก่อนปิดงาน

28 กันยายน 2026: ผู้ทดสอบรายงานว่าเปิดหน้า `PASS`, `MINOR_ISSUE`, `REVOKED` และ 404 ผ่าน HTTPS quick tunnel บนมือถือได้ครบ โดยใช้ PostgreSQL ทดสอบแยกในเครื่อง หลักฐานนี้ยืนยันการแสดงผลผ่าน HTTPS ชั่วคราว; ยังต้องเก็บภาพและตรวจ Network/response headers รวมถึงทดสอบ `certificate.public_url` ที่ API ส่งจริงในสภาพแวดล้อม deploy ก่อนปิดงาน
