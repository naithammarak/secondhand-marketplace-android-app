# งานส่ง Android prototype — 8 ตุลาคม 2026

**เป้าหมาย:** APK ติดตั้งบน Android จริงได้ และสาธิตการขายสำเร็จ/คืนเงินได้ครบ พร้อม profile และ reviews แบบพื้นฐาน

เจ้าของโครงการอนุญาตให้ Lead ตัดสินใจ scope เมื่อ 1 ตุลาคม 2026 เป้าหมายคือวันพฤหัสที่ **8 ตุลาคม 2026 (Asia/Bangkok)** เอกสารนี้เป็นแผนและสัญญาส่งงาน ยังไม่ใช่หลักฐานว่าแอปเสร็จหรืออาจารย์ยอมรับ scope ใหม่แล้ว

## ให้เพื่อนเริ่มอย่างไร

1. ให้เพื่อนใช้ **โค้ดล่าสุดทั้ง working tree** ของ `secondhand-marketplace-android-app` หรือ release base ที่งาน 01 ส่งมอบ พร้อมโฟลเดอร์เอกสารนี้ การ clone `main` อย่างเดียวไม่มี UI/INSPECT/CERT ล่าสุด
2. เปิด Codex ใน root ของ repository แล้วคัดลอกข้อความในหัวข้อ **Prompt สำหรับ Codex** ของ task ที่มอบหมาย
3. ทุก prompt อ่านเอกสารร่วมในแพ็กนี้เอง ไม่ต้องพิมพ์ประวัติโครงการซ้ำ ถ้าแตก ZIP ไว้นอก repo ให้ระบุที่ตั้งแพ็กเพิ่มหนึ่งบรรทัด
4. ส่งผลเป็นโค้ด + tests + รายงานตาม [TASK-REPORT](templates/TASK-REPORT.md) โดยอ้าง SHA และ upstream SHA จริง

แพ็กนี้ไม่มี `.env`, credentials, ข้อมูลผู้ใช้จริง หรือ source code ของแอป เพื่อนต้องได้รับ repo ล่าสุดแยกจากแพ็กเอกสาร ใช้ credentials ผ่านช่องทางส่วนตัว

## เอกสารที่ถือเป็นข้อกำหนด

| อ่าน | ใช้ตัดสินใจ |
|---|---|
| [DOC-01 scope](DOC-01-scope.md) | สิ่งที่ต้องส่ง/สิ่งที่เลื่อน และกฎที่แทน SRS เดิม |
| [Release design](RELEASE-DESIGN.md) | UX, roles, ข้อความและ flow ที่ใช้จริง |
| [Profile/reviews API](PROFILE-REVIEWS-contract.md) | สัญญาใหม่ก่อน implementation |
| [FINISH release gates](FINISH-00-release-gates.md) | ฐานโค้ด, schema, API ownership และสิ่งที่ยังไม่ผ่าน |
| [FINISH specification](references/FINISH-spec.md) | รายละเอียด transaction, proof, settlement, errors, timers |
| [QA matrix](QA-MATRIX.md) | หลักฐานที่ใช้ตัดสินว่าพร้อมส่ง |
| [SRS submission](SRS-SUBMISSION.md) | SRS ฉบับส่ง แยกจาก PDF เดิมที่มีข้อกำหนดเก่า |
| [Lead report](LEAD-WORK-REPORT.md) | งานที่ Lead ทำแล้วและงานที่ยังต้องรอ implementation |

ลำดับเมื่อข้อความขัดกัน: `DOC-01` → `PROFILE-REVIEWS-contract` / `RELEASE-DESIGN` → `references/FINISH-spec.md` → สัญญา INSPECT/CERT ที่เกี่ยวข้อง แพ็ก references เก็บ snapshot ประวัติไว้ด้วย ส่วน baseline/gate ที่เก่าใน references ให้ใช้ `FINISH-00-release-gates.md` แทน ห้ามอ่าน UI checklist ที่ติ๊กแล้วว่า API ถูก implement แล้ว

[รวม prompt ทุกงานในไฟล์เดียว](PROMPTS.md) · [ตาราง traceability FR/NFR](requirements.csv) · [ดู diagrams](diagrams/README.md)

**แบ่งให้เพื่อนทำเป็นชุด:** [6 work packages พร้อม prompt และลำดับส่งต่อ](work-packages/README.md) ใช้ task IDs และข้อกำหนดเดิม ไม่เพิ่มขอบเขตงาน

**หลัง clone:** [รายการติดตั้งและคำสั่ง setup สำหรับเพื่อน](FRIEND-SETUP.md) รวม dependencies, configuration, DB และคำสั่งเปิด server

## Tasks พร้อม prompt

| ID / ไฟล์ | งาน | ผู้รับงานแนะนำ | ต้องรอ | สถานะ ณ 1 ต.ค. |
|---|---|---|---|---|
| [00 DOC-01](tasks/00-DOC-01-lead.md) | Scope, สัญญา, diagrams, task pack | Lead / ทำใน session นี้ | — | เอกสารพร้อม; รับรองจากอาจารย์ยังไม่มี |
| [01 INT-01](tasks/01-INT-01-release-base.md) | รวมฐาน release และ UI ล่าสุด | Codex integration | 00 | ยังต้องทำ |
| [02 FINISH-01](tasks/02-FINISH-01-schema.md) | Schema, return address, migration | Codex backend/DB | 01 | ยังต้องทำ |
| [03 FINISH-02](tasks/03-FINISH-02-delivery.md) | ส่งถึง Buyer / ส่งคืน Seller + Courier proof | Codex backend | 02 | ยังต้องทำ |
| [04 FINISH-03/04](tasks/04-FINISH-03-04-settlement.md) | RELEASE/REFUND service + receipt/report/Admin | Codex backend | 02; ต่อ 03 เพื่อพิสูจน์ return | ยังต้องทำ |
| [05 TIMER-01](tasks/05-TIMER-01-jobs.md) | งานอัตโนมัติและ recovery | Codex backend | 03, 04 | unpaid code มีบางส่วน; runner/paid jobs ยังไม่ครบ |
| [06 FINISH-05](tasks/06-FINISH-05-ui.md) | UI Buyer/Seller/Inspector/Courier/Admin | Codex frontend | เตรียม fixtures ได้; ต่อ API หลัง 03, 04 | ยังต้องทำ |
| [07 PROFILE-01](tasks/07-PROFILE-01.md) | Profile + policy acknowledgement | Codex full stack | 01; ต่อ migration หลัง 02 | UI เดิมมีบางส่วน; persistence ยังต้องทำ |
| [08 REVIEW-01](tasks/08-REVIEW-01.md) | รีวิวผู้ขายจาก completed order | Codex full stack | 02, 04; ต่อ migration หลัง 07 | UI mock มี; persistence ยังต้องทำ |
| [09 CERT-REVOKE-01](tasks/09-CERT-REVOKE-01-revocation.md) | Admin revoke + public revoked view | Codex full stack | 01 | Read/schema มี; write/UI ยังต้องทำ |
| [10 ENV-01](tasks/10-ENV-01-runtime.md) | HTTPS API/Auth/Storage/worker | Codex runtime | เตรียมได้; deploy หลังรวม candidate | ยังต้องตรวจ environment จริง |
| [11 QA-01](tasks/11-QA-01-release.md) | สอง business journeys + acceptance จริง | Codex QA + เจ้าของเครื่อง | 01–10; Android final ใช้ 12 | ยังไม่ผ่าน final |
| [12 APK-01](tasks/12-APK-01-android.md) | Build APK, ติดตั้งจริง, reproducibility | Codex build + เจ้าของเครื่อง | 01–10 feature candidate | ยังไม่มี APK ที่ยืนยันในแพ็กนี้ |
| [13 HANDOVER-01](tasks/13-HANDOVER-01-demo-presentation.md) | Demo data, คู่มือ, final docs, slides/recording | Codex docs/demo + ผู้นำเสนอ | เตรียมได้; final หลัง 11, 12 | โครงพรีเซนต์และ matrix ทำแล้ว; final evidence รอ |

เป็น **14 task files รวมงาน 00 ที่ทำแล้ว** ตัวเลขนี้เป็น ID ภายในแพ็ก ไม่ใช่คำกล่าวว่าได้สร้าง GitHub issues ใหม่ งาน 02–06 แมป FINISH/COURIER เดิม; งาน 05 ใช้ TIMER เดิม ถ้ามี issue เดิมให้ใช้ issue เดิมและอย่าปิดจาก unit tests อย่างเดียว

## ลำดับและเวลาที่ตั้งเป้า

| วันที่ (Bangkok) | เป้าหมาย |
|---|---|
| พฤ. 1 ต.ค. | DOC-01 พร้อม, เลือก release base, จอง schema/API ownership, เตรียม runtime และ QA |
| ศ. 2 ต.ค. | รวมฐานโค้ด + migration; เริ่ม delivery/settlement, profile |
| ส. 3 – อา. 4 ต.ค. | Delivery + settlement ทั้งสองทาง; UI ต่อ APIs; reviews/revoke |
| จ. 5 ต.ค. | Worker/recovery, integration smoke บน environment จริง, APK รอบแรก |
| อ. 6 ต.ค. **18:00** | Feature freeze: แก้เฉพาะ blocker; รวม SHA ของทั้งระบบ |
| พ. 7 ต.ค. | Android จริงสอง journeys, QR อีกเครื่อง, final APK, หลักฐาน/เอกสาร/ซ้อม/วิดีโอสำรอง |
| พฤ. 8 ต.ค. | ส่งชุด release ที่ผ่าน gates และพรีเซนต์ |

นี่เป็นกำหนดเป้าหมาย ไม่ใช่การรับประกันว่าเวลาพอ ถ้าการส่ง/คืนเงิน/Android ยังไม่ผ่านวันที่ 6 ให้รายงาน blocker และผลกระทบทันที การตัด feature เสริมช่วยลดงานได้ แต่ไม่ทำให้ business journey ที่ยังขาดกลายเป็นเสร็จ

## ลดงานชนกัน

- ให้ integration owner งาน 01 เลือก parent SHA ก่อน branch งานต่อ ห้ามแต่ละ session เริ่มจาก `main` ต่างชุด
- งาน 02 → 07 → 08 เป็นลำดับ migration เดียว ตรวจ `alembic heads` ให้เหลือหนึ่ง head ก่อนส่งต่อ ไม่มีการ reset/stamp shared DB
- Backend hotspots `models/order.py`, `api/orders.py`, `api/inspections.py`, `main.py` ต้องมีผู้รวมคนเดียว: งาน 03 และ 04 แยก service modules แล้วรวมตามลำดับ; job งาน 05 เรียก service เดียวกัน
- Frontend ที่กำลังปรับ visual อยู่ต้องส่ง latest diff ให้ integration owner ก่อนรวม งาน 06/07/08/09 ใช้ UI ล่าสุดและแก้เฉพาะ flow ของงานตน
- จะทำคนเดียวก็ทำตามลำดับ dependencies ได้ ไม่จำเป็นต้องเปิดหลาย session

ลำดับท้าย release: รวม features → งาน10 runtime → งาน12สร้าง APK candidate → งาน11ตรวจ Q01–Q26 → งาน13ทำ handover/ตรวจ Q27–Q28 → ตัดสิน READY ทั้งชุด ถ้า QA พบ defect ให้แก้/rebuild และตรวจเฉพาะกรณีที่ได้รับผลกระทบก่อน freeze ใหม่ [Dependency manifest](manifests/tasks.json) ใช้ลำดับนี้ จึงไม่มีวงรอ APK/QA/slides กันเอง

## เกณฑ์พร้อมส่ง

พร้อมส่งเมื่อ [QA-MATRIX](QA-MATRIX.md) รายการบังคับผ่านบน **release เดียวกัน** และ [release manifest](templates/RELEASE-MANIFEST.json) มี API SHA, app SHA, migration head, APK hash, environment, test evidence จริงครบ Payment/payout/shipping ยังเป็นการจำลองที่บันทึกจริงใน backend ต้องบอกตรงกันใน UI และพรีเซนต์

Codex ทำโค้ด, tests, migration rehearsal ในฐานแยก, runbooks, build, docs และเตรียมหลักฐานได้ งานที่ต้องใช้คนจริงคือ Google account/สิทธิ์บริการที่ยังไม่ตั้งไว้, แตะอนุญาต/ติดตั้งบนโทรศัพท์ที่เครื่องมือเข้าไม่ถึง, รับทราบ scope กับอาจารย์ และพรีเซนต์/ซ้อมจริง อย่าปักผล PASS ให้ขั้นตอนเหล่านี้ล่วงหน้า
