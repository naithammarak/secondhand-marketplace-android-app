# F3 — QA API/Database บน integrated candidate

เจ้าของ: เพื่อน QA/Backend; อ้างอิง #50 PRODUCT-08, #63 ORDER-06, #65 INSPECT-06, #106 CERT-06

เริ่มเตรียม cases ได้ทันที แต่การตรวจรวมต้องใช้ candidate SHA ที่ L1 ส่งใน `L1-integration-report.md` หากยังไม่มีให้ baseline-check เฉพาะ feature ที่อยู่ใน revision นั้น ไม่ใช้ a234 เป็นที่รัน tests

## QA prompt

```text
อ่าน CONTEXT และงาน F1/F2 เพื่อทราบสิ่งที่ต้องพิสูจน์
เตรียม QA matrix พร้อม expected API/DB results และเชื่อมกลับ existing issues
เมื่อ L1 ส่ง candidate ให้ checkout SHA นั้นในพื้นที่ของตัวเองและตรวจ diff/revision
ใช้ disposable PostgreSQL แยกให้ตรง test environment names ไม่ชี้ shared Supabase
อ่าน fixtures ก่อนรันเพราะหลายชุด drop/recreate schema และโหลด .env ได้

ทดสอบ normal path และ failure path ด้านล่าง ใช้ test helpers เดิมเมื่อเหมาะสม
เพิ่ม focused regression tests ได้ภายใต้ไฟล์ QA ของ task แต่ไม่แก้ business code/migrations
เมื่อพบ bug ให้บันทึก expected/actual, minimal repro, file/line/SHA และผู้รับผิดชอบ F1/F2/L1
ส่ง feedback กลับในรายงาน ไม่ส่งข้อความ GitHub/team โดยไม่มีคำสั่ง

อย่านับ skip เป็น pass อย่าอ้าง OAuth/Supabase/Android จาก mock auth, local storage หรือ web tests
ตรวจรายงาน compatibility ทั้ง JSON และสิทธิ์กับ current Wondee consumer โดยอ่าน mobile ได้
ไม่แก้ mobile เพื่อกลบ contract failure รายงานแต่ละ Issue เป็น partial/ready-for-device/blocked
ไม่ปิด Issue หรือประกาศ whole feature accepted จาก backend tests อย่างเดียว
```

## Matrix ขั้นต่ำ

| กลุ่ม | ต้องพิสูจน์ |
|---|---|
| Roles | BUYER/SELLER ซื้อได้; self-purchase และ staff ซื้อไม่ได้; promote หลังซื้อแล้ว history/inspection ยังเข้าถึงได้ |
| Ownership | Order/result/evidence/proof/decision เปิดให้เฉพาะ owner/assigned staff ตาม endpoint; account switch ไม่ปน identity ใน API requests |
| Payment | Reservation race, payment replay, failed payment, cancellation และ expiry race ไม่มีเงินซ้ำ |
| INSPECT | Assigned Courier proof→Inspector receive→start→ผล 4 แบบ; ไม่รับเข้าศูนย์จาก upload อย่างเดียว |
| CERT | Positive result+certificate+order commit พร้อมกัน; failure rollback; negative ไม่มี certificate/decision |
| Buyer decision | Owner BUYER/SELLER, fresh-account check, replay/conflict/concurrent calls และ historical result หลัง status เดินหน้า |
| Public/private | Public HTML ไม่เผย PII/private links; token ผิด/เพิกถอน; private image authorization/no-store; response ใช้กับ Wondee decoder ได้ |
| Worker | ไม่มี HTTP traffic, before/at/after deadline, restart, batches, two workers/payment race, failure/retry |
| Migration | L1 มี isolated PostgreSQL upgrade/adoption/constraints/data preservation evidence ของ candidate; ตรวจหลักฐานและรันเฉพาะ gate ที่ยังขาด |

## ขอบเขตและ output

เพิ่ม `backend/tests/test_handoff_integration_postgres.py` หรือชื่อเฉพาะ QA ที่ไม่ชน F1/F2; หากต้อง reuse existing fixture ให้ประสานแทนแก้ global conftest กว้าง ๆ

ส่ง `doc/handoff/F3-qa-report.md` พร้อม candidate SHA, test command/counts, matrix PASS/FAIL/NOT RUN/BLOCKED, bug list พร้อม severity/owner, รายการ device/runtime ที่ L3 ต้องทำ และคำตัดสิน **ready-for-device / request-changes / blocked** ให้ตรงหลักฐาน

ถ้าหา candidate ไม่ได้ งาน preparation จบได้ แต่ integrated QA ต้องยังเป็น pending ไม่สร้าง success report จากการรวม branch ตามเดา
