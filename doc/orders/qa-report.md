# ORDER-06 — QA Report: สั่งซื้อและจ่ายเงินจำลอง

## Environment
| รายการ | ค่า |
|---|---|
| วันที่ | 2026-09-18 |
| Base commit | `b977bd2` (branch `feat/seller-verification`) + การเปลี่ยนแปลงที่ยังไม่ commit ของงาน ORDER |
| OS | Windows 11 |
| Python / FastAPI / SQLAlchemy | 3.13.5 / 0.141.1 / 2.0.52 |
| ฐานข้อมูลทดสอบ | PostgreSQL 16.15 (Docker `postgres:16-alpine` ชื่อ `sa-order-test-pg` port 55432 ฐาน `order_test`) — **แยกจาก Supabase กลาง** |
| Node | 24.20.0 (mobile unit tests) |
| บัญชี | สร้างใหม่ทุกรอบ เป็นข้อมูลสมมติ (`demo buyer_a` ฯลฯ, อีเมล `@example.test`, UUID สุ่ม) JWT เซ็นด้วย secret ทดสอบเฉพาะในเครื่อง |

ฐานข้อมูลกลางไม่ถูกแตะ: ชุด test เดิมรันด้วย `DATABASE_URL=""` และชุด PostgreSQL/E2E ปฏิเสธการรันถ้า host ไม่ใช่ localhost หรือชื่อฐานไม่มีคำว่า `test`

## วิธีรัน
```powershell
# ฐานข้อมูลแยก
docker run -d --name sa-order-test-pg -e POSTGRES_PASSWORD=order_test_only -e POSTGRES_DB=order_test -p 55432:5432 postgres:16-alpine
$env:ORDER_TEST_DATABASE_URL = "postgresql+psycopg://postgres:order_test_only@localhost:55432/order_test"

cd backend
$env:DATABASE_URL = ""          # กันไม่ให้ test เดิมต่อ Supabase
.\.venv\Scripts\python.exe -m pytest -q

cd ..\mobile
npm test; npx tsc --noEmit; npx expo lint
```
E2E ผ่าน HTTP: ดูวิธีรันในหัวไฟล์ `backend/scripts/order_e2e_smoke.py`

## ผลการทดสอบอัตโนมัติ
| ชุด | ผล |
|---|---|
| Backend ทั้งหมด (`pytest`) | **155 passed, 8 skipped** (skip = test เดิมที่ต้องใช้ Supabase กลาง) |
| └ `test_orders_api.py` (SQLite, พฤติกรรม API) | 47 passed |
| └ `test_orders_postgres.py` (PostgreSQL แยก: migration, constraint, race) | 12 passed |
| Mutation check: ลบ `with_for_update()` | test race SUCCESS vs FAILED **ล้ม** (ยืนยันว่า test จับได้จริง) |
| E2E HTTP (`order_e2e_smoke.py`) × 3 รอบ | **27/27 passed ทุกรอบ** |
| Mobile `npm test` | 158 passed (ใหม่ 29) |
| Mobile `tsc --noEmit` | ผ่าน |
| Mobile `expo lint` | 0 error (2 warning เดิมใน `login-screen.tsx`) |

## ตารางกรณีสำคัญ (Expected / Actual)
| กรณี | Expected | Actual | หลักฐาน |
|---|---|---|---|
| Happy path | `WAITING_PAYMENT → SUCCESS → WAITING_SELLER_SHIP`, Escrow `HELD` 1, Receipt 1 | ตรง; DB (attempt, payment, escrow, receipt) = (1,1,1,1) | E2E, `test_success_payment_creates_one_payment_escrow_receipt` |
| FAILED แล้ว Retry | FAILED ไม่สร้างเงิน, key ใหม่ SUCCESS | DB หลัง FAILED = (1,0,0,0), หลัง SUCCESS = (2,1,1,1) | E2E, `test_failed_then_retry_with_new_key_succeeds` |
| Buyer A/B สร้างพร้อมกัน | ผู้ชนะ 1, ผู้แพ้ 409 | `[201, 409]`, DB 1 order/สินค้า (15 รอบ stress + 1 แบบกำหนดลำดับ + E2E) | `test_two_buyers_racing_…`, `test_parallel_create_stress_…` |
| จ่ายซ้ำ key เดิม | ผลเดิม ไม่มีแถวใหม่ | attempt id เดิม, `Idempotent-Replayed: true` | `test_retry_after_timeout_with_same_key_…`, `test_racing_same_key_…` |
| จ่ายซ้ำ key ใหม่หลังจ่ายแล้ว | 409 ไม่มีเงินซ้ำ | 409 `order_already_paid`, DB ไม่เปลี่ยน | E2E, `test_new_key_after_paid_…` |
| SUCCESS/FAILED แข่งกัน | ไม่ลดสถานะ, เงิน 1 ชุด | ผ่าน (row lock บังคับลำดับ) | `test_racing_payment_never_duplicates_or_downgrades[FAILED]` |
| คำขอจ่ายพร้อมกัน 6 คำขอ | Payment/Escrow/Receipt = 1 | (1,1,1) ทุกรอบ (8 รอบ + E2E) | `test_parallel_payment_stress` |
| Timeout | ลองซ้ำด้วย key เดิมได้ผลเดิม, Mobile ตรวจสถานะก่อน | ผ่าน | backend test + `order-stores.test.mjs` |
| แก้ยอด/ส่ง buyer_id จาก Client | ปฏิเสธ | 422 | E2E, `test_create_ignores_nothing_from_client_…` |
| ซื้อของตัวเอง | ปฏิเสธ | 409 `self_purchase` (และ SELLER role → 403) | `test_cannot_buy_own_product` |
| สินค้าถูกจอง / ถูกลบ | 409 / 404 | ตรง | E2E |
| ไม่ Login | 401/403 | ตรง | E2E |
| เดา Order/Receipt ของผู้อื่น | 404 | 404 (ผู้ขายของ Order ขอใบเสร็จ = 403) | E2E, `test_detail_permissions_and_views`, `test_receipt_access` |
| Rollback ตอนสร้าง Order ล้ม | สินค้ากลับ AVAILABLE, ไม่มี Order | ตรง | `test_create_rolls_back_…` (2 กรณี) |
| Rollback ตอนจ่ายล้มกลางทาง | ไม่มี attempt/payment/escrow/receipt | ตรง | `test_payment_rolls_back_everything_…` |
| Snapshot | แก้สินค้าภายหลัง Order ไม่เปลี่ยน | ตรง | `test_order_snapshot_does_not_follow_product_edits` |

## Bug ที่พบระหว่าง QA
| # | อาการ | สาเหตุ | สถานะ |
|---|---|---|---|
| QA-1 | E2E "Buyer B list is empty" ล้ม 1 ครั้ง | Script คาดผิด: B อาจชนะการแข่งจอง | แก้ script ให้เทียบกับ DB — ไม่ใช่ Bug ของระบบ |
| QA-2 | Checkout เปิดซ้ำอาจพาไป Order ของรอบก่อน (พบจาก review ก่อนรันจริง) | state ของ checkout ค้างหลังออกจากหน้า | แก้: `close()` ตอน unmount |

ไม่พบ Bug ที่ทำให้เงินซ้ำ จองซ้ำ หรือข้อมูลรั่ว

## ยังไม่ได้ทดสอบ (ต้องทำก่อนปิด Feature)
**การทดสอบบนมือถือจริง** — ยังไม่ได้รัน เพราะ Login ต้องผ่าน Google OAuth ด้วยบัญชีทดสอบจริงที่ไม่มีในสภาพแวดล้อมนี้
ตรรกะของแอป (กดซ้ำ, timeout, สลับบัญชี, pagination) มี unit test ครอบคลุมแล้ว แต่ **ORDER-04 ระบุว่า Mock อย่างเดียวไม่นับว่าปิดงาน**
ให้ QA รันตาม `mobile/docs/testing/orders-checkout.md` แล้วบันทึกผลกลับในไฟล์นี้


---

# ORDER-08 — ยกเลิก Order และเส้นตายการจ่ายเงิน (เพิ่มเติม 2026-09-23)

## Environment
| รายการ | ค่า |
|---|---|
| วันที่ | 2026-09-23 |
| Base commit | `99ec8bf` (= `origin/main`) |
| OS | Windows 11 |
| ฐานข้อมูลที่ใช้ทดสอบ | **SQLite ในหน่วยความจำเท่านั้น** |
| Node | ตามที่ติดตั้งในเครื่อง (mobile tests) |

## ผลการทดสอบอัตโนมัติ
| ชุด | ผล |
|---|---|
| Backend ทั้งหมด (`pytest`, `DATABASE_URL=""`) | **360 passed, 36 skipped** |
| └ `test_orders_api.py` (SQLite, พฤติกรรม API) | 61 passed (เดิม 46 + ใหม่ 15) |
| └ `test_orders_postgres.py` | **skipped ทั้งหมด** (ไม่มี PostgreSQL/Docker ในเครื่องที่แก้) |
| Mobile `npm run test:logic` | 267 passed (เดิม 256 + ใหม่ 11) |
| Mobile `npm run test:components` (jest) | 93 passed (เดิม 92 + ใหม่ 1) |
| Mobile `tsc --noEmit` | ผ่าน |
| Mobile `expo lint` | ผ่าน (exit 0) |

## กรณีที่เพิ่มและผลลัพธ์ (SQLite)
| กรณี | Expected | Actual |
|---|---|---|
| ผู้ซื้อยกเลิก Order ที่ยังไม่จ่าย | สถานะ `CANCELLED`, `cancel_reason=BUYER`, สินค้ากลับเป็น `AVAILABLE`, ไม่มีแถวเงินใด ๆ | ตรง |
| ยกเลิกซ้ำ | 200 ผลเดิม `cancelled_at` ไม่เปลี่ยน มี Order เดียว | ตรง |
| ผู้ซื้อคนอื่น / ผู้ซื้อคนเดิม สั่งซื้อสินค้าเดิมหลังยกเลิก | สร้าง Order ใหม่ได้ ไม่ติด `already_ordered` | ตรง |
| ยกเลิกหลังจ่ายเงินแล้ว | 409 `order_already_paid` สถานะไม่ถอยหลัง | ตรง |
| จ่ายเงิน Order ที่ยกเลิกแล้ว | 409 `order_cancelled` ไม่บันทึก attempt | ตรง |
| ผู้ขาย / คนนอก / บัญชีถูกระงับ ขอยกเลิก | 403 `not_order_buyer` / 404 / 403 `account_inactive` | ตรง |
| จ่ายเงินหลังเลย `expires_at` | 409 `order_expired`, Order เป็น `CANCELLED` (`EXPIRED`), ไม่มี attempt, สินค้าคืนเป็น `AVAILABLE` | ตรง |
| เปิดหน้ารายละเอียด / รายการ หลังเลยเวลา | สถานะกลายเป็น `CANCELLED` และสินค้าถูกปล่อย | ตรง |
| ผู้ซื้อรายอื่นซื้อสินค้าที่การจองหมดเวลา (ยังไม่มีใครเปิดดู Order เดิม) | ซื้อได้ทันที | ตรง |
| Order ที่จ่ายแล้วถูกเลื่อนเวลาให้เลยเส้นตาย | ไม่ถูกยกเลิก สถานะคงเดิม | ตรง |
| ยกเลิกหลังเลยเวลาแต่ยังไม่มีใครกวาด | บันทึก `cancel_reason=EXPIRED` ตามความจริง | ตรง |

## ยังไม่ได้ทดสอบ (สถานะ ณ 2026-09-23 รอบ ORDER-09)
1. ~~ชุด PostgreSQL~~ → **ปิดแล้ว** รันจริงเมื่อ 2026-09-23 บน PostgreSQL 16 ในเครื่อง ผ่าน 18/18
   (รวม `test_cancelled_order_frees_the_product_slot`, `test_cancel_fields_must_match_status`,
   `test_paid_order_cannot_be_marked_cancelled`, `test_racing_cancel_never_beats_successful_payment`
   และ migration `b41d7ce09f35` ทั้ง upgrade/downgrade/backfill) ดูรายละเอียดในหัวข้อ ORDER-09 ด้านล่าง
2. ~~E2E HTTP~~ → **ปิดแล้ว** เพิ่มกรณียกเลิก/หมดเวลา/มุมมองผู้ดูแลเข้าไปในสคริปต์ และรันจริงผ่าน 50/50
3. **การทดสอบบนมือถือจริง** — **ยังติดอยู่** เหตุผลและตัวบล็อกที่ตรวจแล้วอยู่ในหัวข้อ ORDER-09 ด้านล่าง

## หมายเหตุระหว่างทำ
- `npm test` รอบหนึ่งมี component test ล้ม 1 รายการแบบไม่คงที่ (React `act` warning ใน `login-screen`)
  รันซ้ำแล้วผ่านทั้งหมด เป็นอาการเดิมที่ไม่เกี่ยวกับงานนี้ แต่ควรตามแก้
- สภาพแวดล้อมที่แก้ขาดของเดิมอยู่สองอย่างและได้ติดตั้ง/สร้างใหม่แล้ว: `Pillow` ใน venv ของ backend
  (มีใน `requirements.txt` อยู่แล้ว) และ type ของ expo-router ใน `mobile/.expo/types` ที่ค้างอยู่ก่อนงาน PRODUCT-07


---

# ORDER-09 — มุมมอง Order ของผู้ดูแล และการปิดรายการค้าง (2026-09-23)

## Environment
| รายการ | ค่า |
|---|---|
| วันที่ | 2026-09-23 |
| Base commit | `df0d28d` (ORDER-08 บน `feat/order-08-cancel-expiry`) |
| OS | Windows 11 |
| ฐานข้อมูลที่ใช้ทดสอบ | SQLite ในหน่วยความจำ **และ PostgreSQL 16** (Docker `postgres:16-alpine` พอร์ต 55432 ในเครื่อง) |

## ผลการทดสอบอัตโนมัติ
| ชุด | ผล |
|---|---|
| Backend ทั้งหมด (SQLite เท่านั้น, `DATABASE_URL=""`) | **394 passed, 40 skipped** |
| Backend ทั้งหมด **พร้อม PostgreSQL** (`TEST_DATABASE_URL` + `ORDER_TEST_DATABASE_URL`) | **432 passed, 2 skipped** |
| └ `tests/test_orders_postgres.py` | **20 passed** (เดิม skip ทั้งหมด) |
| └ `tests/test_admin_orders.py` (ใหม่) | 28 passed |
| └ `tests/test_orders_api.py` | 62 passed |
| └ `tests/test_product_upload_schema.py` + `tests/test_user_migration.py` (ฐานข้อมูลเปล่า) | 28 passed |
| ที่เหลืออีก 2 skipped รันแยกแล้วผ่าน | `test_auth.py` (30 passed ด้วย `AUTH_TEST_DATABASE_URL`), `test_database_security.py` (1 passed ด้วย `DATABASE_URL` ชี้ฐานข้อมูลทดสอบ) |
| E2E ผ่าน HTTP จริง (`scripts/order_e2e_smoke.py`) | **57/57 passed** (เพิ่มกรณี ORDER-08, ORDER-09 และแคตตาล็อกเข้าไปแล้ว) |
| Mobile `npm run test:logic` | **281 passed** (เดิม 267 + ใหม่ 14) |
| Mobile `npm run test:components` | **101 passed** (เดิม 93 + ใหม่ 8 จาก jest run เต็ม) |
| Mobile `tsc --noEmit` / `expo lint` | ผ่านทั้งคู่ (exit 0) |

## กรณีที่เพิ่มและผลลัพธ์
| กรณี | Expected | Actual |
|---|---|---|
| ผู้ดูแลเปิดรายการ Order ทั้งระบบ | 200 อีเมลถูกปิดบัง และ **ไม่มีที่อยู่ในรายการเลย** | ตรง |
| ผู้ดูแลเปิดรายละเอียด Order | ที่อยู่เหลือจังหวัด/รหัสไปรษณีย์/เลขท้ายโทรศัพท์ อีเมลเหลือตัวแรก | ตรง |
| ผู้ดูแลขอดูข้อมูลเต็มพร้อมเหตุผล | 200 ได้อีเมลและที่อยู่เต็ม พร้อมหนึ่งแถวใน `admin_access_logs` | ตรง |
| ขอดูข้อมูลเต็มโดยไม่มีเหตุผล / เหตุผลสั้น / ยาวเกิน | 422 `validation_error` และ **ไม่มีแถว Audit** | ตรง |
| ขอดู Order ที่ไม่มีจริง | 404 `order_not_found` และไม่มีแถว Audit | ตรง |
| เรียกซ้ำสองครั้ง | ได้ Audit สองแถว (ตั้งใจให้เป็นเช่นนั้น) | ตรง |
| ปิดด้วย `ADMIN_ORDER_CONTACT_REVEAL_ENABLED=false` | 403 `admin_contact_reveal_disabled`, `contact_reveal_available=false` แต่มุมมองปิดบังยังใช้ได้ | ตรง |
| ผู้ซื้อ / ผู้ขาย / INSPECTOR / ผู้ดูแลที่ถูกระงับ เรียก `/admin/orders...` | 403 ทุกกรณี และไม่มีแถว Audit | ตรง |
| ผู้ดูแลเรียก `/orders/{id}`, `/cancel`, `/receipt` | 404 ทุกกรณี (สิทธิ์เดิมไม่เปลี่ยน) | ตรง |
| ผู้ขายเปิด Order ที่ยังไม่จ่ายหลังผู้ดูแลเปิดดูข้อมูลเต็ม | ยังได้ `shipping_address: null` เหมือนเดิม | ตรง |
| ผู้ดูแลเปิดรายการขณะมี Order เลยเวลา | Order กลายเป็น `CANCELLED`/`EXPIRED` และสินค้าถูกปล่อย | ตรง |
| สั่งซื้อสินค้าที่ `sale_type` ไม่ใช่ `FIXED_PRICE` | 409 `sale_type_unsupported` ทั้งที่ `POST /orders` และ `checkout-quote` ไม่มี Order เกิดขึ้น | ตรง |
| ทางเข้า "ซื้อด้วยรหัสสินค้า" บนมือถือ | ซ่อนเป็นค่าตั้งต้น เปิดได้เฉพาะ build พัฒนาที่ตั้ง flag และ deep link ตรง ๆ ก็ถูกเด้งกลับ | ตรง |
| สคริปต์ `scripts/release_expired_orders.py` บนฐานข้อมูลจริง | โหมดดูอย่างเดียวไม่เขียนอะไร, `--apply` ยกเลิก 2 Order ที่หมดเวลาและปล่อยสินค้าค้างจอง 1 ชิ้น | ตรง |

## Migration บนฐานข้อมูลแยก (ตามที่โจทย์กำหนดก่อนขึ้น Supabase)
| ขั้นตอน | ผล |
|---|---|
| `alembic upgrade head` บนฐานข้อมูลเปล่า | ผ่านทั้งกราฟถึง `a5f1c9d2e7b3` |
| `alembic downgrade -1` แล้ว `upgrade head` ซ้ำ | ผ่าน ตาราง `admin_access_logs` หายแล้วกลับมาพร้อม CHECK ครบ 3 ตัวและ FK (ไม่มี duplicate constraint) |
| upgrade → downgrade → upgrade ของกลุ่ม ORDER ทั้งชุด | ผ่าน (`test_migration_downgrade_and_upgrade_round_trip`) ตารางของทีมอื่นไม่ถูกแตะ |
| migrate จากฐานข้อมูลที่มีข้อมูลเดิม (users/products/images) | ผ่าน (`test_product_upload_schema.py`, `test_user_migration.py`) |

**ยังไม่ได้รันกับ Supabase กลาง** — ขั้นตอนนั้นต้องให้ผู้ถือสิทธิ์ฐานข้อมูลกลางรันตาม `doc/orders/migration-plan.md`

## การทดสอบบนมือถือจริง (M1–M27) — ยังติด พร้อมผลการตรวจตามโจทย์
ตรวจตามที่โจทย์สั่ง (FR-01 เปิดทางทั้งอีเมลและ Social Login) ผลคือ **เปิดใช้จริงในรอบนี้ไม่ได้** ด้วยเหตุผลต่อไปนี้

| สิ่งที่ตรวจ | ผลที่ได้ (จาก `GET /auth/v1/settings` ของโปรเจกต์ Supabase ที่ตั้งค่าไว้) |
|---|---|
| Email/Password provider | **เปิดอยู่** (`external.email = true`) |
| สมัครสมาชิกใหม่ | **เปิดอยู่** (`disable_signup = false`) |
| ยืนยันอีเมลอัตโนมัติ | **ปิด** (`mailer_autoconfirm = false`) → บัญชีใหม่ล็อกอินไม่ได้จนกว่าจะกดลิงก์ในเมลจริง |
| Magic Link / OTP ทางโทรศัพท์ | อีเมลใช้ได้ผ่าน provider เดียวกัน ส่วน `phone = false` |

ตัวบล็อกที่เหลือ (เรียงตามลำดับที่ต้องแก้)
1. **แอปยังไม่มีทางล็อกอินด้วยอีเมลเลย** — `mobile/src/auth/auth-provider.tsx` มีแต่ `signInWithOAuth`
   ผ่าน `createGoogleLoginAdapter` ไม่มีหน้าจอกรอกอีเมล/รหัสผ่านหรือขอ Magic Link
   ต่อให้สร้างบัญชีในฝั่ง Supabase ได้ ก็ยังล็อกอินในแอปไม่ได้ **ผู้ปลดล็อก:** เจ้าของงาน FR-01 (ต้องมีมติก่อนว่าจะเพิ่มทางล็อกอินนี้ในรอบไหน เพราะเป็น Feature ใหม่ ไม่ใช่การตั้งค่า)
2. **มีโปรเจกต์ Supabase ชุดเดียว** (ค่าใน `mobile/.env` และ `backend/.env` ชี้ที่เดียวกัน)
   จึงไม่มี "environment ทดสอบ" ให้เปิดค่าอะไรแยกได้ การสร้างบัญชีทดสอบคือการเขียนลงระบบที่ใช้ร่วมกันทั้งทีม
   **ผู้ปลดล็อก:** เจ้าของโปรเจกต์ Supabase (สร้างโปรเจกต์ทดสอบแยก + เปิด `mailer_autoconfirm` ที่โปรเจกต์นั้น
   หรือส่ง service-role key ของโปรเจกต์ทดสอบมาเพื่อสร้างบัญชีแบบยืนยันอีเมลให้เอง)
3. **ไม่มีเครื่อง Android/Emulator ในสภาพแวดล้อมนี้** เช็กลิสต์ M1–M27 เป็นการทดสอบบนเครื่องจริง
   **ผู้ปลดล็อก:** QA หรือผู้พัฒนาที่มีเครื่องทดสอบ

จนกว่าทั้งสามข้อจะปลด ตรรกะฝั่งแอปยืนยันได้เท่าที่ unit/component test ครอบคลุม (281 + 101 กรณี)
และ **ORDER-04 ยังถือว่าไม่ปิด** ตามที่ระบุไว้เดิม

## หมายเหตุระหว่างทำ
- พบ test ที่ล้มอยู่ก่อนแล้วสองกลุ่ม และแก้ในรอบนี้เพราะขวางการรันชุด PostgreSQL ทั้งชุด
  1. `tests/test_product_images_upload.py` 3 กรณีที่ตรวจข้อความ log ล้มเมื่อรันรวมกับ test ที่เรียก alembic
     สาเหตุคือ `fileConfig()` ใน `migrations/env.py` ปิด logger เดิมทั้งหมด ทำให้ `caplog` ของ pytest ตายไปด้วย
     แก้ด้วย `disable_existing_loggers=False`
  2. `tests/test_verification_postgres.py::test_migration_upgrades_to_verification_head` ผูกกับเลข revision
     ตายตัว (`f02a03c91801`) จึงล้มทุกครั้งที่มี migration ใหม่ แก้ให้เทียบกับ head ปัจจุบันของ repo แทน
     และยังตรวจว่า revision ของงานยืนยันตัวตนถูกใช้ไปแล้วเหมือนเดิม
- ตารางทดสอบ PostgreSQL ที่ใช้: `order_test`, `schema_test`, `auth_test`, `security_test` เป็นฐานข้อมูลในเครื่อง
  ที่สร้างใหม่ทุกครั้งและทิ้งได้ ไม่มีการเชื่อมต่อฐานข้อมูลกลางในทุกขั้นตอน


## รอบแก้ตามรีวิว PR #92 (2026-09-23)

**ปัญหาที่ผู้รีวิวเจอ (merge blocker):** สินค้าที่การจองหมดเวลาหายจากแคตตาล็อกถาวร
แคตตาล็อกคืนเฉพาะสินค้า `AVAILABLE` และไม่ได้กวาด Order ที่หมดเวลา ส่วนการกวาดมีแต่ในเส้นทางของงานสั่งซื้อ
ซึ่งต้องรู้ `product_id` หรือ `order_id` อยู่แล้ว ผู้ซื้อที่เดินดูแอปตามปกติจึงไปไม่ถึงสินค้าชิ้นนั้นเลย
**ยืนยันแล้วว่าเป็นจริง** (`public_product_filter()` บังคับ `status == "AVAILABLE"` และไม่มีการกวาดใน `product_reads.py`)

**สิ่งที่แก้**
| รายการ | รายละเอียด |
|---|---|
| ย้ายตรรกะการกวาด | `app/services/order_expiry.py` (จากเดิมอยู่ใน `app/api/orders.py`) เพื่อให้แคตตาล็อกเรียกได้โดยไม่ต้องอ้าง API อื่น |
| จุดกวาดใหม่ | `GET /products` (ทั้งระบบ), `GET /products/{id}` (เฉพาะสินค้านั้น), `GET /products/me` (เฉพาะของผู้ขายคนนั้น) |
| ต้นทุนต่อคำขอ | ถามด้วยคำสั่งอ่าน `LIMIT 1` ก่อน เขียนเฉพาะเมื่อมีของค้างจริง จำนวนคำสั่งต่อคำขอคงที่ (test เดิม `test_list_query_count_does_not_grow_with_products` ยังคุมอยู่ ปรับจาก 4 เป็น 5) |
| index รองรับ | migration `c93b7e5a1d84` สร้าง `ix_orders_waiting_expires_at` แบบ partial (`WHERE status = 'WAITING_PAYMENT'`) |
| กันพัง | การกวาดล้มเหลวไม่ทำให้หน้าสินค้าพัง จับ `SQLAlchemyError` แล้วบันทึก log และอ่านข้อมูลต่อ |

**Test ที่เพิ่ม**
| กรณี | Expected | Actual |
|---|---|---|
| ยังไม่หมดเวลา เปิดแคตตาล็อก | สินค้ายังซ่อน สถานะยัง `RESERVED` (ไม่ถูกปล่อยเพราะแค่มีคนเปิดดู) | ตรง |
| หมดเวลาแล้ว เปิด `GET /products` | สินค้ากลับมาในรายการ, สินค้าเป็น `AVAILABLE`, Order เป็น `CANCELLED`/`EXPIRED` | ตรง |
| หมดเวลาแล้ว เปิด `GET /products/{id}` ตรง ๆ | 200 และสินค้าถูกปล่อย โดยไม่ต้องรอให้ใครเปิดหน้ารายการก่อน | ตรง |
| หมดเวลาแล้ว ผู้ขายเปิด `GET /products/me` | เห็นสถานะ `AVAILABLE` ไม่ใช่ `RESERVED` ค้าง | ตรง |
| สินค้าที่จ่ายเงินแล้วถูกเลื่อนเวลาให้เลยเส้นตาย | ไม่ถูกปล่อยไม่ว่าจะเปิดแคตตาล็อกกี่ครั้ง | ตรง |
| E2E ผ่าน HTTP: จอง → หายจากรายการ → หมดเวลา → กลับมาในรายการและเปิดรายละเอียดได้ | ตรงทุกขั้น | ตรง (7 กรณีใหม่) |

**Backfill ของ Order เดิม (ตามที่ผู้รีวิวขอให้ยืนยัน)**
`test_migration_backfills_deadlines_for_pre_existing_orders` บน PostgreSQL: downgrade กลับไปก่อน ORDER-08
ใส่ Order แบบเก่าที่ไม่มีคอลัมน์เส้นตาย (`created_at = 2026-09-01T08:00Z`) แล้ว upgrade ใหม่
ได้ `expires_at = created_at + 30 นาที` จริง ไม่ใช่เวลาที่รัน migration และ `cancelled_at`/`cancel_reason` ยังว่าง


## รอบแก้ตามรีวิว PR #92 ครั้งที่ 2 (2026-09-23)

ผู้รีวิวพบปัญหาที่ทำซ้ำได้ 3 ข้อ ตรวจแล้วเป็นจริงทั้งหมดและแก้ครบ พร้อม test ที่ **ยืนยันแล้วว่าล้มก่อนแก้**

| # | ปัญหา | สาเหตุ | วิธีแก้ | Test ที่กันไว้ |
|---|---|---|---|---|
| 1 | ส่งซ้ำด้วย key เดิมหลังหมดเวลา ได้ 200 + `WAITING_PAYMENT` และสินค้ายังค้างถูกจอง | เส้นทาง replay ตอบกลับ **ก่อน** การตรวจเส้นตาย | ย้ายการตรวจ/กวาดเส้นตายขึ้นไปก่อนการหา attempt เดิม; replay ยังได้ attempt เดิมแต่สถานะ Order ที่แนบไปเป็นของจริง | `test_replaying_a_failed_attempt_after_the_deadline_applies_the_expiry` และอีก 2 กรณี |
| 2 | นับถอยหลังรีเฟรชเร็วเกินไปแล้วค้าง | หน้าจอใช้ "ข้อความนับถอยหลังเป็น null" เป็นตัวตัดสินว่าหมดเวลา ซึ่งเป็นจริงตั้งแต่ 999 ms ก่อนเส้นตาย และ effect ถูกยิงครั้งเดียว | ตัดสินจากเวลาดิบ (`deadlineAt`) เทียบกับนาฬิกา และถามสถานะซ้ำทุก 5 วินาทีจนกว่า server จะตอบสถานะสุดท้าย; `formatRemaining` ปัดขึ้นจึงไม่มีช่วงว่าง 1 วินาที | component test 3 กรณีใน `order-detail-screen.test.tsx` + unit test ของ formatter |
| 3 | การรีเฟรชที่มาช้าลบผลการยกเลิกที่สำเร็จแล้ว | `fetchOrder` กันเฉพาะการเปลี่ยน Order/ผู้ใช้ ไม่ได้กันผลการอ่านที่เก่ากว่าคำตอบล่าสุด | เพิ่มลำดับ (`orderEpoch`) ที่เพิ่มขึ้นทุกครั้งที่ได้ผลการจ่ายหรือการยกเลิก ผลการอ่านที่ออกไปก่อนหน้านั้นถูกทิ้ง | 2 กรณีใน `order-stores.test.mjs` (ทั้งยกเลิกและจ่ายเงิน) |

**ยืนยันว่า test จับปัญหาได้จริง** — ปิดเฉพาะโค้ดที่แก้แล้วรัน test ใหม่: ข้อ 1 ล้ม 1 กรณี, ข้อ 2 ล้ม 1 กรณี, ข้อ 3 ล้ม 2 กรณี
จากนั้นคืนโค้ดแล้วผ่านทั้งหมด

### ช่องว่างที่ผู้รีวิวชี้ และยอมรับตามนั้น
**NFR-10 ยังไม่ปิด** — ข้อกำหนดต้องการให้ระบบยกเลิก **โดยอัตโนมัติ** เมื่อครบ 30 นาที
แต่ lazy expiry ยกเลิกให้ต่อเมื่อมีคำขอมาแตะหรือมีคนรันสคริปต์ ผลที่ผู้ใช้เห็นตรงตามข้อกำหนดในทุกเส้นทางที่มีคนใช้งานแล้ว
(รวมแคตตาล็อกตั้งแต่รอบรีวิวที่ 1) แต่ "แถวในฐานข้อมูลเปลี่ยนเองที่นาทีที่ 30" ยังไม่เกิด
บันทึกไว้ใน D-05 แล้วว่า **ต้องเปิดข้อกำหนดนี้ค้างไว้จนกว่าจะมี Scheduled Job ทำงานจริง**

### ผลรันหลังแก้
| ชุด | ผล |
|---|---|
| Backend ทั้งหมด **พร้อม PostgreSQL 16** | **441 passed, 2 skipped** |
| └ `tests/test_orders_api.py` | 71 passed |
| E2E ผ่าน HTTP จริง | **57/57 passed** |
| Mobile `test:logic` / `test:components` | **289 passed** / **104 passed** |
| Mobile `tsc --noEmit` / `expo lint` | ผ่านทั้งคู่ |
