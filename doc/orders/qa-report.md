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
