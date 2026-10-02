# แบ่งงานให้เพื่อนใช้ Codex — 6 ชุด

Current R1–R4 candidate: [PR130](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/130), parent reviewed PR129. Read [amendment scope](../coordination/AB-AMENDMENT-SCOPE.md) and [current API mapping](../reports/EXTERNAL-SHIPPING-API-MAPPING.md) before historical sequencing. Accepted C/D is already composed in that source; do not re-create old migration branches. New-policy independent/E/shared/native acceptance remains separate.

เป้าหมายเดิม: Android prototype ส่ง 8 ตุลาคม 2026 สองเส้นทางขายสำเร็จ/คืนเงิน พร้อม profile และ reviews แบบพื้นฐาน เอกสารนี้จัดผู้รับงานจาก tasks เดิม ไม่ใช่หลักฐานว่า implementation เสร็จแล้ว

## มอบหมายงาน

| ชุด / prompt | ส่งให้ใคร | Tasks เดิม | ผลที่ต้องส่ง |
|---|---|---|---|
| [A ฐานโค้ดและ DB](A-base-and-schema.md) | Lead / Codex ฝั่งเจ้าของโครงการ | 01 → 02 | ฐานโค้ดเดียว, payment จำลองที่บันทึกได้, migration, API mapping |
| [B ส่งสินค้าและ settlement](B-backend-delivery-settlement.md) | เพื่อน 1 / backend | 03 → 04 → 05 | ส่งถึง Buyer/คืน Seller, RELEASE/REFUND จำลอง, jobs |
| [C Profile และ reviews](C-profile-reviews.md) | เพื่อน 2 / full stack | 07 → 08 | แก้ชื่อ/บันทึก acknowledgement, รีวิวผู้ขายจาก Order ที่ขายสำเร็จ |
| [D เพิกถอนใบรับรอง](D-certificate-revocation.md) | เพื่อน 3 / full stack; หรือเพื่อน 2 ช่วงรอ 04 | 09 | Admin revoke ผ่าน API/UI, public QR แสดง REVOKED |
| [E ต่อ frontend](E-frontend-integration.md) | frontend session ที่กำลังทำอยู่ | 06 | ทุก role ใช้งานสองเส้นทางผ่าน API ใน UI ล่าสุด |
| [F Build, QA และส่งงาน](F-release-android-presentation.md) | Lead / Codex ฝั่งเจ้าของโครงการ + ผู้ถือโทรศัพท์ | 10 → 12 → 11 → 13 | runtime, APK, ผลทดสอบเครื่องจริง, คู่มือและ presentation |

งาน 00 DOC-01 เป็นเอกสารที่เตรียมแล้ว ไม่ต้องแจกทำซ้ำ ถ้ามีเพื่อน 2 คน ให้คนแรกทำ B คนที่สองทำ C+D; ชุด A/F ใช้ Codex ฝั่งเจ้าของโครงการ และ E ใช้ frontend session เดิม

## เริ่มได้เมื่อไร

1. **A/01** ส่งฐานโค้ดล่าสุดที่ทำซ้ำได้ก่อน ห้ามให้เพื่อนเริ่มจาก `main` คนละชุด
2. หลัง A/01: D เริ่มได้; E เตรียมหน้าจอ/fixtures; F เตรียม environment และโครงเอกสารได้
3. **A/02** ส่ง schema commit และ [API mapping ที่จะส่งมอบ](../tasks/02-FINISH-01-schema.md) ก่อน B ลงมือกับ final states; C ลงมือ profile บน migration นี้
4. **B/03 → B/04 → B/05** ทำต่อกันในเจ้าของ backend คนเดียว ใช้ service settlement เดียว
5. **C/07** ทำได้พร้อม B; **C/08** ต้องใช้ B/04 ที่ผ่านแล้วและ migration หลัง 07 จึงจะทดสอบ COMPLETED/RELEASED จริงได้
6. E ต่อ API เมื่อ B/03+04 ส่งมอบแล้ว; A กลับมารวม B/C/D/E และโค้ด runtime ที่เกี่ยวข้องก่อน freeze candidate
7. F ทำ runtime 10 → APK candidate 12 → QA Q01–Q26 ใน 11 → handover/Q27–Q28 ใน 13 หากพบ defect ให้แก้และ rebuild แล้วตรวจส่วนที่ได้รับผลกระทบ

ลำดับ migration คือ **02 → 07 → 08** เสมอ กราฟละเอียดใช้ [task dependency manifest เดิม](../manifests/tasks.json) ชุดงานมีหลายช่วง จึงไม่ใช่ให้ทุกชุดทำพร้อมกันจนจบโดยไม่รับ upstream

## ส่งอะไรให้เพื่อน

หลังรับ source ใช้ [คู่มือติดตั้งสำหรับเพื่อน](../FRIEND-SETUP.md) ก่อนเริ่ม implementation

- **source code ล่าสุดทั้ง working tree** หรือฐาน commit ที่ A ส่งมอบ; ZIP เอกสารอย่างเดียวไม่มีโค้ดแอป
- โฟลเดอร์ `doc/submission-2026-10-08` ทั้งชุด รวม references, contracts, tasks และ work-packages
- ชื่อชุด B/C/D ที่รับผิดชอบและ upstream commit/patch ตามจุดเริ่มด้านบน
- ให้เปิด Codex ใน repository แล้วคัดลอกหัวข้อ **Prompt สำหรับ Codex** จากไฟล์ชุดนั้น ไม่ต้องพิมพ์ context ใหม่

เมื่อย้ายเครื่อง path ของ repo เปลี่ยนได้ แต่ต้องคง packet path หรือแจ้ง Codex ว่า packet อยู่ที่ไหน ให้แต่ละคนใช้ checkout/branch ของตนจากฐานเดียวกัน หาก UI ยังมีการแก้พร้อมกันให้ใช้ worktree แยกและส่ง commit/patch กลับให้ A

## Ownership และกติกาการรวม

- A เป็นผู้รวมโค้ดและดูแล migration chain; B ดูแล final delivery/order/settlement/jobs; C ดูแล profile/review API และ UI ของตน; D ดูแล revoke; E ดูแลหน้าจอ fulfillment/navigation
- C/E อาจแตะ profile-screen และ D/E อาจแตะ Admin entry: ใช้ theme ล่าสุด แยก commit เฉพาะงาน และให้ A รวมตามลำดับ ห้ามเขียนไฟล์เดียวกันพร้อมกันใน checkout เดียว
- B ส่ง concrete routes/action flags/settlement read model ให้ E; C/D ส่ง service exports และหน้าจอของตนให้ E/A เพื่อรวม entry/navigation
- `Payment gateway`, payout และ refund จำลองการเคลื่อนเงิน; backend บันทึก Payment/Receipt/Escrow/settlement จริงใน DB ยอดใน DB คือยอดจำลอง ไม่ใช่เงินจริงและไม่เพิ่ม wallet
- กฎข้อกำหนดใช้ [DOC-01](../DOC-01-scope.md), [release gates](../FINISH-00-release-gates.md) และ task prompt เดิมเป็นหลัก ทุกชุดอ่าน code ปัจจุบันก่อนลงมือ

## ส่งกลับเมื่อเสร็จแต่ละ task

1. source commit หรือ patch ที่ทำซ้ำได้ พร้อม upstream/head SHA
2. รายงาน `reports/<task-id>-...md` ตาม [TASK-REPORT](../templates/TASK-REPORT.md), คำสั่ง/ผล checks และ API examples ที่เกี่ยวข้อง
3. migration revision ถ้ามี, interface ที่ชุดอื่นต้องใช้ และขั้นตอนรับงานต่อ
4. แยกผล isolated tests ออกจาก Android/Google/Storage/QR จริง; สิ่งที่ยังขาดระบุ PENDING พร้อมเหตุผล อย่าแสดง mock success ว่าเชื่อมระบบแล้ว

ถ้า upstream ยังไม่มี ให้ตรวจ code/เตรียม fixtures/tests/interface ที่ทำได้ก่อน ระบุ dependency ที่ขาดให้ชัด แล้วรับ upstream มารวมและทดสอบต่อ ห้ามสร้าง Payment/Shipment/settlement อีกชุดเพื่อเลี่ยง dependency

[Manifest ของชุดงาน](../manifests/work-packages.json) · [README ของแพ็กเดิม](../README.md)
