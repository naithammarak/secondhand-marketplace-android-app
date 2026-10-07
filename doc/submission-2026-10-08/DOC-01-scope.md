# DOC-01 — ขอบเขตส่ง 8 ตุลาคม 2026

> **Backend candidate 2 ต.ค.:** R1–R4 ใช้ `EXTERNAL_V2` สำหรับ Order ใหม่และคง `LEGACY_V1` สำหรับข้อมูลเดิม ดู [API mapping](reports/EXTERNAL-SHIPPING-API-MAPPING.md) และ [รายงาน R1](reports/EXTERNAL-SHIPPING-R1.md) ผล local PostgreSQL ไม่ใช่ independent PASS, E UI, shared rollout หรือ Android acceptance

วันที่ตัดสินใจ: 1 ตุลาคม 2026 · ผู้อนุญาต: เจ้าของโครงการใน session นี้ · สถานะ: **Lead scope selected**; ยังไม่มีหลักฐานอาจารย์อนุมัติฉบับใหม่

## 1. สิ่งที่ต้องส่ง

1. เปิดแอปดู/ค้นหาสินค้าและรายละเอียดได้ทันทีแบบ guest; Google login เมื่อซื้อ/ทำงานที่ต้องมีสิทธิ์ ผู้สมัครใหม่เป็น BUYER
2. Profile แสดงข้อมูล backend; แก้ชื่อได้; ขอเปิดร้านผ่าน verification ใน profile; approved SELLER ยังซื้อสินค้าได้
3. Seller verification, public catalog, listing แบบราคาปกติ, edit/cancel ตามสถานะและสิทธิ์เดิม
4. สร้าง Order, จองสินค้ากันซื้อซ้ำ, simulated payment ที่บันทึก Payment/Receipt/Escrow จริง; อ่าน/ยกเลิก/หมดเวลา unpaid
5. ส่งไปศูนย์ตรวจ, Inspector รับ/ตรวจ/บันทึกหลักฐานและผล, certificate/QR สาธารณะ, Buyer ตัดสินผลตรวจตามกฎ
6. ส่งถึง Buyer → ยืนยันรับหรือ auto receipt ที่มีเงื่อนไข → RELEASE และ payout จำลองที่บันทึกครั้งเดียว
7. ส่งคืน Seller → ผู้รับยืนยันรับคืนจริง; Buyer ปฏิเสธ/หมดเวลาผลตรวจคืนเฉพาะค่าสินค้า กรณีอื่นคง policy เดิม; no-ship refund; non-receipt report หยุด AUTO และ Admin resolve แบบมี audit
8. Worker unpaid expiry / receipt settlement / no-ship refund / return retry / inspection overdue escalation / Buyer result timeout ทำงานโดยไม่มี HTTP traffic
9. รีวิวผู้ขาย 1–5 ดาว + ข้อความไม่บังคับจาก Order ของผู้รีวิวที่ `COMPLETED` แล้ว; อ่าน aggregate/list จริงจาก backend
10. Admin เฉพาะ seller verification, assignment ที่จำเป็น, scoped delivery/return exceptions, certificate revocation และเหตุการณ์ขนส่งจำลองที่มี audit
11. HTTPS runtime ใช้จาก Android ได้, private Storage, QR เปิดอีกเครื่องไม่ต้อง login, APK, test report, aligned docs, คู่มือ, demo/slides/backup recording

## 2. ขอบเขตที่ลด/เลื่อน

| เรื่อง | ขอบเขตฉบับส่ง |
|---|---|
| Profile FR-03 | แก้ `full_name` เท่านั้น; email จาก Google, role/status อ่านอย่างเดียว; ไม่มีรหัสผ่านในแอป, avatar upload, address book หรือ account self-delete |
| Privacy NFR-05 | Policy ภาษาไทยอ่านได้ + บันทึก acknowledgement version/time; อธิบายข้อมูล/การเข้าถึง/การติดต่อผู้ดูแลเดโมตามจริง; ไม่อ้าง compliance certification; self-service export/delete และ optional photo reuse consent เลื่อน |
| Search/filter FR-08 | Search + category/filter ที่ API release มีและใช้จริง; brand/price/size/condition ขั้นสูงไม่บังคับส่ง ห้ามมี filter ที่เลือกแล้วไม่มีผล |
| Product detail FR-09 | ข้อมูลสินค้า + review score ผู้ขายจาก reviews จริง; ไม่มี trustScore แยกหรือรีวิวสินค้าคนละคะแนน |
| Reviews FR-37 | หนึ่ง seller rating ต่อ completed Order; comment อธิบายสินค้า/การซื้อได้; ไม่มี photo, tags, แก้/ลบรีวิว, seller replies หรือหลาย score |
| Inspection reviews FR-38 | เลื่อนทั้ง feature; ไม่แสดงช่องให้กรอกคะแนนผู้ตรวจที่ไม่ถูกบันทึก |
| Notifications FR-18 / FR-33 | FR-18 เห็นผลตรวจจากหน้าที่โหลด API/refresh; FR-33 push/inbox/email เลื่อน ไม่เรียก refresh ว่า push notification |
| Admin FR-41 | คง seller application approval + existing permission/status guards; UI จัดการผู้ใช้ทั่วระบบ/ระงับ-คืนสถานะ/ค้นบัญชี/automatic refund on suspension เลื่อน |
| Payment/transport/payout | จำลองผู้ให้บริการ แต่สถานะ, เงิน, receipt, proof และ settlement บันทึกใน DB จริง; ไม่ใช่ real PromptPay/bank transfer/carrier tracking |
| External shipping | Seller เลือกบริการ/เลขพัสดุเมื่อส่งเข้าศูนย์; Inspector บันทึกเลขพัสดุเมื่อส่งออก; ผู้รับยืนยันรับ; ไม่ออกแบบ Courier workspace ใหม่และไม่บังคับรูปจากบริษัทภายนอก |
| Wallet/withdrawals | เลื่อน; seller เห็น settlement payout ที่บันทึกไว้เท่านั้น |
| Other | Auction, chat/chatbot, wishlist, analytics dashboard, general dispute/appeal/report seller, post-completion returns, extra return fees และ auto relisting เลื่อน |

การลด scope เป็นการตัดสินใจของเจ้าของโครงการ ยังต้องส่ง revision ให้อาจารย์รับทราบก่อนอ้างว่าเป็น scope ที่รับรองแล้ว โดยเฉพาะ FR-33, FR-37/38 และ FR-41 ที่เอกสารเดิมระบุไว้

## 3. กฎเดียวกันทั้ง code / UI / diagrams / SRS

| เรื่อง | กฎที่เลือก |
|---|---|
| Role | Google login ใหม่เป็น BUYER; SELLER หลังอนุมัติ verification; SELLER ซื้อได้; ADMIN/INSPECTOR จัดให้โดยเจ้าหน้าที่ ไม่เลือกสิทธิ์จาก client; COURIER/ข้อมูลเก่าคงไว้ย้อนหลังแต่ไม่เป็น workspace ใน flow ใหม่ |
| Certificate | ออก atomic พร้อม final inspection `PASS`/`MINOR_ISSUE` ก่อน Buyer decision; `FAKE`/`NOT_AS_DESCRIBED` ไม่ออก และไม่ให้ CONFIRM; Admin revoke ไม่ย้อน settlement หรือเปลี่ยนผลตรวจ |
| Buyer decision | CONFIRM/REJECT ก่อนผลพร้อม +72h แยกจาก physical receipt; เมื่อไม่ตอบทันเวลาระบบบันทึก timeout→return ไม่ปลอม Buyer decision และไม่มี auto-CONFIRM |
| Timers | unpaid: persisted `created_at + 30 นาที`; no-ship: `paid_at + 72h`; receipt: trusted TO_BUYER event +72h ใน policy ใหม่ ไม่ใช่กรอก tracking; result decision: final availability +72h; inspection: 3 working days หลัง center receive เพื่อ escalation เท่านั้น; legacy timer ใช้ policy เดิม |
| Receipt/report deadline | หลังได้ Order lock และ revalidate I/O ให้อ่าน DB wall clock ใหม่ก่อน guarded mutation; ก่อน deadline ทำได้, ที่/หลัง deadline คืน 409 แม้ request มาถึงก่อนแต่รอ lock; same-key successful replay อ่านได้หลัง deadline |
| Missing delivery | Timely report ทำให้ `DELIVERY_DISPUTED` + HELD และกัน AUTO; Admin ดูหลักฐานแบบ scoped/audited แล้ว RELEASE/REFUND ได้ครั้งเดียว |
| Return address | validated seller-owned snapshot ก่อน ship-to-center; immutable ต่อ Order; ห้ามใช้ address ที่ client/Courier เปลี่ยนเองภายหลัง |
| Settlement | unique per Order/Escrow: RELEASE หรือ REFUND เท่านั้น; payment/receipt charge เดิม immutable; money Decimal และ snapshots; ไม่ทำ ledger/wallet ซ้ำ |
| Refund | New-policy Buyer reject/result timeout คืน item snapshot หลังรับคืนจริง, retain inspection/shipping ครั้งเดียว, payout/commission=0; negative/no-ship/Admin non-receipt และ legacy คง full policy เดิม; Product CANCELLED ไม่ auto relist |
| Fees | ตัวอย่างราคา 1,200 + shipping 50 + inspection 100 = held 1,350; commission 5% item = 60, seller payout 1,140; ใช้ snapshot จริง ไม่ hardcodeคำนวณใหม่บน client |
| Delivery evidence | New flow ใช้ผู้รับยืนยัน + trusted shipping event พร้อม source/audit; รูปขนส่งไม่บังคับ; legacy Courier/proof constraints และข้อมูลคงไว้; private inspection/identity/proof ยังตรวจสิทธิ์และไม่เผย keys/PII |
| Scheduler | recurring runner เป้าหมายทุก 5 นาที; ถ้า outage/Storage ใช้ไม่ได้ยัง HELD และ retry; completion คือ successful eligible scan ไม่สัญญาว่าเปลี่ยนสถานะตรงวินาทีครบ 72h |
| Image | Product สูงสุด 10 รูป, จำกัด 5 MiB/รูปตาม server contract; ไม่อ้างว่าทุกรูป auto-compress ถ้ายังไม่ได้พิสูจน์ |
| UI truth | แสดงชื่อ/คะแนน/จำนวนรีวิว/สถานะ/เงินจาก API จริง; empty state เมื่อไม่มีข้อมูล; simulation label ชัด; errors/retry ไม่แสดง success ก่อน commit |

Inspection working days ฉบับเดโม: เลื่อนไป 3 วันที่เป็นจันทร์–ศุกร์ตาม Asia/Bangkok โดยคงเวลาท้องถิ่นเดิม ไม่นับเสาร์–อาทิตย์ ไม่มี holiday calendar (เช่น รับศุกร์ 2 ต.ค. 10:00 → targetพุธ 7 ต.ค. 10:00); เป็น operational escalation target ไม่ใช่สัญญาบริการจริง เวลาเก็บใน DB เป็น UTC

## 4. ความหมายของ DONE

- DONE implementation = มี code + focused tests บน upstream/revision ที่ส่งมอบ; ไม่เท่ากับ full release acceptance
- DONE submission = core gates ใน [QA matrix](QA-MATRIX.md) ผ่าน, Android installed และ manifest ชี้หลักฐานของ release เดียวกัน
- ห้ามปิด issue ที่ยังต้องใช้ shared Auth/Storage/QR/device จาก mock/unit/browser smoke เพียงอย่างเดียว
- ถ้าอาจารย์ไม่รับ scope ใหม่ ให้แสดง requirement ที่ต่างพร้อม effort/ผลกระทบ แล้วกลับมาปรับ plan; อย่าแก้หลักฐานว่าความต้องการเดิมผ่านแล้ว
