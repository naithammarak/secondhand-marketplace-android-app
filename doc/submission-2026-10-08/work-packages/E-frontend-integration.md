# E — ต่อ frontend ล่าสุดกับ business APIs

**ผู้รับ:** frontend session เดิม · **Task:** 06 · **Priority:** P0

**เริ่ม:** เตรียมจาก fixtures หลัง A/01; ต่อ concrete API หลัง A/02 และ B/03+04 ส่งมอบ

## ผลลัพธ์

Buyer/Seller/Inspector/Courier/Admin ทำสองเส้นทางจบได้ด้วย API จริงใน UI ล่าสุด พร้อม loading/error/retry และข้อความยอดเงินจำลอง

## Prompt สำหรับ Codex

```text
You own work package E in the existing frontend session for the Android marketplace prototype due 8 October 2026, Asia/Bangkok. Preserve the newest frontend changes and theme. Locate doc/submission-2026-10-08 (or the supplied packet path). Read work-packages/README.md, DOC-01-scope.md, RELEASE-DESIGN.md and FINISH-00-release-gates.md, and follow mobile/AGENTS.md before edits.

Execute the full prompt and acceptance checks in tasks/06-FINISH-05-ui.md. Prepare fixtures/components while upstream APIs are being delivered, then integrate A's reports/API-MAPPING.md and B's task03/04 routes and action flags. Implement retained Buyer receipt/non-receipt/history/refund views, Seller return address/shipping/payout views, Inspector final dispatch, Courier selected private proof flow and scoped Admin assignment/dispute resolution. Reuse the current API client, auth provider, role entry/navigation and latest screens.

Result acceptance is distinct from physical receipt; use server deadlines, statuses and money. Show pending refund if a durable return is not yet settled. Gate mutation success on committed API response, use stable retry keys and refetch ambiguous outcomes; handle account change and role redaction. Label payment/payout/refund as simulated. Do not implement external payments or client-side settlement.

Package C owns profile/review persistence and dedicated UI; package D owns certificate revoke. Integrate their services/components and entries after delivery, coordinating shared files with A. Do not independently reimplement their APIs or overwrite their UI. Keep preparation fixtures distinct from completed real API wiring.

Run focused mobile component/logic checks and typecheck, then API-backed smoke against the combined candidate when available. Send reports/06-FINISH-05.md using templates/TASK-REPORT.md, exact upstream/head, wired routes, code and actual checks. Camera/Google/private Storage/native proof requires F's real Android QA; do not claim it from a browser preview. Continue through API integration and verification.
```

[Task 06 พร้อมรายละเอียด](../tasks/06-FINISH-05-ui.md)
