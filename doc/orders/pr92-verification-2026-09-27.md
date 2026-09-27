# PR #92 — หลักฐานหลังรวม main (27 กันยายน 2026)

ตรวจบน code commit `6be08c91cfc64e40c5f06c6935a16aacd708ae09` ซึ่งเป็น merge commit มี parent
`035ff48f9cf71823ba52af298e9b23da47ea849f` (#92 เดิม) และ
`a936ccf8c10df308af3a7792c0ad633d53cf6d1b` (main). ไม่ rebase, squash หรือ force-push.
commit เอกสารที่ตามมาจะไม่เปลี่ยน backend/mobile ที่ทดสอบนี้.

## ปัญหาและผลลัพธ์

- รวม conflict 8 ไฟล์ โดยเก็บ marketplace UI, gallery, category filter และ login/checkout return ของ main
  พร้อม cancellation, timer, feature flag ของทางเข้าด้วยรหัสสินค้า และ unknown-status fallback ของ #92.
- `GET /products?category_id=...` กวาดการจองหมดเวลาก่อนอ่าน/นับ/แบ่งหน้า และยังกรองหมวดหมู่ถูกต้อง.
- หน้ารายการเสนอชำระเงินเฉพาะ buyer + `WAITING_PAYMENT` + `UNPAID`;
  Order ที่ยกเลิก/สถานะไม่รู้จักและมุมมองผู้ขายเปิดดูรายละเอียดได้ แต่ไม่มีปุ่มชำระเงิน.
- Badge ของ `CANCELLED`/`UNKNOWN` ใช้สีกลางตาม theme แทนการตกไปเป็นสีสำเร็จ.
- พบและทำ regression ยืนยันก่อนแก้ว่า PostgreSQL CHECK เดิมยอมรับ `CANCELLED` พร้อมเวลาแต่
  `cancel_reason=NULL` เพราะผล CHECK เป็น SQL UNKNOWN. เพิ่ม `cancel_reason IS NOT NULL`
  ใน model และ migration `b41d7ce09f35` ที่ยังอยู่ใน PR นี้.
- ไม่เพิ่ม migration head, ไม่สร้าง INSPECT/Courier ซ้ำ; #92 ยังมี head เดียว `c93b7e5a1d84`.

## ผลทดสอบบน code commit ข้างต้น

Environment: Fedora/Linux, Python 3.14.7, Node 24.20.0, PostgreSQL **16.15**
จาก `postgres:16-alpine`. Container เฉพาะงาน `codex-pr92-test-pg` bind ที่
`127.0.0.1:55492`; ใช้ฐานแยกสำหรับ app/HTTP, ORDER, migration, auth และ compatibility.
สร้าง Data API roles `anon`/`authenticated` ใน container ทดสอบเพื่อไม่ข้าม RLS checks.
ทุกบัญชี/JWT/ข้อมูลสินค้าเป็นข้อมูลสมมติในเครื่อง.

| Verification | ผลจริง |
|---|---|
| Backend `python -m pytest -q -rs` พร้อม DATABASE/ORDER/TEST/AUTH URLs ของฐานแยก | **456 passed, 0 skipped, 0 failed** |
| Order API (รวม paid-state/status guards) | 72 passed, รวมในชุด backend |
| Admin orders privacy/permission/audit | 28 passed, รวมในชุด backend |
| Product reads (รวม category + expiry regression) | 29 passed, รวมในชุด backend |
| Order PostgreSQL | **26 passed**, รวมในชุด backend |
| HTTP จริงผ่าน Uvicorn + `python -m scripts.order_e2e_smoke` | **57/57 passed** |
| Mobile `npm run test:logic` | **294 passed, 0 skipped** |
| Mobile `npm run test:components -- --no-cache` | **13 suites, 119 tests passed** |
| Mobile `npm run typecheck` / `npm run lint` | ผ่านทั้งคู่ ไม่มี error |
| `git -c core.whitespace=cr-at-eol diff origin/main...HEAD --check` | ผ่าน; repo มีไฟล์ CRLF เดิม |

Backend มี dependency deprecation warnings ของ Starlette/httpx/AnyIO และคำเตือน SHA512 key
จาก negative JWT test; components มี React `act(...)` warnings เดิม. ไม่มี test failure.
รอบเตรียม environment แรก security test ล้มเพราะ app database ยังไม่ได้ migrate;
แก้โดย migrate app database แยกก่อน suite. ผลในตารางเป็นรอบหลังแก้ environment และโค้ดครบแล้ว.
หลังเครื่อง restart ได้รันทวนทั้งหมดที่ commit นี้และเก็บ log ในพื้นที่ถาวร.

### PostgreSQL พิสูจน์อะไรบ้าง

- `upgrade head`, downgrade/upgrade ของ schema เดิม และ backfill deadline = `created_at + 30 minutes`.
- downgrade จาก head ไปก่อน ORDER-08 แล้ว upgrade กลับ โดยมี Order ที่จ่ายแล้วและยังไม่จ่าย:
  เปรียบเทียบทุก field เดิมของ Order/PaymentAttempt/Payment/Escrow/Receipt ก่อน/หลังเท่ากัน.
- ปฏิเสธ downgrade เมื่อมี CANCELLED และเก็บข้อมูลเดิมไว้; ตรวจ RLS/index/constraints.
- ปฏิเสธเหตุผล NULL/ไม่ถูกต้อง, cancelled fields ไม่ครบ และการยกเลิก Order ที่จ่ายแล้ว.
- จ่ายชนยกเลิก; จ่ายถือ lock ก่อน expiry และ expiry ถือ lock ก่อนจ่าย:
  ผู้ชนะเป็น transaction เดียว ไม่มี Payment/Escrow/Receipt ซ้ำ และไม่ปล่อยสินค้าที่จ่ายแล้ว.
- หลัง cancel/expiry ผู้ซื้อสองคนแย่งจองใหม่: ได้ 201 หนึ่งคำขอและ 409 อีกคำขอ,
  Order เก่าเก็บเหตุผลถูกต้อง สินค้า RESERVED สำหรับ Order ใหม่เพียงหนึ่งรายการ.

### คำสั่งรันทวน

กำหนด URL ทั้งหมดไปยัง **ฐาน disposable ในเครื่องคนละฐาน** เท่านั้น. `DATABASE_URL` ต้องเป็น
app database ที่ migrate แล้ว; `TEST_DATABASE_URL` ต้องเริ่มว่าง และ ORDER suite จะล้าง schema ของฐานตน.

```bash
cd backend
# export DATABASE_URL, ORDER_TEST_DATABASE_URL, TEST_DATABASE_URL, AUTH_TEST_DATABASE_URL
python -m alembic upgrade head
python -m pytest -q -rs --junitxml=backend.xml
```

HTTP ใช้ app database ข้างต้นและ JWT ทดสอบที่ตรงกันทั้ง server/client:

```bash
# server: DATABASE_URL=<local app test URL>
# SUPABASE_JWT_SECRET=<local test value>; SUPABASE_JWT_ALGORITHM=HS256
# SUPABASE_JWT_AUDIENCE=authenticated
# SUPABASE_JWT_ISSUER=https://example-project.supabase.co/auth/v1
# PAYMENT_SIMULATION_ENABLED=true; APP_ENV=test
python -m uvicorn app.main:app --host 127.0.0.1 --port 8770
# client: ORDER_TEST_DATABASE_URL=<same local app test URL>
# ORDER_E2E_BASE_URL=http://127.0.0.1:8770; ORDER_E2E_JWT_SECRET=<same local test value>
python -m scripts.order_e2e_smoke
```

```bash
cd mobile
npm run test:logic
npm run test:components -- --no-cache
npm run typecheck
npm run lint
```

## Compatibility กับ #93 (ไม่ใช่การแก้หรือยอมรับ PR #93)

ทดสอบ **tree จำลอง** จาก `git merge-tree --write-tree 6be08c9 e7bde70`:
`0ab8c088b96e1800ef98828f00a9a065653d60f5`. Git รวมได้โดยไม่มี conflict.
ใช้ `git archive` ไป directory แยก ไม่แก้ branch/worktree ของผู้ทำ #93.

- migration head เดียว `f3c1a09d8b56` ต่อ `c93b7e5a1d84` ตาม #93 เดิม.
- ตั้ง `INSPECT_TEST_DATABASE_URL` เพิ่มจาก URLs ข้างต้น ใช้ฐานว่างเฉพาะและคนละชุดกับ #92.
- Backend ของ tree จำลอง **472 passed, 0 skipped, 0 failed**;
  รวม INSPECT PostgreSQL **12 passed** สำหรับ migration/preservation/guards/race/RLS ของ #93.
- ผลนี้แสดงว่าโค้ด #93 ที่ตรวจสามารถรวมกับฐาน #92 ฉบับนี้ได้;
  ไม่ใช่ผลบน remote head ใหม่ของ #93 และไม่แทน DB2 review/acceptance ของทีม.

## ข้อจำกัดและผู้รับช่วงต่อ

1. **Reviewer/Lead:** ruleset ของ main ต้องการอย่างน้อย 1 approval. ตรวจและรับ #92 ก่อน merge;
   ไม่มี required status-check rule ที่พบในรอบนี้ และไม่มี CI result ของชุดทดสอบข้างต้นบน GitHub.
   หลักฐานทั้งหมดเป็น local automated tests. ไม่ได้ตั้ง auto-merge หรือ bypass review.
2. **DB1/ผู้ทำ #93 + DB2:** หลัง #92 merge ให้รวม main โดยรักษาประวัติ เปลี่ยน base #93 เป็น main,
   ตรวจ diff เฉพาะ INSPECT/Courier และรันทวนบน head จริง พร้อม DB2 review.
   #93 ยัง Draft; #94 ไม่ได้ถูกแก้และไม่ใช่ dependency ก่อน merge #93.
3. **ผู้ดูแลฐานกลาง + DB1; DB2 ตรวจอิสระ:** revision `ab2409240001` ยังไม่มีใน repo.
   ต้องพิสูจน์ lineage/backup/restore/staging และตกลง rollout gates ก่อนแตะฐานกลาง.
   รอบนี้ไม่ connect/migrate/seed/reset/stamp Supabase กลาง.
4. **DB owner:** `b41d7ce09f35` ใน PR ที่ยังไม่ merge ถูกแก้ CHECK เพื่อปิด NULL loophole.
   ฐานใดเคย apply ฉบับเก่าแล้วจะไม่ได้ CHECK ใหม่นี้จาก `upgrade head` เฉย ๆ.
   สร้าง disposable DB ใหม่เพื่อทดสอบ; ฐานที่มีข้อมูลต้องมีแผนแก้ constraint ที่ DB owner ตรวจรับ
   หลัง audit แถวผิดเงื่อนไข. ห้ามย้อน migration/reset/stamp ฐานร่วมตามคำสั่งทดสอบนี้.
5. **BE/ผู้ทำ TIMER-01 ตาม #98:** scheduled worker ที่รันโดยไม่มี API traffic ยังไม่มี.
   lazy expiry และ CLI script ผ่านขอบเขตที่ตรวจ แต่ ORDER-08/NFR-10 ยังไม่ปิดครบ.
6. **QA/ผู้มี Android และเจ้าของ test environment:** OAuth/deep-link บนอุปกรณ์จริง,
   private Storage ของระบบร่วม และ M1–M27 ยังไม่มีหลักฐานจากรอบนี้. ไม่เพิ่ม email login เพื่อข้าม gate.
7. **Lead + BE/DB/FE/QA:** รับรอง #54 v2 และ #98 ด้วยแต่ละฝ่ายเอง; ไม่ติ๊กยอมรับแทนบุคคลจริง.

เอกสารนี้เป็นหลักฐานใหม่; ผลใน `qa-report.md` ก่อนหน้านี้เก็บไว้เป็นประวัติเท่านั้น.
