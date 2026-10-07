# D — Admin เพิกถอนใบรับรอง

**ผู้รับ:** เพื่อน 3 หรือเพื่อน 2 ช่วงรอ settlement · **Task:** 09 · **Priority:** P1 · **เริ่มหลัง:** A/01

## ผลลัพธ์

Admin เข้าถึงหน้าเพิกถอนได้ กรอกเหตุผลและยืนยันผ่าน API; public HTML/JSON/native certificate แสดง REVOKED ตรงกัน พร้อม audit และ retry ที่ปลอดภัย

## Prompt สำหรับ Codex

```text
You own work package D for the Android marketplace prototype due 8 October 2026, Asia/Bangkok. Use the complete release base delivered by A/task01, containing CERT storage and public HTML/JSON. Locate doc/submission-2026-10-08 (or the supplied packet path). Read work-packages/README.md, DOC-01-scope.md, RELEASE-DESIGN.md and FINISH-00-release-gates.md. Follow repository/mobile AGENTS.md where applicable.

Execute the full prompt and acceptance checks in tasks/09-CERT-REVOKE-01-revocation.md. Inspect existing certificate/audit/idempotency/public-page code and reuse it. Implement active-Admin-only revoke with strict reason validation, row lock, one ISSUED->REVOKED transition and replay. Provide a reachable minimal Admin UI and consistent revoked display on public HTML/JSON/native routes without exposing private reason/actor/PII. Do not change certificate issue timing, original inspection/Buyer decision/payment/settlement or automatically refund because of revocation.

Coordinate Admin entry/navigation with E/A using isolated commits; keep the latest theme and avoid wider administration. If a schema change is actually necessary, send its requirement to A and place it on the agreed current migration chain; do not add an independent head.

Verify authorization, concurrent/repeated/key-mismatch revoke, invalid inputs, immutable business records, public cache/status behavior and private-field omission. Run focused backend/mobile checks and write reports/09-CERT-REVOKE-01.md using templates/TASK-REPORT.md, including exact upstream/head and UI/API integration instructions. Deliver working code and actual results. Public HTTPS QR proof on another phone belongs to F/task11; record it as pending when untested. Continue through implementation and verification, not only seeded revoked rows.
```

[Task 09 พร้อมรายละเอียด](../tasks/09-CERT-REVOKE-01-revocation.md)
