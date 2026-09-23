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

## ยังไม่ได้ทดสอบ (ต้องทำก่อนปิดงาน)
1. **ชุด PostgreSQL (`test_orders_postgres.py`)** — เครื่องที่แก้ไม่มี Docker/PostgreSQL จึง skip ทั้งหมด
   ชุดนี้มี test ใหม่ที่ **ยังไม่เคยรันจริงเลย** ได้แก่
   `test_cancelled_order_frees_the_product_slot`, `test_cancel_fields_must_match_status`,
   `test_paid_order_cannot_be_marked_cancelled`, `test_racing_cancel_never_beats_successful_payment`
   และ migration `b41d7ce09f35` (upgrade/downgrade/backfill) ก็ยังไม่เคยรันบน PostgreSQL
   ต้องรันตามวิธีในหัวข้อ "วิธีรัน" ด้านบนก่อนถือว่างานนี้ผ่าน
2. **E2E HTTP (`scripts/order_e2e_smoke.py`)** — ยังไม่ได้รันหลังการแก้ (ต้องใช้ PostgreSQL เช่นกัน)
   และยังไม่ได้เพิ่มกรณียกเลิก/หมดเวลาเข้าไปในสคริปต์
3. **การทดสอบบนมือถือจริง** — ยังเหมือนเดิม ให้ QA รันตาม `mobile/docs/testing/orders-checkout.md`
   ซึ่งเพิ่มกรณี M17–M27 (ปุ่มซื้อในหน้าสินค้า การยกเลิก และการหมดเวลา) แล้ว

## หมายเหตุระหว่างทำ
- `npm test` รอบหนึ่งมี component test ล้ม 1 รายการแบบไม่คงที่ (React `act` warning ใน `login-screen`)
  รันซ้ำแล้วผ่านทั้งหมด เป็นอาการเดิมที่ไม่เกี่ยวกับงานนี้ แต่ควรตามแก้
- สภาพแวดล้อมที่แก้ขาดของเดิมอยู่สองอย่างและได้ติดตั้ง/สร้างใหม่แล้ว: `Pillow` ใน venv ของ backend
  (มีใน `requirements.txt` อยู่แล้ว) และ type ของ expo-router ใน `mobile/.expo/types` ที่ค้างอยู่ก่อนงาน PRODUCT-07
