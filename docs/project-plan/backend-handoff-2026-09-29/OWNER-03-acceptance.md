# L3 — Lead acceptance และ rollout handoff

เจ้าของ: คุณ/Lead กับ QA; เตรียม packet ได้ทันที ตรวจรับ integrated flow หลัง L1/F3 และ frontend ส่ง revision ที่จะทดสอบ

## Acceptance preparation prompt

```text
อ่าน CONTEXT และรายงาน L1/F3 ที่ส่งมา เตรียม checklist/runbook ที่ผมทำตามได้ทันที
ระบุ exact backend/frontend SHA, build/device/environment label และ expected/actual fields
อ่านเอกสาร rollout เก่าได้แต่ห้ามอ้างสถานะบัญชี/ฐาน/บริการเก่าเป็น current evidence
ไม่ connect หรือ mutate ฐานร่วม/Storage/บัญชีจาก prompt นี้ และไม่ deploy/merge

จัด cases ตามขอบเขตที่รวมจริง: Product/Order/INSPECT/CERT/worker
FINISH ถ้ายังไม่อยู่ใน candidate ให้ pending ไม่จำลองปุ่มสำเร็จเพื่อผ่าน acceptance
แยก test automation, browser, Android OAuth, private Storage, shared migration/worker runtime
เตรียมคำสั่งเฉพาะที่อ่านได้ปลอดภัยและ deployment steps ที่จะใช้หลังเจ้าของอนุมัติ
ผลลัพธ์เป็น packet และ decision checklist ไม่ใช่การประกาศผ่านจากเอกสารคนอื่น
```

## สิ่งที่คุณต้องเตรียม/ทำ

1. กำหนด synthetic accounts สำหรับ BUYER, approved SELLER, INSPECTOR, COURIER, ADMIN และอีกบัญชีสำหรับ cross-owner test ไม่แชร์ password/token ลงแชตหรือเอกสาร
2. ตรวจว่าบัญชี staff ถูก provision ใน environment ทดสอบโดยผู้มีสิทธิ์; ถ้ายังไม่มีให้สั่ง provisioning เป็นงานแยก ไม่เดา promote บัญชีจากชื่อ
3. ระบุ Android device/build และเวลาทดสอบ ใช้ API/backend revision เดียวกับรายงาน L1/F3 และบันทึก frontend SHA ล่าสุด
4. ทดลอง Guest→Login→ซื้อ, SELLER ซื้อสินค้าร้านอื่น, ส่งเข้าศูนย์→Courier proof→Inspector รับ/ตรวจ, positive result/public QR/decision และ negative result ตาม candidate ที่มีจริง
5. ทดสอบ logout/account switch/restart/expired session, เปิดรูป private, public QR โดยไม่ login และ worker ทำงานเมื่อไม่มี traffic ใน environment ที่อนุมัติให้ทดลอง
6. เมื่อจะ rollout: ให้เจ้าของ DB ตรวจ target actual revision/backup/restore plan และ supported upgrade path; รวม graph จาก L1 ก่อน apply กำหนดผู้รันหนึ่งคน ไม่ reset/stamp ข้าม revision
7. ตรวจ remote review/CI/branch protection และ pending gates แล้วจึงเลือก merge/deploy/accept issue ตามสิทธิ์ของคุณ

การกดซื้อ/จ่ายจำลอง/ส่ง proof/ยืนยันผลใน test environment เป็นการเปลี่ยนข้อมูล ให้ใช้รายการและบัญชีทดสอบที่คุณเลือกเท่านั้น ไม่รันอัตโนมัติต่อกับบัญชีจริงจากคำสั่งเตรียม packet

## เกณฑ์ตัดสินใจ

- F1/F2 local pass + L1 integration + F3 API/DB pass = พร้อมเข้าสู่ device/runtime acceptance ของ scope นั้น
- Browser หรือ mock/local storage pass ยังไม่ปิด Android/OAuth/Supabase acceptance
- Issue #50/#63/#65/#106 ปิดได้เฉพาะ acceptance ที่อยู่ใน Issue ครบและมีหลักฐาน ไม่ปิดทั้ง feature เพราะโค้ด merge แล้ว
- FINISH ยัง pending จนงาน FINISH/COURIER/TIMER และเส้นทางจบธุรกรรมมีหลักฐานครบ

## Output

`LEAD-ACCEPTANCE.md`: ตาราง scenario/expected/actual/evidence/owner, blockers, scope ที่ผ่านจริง และข้อเสนอ approve/request-changes/conditional พร้อมเงื่อนไขที่ชัดเจน

`ROLLOUT-CHECKLIST.md`: exact revisions, backup/restore reference, migration plan, API/UI compatibility, worker start/stop/health/retry, rollback constraints และผู้รับผิดชอบ โดยยังไม่ได้รันการเปลี่ยนระบบ
