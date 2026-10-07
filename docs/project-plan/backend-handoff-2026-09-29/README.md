# งานคู่ขนานระหว่างปรับ Wondee UI — 29 กันยายน 2026

ชุดส่งต่อให้เพื่อนใช้กับ Codex และชุดงานสำหรับเจ้าของโปรเจกต์ มี context, prompt, ขอบเขตไฟล์, dependency และเกณฑ์ตรวจรับครบในแพ็กนี้

**สถานะ: เตรียมงานแล้ว ยังไม่ได้เริ่ม implementation ตาม task เหล่านี้ และยังไม่ได้สร้าง GitHub Issue ใหม่** รหัส F1–F3/L1–L3 เป็นรหัสส่งต่อในแพ็ก ไม่ใช่หมายเลข Issue

## วิธีส่งให้เพื่อน

1. ส่ง ZIP ทั้งแพ็ก พร้อมสิทธิ์เข้าถึง repository `https://github.com/naithammarak/secondhand-marketplace-android-app` ให้เพื่อน
2. ให้เพื่อนเปิด repository ของตัวเองใน Codex และแตกแพ็กไว้ในโฟลเดอร์ที่ Codex อ่านได้
3. คัดลอก prompt ของงานจากตารางด้านล่างไปวาง โดยเปิดหนึ่ง task ต่อหนึ่งงาน
4. Codex อ่าน `CONTEXT.md` และ task ที่ระบุเอง ไม่ต้องเล่าประวัติแชตนี้ใหม่

แพ็กไม่มี source code ทั้ง repository, `.env`, บัญชี หรือ credentials เครื่องเพื่อนไม่จำเป็นต้องมี path `/home/tmk/...` ให้ใช้ checkout ที่เปิดอยู่และดึง branch/commit ตาม CONTEXT การใช้ SHA เป็นการระบุฐานทดสอบ ไม่ได้แปลว่า PR ผ่าน review แล้ว

## งานสำหรับเพื่อน

| งาน | ส่งให้ใคร | เริ่มเมื่อไร | ไฟล์ | Issue ที่เกี่ยวข้อง |
|---|---|---|---|---|
| F1 — Seller ซื้อสินค้าแล้วใช้ INSPECT/CERT ได้ครบ | เพื่อน Backend/CERT | เริ่มได้ทันที บนฐาน CERT #112 | [FRIEND-01-buyer-access.md](FRIEND-01-buyer-access.md) | #104, #65, #106; ชื่อ bug ใหม่อยู่ใน task |
| F2 — worker หมดเวลาจ่ายและปลดจอง | เพื่อน Backend อีกคน หรือคนเดิมทำต่อ | เริ่มคู่กับ F1 ได้ บนฐาน #113 | [FRIEND-02-unpaid-expiry.md](FRIEND-02-unpaid-expiry.md) | ORDER-08 / ส่วน unpaid ของ TIMER-01; ยังไม่มี Issue ใหม่ในแพ็ก |
| F3 — QA API/DB บนโค้ดที่รวมแล้ว | เพื่อน QA/Backend | เตรียม cases ได้ทันที; run ปิดงานหลัง L1 ส่ง candidate SHA | [FRIEND-03-backend-qa.md](FRIEND-03-backend-qa.md) | #50, #63, #65, #106 |

**เพื่อน F1 — คัดลอกข้อความนี้**

```text
อ่านแพ็ก backend-handoff-2026-09-29 ที่แนบหรืออยู่ใน workspace โดยเริ่มจาก CONTEXT.md แล้วทำ FRIEND-01-buyer-access.md ให้ครบตาม Implementation prompt และ acceptance ใช้ checkout/worktree ของตัวเอง ฐานเริ่มต้นคือ PR #112 ตาม SHA ใน CONTEXT ห้ามแก้ a234 หรือ mobile ห้ามเริ่ม task อื่น รายงาน base/head, diff, ผลทดสอบจริงและ dependency ที่เหลือ
```

**เพื่อน F2 — คัดลอกข้อความนี้**

```text
อ่านแพ็ก backend-handoff-2026-09-29 ที่แนบหรืออยู่ใน workspace โดยเริ่มจาก CONTEXT.md แล้วทำ FRIEND-02-unpaid-expiry.md ให้ครบตาม Implementation prompt และ acceptance ใช้ checkout/worktree ของตัวเอง ฐานเริ่มต้นคือ PR #113 ตาม SHA ใน CONTEXT จำกัดเฉพาะ unpaid expiry ห้ามแก้ a234/mobile หรือทำ FINISH settlement รายงาน base/head, diff, PostgreSQL/worker proof และวิธีรันในฐานทดสอบแยก
```

**เพื่อน F3 — คัดลอกข้อความนี้**

```text
อ่าน CONTEXT.md และ FRIEND-03-backend-qa.md ในแพ็ก backend-handoff-2026-09-29 ทำตาม QA prompt เริ่มจาก cases และ regression ที่ตรวจได้ แล้วรับ integrated candidate SHA จากรายงาน L1 ก่อนปิด QA รวม ถ้ายังไม่มี candidate ให้รายงานเฉพาะ preparation/baseline evidence ไม่อ้างว่ารวมผ่าน ห้ามแก้ production code, a234 หรือใช้ฐานร่วม
```

## งานสำหรับคุณ — Lead

| งาน | สิ่งที่ Codex ทำให้ | สิ่งที่คุณดูแล | ไฟล์ |
|---|---|---|---|
| L1 — รวม CERT/Wondee และงานเพื่อนใน candidate แยก | อ่าน PR, ทำ local integration, จัด migration graph, ตรวจ contract และรัน regression | เลือก reviewer/ผู้รับผิดชอบ merge; รับผลแล้วส่ง candidate SHA ให้ F3 | [OWNER-01-integration.md](OWNER-01-integration.md) |
| L2 — FINISH readiness และชุดงานรอบถัดไป | เทียบ spec กับฐานจริง เตรียม schema/API/fixtures และแจก FINISH-01…04 ตาม dependency | ยืนยัน decision table เฉพาะช่องที่ยังขัดกัน และกำหนดเจ้าของ migration | [OWNER-02-finish-readiness.md](OWNER-02-finish-readiness.md) |
| L3 — ตรวจรับบนเครื่องจริงและ rollout | เตรียม acceptance checklist, runbook และตรวจหลักฐานที่มี | เตรียมบัญชีทดสอบ/มือถือ ทดสอบ flow จริง ตัดสินใจ merge/deploy/shared migration | [OWNER-03-acceptance.md](OWNER-03-acceptance.md) |

**คุณ L1 — คัดลอกข้อความนี้**

```text
อ่าน CONTEXT.md และ OWNER-01-integration.md ในแพ็ก backend-handoff-2026-09-29 ทำ local integration candidate ตาม Integration prompt ใน clone/worktree แยก อ่าน a234 ได้อย่างเดียว รักษา UI ของ frontend session สรุป PR revisions, compatibility, migration graph, tests และ candidate SHA ส่งให้ QA ไม่ push/merge remote หรือใช้ฐานร่วม หากงานเพื่อนยังไม่ส่งให้รวมส่วนที่พร้อมและบอก dependency ที่ยังไม่รวม
```

**คุณ L2 — คัดลอกข้อความนี้**

```text
อ่าน CONTEXT.md, OWNER-02-finish-readiness.md และ references/project-plan/FINISH-spec.md ในแพ็ก backend-handoff-2026-09-29 ทำ FINISH-00 readiness กับฐานล่าสุดที่ตรวจได้ แล้วจัด issue-sized handoff รอบถัดไปตาม Planning prompt รวม context ให้ session ถัดไปอ่านต่อได้ งานนี้เขียนเอกสาร/contract fixtures เท่านั้น ห้ามแก้ application, a234 หรือฐานข้อมูล ไม่ถือว่าการส่ง prompt นี้อนุมัติ team contract หรือ FINISH implementation
```

**คุณ L3 — คัดลอกข้อความนี้**

```text
อ่าน CONTEXT.md และ OWNER-03-acceptance.md ในแพ็ก backend-handoff-2026-09-29 เตรียม Lead acceptance packet ตาม prompt ตรวจหลักฐานจาก L1/F3 ที่มีจริง แยก automated, Android, OAuth, Storage และ rollout ที่ยังไม่ทดสอบให้ชัด ไม่เปลี่ยนบัญชี บริการ ฐานร่วม หรือ deploy จากคำสั่งนี้ รายงานสิ่งที่ผมต้องทดสอบ/ตัดสินใจพร้อมขั้นตอนโดยไม่ต้องให้ผมเล่า context ใหม่
```

## ลำดับที่แนะนำ

เริ่ม F1 + F2 + L2 พร้อมกันได้; F3 เตรียม cases; L1 เริ่มตรวจ dependency ได้ทันที แล้วรับงาน F1/F2 มารวม → F3 ทดสอบ candidate → L3 ตรวจรับ → เปิด implementation ของ FINISH เมื่อ L2 ระบุว่าฐานพร้อม

ถ้ามีเพื่อนคนเดียว ให้ทำ F1 ก่อน F2 แล้วให้ F3 เป็นรอบตรวจแยก คุณรับ L1/L2 ส่วน frontend session เดิมรับ mobile ทั้งหมด

## ขอบเขตที่ช่วยไม่ให้ชนกัน

- frontend session: `mobile/**` ใน `a234` และงาน Order product-image API/schema/tests ที่พบกำลังแก้อยู่ ดูรายการใน CONTEXT
- F1: สิทธิ์ใน INSPECT/CERT และ focused tests ไม่มี migration
- F2: expiry service/worker/tests ไม่มี INSPECT/CERT หรือ migration โดยปริยาย
- L1: integration และ migration graph บน branch แยก เป็นผู้ประสาน shared files คนเดียว
- F3: QA cases/tests/report; ส่ง bug กลับเจ้าของ ไม่แอบแก้ business behavior
- L2/L3: เอกสารและหลักฐาน; FINISH code/ฐานร่วมเป็นงานที่ส่งต่อหรืออนุมัติตามขั้นตอนภายหลัง

จุดที่ต้องประสาน: F1 แก้ `inspections.py` ซึ่ง CERT #112 ก็แก้ ให้เจ้าของ CERT รับ patch เป็นชุดเดียว; L1 ไม่เขียนแข่งกับ F1 การทดสอบแต่ละ session ใช้ disposable DB คนละชื่อ/port และไม่ restart บริการที่ frontend ใช้อยู่

**อัปเดตท้ายรอบ:** session เดิมเริ่มแก้ `backend/app/api/orders.py`, Order schema/tests และ mobile order service เพิ่มรูปสินค้าแล้ว ให้ L1 รับ commit ล่าสุดก่อนรวมงานเพื่อน; F1/F2 จำกัดการแก้ Order ตามขอบเขตตัวเองและไม่เปลี่ยน product-image serialization

## ส่งงานกลับแบบเดียวกัน

ทุก task รายงานรหัส, base/head SHA, branch, paths, acceptance PASS/FAIL/NOT RUN/BLOCKED, คำสั่งทดสอบและจำนวน passed/failed/skipped, API/migration impact, งานที่ยังต้องทำ พร้อม local commit หรือ patch ที่ผู้อื่นนำไปใช้ได้ ห้ามรวม secrets หรือ dirty work ของคนอื่น

Owner ส่งเพียงชื่อ branch/commit/patch กลับมาในรอบต่อไปก็พอ ไม่ต้องเล่าบริบทใหม่ รายงานของ L1 เป็นแหล่ง candidate SHA สำหรับ F3/L3
