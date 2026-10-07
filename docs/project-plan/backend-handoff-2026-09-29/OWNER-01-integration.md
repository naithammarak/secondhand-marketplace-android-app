# L1 — Lead integration: CERT + Wondee + F1/F2

เจ้าของ: คุณ/Lead ใช้ Codex อีก task ได้ ผู้ดูแล migration graph หนึ่งคน งานนี้ทำบน clone/worktree แยกเท่านั้น

## Integration prompt

```text
อ่าน CONTEXT และตรวจ state/head/base ล่าสุดของ PR #108–#113 และ patch F1/F2 ที่ส่งมา
บันทึก exact revisions ก่อนรวม ไม่ถือว่า OPEN/DRAFT คือ merged/approved
ใช้ local integration branch แยก a234 เป็น source อ่านอย่างเดียว
ห้าม stash/checkout/reset/commit dirty file หรือ stop/restart services ใน a234

เริ่มจากตรวจ #113 กับ a234 committed HEAD และ frontend output ที่เจ้าของส่งมา
รักษา mobile ของ frontend session เป็นแหล่ง UI หลัก ไม่เอา mobile จาก CERT ancestry มาทับ
dirty mobile และ backend Order image API/schema/tests ตามรายการใน CONTEXT
ไม่อยู่ใน candidate จน session เดิมส่ง commit เอง ห้าม snapshot/copy dirty code
บันทึก UI SHA ของ candidate และข้อจำกัดว่าการปรับ UI ใหม่หลังจากนั้นยังไม่ถูกตรวจ

วิเคราะห์ CERT #109→#110→#111→#112 เป็น stack เดียว ตรวจ ancestry/current diff ก่อนเลือก
รับ F1 เป็น delta จาก CERT base และ F2 เป็น delta จาก Wondee #113 base
ทำ integration ทีละ dependency ในพื้นที่ใหม่ หลีกเลี่ยงนำ commits/ไฟล์ซ้ำจาก shared ancestry
ห้ามแก้ F1 แข่งกับผู้รับงาน หากยังไม่ส่งให้รวมส่วนที่พร้อมและทำ readiness table

ประเด็นต้องตรวจเป็นพิเศษ:
1. #109 มี mobile ใน diff ปัจจุบัน; outcome integration ต้องไม่ย้อน UI
2. diff backend ของ a234/#113 ณ snapshot เป็น formatting เท่านั้น ไม่มี graph change
   งาน migration จริงคือรวม CERT revision กับ Wondee graph ตรวจ heads/predecessors
   และหลักฐาน applied history ที่มี ห้าม rewrite migration ที่อาจ apply แล้ว
   ใช้ additive reconciliation เมื่อจำเป็นและพิสูจน์ supported upgrade/adoption paths
3. CERT branch เพิ่ม decision/revocation/schema; Wondee มี BUYER-default, shop_name,
   Seller-as-buyer, current ownership/active policies ต้องรักษาทั้งสองชุด
4. ตรวจ JSON ของ result/evidence/certificate กับ mobile/src/services/inspection-service.ts
   และ public certificate route: #113 ใช้ public JSON ส่วน #111 เปลี่ยน public path เป็น HTML
   ต้องรักษา contract ผู้ใช้เดิมหรือออกแบบ compatibility endpoint แบบจำกัดพร้อม API examples
   ห้ามเลือกแค่ฝั่ง server แล้วอ้างว่าหน้า mobile ใช้ได้ และห้ามแก้ mobile ใน task นี้
5. หลักฐานส่ง/รูปตรวจต้องรองรับ order owner BUYER/SELLER; decision ไม่ปล่อยเงิน
6. รับและตรวจ Order product-image contract ล่าสุดจาก frontend session ก่อน final candidate
   ไม่ทับด้วย orders.py/schema/test รุ่นเก่าจาก CERT หรือ F1/F2

แก้ backend integration/migration/compatibility แบบที่จำเป็นได้ในพื้นที่ใหม่
เก็บ protocol เดิมให้ current UI ใช้ได้เท่าที่ทำได้ ถ้าต้องแก้ consumer ให้ทำ frontend handoff
พร้อม JSON/route/acceptance แล้วส่งให้ frontend session เดิมแทนการแก้ UI เอง

ทดสอบ isolated PostgreSQL migration/data preservation/FK/RLS/concurrency ที่เกี่ยวข้อง
รวม focused backend regressions และ frontend contract checks บน candidate ถ้ารันได้โดยไม่แก้ UI
ไม่มี shared DB, no push/remote merge/deploy/Issue closure ใน task นี้
จบด้วย reviewable local candidate commit พร้อม report, branch และ SHA ที่ F3 ใช้ต่อได้
```

## Deliverables

- `doc/handoff/L1-integration-report.md`: ตาราง PR/base/head/included/reason, F1/F2 revision, Wondee UI revision, conflict decisions และ test evidence
- `doc/handoff/L1-frontend-contract.md`: endpoint/JSON/errors ที่ใช้ต่อได้ และ consumer changes ที่ส่งให้ frontend ถ้ามี
- Migration head/predecessor map, data preservation/downgrade notes; claim เฉพาะ supported paths ที่พิสูจน์แล้ว
- Candidate commit/patch ที่ QA checkout ได้ (shared remote publishing ยังเป็นขั้นตอนเจ้าของ)

## เกณฑ์ตรวจรับของคุณ

- [ ] ไม่มี mobile diff จากการแก้ของ L1; UI source revision ชัดเจน และไม่คัด dirty file
- [ ] F1/F2/CERT dependencies ระบุ included/missing ตาม SHA จริง ไม่เรียก snapshot ที่ไม่รวมครบว่า complete
- [ ] มี canonical migration plan และ PostgreSQL proof โดยไม่เปลี่ยนฐานร่วม
- [ ] Buyer roles, cert HTML/JSON, evidence shape และ error contract ใช้ร่วมกันได้ หรือมี frontend gate ระบุชัด
- [ ] มี candidate SHA ให้ F3; ผ่านแล้วค่อยพิจารณา remote review/merge ตาม branch protection

สิ่งที่คุณต้องตัดสินใจเอง: reviewer/เจ้าของ migration, ส่วนที่ยอมรับให้ปล่อยในรอบนี้ และการ merge/deploy หลังเห็น candidate+หลักฐาน ไม่ต้องพิมพ์ business context ใหม่
