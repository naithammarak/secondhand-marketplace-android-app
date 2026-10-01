# A — รวมฐานโค้ดและเตรียม schema

**ผู้รับ:** Lead / Codex ฝั่งเจ้าของโครงการ · **Tasks:** 01 → 02 · **Priority:** P0

## ผลลัพธ์

- release base ที่เก็บ UI ล่าสุดและ INSPECT/CERT พร้อมตรวจ payment จำลองที่บันทึก Payment/Receipt/Escrow และ replay ได้
- migration เดียวสำหรับ final delivery/receipt/settlement, immutable return address และ proof binding
- concrete API mapping และ base SHA ให้ B/C/D/E เริ่มจากโค้ดชุดเดียวกัน

## Prompt สำหรับ Codex

```text
You own work package A for the Android marketplace prototype due 8 October 2026, Asia/Bangkok. Work in the supplied secondhand-marketplace-android-app repository. Locate doc/submission-2026-10-08 (or the supplied packet path). Read work-packages/README.md, README.md, DOC-01-scope.md and FINISH-00-release-gates.md; apply actual repository AGENTS.md.

Execute the full prompts and acceptance checks in tasks/01-INT-01-release-base.md, then tasks/02-FINISH-01-schema.md. Inspect the current checkout and latest provided dirty UI before edits; the historical baseline is a reference, not proof of current state. Preserve unrelated work. Deliver a repeatable base before other feature work and keep integration ownership through the final release. Reuse the existing simulated payment implementation; verify and repair its persistence/idempotency as task01 requires rather than add an external gateway or real money custody. Escrow amounts are simulated database records.

Own the migration chain and API-MAPPING.md. Deliver task02's states, constraints, replay/proof/overdue records and immutable seller return-address snapshot. Coordinate schema extensions in order 02 -> 07 -> 08, with one Alembic head. Give downstream tasks exact upstream SHA and concrete APIs. Use isolated PostgreSQL for migration and race verification.

Write reports/01-INT-01.md, reports/02-FINISH-01.md, reports/API-MAPPING.md and reports/release-manifest.json as the original tasks require. Send code commits or a reproducible patch, migration head and actual test output. Do not mark other work packages done from prepared contracts. When B/C/D/E and runtime code return, integrate their commits on the same candidate, reconcile hotspots, verify affected behavior and freeze the source for F's APK. Review reported blockers and make routine in-scope fixes; do not stop at a plan. Shared environment activation and native acceptance follow tasks10-13 rather than this package's isolated tests.
```

## งานและส่งต่อ

1. [01 INT-01](../tasks/01-INT-01-release-base.md) → ส่ง base ให้ D และ preparation ของ E/F
2. [02 FINISH-01](../tasks/02-FINISH-01-schema.md) → ส่ง schema/base ให้ B และ C/07
3. กลับมารวม downstream commits ก่อน [F](F-release-android-presentation.md) freeze/build
