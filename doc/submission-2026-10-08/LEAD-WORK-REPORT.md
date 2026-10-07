# งาน Lead ใน session นี้ — 1 ตุลาคม 2026

## ทำแล้ว

- เลือกวันส่ง 8 ตุลาคม 2026 และ scope เพิ่มเฉพาะ basic profile + seller reviews ตามที่ผู้ใช้อนุญาต
- เขียน DOC-01 พร้อม retained/deferred decisions และแก้กฎ certificate/receipt/72h/full-refund/fees/roles/simulation ให้เป็นชุดเดียว
- กำหนด profile/reviews API, schema, auth, replay, public data และ acceptance ก่อนเพื่อนไป implement
- Refresh FINISH-00 จาก HEAD/dirty files/PRs จริง และกำหนด integration/migration/API ownership
- แตก 14 task files (00–13) พร้อม prompt ที่อ่าน context เอง, upstream dependencies, tests และ report criteria
- เตรียม QA 28 cases, release/test/task report templates, issue#98 comment draft, Thai privacy text และ presentation/demo outline
- เตรียม SRS source/PDF และ target diagrams; ติดป้ายเอกสารเดิมที่ขัด scope เป็น historical roadmap โดยรักษา original PDF
- รวม references ที่จำเป็นและ handoff ZIP; ไม่ใส่ credentials หรือ application source ในแพ็ก

## การตรวจในรอบนี้

ตรวจ branch/HEAD/status, live open PRs/issues, source ของ User/auth/profile/review, FINISH/CERT/INSPECT contracts และข้อกำหนดใน SRS เดิม จากนั้นตรวจ task count, dependency references, Markdown links, JSON/CSV traceability, PDF text/render และ diagram syntax/render ตามรายงาน `reports/00-package-validation.json`

เอกสาร/แพ็กที่สร้างไม่ได้ยืนยันว่าระบบผ่าน integration tests รอบนี้ ไม่มีการ rerun application suites จากการแก้เอกสาร และไม่ได้แก้ source code ของแอป

## ที่ยังทำ final ไม่ได้ก่อน code พร้อม

| งาน Lead / เจ้าของโครงการ | ส่วนที่เตรียมแล้ว | เงื่อนไขก่อน final |
|---|---|---|
| รวม release | Snapshot/gates/provenance rules/task01 | latestUI และ feature commits ต้องรวม/ทดสอบจริง |
| ยืนยัน FINISH-00 | selected rules, issue draft, schema ownership | task01–05ส่ง code/evidence; ไม่ใช่ปิดissueจากspec |
| Deploy/rollout | task10/preflight requirements | target/access/backupและapprovalสำหรับshared changesที่จำเป็น |
| Final acceptance | QA matrix/templates | task11/12จริง รวมGoogle/Storage/Android/QR |
| Finalเอกสาร/พรีเซนต์ | SRS/diagrams/outline/script | actualrelease/evidence/screenshots/APK/recordingแล้วtask13finalize |
| แจ้งอาจารย์ | scope revisionพร้อมส่ง | อาจารย์รับทราบ/ตอบตามจริง; Codexไม่ตอบรับแทนอาจารย์ |

งานที่เครื่องมือทำแทนได้ถูกส่งเป็น prompt ที่ดำเนินการจนจบใน tasks ส่วนการแตะอนุญาตบนเครื่องที่ไม่ได้เชื่อม, credentialsที่ไม่มี, ติดต่อ/ยืนยันกับอาจารย์ และพูดพรีเซนต์ยังต้องเจ้าของโครงการทำ ไม่ใส่สถานะเสร็จล่วงหน้า

## สิ่งที่รักษาไว้

รักษา latest frontend/backend changes ที่มีอยู่ก่อนรอบนี้ ไม่มี force-push/merge/publish comment ไม่มี shared DB mutation ไม่แตะ `.env` และไม่มีการเปลี่ยน server ของ sessionอื่น งานใหม่อยู่ใน `doc/submission-2026-10-08` และแก้เฉพาะ documentation ของ parent projectเพื่อชี้scopeใหม่
