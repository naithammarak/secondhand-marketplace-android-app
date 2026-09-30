# TASK-01: แก้การจ่ายเงินจำลองก่อนนำเสนอ

วันที่: 2026-09-30 | Owner: lead/planner | สถานะเริ่มต้น: พร้อม implement

## เป้าหมาย

ผู้ซื้อสร้าง Order แล้วจำลองการจ่ายผ่าน API จริงได้ในสภาพแวดล้อมเดโมที่ตั้งค่าถูกต้อง ไปหน้าใบเสร็จเมื่อ server ยืนยัน PAID ของ Order และบัญชีเดียวกัน และเห็นข้อความที่ตรงกับผลจริงเมื่อจ่ายไม่ได้

## หลักฐานเริ่มต้น

- ฐานงานคือ PR #116 (`codex/project-review-2026-09-30`), SHA `521a3822744ac1c67cc75fc2a5574567eb885125`.
- API 8001 ที่หน้าเว็บใช้อยู่มาจาก `/home/tmk/project/2ndhand/backend`; Expo 8081 มาจาก checkout หลัก จึงเป็นคนละ revision.
- ค่า `PAYMENT_SIMULATION_ENABLED` ไม่ได้เปิด; endpoint จะตอบ 403 `payment_simulation_disabled` ตามสัญญาเดิม.
- checkout หลักขาด `PUBLIC_CERTIFICATE_BASE_URL`; pure configuration validation ไม่ผ่าน HTTPS origin requirement และ API 8000 ไม่รับการเชื่อมต่อ ณ เวลาตรวจ. ไม่มี captured crash traceback.
- `order-detail-store.pay()` จับข้อผิดพลาดไว้ใน state และไม่ throw; `checkout-screen` กลับไป receipt โดยไม่ตรวจ state จึงซ่อน failure และแสดง success เกินหลักฐาน.
- QR ใน checkout เป็นภาพจำลอง ไม่ใช่ bank QR. ปุ่ม failure/expiry ปัจจุบันเปลี่ยนแค่ UI และ countdown เริ่ม 30 นาทีใหม่.

## งานย่อยและลำดับ

### T01-A: Runtime/configuration สำหรับเดโม

1. เพิ่มวิธีเริ่ม API เดโมที่ตรวจ configuration ก่อนรัน พร้อม runbook สั้นและคำสั่ง copy ได้.
2. เปิด simulation อย่าง explicit เฉพาะ development/test/demo; production/prod และ default-off ต้องคงเดิม.
3. คง HTTPS certificate-origin validation. สำหรับ isolated payment tests ใช้ reserved HTTPS test origin ได้ แต่ห้ามอ้างว่า QR certificate ใช้งานภายนอกแล้ว.
4. วิธีเริ่ม API และ Expo ต้องระบุ checkout/branch, API origin และ ports ให้ตรงกัน. อธิบาย dotenv precedence และ Android physical-device/LAN address; อย่าพิมพ์ secrets.
5. Launcher/test helper ที่เพิ่มต้องปฏิเสธ remote/shared DB สำหรับเดโมที่เปิด simulation อัตโนมัติ. การตั้ง shared demo environment ให้เจ้าของทำตาม runbook ด้วย approved settings.

### T01-B: Checkout และผลจ่าย

1. อ่าน snapshot ล่าสุดหลัง `open`/`pay`; อย่าใช้การ resolve ของ promise เป็นหลักฐาน success.
2. ไป receipt เฉพาะ server-backed PAID ของ Order ที่กำลังกดและ owner เดิม. คำขอเก่าหลัง logout/account/order change ต้องไม่พาไป receipt.
3. load failure, disabled simulation, FAILED attempt, expired/cancelled order และ unknown payment outcome ต้องคงหน้าเดิมพร้อมข้อความภาษาไทยตรงเหตุผล.
4. รักษา timeout reconciliation, reuse idempotency key เมื่อ retry ผลไม่แน่นอน และป้องกัน duplicate submission. ห้ามรีเซ็ต pending retry เพื่อขอจ่ายซ้ำเป็นคำขอใหม่.
5. บอกชัดว่า QR/การจ่ายเป็น simulation; อย่าชวนสแกนด้วยแอปธนาคารจริง.
6. ปุ่มจำลอง failure ต้องใช้ผล API จริง หรือเปลี่ยนเป็น preview ที่ระบุชัด. ปุ่ม force expiry ต้องเอาออก/เปลี่ยนเป็น preview ที่ไม่อ้างว่า Order server หมดเวลาแล้ว. Countdown ใช้ server `expiresAt` หรือไม่แสดง countdown จนทราบ deadline; ห้ามเริ่ม deadline ใหม่ที่ client.

### T01-C: หลักฐานและ PR

1. เพิ่ม regression ที่สอดคล้องกับ store จริงซึ่ง resolve เมื่อ failure: disabled 403, load failure, FAILED, expired, unpaid/unknown, timeout reconciled PAID, same-key retry, success PAID, owner/order change และ duplicate click.
2. รัน typecheck, logic/component tests ที่เกี่ยวข้อง และ regression เต็ม mobile เมื่อพร้อม. รัน focused backend guards/startup tests.
3. ใช้ PostgreSQL ใหม่แบบ disposable เฉพาะ TASK-01 ทำ HTTP smoke จริง: create order, pay success, read PAID/receipt, retry key เดิม ไม่มี Payment/Escrow/Receipt เพิ่ม; failed then success และ disabled/production guard. ห้ามใช้ database ของทีม/container ที่คนอื่นใช้อยู่.
4. ตรวจ git diff, secret exposure และ Alembic head. ไม่จำเป็นต้องแก้ schema สำหรับงานนี้.
5. ทุกครั้งที่ implement เสร็จต้อง push และสร้าง/อัปเดต PR บน GitHub พร้อม tested SHA, commands/results และ remaining acceptance limits. PR ใหม่ stack บน #116 ไม่ merge.
6. ส่งรายงาน `doc/handoff/TASK-01-implementation.md` และ reviewer ส่ง `doc/handoff/TASK-01-review.md` พร้อม verdict ของ remote head ล่าสุด.

## การแบ่ง session

| Session | Model / reasoning | หน้าที่ |
|---|---|---|
| Implement | `gpt-6-luna` / `max` | T01-A → T01-B → T01-C, commit, push, PR |
| Review หลัง implement/PR เสร็จ | `gpt-6.1-sol` / `xhigh` (extrahigh) | ตรวจ contract, current PR head, failure paths, regression และสรุป approve/request changes |
| Lead/planner | session นี้ | ตรวจหลักฐาน, ส่งแก้ findings, ตรวจ PR ล่าสุดและสรุปสิ่งที่ยังค้าง |

## Checkout และข้อจำกัด

- Implement worktree: `/home/tmk/.codex/worktrees/task01-simulated-payment/secondhand-marketplace-android-app`.
- Implement branch: `codex/task01-simulated-payment`; PR base: `codex/project-review-2026-09-30`.
- Checkout หลักมีงานที่ยังไม่ commit จำนวนมาก: ห้าม reset/clean/stash/commit งานนั้น.
- อย่าแก้ main/PR #115 หรือ rewrite history, merge PR, deploy/migrate/seed shared DB, เปลี่ยน auth production, เปิดเงินจริง หรือเผยแพร่ `.env`/credentials.
- อ่าน `mobile/AGENTS.md` และ Expo docs เวอร์ชันที่ระบุก่อนแก้ mobile.
- Existing `backend/scripts/order_e2e_smoke.py` ทำ TRUNCATE และ tests PostgreSQL บางชุด DROP SCHEMA: ใช้ได้เฉพาะ DB ใหม่ที่ session นี้สร้างและยืนยัน host/name แล้วเท่านั้น.
- Reuse installed dependencies ได้ด้วย ignored symlink; ห้าม commit symlink/dependencies.

## เกณฑ์ปิด TASK-01

PR เปิดให้เพื่อนอ่านได้, review ตรวจ SHA ล่าสุดและไม่มี blocking findings, automated/isolated HTTP evidence ผ่าน. ถ้ายังไม่มี real device/live account/shared deployment evidence ต้องระบุว่าเหลือ acceptance นั้น ไม่อ้างว่าการจ่ายบนเครื่องผู้ใช้เดิมหรือการส่งมอบทั้งโครงการเสร็จแล้ว.

FINISH settlement/refund, external certificate QR, migration ของทีมและ submission readiness ทั้งโครงการเป็นงานต่อจาก TASK-01.
