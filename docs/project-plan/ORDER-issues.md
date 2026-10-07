# [Feature] สั่งซื้อและจ่ายเงินจำลอง

**หมายเหตุแผน 26 กันยายน 2026:** รายการนี้บันทึกขอบเขต ORDER-01…07 ในรอบแรกเท่านั้น. แผนส่งมอบล่าสุดใน [FULFILLMENT-00](FULFILLMENT-00-delivery-proof-and-deadlines.md) เพิ่ม worker หมดเวลาจ่าย 30 นาที, คืนเงินเมื่อผู้ขายไม่ส่งภายใน 3 วัน และปล่อยเงินหลัง Courier ถ่ายรูปส่งถึงผู้ซื้อแล้ว Buyer ไม่ยืนยันรับภายใน 72 ชั่วโมงโดยไม่มีรายงานไม่รับ. การยอมรับ **ผลตรวจ** ใน CERT ไม่ใช่การยืนยันว่า **ได้รับสินค้า** ใน FINISH. ลิงก์ `SA-Project` ด้านล่างเป็นชื่อ repository ที่ใช้ตอนเขียนเอกสารเดิม; งานปัจจุบันอยู่ที่ `naithammarak/secondhand-marketplace-android-app` และต้องตรวจเลข Issue สดก่อนใช้งาน.

วันที่: 18 กันยายน 2026 | สถานะ: เปิดบน GitHub แล้ว
Repository: naithammarak/SA-Project

GitHub Issues:
- Feature หลัก: https://github.com/naithammarak/SA-Project/issues/67
- ORDER-00: https://github.com/naithammarak/SA-Project/issues/51
- ORDER-01: https://github.com/naithammarak/SA-Project/issues/53
- ORDER-02: https://github.com/naithammarak/SA-Project/issues/55
- ORDER-03: https://github.com/naithammarak/SA-Project/issues/57
- ORDER-04: https://github.com/naithammarak/SA-Project/issues/59
- ORDER-05: https://github.com/naithammarak/SA-Project/issues/61
- ORDER-06: https://github.com/naithammarak/SA-Project/issues/63
- ORDER-07: https://github.com/naithammarak/SA-Project/issues/66

## ที่มาและเป้าหมาย

อ้างอิง `GitHub_Prototype_Backlog.md` หัวข้อ 4 และ 6: Feature ถัดจาก Product คือสั่งซื้อและจ่ายจำลอง รักษารหัส ORDER-01 ถึง ORDER-06 เดิม เพิ่ม ORDER-00 สำหรับตกลง contract และ ORDER-07 สำหรับ API อ่านคำสั่งซื้อที่หน้าจอต้องใช้

ผู้ซื้อเลือกสินค้า → ยืนยันข้อมูลและยอด → จองได้คนเดียว → จ่ายจำลอง → มีใบเสร็จและเงินพักหนึ่งชุด → สถานะ WAITING_SELLER_SHIP พร้อมส่งต่อให้ Feature ตรวจสินค้า

ขอบเขต: หนึ่งคำสั่งซื้อต่อสินค้าหนึ่งชิ้น, จ่ายจำลองสำเร็จ/ล้มเหลว, อ่านรายการและรายละเอียดตามสิทธิ์, Refresh เอง
ไม่รวม: ตะกร้าหลายสินค้า, payment/shipping จริง, wallet, ปล่อยเงิน/คืนเงิน, งานหมดเวลาอัตโนมัติ

ข้อขัดแย้ง: `state-diagram/Order State Diagram.puml` มีหมดเวลาจ่าย 30 นาที แต่ backlog ล่าสุดเลื่อนงานอัตโนมัติออก จึงไม่รวม timer รอบนี้ ต้องบันทึกใน ORDER-00 และปรับเอกสารให้ตรงกัน การจ่ายล้มเหลวให้คงการจองและลองใหม่ได้ เป็นข้อเสนอที่ต้องสรุปใน ORDER-00

สถานะ Product ปัจจุบันเป็น String ไม่ได้จำกัด enum; ชื่อสถานะพร้อมขาย/จองต้องตกลงกับทีม Product ห้ามสมมติชื่อแล้วเขียนแยกกัน
ผู้รับผิดชอบเป็นบทบาทในแผน ยังไม่ใช่ GitHub assignee จริง

## เกณฑ์ปิด Feature

- [ ] ผู้ซื้อสองคนซื้อพร้อมกัน สำเร็จได้หนึ่งคน อีกคนได้รับ conflict
- [ ] ซื้อสินค้าตนเอง สินค้าที่ไม่พร้อมขาย หรือถูกลบไม่ได้
- [ ] ยอดและข้อมูลผู้ขายมาจาก Server; ข้อมูลราคา/ที่อยู่ถูก snapshot เมื่อสร้าง Order
- [ ] จ่ายล้มเหลวไม่สร้างเงินพัก/ใบเสร็จสำเร็จ และลองจ่ายใหม่ได้
- [ ] จ่ายสำเร็จสร้างเงินพักและใบเสร็จเพียงครั้งเดียว แม้กดซ้ำ ส่งซ้ำ หรือส่งพร้อมกัน
- [ ] ผู้ไม่เกี่ยวข้องอ่าน Order/ที่อยู่/ใบเสร็จไม่ได้
- [ ] มือถือเชื่อม API และฐานข้อมูลจริงครบ flow; มีหลักฐาน QA

---

## ORDER-00 — [Lead] ตกลงสถานะ กติกา และ API ของการสั่งซื้อ
เจ้าของหลัก: Lead | ผู้ร่วม: BE, DB1, FE1, FE2 | Label: integration
รอ: ข้อตกลง Product และ Login; ตรวจสถานะจริงก่อนเริ่ม ไม่ถือว่า Product เสร็จจากการมี Model

งาน:
- [ ] ระบุบทบาทที่ซื้อได้และสิทธิ์ Buyer/Seller/Admin/Inspector; ค่าเริ่มต้นที่เสนอคือผู้ซื้ออ่าน/จ่ายของตน ผู้ขายอ่านรายการสินค้าตน และยังไม่เปิดสิทธิ์ Admin/Inspector เพิ่มโดยไม่มี use case
- [ ] ยืนยันชื่อสถานะ Product และ Order: เริ่ม WAITING_PAYMENT; สำเร็จเป็น WAITING_SELLER_SHIP; ล้มเหลวยังคง WAITING_PAYMENT
- [ ] ตกลงค่าขนส่ง ค่าตรวจ ค่าคอมมิชชัน สกุลเงิน สูตรยอดรวม และการปัดทศนิยม ห้าม FE กำหนดยอดที่ Server เชื่อ
- [ ] ตกลงฟิลด์ที่อยู่และข้อมูลที่ Seller จำเป็นต้องเห็น; ใบเสร็จจำลองต้องระบุชัดว่าไม่ใช่การชำระจริง
- [ ] ยืนยันการจ่ายล้มเหลวแล้วคงการจอง/ลองใหม่; การเลิกซื้อและปลดจองด้วยผู้ใช้ยังไม่อยู่ในรอบนี้ ถ้าจำเป็นให้เพิ่ม scope ชัดเจนก่อนเริ่ม
- [ ] กำหนด Idempotency-Key: ส่งซ้ำ key เดิม payload เดิมได้ผลเดิม; key เดิม payload ต่างตอบ 409; ลองจ่ายใหม่หลัง failure ใช้ key ใหม่
- [ ] เผยแพร่ตัวอย่าง request/response และ error ของ create/list/detail/pay/receipt พร้อม pagination และข้อมูลส่วนตัวที่แต่ละบทบาทเห็นได้
- [ ] ปรับข้อขัดแย้งเรื่อง timer ในเอกสารให้ตรง prototype และกำหนดวิธีเตรียมสินค้าสมมติใหม่สำหรับ demo ที่ค้างจ่าย

API ที่เสนอเพื่อใช้ตกลง: POST /orders, GET /orders, GET /orders/{id}, POST /orders/{id}/payments/simulate, GET /orders/{id}/receipt
POST /orders รับ product_id และ shipping_address; ไม่รับ buyer_id, seller_id, total จาก client เป็นข้อมูลเชื่อถือได้
POST payment รับ outcome SUCCESS/FAILED และ Idempotency-Key; จำกัดเฉพาะสภาพแวดล้อม demo/test

เสร็จเมื่อ: ทีมมี contract เดียวที่ใช้สร้าง schema, mock และ tests ได้ พร้อมบันทึกการตัดสินใจข้างต้นครบ

## ORDER-01 — [Database] ตารางคำสั่งซื้อ การจ่าย และเงินพัก
เจ้าของหลัก: DB1 | ผู้ช่วย: DB2 | Label: database
รอ: ORDER-00, PRODUCT-01
พื้นที่: backend/app/models/, backend/migrations/versions/, backend/tests/

งานและเงื่อนไขรับงาน:
- [ ] สร้าง Order เชื่อม buyer/seller/product พร้อมราคา ค่าธรรมเนียม ยอดรวม ที่อยู่ snapshot และ timestamps
- [ ] ใช้ Decimal/Numeric สำหรับเงิน ไม่คำนวณด้วย float
- [ ] สร้าง Payment attempt, Escrow และ Receipt ตาม contract; เก็บ failed attempt แยกจาก payment สำเร็จ
- [ ] มี database constraint ให้ payment สำเร็จ, เงินพัก และใบเสร็จสำเร็จไม่ซ้ำต่อ Order และ idempotency key ไม่ซ้ำตาม scope ที่ตกลง
- [ ] ออกแบบข้อบังคับการจองหนึ่งรายการต่อ Product ร่วมกับ BE เช่น reservation ที่ product_id unique พร้อม transaction lock; ห้ามใช้แค่ตรวจ SELECT แล้ว INSERT โดยไม่มีการป้องกัน race
- [ ] มี foreign keys และ indexes สำหรับการอ่านรายการตามเจ้าของ; ถ้าเข้าผ่าน Supabase โดยตรงต้องไม่เปิดทางข้ามสิทธิ์ API
- [ ] Migration ทดสอบบนฐานข้อมูลแยก รวม duplicate constraints และ rollback; ไม่ reset ฐานข้อมูลกลาง

เสร็จเมื่อ: Model/Migration ตรง contract, ทดสอบ constraints ผ่าน และ DB2 ตรวจแผน migration ก่อนผู้ดูแลนำขึ้นฐานข้อมูลกลาง

## ORDER-02 — [Backend] API สร้างคำสั่งซื้อและจองสินค้า
เจ้าของหลัก: BE | Label: backend
รอ: ORDER-00, ORDER-01, API และกติกา Product พร้อมใช้งาน
พื้นที่: backend/app/api/orders.py (เสนอเพิ่ม), backend/app/schemas/, backend/app/services/, backend/app/main.py, backend/tests/

- [ ] ตรวจตัวตนจาก Login และดึง buyer จาก token; ปฏิเสธซื้อสินค้าตนเอง/ไม่พร้อมขาย/soft-deleted
- [ ] ตรวจที่อยู่ตาม contract และคำนวณยอดจากข้อมูล Server พร้อม snapshot
- [ ] สร้าง Order และจอง Product ใน transaction เดียว; exception ต้อง rollback ทั้งคู่
- [ ] ใช้ lock/conditional update ร่วมกับข้อบังคับ DB; ผู้แพ้การจองพร้อมกันได้ 409 พร้อม code ที่ FE แสดงได้
- [ ] รองรับ retry ด้วย Idempotency-Key ตาม ORDER-00 โดยไม่สร้าง Order เพิ่ม
- [ ] มี tests สำหรับ 401, validation, self-purchase, unavailable, rollback, retry และผู้ซื้อสองคนส่งพร้อมกันบน PostgreSQL แยก

เสร็จเมื่อ: สั่งซื้อได้จริงและมีหลักฐานว่าการแข่งขันจองทำให้มีผู้ชนะเพียงหนึ่งคน

## ORDER-03 — [Backend] API จ่ายเงินจำลองและใบเสร็จ
เจ้าของหลัก: BE | Label: backend
รอ: ORDER-02
พื้นที่: backend/app/api/, backend/app/services/, backend/app/schemas/, backend/tests/

- [ ] เฉพาะเจ้าของ Order จ่ายได้ และรับเฉพาะสถานะที่อนุญาต; ปิด endpoint จำลองนอก demo/test
- [ ] FAILED บันทึก attempt แต่ไม่สร้างเงินพัก/ใบเสร็จสำเร็จ ไม่เปลี่ยน Order เป็นจ่ายแล้ว
- [ ] SUCCESS บันทึก Payment, Escrow HELD, Receipt และ Order WAITING_SELLER_SHIP ใน transaction เดียว; ยอดเท่ากับ snapshot
- [ ] คำขอซ้ำ key เดิมได้ผลเดิม; payload ต่างตอบ 409; key ใหม่หลังจ่ายสำเร็จก็ต้องไม่สร้างเงินซ้ำ
- [ ] แข่งกันสองคำขอหรือสำเร็จชนล้มเหลว ต้องไม่ลดสถานะที่จ่ายแล้วกลับเป็นรอจ่าย
- [ ] GET receipt ตรวจสิทธิ์และไม่มีใบเสร็จสำเร็จก่อนจ่าย; ไม่เปิดเผยข้อมูลส่วนตัวเกิน contract
- [ ] ทดสอบ rollback เมื่อเขียนเงินพัก/ใบเสร็จล้มเหลว, retry หลัง timeout และคำขอพร้อมกัน

เสร็จเมื่อ: จำนวนรายการเงินพัก/ใบเสร็จสำเร็จเท่ากับหนึ่งต่อ Order แม้ส่งซ้ำหรือเกิด concurrent requests

## ORDER-07 — [Backend] API รายการและรายละเอียดคำสั่งซื้อตามสิทธิ์
เจ้าของหลัก: BE | Label: backend
รอ: ORDER-00, ORDER-01; ตรวจ integration อีกครั้งหลัง ORDER-03
พื้นที่: backend/app/api/orders.py, backend/app/schemas/, backend/tests/

- [ ] GET /orders คืนรายการที่ผู้เรียกมีสิทธิ์เท่านั้น แบ่งหน้าและเรียงลำดับแน่นอนตาม contract
- [ ] GET /orders/{id} คืนสินค้า/ราคา/สถานะจาก snapshot พร้อมสถานะจ่ายและข้อมูลใบเสร็จเท่าที่มีสิทธิ์
- [ ] ฝั่ง Buyer/Seller เห็นข้อมูลตาม ORDER-00; ไม่เชื่อ buyer_id/seller_id ที่ client ส่งมาเพื่อข้ามสิทธิ์
- [ ] ทดสอบผู้ไม่เกี่ยวข้องเดา id, สลับ role/filter, ไม่มีรายการ, pagination และสินค้าต้นทางถูกแก้ไข

เสร็จเมื่อ: FE ใช้ข้อมูลจริงได้และ tests ยืนยันว่าอ่านข้อมูลผู้อื่นไม่ได้

## ORDER-04 — [Frontend] หน้า Checkout และจ่ายเงินจำลอง
เจ้าของหลัก: FE1 | Label: frontend
รอ: ORDER-00 สำหรับ mock; ORDER-02/03 สำหรับเชื่อมจริง และหน้ารายละเอียดสินค้า Product
พื้นที่: mobile/src/app/, mobile/src/services/, mobile/src/types/ ตาม AGENTS.md ของ mobile

- [ ] เปิด Checkout จากสินค้า กรอก/ตรวจที่อยู่ แสดงราคาและค่าธรรมเนียมตาม contract
- [ ] สร้าง Order แล้วใช้ยอดตอบกลับจาก Server เป็นยอดยืนยันจ่าย
- [ ] แสดงตัวเลือกจำลองสำเร็จ/ล้มเหลวอย่างชัดเจนและ loading ระหว่างส่งคำขอ
- [ ] เก็บ key เดิมสำหรับ retry ของคำขอเดิม; เริ่ม attempt ใหม่หลัง FAILED ด้วย key ใหม่
- [ ] กรณี timeout ตรวจสถานะก่อนให้ลองใหม่ และห้ามแสดงสำเร็จโดยเดาเอง
- [ ] รองรับสินค้าถูกจองไปแล้ว, session หมดอายุ, validation และจ่ายล้มเหลว
- [ ] สำเร็จเปิดรายละเอียด Order/ใบเสร็จ; กด Back แล้วกลับมาไม่สร้าง Order ซ้ำโดยอัตโนมัติ

เสร็จเมื่อ: มือถือทำ flow จริงครบทั้งสำเร็จ/ล้มเหลว/ลองใหม่และกดซ้ำ พร้อมหลักฐาน QA2; mock อย่างเดียวไม่ปิดงานนี้

## ORDER-05 — [Frontend] หน้าคำสั่งซื้อและรายละเอียด
เจ้าของหลัก: FE2 | Label: frontend
รอ: ORDER-00 สำหรับ mock; ORDER-07 และ ORDER-03 สำหรับเชื่อมจริง
พื้นที่: mobile/src/app/, mobile/src/services/, mobile/src/types/ ตาม AGENTS.md ของ mobile

- [ ] แสดงรายการ Buyer/Seller ตามสิทธิ์ พร้อม empty/loading/error และการโหลดหน้าถัดไปตาม contract
- [ ] รายละเอียดแสดง snapshot ยอดและสถานะด้วยข้อความไทย ไม่คำนวณสถานะจากหน้าจอเอง
- [ ] มี Refresh; Order รอจ่ายกลับไปจ่ายได้; Order จ่ายแล้วไม่มีปุ่มจ่ายซ้ำ
- [ ] แสดงใบเสร็จจำลองเฉพาะที่มีสิทธิ์ ไม่แสดงที่อยู่ในรายการรวมโดยไม่จำเป็น
- [ ] Logout/สลับบัญชีล้างข้อมูลเดิม และจัดการ Order ที่ไม่มีสิทธิ์/ไม่พบ

เสร็จเมื่อ: ผู้ซื้อและผู้ขายเห็นสถานะจริงหลัง refresh และไม่เห็นข้อมูลค้างของบัญชีก่อนหน้า

## ORDER-06 — [QA] ทดสอบซื้อและจ่ายซ้ำครบเส้นทาง
เจ้าของหลัก: QA1 | ผู้ช่วย: QA2 ทดสอบมือถือ, DB2 เตรียมข้อมูล | Label: qa
รอ: ORDER-00 สำหรับเตรียม cases; ORDER-01/02/03/07/04/05 สำหรับตรวจปิด Feature

- [ ] เตรียมบัญชีสมมติ Buyer A/B, Seller เจ้าของ/อื่น และสินค้าพร้อมขาย/ถูกจอง/ถูกลบ; ห้ามใส่ secret หรือข้อมูลจริงในหลักฐาน
- [ ] Happy path: Order WAITING_PAYMENT → SUCCESS → WAITING_SELLER_SHIP, Escrow HELD และใบเสร็จหนึ่งใบ
- [ ] Failure → retry SUCCESS; failed attempt ไม่สร้างเงินพัก และยอดไม่เปลี่ยนจาก snapshot
- [ ] ยิง create พร้อมกันจาก Buyer A/B ยืนยันหนึ่งผู้ชนะและไม่มี Order/จองค้างจาก rollback
- [ ] ทดสอบจ่ายซ้ำทั้ง key เดิม/key ใหม่/พร้อมกัน/timeout และยืนยันจำนวนรายการจาก DB ไม่ใช่ดู UI อย่างเดียว
- [ ] ทดสอบแก้ยอดจาก client, ซื้อของตัวเอง, สถานะสินค้าไม่อนุญาต, ไม่ login และเดา Order/Receipt ผู้อื่น
- [ ] ทดสอบมือถือกดซ้ำ, Back, เปิดแอปใหม่, refresh และสลับบัญชี
- [ ] บันทึก environment, commit/build, expected/actual และหลักฐานที่ปิดข้อมูลส่วนตัว; เปิด bug พร้อมวิธีทำซ้ำ

เสร็จเมื่อ: cases สำคัญผ่าน ไม่มี bug ที่ทำให้เงิน/การจองซ้ำหรือข้อมูลรั่ว และ Lead ตรวจ demo แล้ว

## ลำดับทำงาน

1. Lead ปิด ORDER-00; FE1/FE2 เตรียม mock และ QA เตรียม cases หลัง contract ชัดเจน
2. DB1 ทำ ORDER-01 โดย DB2 ตรวจ constraints และเตรียมข้อมูล
3. BE ทำ ORDER-02 → ORDER-03 → ORDER-07 ทีละงานตามกำลังทีม (ORDER-07 เริ่มหลัง schema ได้ถ้าปรับลำดับร่วมกัน)
4. FE1 เชื่อม ORDER-04; FE2 เชื่อม ORDER-05 เมื่อ API ที่ต้องใช้พร้อม
5. QA ทดสอบส่วนที่พร้อมระหว่างทาง แล้วปิด ORDER-06 และ Feature หลัง integration

กติกา: หนึ่ง issue มีเจ้าของหลักหนึ่งคน; งานแก้โค้ดหนึ่ง issue → หนึ่ง branch → หนึ่ง PR; งานประชุมและ QA ไม่บังคับ PR เริ่มงานอ่าน AGENTS.md ที่เกี่ยวข้อง และไม่ถือว่างานเสร็จเพียงเพราะมี mock

หมายเหตุการเผยแพร่: สร้าง Feature หลักและ ORDER-00 ถึง ORDER-07 บน GitHub แล้วเมื่อ 18 กันยายน 2026 ผ่านบัญชี `naithammarak` รหัส ORDER เป็นรหัสแผน ส่วนเลข GitHub Issue แสดงในรายการด้านบน
