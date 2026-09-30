# L2 — FINISH-00 readiness และ tasks รอบถัดไป

เจ้าของ: คุณ/Lead; อ้างอิง Issue #98 เริ่มวิเคราะห์/เอกสารคู่กับ F1/F2 ได้ ส่วน G0/G1 ต้องสรุปซ้ำที่ L1 candidate ก่อนเริ่ม dependent implementation

## Planning prompt

```text
อ่าน CONTEXT, references/project-plan/FINISH-spec.md, FULFILLMENT-00,
CERT-spec และ INSPECT-spec แล้วตรวจ source ของฐานปัจจุบันแบบอ่านอย่างเดียว
ใช้ candidate จาก L1 ถ้ามี หากยังไม่มีแยก a234/#112 เป็นคนละ baseline
ห้ามสรุปว่ารวมแล้วจากการที่พบ code คนละ branch

ทำ FINISH-00 readiness G0/G1/G2: actual models/fields, states, permissions,
decision uniqueness, Courier proof legs, destination snapshots และ migration ownership
FINISH-spec มี baseline เก่าที่บางข้อแก้แล้ว เช่น paid_at และ COURIER ให้ annotate delta
ไม่ใช้ snapshot เก่าเป็นเหตุสร้างตาราง Shipment/Certificate/Payment ซ้ำ

ตรวจ return-address snapshot โดยเฉพาะ: ใช้ immutable Seller destination ที่มีอยู่
ถ้ายังไม่มี จัด upstream task แคบให้เจ้าของ INSPECT/DB มี validator และ migration plan
ไม่ใช้ Buyer address หรือ editable profile เป็น fallback; legacy missing destination ต้อง fail ชัด

ทำ decision table โดยระบุ established choice / proposed API-schema / actual code / conflict
คงข้อเลือกเดิม: full refund จำลอง, separate result/receipt, private Courier proof,
72h deadline, timely non-receipt hold, exactly-once RELEASE-or-REFUND, no auto relist
หากพบข้อความขัดกันเช่น deadline ordering ให้ยกขึ้น cross-team contract decision
โดยใช้รายละเอียด FINISH-spec v1 เป็นข้อเสนอที่ต้องเทียบกับ #98 ไม่อ้างว่า team อนุมัติแล้ว

ส่ง plan และ handoff ต่อหนึ่ง issue ด้วย base/dependencies/files/API examples,
acceptance/stop rules และ exact scope คนรับเริ่มได้จากไฟล์ ไม่ต้องอ่านแชตนี้
งานนี้เขียนเอกสารและ contract fixtures เท่านั้น ไม่ implement app/migrations/worker
หาก upstream ยังไม่พร้อม ให้ทำงานอิสระที่เสร็จได้และระบุ owner ของ blocker
```

## ชุดงานที่ต้องเตรียม

| Task | ขอบเขต | Gate ก่อน implementation |
|---|---|---|
| FINISH-01 / DB2 (DB1 ประสาน migration) | Settlement/operations/history/resolution constraints และ Order/Escrow extensions | G0 และ schema inputs จาก decision/proof/destination ชัดเจน |
| FINISH-02 / BE | Outbound/return creation และต่อ proof/confirm ที่มีอยู่; ไม่สร้าง courier subsystem ซ้ำ | FINISH-01 + CERT decision + return-address input |
| FINISH-03 / BE | Shared settlement RELEASE, Buyer receipt/report, audited Admin resolution interface | FINISH-01/02; lock/deadline/rollback contract |
| FINISH-04 / BE คนเดียวกับ settlement | REFUND branch ใน service เดียว, return/no-ship/Admin reasons และ retry | Interface จาก FINISH-03; ห้ามเขียน competing settlement service |
| TIMER-01 ส่วน FINISH / BE | 72h AUTO, no-ship, durable return refund retries | FINISH service พร้อม; reuse runner F2 ถ้า compatible แต่ไม่ถือ F2 ว่าทำทั้งหมดแล้ว |
| FINISH-05 / frontend เดิม | Final order/delivery/receipt/report/status | Contract fixtures พร้อมเริ่ม mock components ได้; live ต้อง API พร้อม |
| FINISH-06 / QA | Both Android paths + failures/races/privacy | Combined revision + worker/test accounts/Storage/device |

## Output และงานคุณ

ให้ Codex สร้าง `FINISH-00-readiness.md`, `FINISH-contract-decisions.md`, API/JSON fixtures และ prompt แยก FINISH-01…04 ในโฟลเดอร์ planning ของตัวเอง บันทึก actual source SHA และ linked evidence ทุก gate

คุณตรวจเฉพาะ decision ที่มี impact ต่อ business/ทีมและกำหนด owner; ข้อเลือกเดิมไม่ต้องถามซ้ำ ติดตาม #98 จนสัญญากลางและผู้รับงานใช้ revision เดียวกัน แล้วส่งไฟล์ FINISH-01 ให้ DB2 เป็นงานถัดไป ไม่เริ่ม 01–04 พร้อมกันจากคนละฐาน
