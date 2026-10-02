# 09 / CERT-REVOKE-01 — ส่งมอบงาน D

- Task ID / owner: 09 CERT-REVOKE-01 / D (Codex)
- Status: **IMPLEMENTED_AND_TESTED** สำหรับ implementation และ focused checks; ไม่ใช่ full release/device acceptance
- Repo / branch: `D:\projectsa\package-d` / `codex/d-certificate-revocation-2026-10-02`
- Upstream SHA: **`94a26a0fbb7a0a82948d95de7db9af070707b770`**, [A PR #123](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/123), branch `codex/a-foundation-2026-10-02`; ตรวจ head ซ้ำก่อนส่งแล้วตรงกัน (PR ยัง OPEN)
- Delivered SHA (implementation + navigation): **`980a5ef57dda682d95a8e60ee2b19c2c42d2980d`**; tree `6f24910746850e63974c63701db985d3642c2a42`; commit ถัดจากนี้เป็นรายงาน/หลักฐานเท่านั้น
- Core commit: `61f7a6da8381d02e1d09fe45a937a9ddc3c3810a`
- Navigation commit: `980a5ef57dda682d95a8e60ee2b19c2c42d2980d`
- Migration predecessor/head: ไม่เพิ่ม migration; คง head เดียว **`a02f20261002`**, predecessor `714f11c84d53` จาก A; C ต่อ 07 → 08 ตามเดิม
- Date / timezone: 2 October 2026 / Asia/Bangkok; submission due 8 October 2026

## What changed and why

เพิ่ม `backend/app/api/admin_certificates.py` และ register router/cache policy ใน `app/main.py` ใช้ `require_admin`, การตรวจ actor ใหม่หลัง lock, fingerprint และ Idempotency-Key validator เดิม การเปลี่ยนสถานะเกิดใน transaction เดียวที่ล็อก Certificate ก่อนตรวจสถานะและเขียน audit ถ้าเขียน audit ไม่สำเร็จ Certificate ต้อง rollback ด้วย

ใช้ schema ที่ A ส่งมาแล้ว: Certificate เก็บ `status=REVOKED`, `revoked_at` จาก DB clock หลัง lock และ safe code `revocation_reason=ADMIN_REVOKED`; **เหตุผลส่วนตัวเต็ม 10–1000 ตัวอักษรอยู่ใน `fulfillment_commands.result.audit.reason`** พร้อม actor FK, action, resource, key/hash, server time และ response สำหรับ replay ตารางนี้ append-only และมี RLS อยู่แล้ว จึงไม่ขยาย column 500 ตัวอักษรหรือสร้าง migration แข่งกับ C

Mobile เพิ่มหน้า list/detail/confirmation ที่ `/admin-certificates` และ `/admin-certificates/[certificateId]` ใช้ theme/components เดิม มี loading/error/retry, ตรวจสิทธิ์จากบัญชี backend, key เดิมหลัง timeout และแยก state ตามบัญชี เมื่อส่งแล้วแต่ยังยืนยันผลไม่ได้จะล็อกเหตุผลเดิมไว้ให้ retry อย่างปลอดภัย ความสำเร็จแสดงหลัง API ตอบสำเร็จเท่านั้น

ทางเข้าที่ใช้งานได้: **Profile → เมนูผู้ดูแลระบบ → จัดการใบรับรอง → รายละเอียด → เหตุผล → เพิกถอนใบรับรอง → ยืนยันเพิกถอน** แยกการเพิ่มปุ่มใน Profile เป็น navigation commit เพื่อให้ A/E/C รวมกับ Profile ล่าสุดโดยไม่แทนไฟล์ทั้งไฟล์

Public HTML/JSON ใช้ projection เดิมที่ไม่เผย PII และส่ง `Cache-Control: no-store` อยู่แล้ว Native public route เพิ่ม `cache: no-store`, โหลดใหม่เมื่อกลับเข้าหน้า/กลับจาก background/กดตรวจสถานะ และซ่อนผลเก่าระหว่างโหลดหรือเมื่อโหลดล้มเหลว ใบรับรองที่ revoked แสดงชัดทั้ง public route และ certificate sheet ในผลตรวจ ไม่แสดงตราว่าใช้งานได้ และยังเปิด URL สาธารณะเดิมได้

คงการออก Certificate แบบ atomic พร้อมผล PASS/MINOR_ISSUE เดิม ไม่แก้ inspection final snapshot, Buyer decision เดิม, Order/Payment/Receipt/settlement หรือทำ refund อัตโนมัติ กฎ backend ที่ไม่ให้ตัดสินผลใหม่จาก revoked Certificate เป็นของ upstream เดิม

## Verification performed

เครื่องทดสอบ Windows, Python 3.13.5, Node 24.21.0; PostgreSQL 16.15 แบบ portable ที่ `127.0.0.1:55459` และ DB แยกเฉพาะ D ไม่มีการใช้ `.env` จริง, shared DB หรือ shared Storage ในการทดสอบนี้ JWT และรูป private เป็น fixture ในเครื่อง Certificates สำหรับ revoke ถูกออกผ่าน API Order → payment → shipping/Courier proof → inspection evidence/final result จริงใน test environment ไม่ได้เริ่มจาก seeded REVOKED row

| Check / exact command | Environment / DB isolation | Result / count | Evidence path |
|---|---|---|---|
| Backend command ด้านล่าง: revoke + existing INSPECT/CERT + public page/URL | Empty local DBs `cert_d_test_06`, `cert_d_inspect_test`; migrate ถึง A head จริง | **77 passed**, 2 upstream deprecation warnings; ประกอบด้วย revoke 18, existing INSPECT/CERT 46, public page/URL 13 | `backend/tests/test_certificate_revoke_postgres.py`, [09 verification](09-CERT-REVOKE-verification.json) |
| `npm run test:components -- --runTestsByPath component-tests/admin-certificate-screen.test.tsx component-tests/public-certificate-screen.test.tsx component-tests/inspection-views.test.tsx component-tests/inspection-session.test.tsx component-tests/inspection-connected.test.tsx component-tests/profile-screen.test.tsx --silent --json --outputFile=D:\projectsa\package-d-tools\D-mobile-results.json` | React Native renderer; mock network/auth/animation; actual screen and hook code | **50 passed / 6 suites** | [Component results](09-CERT-REVOKE-components.json) |
| `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-isolation=none tests/certificate-revoke-service.test.mjs tests/inspection-service.test.mjs` | Mobile request/body/deadline tests, mock HTTP responses | **11 passed** | `mobile/tests/certificate-revoke-service.test.mjs`, verification JSON |
| `npm run typecheck` | Mobile implementation + navigation commit | **PASS** | verification JSON |
| `D:\projectsa\SA-Project\backend\.venv\Scripts\python.exe D:\projectsa\package-d-tools\http-smoke.py` | Real mobile service → local HTTP API `127.0.0.1:8059` → PostgreSQL `cert_d_test_06`; separate server stopped after run | **PASS**: ISSUED read → revoke → same-key replay → Admin/public JSON + HTML REVOKED; one audit; all original business records unchanged | [HTTP smoke procedure](09-CERT-REVOKE-http-smoke.md) |
| `python -m alembic heads`; `git diff --check` | D checkout | **PASS**: `a02f20261002 (head)`, no patch whitespace errors | verification JSON |

Exact backend run from `D:\projectsa\package-d\backend`:

```powershell
$env:DATABASE_URL='sqlite:///:memory:'
$env:CERT_REVOKE_TEST_DATABASE_URL='postgresql+psycopg://cert_d_test@127.0.0.1:55459/cert_d_test_06'
$env:INSPECT_FLOW_TEST_DATABASE_URL='postgresql+psycopg://cert_d_test@127.0.0.1:55459/cert_d_inspect_test'
$env:PYTHONPATH='D:\projectsa\package-d-tools;D:\projectsa\package-d\backend'
& D:\projectsa\SA-Project\backend\.venv\Scripts\python.exe -m pytest -q tests/test_certificate_revoke_postgres.py tests/test_inspection_flow_postgres.py tests/test_certificate_public_page.py tests/test_certificate_urls.py --tb=short -p no:cacheprovider -p no:tmpdir -p cert_d_pytest_temp
```

Windows sandbox นี้ปฏิเสธ temp directories ที่ pytest สร้างด้วย mode 0700 จึงใช้ local fixture plugin ที่สร้าง temp path ด้วย permissions ที่สืบทอดจาก workspace แทน ไม่เปลี่ยน API/assertions หรือใช้ฐานข้อมูลร่วม; เครื่องปกติใช้ pytest ตามคำสั่งเดียวกันได้โดยตัด `-p no:tmpdir -p cert_d_pytest_temp` และ PYTHONPATH เฉพาะเครื่องนี้ออก **ต้องใช้ DB ว่างใหม่ทุกครั้ง** เพราะ tests ตั้งใจปฏิเสธฐานข้อมูลที่มีตารางอยู่แล้ว Node test runner ใช้ `--test-isolation=none` เพราะการ spawn child test process ถูกปฏิเสธใน sandbox

Baseline warnings: Starlette/httpx และ BlockingPortal deprecation จาก dependency เดิม ไม่พบ baseline functional failure ใน focused suites ที่รัน รอบพัฒนาพบและแก้ fixture ของ RELEASE ให้ตรง constraint ของ A, encoding ของ malformed-surrogate request และ lifecycle mock ใน component tests แล้ว ผลข้างต้นเป็นรอบผ่านหลังแก้ ไม่อ้าง error รอบก่อนว่าเป็นปัญหา production

## Contract and safety checks

### API mapping สำหรับ A/E

| Method / route | Input | Response / semantics |
|---|---|---|
| `GET /admin/certificates` | Active Admin bearer; `limit=1..50` (default 20), optional `before_id` และ `status=ISSUED\|REVOKED` | `{items, next_before_id}` เรียง ID จากใหม่ไปเก่า ไม่มี unrestricted user search |
| `GET /admin/certificates/{id}` | Active Admin bearer | Safe detail: `id, certificate_no, result, issued_at, status, revoked_at, public_url, can_revoke`; 404 ถ้าไม่มี |
| `POST /admin/certificates/{id}/revoke` | Active Admin bearer; `Idempotency-Key` ตาม validator เดิม; strict JSON `{reason}` เท่านั้น | 200 safe detail; replay body เดิม + `Idempotent-Replayed: true` |
| `GET /certificates/{token}` | Guest | HTML เดิม; revoked แสดงว่าใช้ยืนยันผลตรวจไม่ได้; invalid token 404 |
| `GET /certificates/{token}/json` | Guest | **เฉพาะ** `certificate_no, result, issued_at, status`; invalid token 404 |

ตัวอย่าง request (ใช้ ID จาก Admin list ไม่ใช้ public token เป็น ID):

```http
POST /admin/certificates/42/revoke
Authorization: Bearer <ACTIVE_ADMIN_ACCESS_TOKEN>
Content-Type: application/json
Idempotency-Key: revoke-review-000042

{"reason":"ตรวจพบข้อมูลหลักฐานไม่ถูกต้องหลังออกใบรับรอง"}
```

- `reason`: strict string, ตัด whitespace หัวท้ายก่อนนับ Unicode code points 10–1000; ไม่รับ null/number/bool/array/object, extra fields, NUL, surrogate หรือ control characters ที่จัดเก็บไม่ได้ การ trim ก่อน hash ทำให้การเติม whitespace รอบเหตุผลเดิม replay ได้
- Scope ของ key: **actor + REVOKE_CERTIFICATE + CERTIFICATE + certificate ID**; request payload ที่เปลี่ยนภายใต้ scope/key เดิมได้ 409 `idempotency_key_reused`; key ใหม่หรือ Admin คนอื่นบนใบที่ revoked แล้วได้ 409 `certificate_already_revoked` และไม่เขียน audit เพิ่ม
- Auth: guest 401; BUYER/SELLER/INSPECTOR/COURIER/unassigned/inactive Admin ไม่มีสิทธิ์ทั้ง list/detail/write; fresh role/status ถูกตรวจหลัง certificate lock และก่อน replay ด้วย ทดสอบระงับและลด role ขณะรอ lock จริงแล้ว
- Concurrency: 5-way same key, different keys, changed payload และ different Admins เลือก transition เดียว; audit INSERT failure rollback ทั้งสถานะและ audit แล้ว retry key เดิมสำเร็จ; audit UPDATE/DELETE ถูก append-only trigger ของ A ปฏิเสธ
- Preservation: เทียบข้อมูลทุกคอลัมน์ของ Order/inspection/evidence/Buyer decision/product/shipment/payment/receipt/escrow/settlement/history/resolution ก่อนและหลัง ทั้ง HELD, RELEASED และ REFUNDED; terminal settlement เป็น fixture ตาม schema ของ A ไม่ใช่การรับรอง service B
- Public safety: ตรวจ public HTML/JSON ก่อนและหลัง revoke รวม conditional request ที่ต้องได้ fresh 200 ไม่ใช่ 304; 404/422 และ Admin responses มี no-store; private reason, actor, email, address, object key ไม่อยู่ใน public response
- Native safety: revoked badge/sheet, ไม่มี valid seal, refresh/background failure ไม่คืน ISSUED เก่า, response ของ token/บัญชีเดิมไม่ทับบัญชีหรือใบใหม่, confirmation และ retry รักษาเหตุผล/key เดิม
- ไม่ได้เพิ่ม migration, dependency หรือ config secret; ไม่มี global admin/financial write เพิ่มเติม

## Remaining work / exact blocker

- **PENDING — F/task11:** public HTTPS QR เปิดบนโทรศัพท์อีกเครื่องโดยไม่ login, actual Android installation/navigation, real Google/Auth/private Storage และ full release two journeys บน candidate SHA เดียวกัน ยังไม่ได้ทดสอบในงานนี้
- **PENDING — A integration:** รับ core/navigation commits เข้าฐานรวม B/C/E แล้วรัน focused checks ซ้ำตามไฟล์ที่ conflict; PR #123 ยังไม่ merged ณ วันที่ตรวจ จึงไม่อ้างว่าโค้ด D อยู่ใน main แล้ว
- HTTP smoke ที่ผ่านเป็น local HTTP + PostgreSQL แยก ใช้ synthetic JWT; component tests เป็น renderer checks ไม่ใช่หลักฐานว่ากดบน Android จริงแล้ว
- หน้าสาธารณะไม่มี push event สำหรับ revocation ที่เกิดระหว่างเปิดหน้าค้างอยู่ ตรวจใหม่ได้เมื่อกลับเข้าหน้า/foreground หรือกดตรวจสถานะ; response ทุกครั้งห้าม cache ไม่ใช้ validity จาก offline cache
- ไม่มี required D implementation check ที่ยัง Fail/Not Run ในรายการข้างต้น

## Handoff

1. A ใช้ upstream `94a26a0...` หรือ descendant ที่มี foundation ของ A ครบ แล้วรับ core commit `61f7a6d...` ก่อน navigation commit `980a5ef...` จาก branch D แยก ห้ามใช้ checkout เก่าที่มี merge conflicts ของ `D:\projectsa\SA-Project` แทน repo `secondhand-marketplace-android-app`
2. **E/A/C — navigation:** navigation commit แตะเพียง `mobile/src/components/profile-screen.tsx` กับ component test ของ Profile หาก C/E เปลี่ยน Profile ไปแล้ว ให้นำเฉพาะปุ่ม Admin `จัดการใบรับรอง → router.push('/admin-certificates')` ไปวางในเมนู staff ล่าสุด และคง `disabled={auth.accountChecking}` ไม่แทน Profile หรือ theme ทั้งไฟล์ Expo Router ใช้ route files ใหม่ได้โดยไม่ต้องเพิ่ม global provider
3. **E — services/screens:** `createInspectionService()` มี exports `adminCertificates(token, beforeId?)`, `adminCertificate(token, id)`, `revokeCertificate(token, id, reason, key)` และ types `AdminCertificate`, `AdminCertificatesPage`; screen export `AdminCertificateScreen({certificateId?})`. ใช้ `useInspectionApi`/mutation helpers เดิม ห้ามสร้าง API หรือ optimistic revoke อีกชุด
4. **B/A — audit:** action `REVOKE_CERTIFICATE`, resource type `CERTIFICATE` ใช้ `fulfillment_commands` ร่วมแบบมี scope แยก อย่าตีความทุก command ว่าเป็น Order settlement และอย่า serialize `result.audit` ออก public API ไม่มีผลกระทบ migration 02 → 07 → 08
5. Config ที่ต้องมีเหมือน A: `DATABASE_URL`, `PUBLIC_CERTIFICATE_BASE_URL` เป็น public HTTPS origin ที่ F จัดให้, mobile `EXPO_PUBLIC_API_BASE_URL`, Auth configuration เดิม ไม่มี config ใหม่สำหรับ D
6. Merge/retest minimum: backend 4 files ในคำสั่งข้างต้น, mobile 6 component suites + 2 service suites + typecheck; F ทดสอบ Admin revoke จริง → เปิด QR เดิมอีกเครื่อง → เห็น REVOKED → ตรวจ receipt/settlement เดิม และเก็บหลักฐานกับ integrated candidate SHA

เอกสาร Expo SDK 57 ที่อ่านตาม mobile/AGENTS.md: [versioned Expo reference](https://docs.expo.dev/versions/v57.0.0/). ไม่มีการอัปเกรด SDK ในงานนี้
