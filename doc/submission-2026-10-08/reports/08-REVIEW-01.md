# Task delivery report — 08 / REVIEW-01

- Task ID / owner: 08 / package C
- Status: PARTIAL — independent implementation/tests complete; final integration BLOCKED pending accepted B/task04. Native evidence PENDING F.
- Repo / branch: `D:\projectsa\package-c` / `codex/c-profile-reviews-2026-10-02`
- Upstream SHA: task07 `60abb9988530ff648d9b45cb49aa9843b2dae679`, based on A PR123 `94a26a0fbb7a0a82948d95de7db9af070707b770`.
- Delivered implementation SHA: `d0b7f143fffbd67267165f0656853f108410061e`; report/API examples follow as documentation only.
- B status checked: PR124 OPEN at `67c69c83ebae7a3efa717c10ccbd488f971caf99`, titled “Package B preparation: tested contracts and handoff; task02 pending”. No B commit merged here, no accepted task04 SHA available.
- Migration predecessor/head: `a02f20261002` → `c07f20261002` → `c08f20261002`; one Alembic head.
- Date / timezone: 2 October 2026 / Asia/Bangkok

## What changed and why

เพิ่ม immutable Review 1 แถวต่อ Order, rating integer 1–5, comment ไม่บังคับ ≤1000 อักขระ และ UTC DB timestamp. Server derive buyer/seller/product จาก owning locked Order เท่านั้น. Service และ PostgreSQL trigger ตรวจ COMPLETED + Escrow RELEASED + terminal RELEASE และ actor ACTIVE; approved SELLER ที่ซื้อ Order ผู้อื่นรีวิวได้. Existing reviews ไม่ถูกลบเมื่อผู้ซื้อเปลี่ยน role/status.

Routes: GET/POST `/orders/{id}/review`, public GET `/sellers/{seller_id}/reviews?limit=20&offset=0`. ใช้ FulfillmentCommand เดิมของ A บันทึก key/canonical payload/result ใน transaction เดียวกับ review. Same-key/same-payload → original 201 + `Idempotent-Replayed: true`; same key/different payload → 409 `idempotency_key_reused`; different key/duplicate → 409 `review_already_exists`.

Public projection ใช้ label `ผู้ซื้อที่ยืนยันการซื้อ` และ Order.product_name snapshot; ไม่มี buyer/order IDs, ชื่อจริง/email/address/identity/storage keys. Public seller ต้อง ACTIVE SELLER + latest APPROVED ตาม catalog. Aggregate และ page อ่านใน SQL statement เดียว จึงใช้ PostgreSQL snapshot เดียวกัน; zero average=null, distribution ครบ 1–5. ไม่มี stored aggregate ที่เสี่ยงเพิ่มซ้ำ.

ReviewModal, route review และ OrderReviewEntry ใช้ can_review/actual submitted review จาก server; ไม่สร้าง local reviewed=true. Network failure เก็บ draft/key เดิมและไม่ navigate. SellerReviewsModal/summary อ่าน API จริง มี empty/error/retry/previous/next. เอา mock score/count และ product/inspection ratings/tags/photos ออก รวมคะแนนสมมติใน My Products. Product public seller projection เพิ่ม `seller.id` เพื่อเรียก endpoint ได้จริง; ไม่ใช้ buyer/provider ID. Existing consumers ยังอ่าน display_name/verified เดิม.

## Verification performed

Python executable: `D:\projectsa\SA-Project\backend\.venv\Scripts\python.exe`; PostgreSQL 16.15 แยกเฉพาะ localhost:55437. ทั้ง terminal RELEASE/REFUND ที่ใช้ใน C tests เป็น **test-only schema fixtures**, ไม่ใช่ B settlement service หรือหลักฐาน Android journey. สร้าง Order/payment ผ่าน API ก่อนสร้าง terminal fixture; ไม่มี fixture endpoint หรือ automatic completion ใน normal API mode.

| Check / exact command | Environment / DB isolation | Result / count | Evidence path |
|---|---|---|---|
| `python -m pytest -q tests/test_reviews_postgres.py tests/test_profile_postgres.py tests/test_profile_review_migration.py tests/test_product_reads.py -p no:cacheprovider --tb=short` | `DATABASE_URL=sqlite:///:memory:`; `ORDER_TEST_DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:55437/c_profile_test`; `PROFILE_MIGRATION_TEST_DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:55437/c_migration_test`; `PROFILE_LEGACY_SOURCE=D:\projectsa\SA-Project\secondhand-marketplace-android-app\backend` | 89 passed, none skipped. Review 34, profile 24, migration 1 use actual PG; product reads 30 are SQLite API regressions. | named backend tests |
| `python -m pytest -q -p no:cacheprovider --tb=short` | no special PG variables, `DATABASE_URL=sqlite:///:memory:` | 452 passed, 257 skipped; this row alone is not PG evidence | default suite |
| `npm run test:components -- --runTestsByPath component-tests/profile-screen.test.tsx component-tests/profile-persistence.test.tsx component-tests/login-screen.test.tsx component-tests/review-modal.test.tsx component-tests/seller-reviews-modal.test.tsx component-tests/order-detail-screen.test.tsx component-tests/product-detail-screen.test.tsx component-tests/my-products.test.tsx --silent` | React renderer + mocked transport/session | 52 passed / 8 suites | named mobile tests |
| `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-isolation=none tests/profile-service.test.mjs tests/review-service.test.mjs tests/product-catalog-service.test.mjs` | request adapters; Windows no-child-process mode | 33 passed | named mobile service tests |
| `npm run typecheck` | exact A lockfile dependencies | PASS | TypeScript |
| `python -m alembic heads`; `git diff --check` | local source | `c08f20261002` only; PASS | migration graph assertion + migration files |
| `gh pr list --head feat/package-b-delivery-settlement --json number,state,headRefOid,url,title` | GitHub read only | B PR124 still preparation; no accepted task04 claim | exact B head above |

First negative DB test expected IntegrityError for oversized varchar; corrected to also accept PostgreSQL DataError (API still returns strict 422). Default suite identified old exact User columns/head assertions; updated without weakening preserved constraints. My Products old fixture lacked a session user; fixture corrected and real aggregate display asserted. All affected checks rerun green. Existing deprecation/JWT-test warnings remain; no native build was run.

## Contract and safety checks

- Actual Buyer/IDOR, inactive/current role/approval, pending/cancelled/disputed/inspection/refunded rejection; extra recipient/product/inspection score/photos fields rejected. Missing/bad idempotency keys fail 422.
- Concurrent independent connections with same/different keys produce one Review and one CREATE_REVIEW command. Canonical comment/default-empty replay, changed-payload conflict, rollback after injected command persistence failure, and replay after suspension are tested.
- DB negative tests cover cross-order parties, cross-product assignment, pending state, rating/comment bounds, immutable update/delete. Direct anon/authenticated reads remain empty even with accidental grants; direct writes denied.
- Public all-review count/average/distribution remain correct beyond page bounds; empty average=null. Writer commits between the single query's execution and result consumption: response still has one consistent zero-review snapshot, next request sees one review.
- Public exact field allowlist excludes private identities/IDs; text rendering does not interpret markup. Private GET/POST responses/errors use no-store including mounted API prefixes. Product seller.id is public route identity, not reviewer identity.
- Migration compares every original table/column from seeded Orders/payment/receipts/escrows/shipments/inspection data across A→07→08; 07 starts with all null acknowledgements; an actual 07 acknowledgement survives 08 unchanged. Downgrade refuses audit loss. Review migration uses existing A Order-party key, adds no competing Order key/head.
- Exact [Expo v57 docs](https://docs.expo.dev/versions/v57.0.0/) were read before mobile changes. No dependency/version upgrade. No shared database, Storage or auth data changed; no secrets committed.

## Remaining work / exact blocker

**รอ B/task04 ที่ A ยอมรับ**: integrate B on the same A schema, record accepted SHA, then create a normal API sale through proof/receipt/settlement service → COMPLETED/RELEASED → GET can_review → POST → replay → public modal. Also verify refund path remains unreviewable. Do not use C's terminal fixtures for this final acceptance.

**รอ A/E merge**: only C's isolated checkout was edited. A must merge review entry changes into E's current order-detail screen and preserve E delivery/receipt/non-receipt controls. Apply additive product seller.id mapping and service/component exports below; do not overwrite whole screens with older versions.

**รอ F**: actual Android Q20–Q23/Q25, Google auth/account switch, keyboard/back/loading/error/retry, and two real API journeys on a frozen candidate. No claim of native/device/release readiness.

## Handoff

- Task07 independently available on `codex/c-task07-profile` at `60abb9988530ff648d9b45cb49aa9843b2dae679`; it does not wait for task04.
- C full branch includes task08 `d0b7f14` and following report. Portable bundles in `D:\projectsa\package-c-delivery`; A may inspect/merge task07 now and keep task08 pending task04.
- Named exports/API examples and specific A/E merge instructions: `C-API-EXAMPLES.md`. Backend data/API modules are independent of B's mutable handlers; they read A's canonical settlement tables only.
- Run migration/checks on disposable PostgreSQL first; shared deployment is A/F ownership. After combined merge, run isolated suite again and add real task04 service integration evidence before changing task08 status to IMPLEMENTED_AND_TESTED.
