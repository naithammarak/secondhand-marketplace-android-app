# C — Profile และรีวิวผู้ขาย

**ผู้รับ:** เพื่อน 2 / full stack Codex · **Tasks:** 07 → 08 · **Priority:** P1 ที่ผู้ใช้ขอเพิ่ม

**เริ่ม:** profile หลัง A/02; reviews รับ B/04 เพิ่มก่อน final integration

## ผลลัพธ์

- profile อ่าน/แก้ชื่อจริงของบัญชีที่ login และบันทึก policy acknowledgement
- review 1–5 ดาว + comment ของผู้ขายจาก Order ที่ COMPLETED/RELEASED เท่านั้น
- รายการ/สรุปคะแนน public จาก DB จริงและแสดงใน UI ล่าสุด

## Prompt สำหรับ Codex

```text
You own work package C for the Android marketplace prototype due 8 October 2026, Asia/Bangkok. Use package A's release base plus accepted task02. Locate doc/submission-2026-10-08 (or the supplied packet path). Read work-packages/README.md, DOC-01-scope.md, PROFILE-REVIEWS-contract.md, RELEASE-DESIGN.md and FINISH-00-release-gates.md. Apply repository AGENTS.md and mobile's exact Expo documentation requirement before mobile changes.

Execute the full prompt and acceptance checks in tasks/07-PROFILE-01.md first, then tasks/08-REVIEW-01.md. Deliver task07 independently before waiting for task04. Coordinate migrations with A in the single chain 02 -> 07 -> 08. Reviews' final integration requires accepted task04 from B; do not fabricate completed orders in normal API mode to bypass this dependency. Independent fixtures/tests can be prepared while waiting.

Implement only selected basic profile APIs/UI: full_name editing, readonly email/role/status, server policy acknowledgement and truthful guest/seller-application states. Preserve original Order snapshots and role authorization. Implement seller reviews exactly as the contract: actual active Buyer of COMPLETED+RELEASED Order, one review per Order, stars1-5 plus optional comment, persisted idempotent submission, public pagination and true aggregates with masked reviewer label. Approved Sellers may act as Buyers. Use real API data in API mode, replacing mock scores and no-op submission. Do not add product/inspection ratings, photos, replies or unrelated profile settings.

Own profile/review services, models, routes and their existing UI components. Coordinate profile-screen and navigation commits with package E through A rather than concurrently writing the same file in one checkout. Preserve the current theme. Publish API examples and named component/service exports for E/A to integrate.

Run meaningful isolated PostgreSQL/API tests for persistence, review eligibility/uniqueness, idempotency, public PII redaction and migration preservation; run focused mobile checks for save/submit/retry/account switch. Write reports/07-PROFILE-01.md and reports/08-REVIEW-01.md using templates/TASK-REPORT.md with exact upstream/head, migration revisions and commands/results. Deliver code and integration instructions. Missing native evidence stays pending for F. Work through implementation and verification, not only a mock UI.
```

## งานและส่งต่อ

1. [07 Profile](../tasks/07-PROFILE-01.md) → ส่ง commit ให้ A และ migration head สำหรับ 08
2. รับ B/04, แล้วทำ [08 Reviews](../tasks/08-REVIEW-01.md) → ส่ง API/UI และข้อมูลทดสอบให้ A/E/F

หากรับ D เพิ่ม สามารถทำ [D revoke](D-certificate-revocation.md) ช่วงรอ B/04 โดยแยก commit จาก profile/reviews
