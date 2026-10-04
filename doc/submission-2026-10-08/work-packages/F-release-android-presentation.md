# F — Runtime, APK, QA และ presentation

**ผู้รับ:** Lead / Codex ฝั่งเจ้าของโครงการ + ผู้ถือโทรศัพท์และผู้นำเสนอ · **Tasks:** 10 → 12 → 11 → 13 · **Priority:** P0

**เตรียมได้ก่อน:** environment audit, build prerequisites, test plan, โครงคู่มือ/สไลด์

**ทำ final หลัง:** A รวม tasks01–09 และ runtime code เป็น candidate เดียว

**คิวแก้ปัญหาปัจจุบัน:** [ช่องแบรนด์ → อัปโหลดรูปลงขาย → ยืนยันตัวตนขอเปิดร้าน → Render Cron worker](../coordination/F-WORK-QUEUE.md)

## ผลลัพธ์

Android APK ใช้ได้บนเครื่องจริง ไม่พึ่ง Metro พร้อม API/Auth/private Storage/public QR/worker ที่เข้าถึงได้ ผล QA ผูกกับ release เดียว คู่มือ/demo data/สไลด์/หลักฐานและบันทึกสำรอง

## Prompt สำหรับ Codex

```text
You own work package F for the Android marketplace prototype due 8 October 2026, Asia/Bangkok. Locate doc/submission-2026-10-08 (or the supplied packet path). Read work-packages/README.md, DOC-01-scope.md, QA-MATRIX.md, SRS-SUBMISSION.md, PRESENTATION-OUTLINE.md and FINISH-00-release-gates.md. Apply repository and relevant artifact skill instructions.

Prepare independent runtime/build/document work now. Once A supplies the combined feature candidate, execute the full prompts and acceptance checks in this order: tasks/10-ENV-01-runtime.md -> tasks/12-APK-01-android.md -> tasks/11-QA-01-release.md -> tasks/13-HANDOVER-01-demo-presentation.md. This is intentional: APK candidate exists before native QA; handover finalizes presentation/scope evidence after technical QA. A remains integration owner for fixes/source freeze.

Use the full app rather than catalog-only/buyer-only mode. Establish reachable API/Auth/private Storage/public HTTPS QR and the actual scheduler using the original environment authorization gates. Build an installable APK with bundled JS and record source/API SHA, migration head, config and APK hash. Test Android cold launch without Metro and both full business journeys; Q01-Q26 are technical QA, Q27-Q28 are final handover/scope/presentation checks. If QA finds a defect, have its package owner/A fix it, rebuild and retest affected cases before recording readiness.

Complete the final guide, aligned documents/diagrams, deterministic isolated demo data, actual presentation deck, backup recording and rehearsal evidence as task13 requires. Explain that gateway/transfers are simulated and database escrow/settlement logic is implemented; do not describe it as real money custody. Use real test evidence, not fabricated screenshots or guessed PASS. Prior preparation artifacts are drafts until matched to the tested release.

Write reports/10-ENV-01.md, reports/12-APK-01.md, reports/11-QA-01.md and reports/13-HANDOVER-01.md plus the release manifest and original task-required artifacts. Deliver actual paths, commands/results and remaining blockers. Where phone access, Google/service credentials, teacher acknowledgement or recording/rehearsal needs a human, finish independent work and list exact remaining actions; do not mark them passed. Continue through implementation/build/verification and reviewable handover, not only instructions.
```

## งานตามลำดับ

1. [10 Runtime](../tasks/10-ENV-01-runtime.md)
2. [12 Android APK](../tasks/12-APK-01-android.md)
3. [11 QA](../tasks/11-QA-01-release.md)
4. [13 Handover/presentation](../tasks/13-HANDOVER-01-demo-presentation.md)

Codex ทำงานเตรียม/build/checks/เอกสารให้ได้ งานผู้ใช้คือการแตะโทรศัพท์หรือสิทธิ์บริการที่เครื่องมือเข้าถึงไม่ได้ รับทราบ scope กับอาจารย์ และซ้อม/นำเสนอจริง
