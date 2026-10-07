# F3 QA — PR #115 integrated backend/mobile pair

**Verdict: READY FOR DEVICE QA, not final feature acceptance.** PR #115 head `f72a0e51debc32c59d6086f231a0f5fdddbad3a2` has direct parent `442c4b84974e763d2efac31bd5920a8f23b54108`, whose parent is L1 backend candidate `370831bd08073dcfa5b51d5a3c6064bbb817bbdd`. The four earlier consumer failures and the saved-decision feedback issue are cleared in this exact source pair. Physical Android, OAuth, Storage, shared migration, QR, and worker deployment have not been observed.

## Exact revision and isolation

- `gh pr view 115` was rechecked: OPEN/Draft, head `f72a0e51debc32c59d6086f231a0f5fdddbad3a2`, base `feat/cert-04-buyer-decision` at `1493a43b29458459976dd0d5bde5c88fe6847411`. `MERGEABLE` describes conflict status, not review or rollout approval. The new commit changes only four mobile files (two views and their tests); `git diff 442c4b8..f72a0e5 -- backend` is empty. The QA branch `codex/f3-pr115-qa` contains PR #115 plus only F3's PostgreSQL regression test and this report. PR #115 and `a234` were not edited.
- The 307 backend tests below ran on direct parent `442c4b8` in F3's own disposable `postgres:16-alpine` container on `127.0.0.1:32772`, with separate fresh `f3qa_pr115_*_test` databases. Each process used `env -i`, an explicit local test URL, test JWT values, and `PUBLIC_CERTIFICATE_BASE_URL=https://cert.example.test`. No backend source or test changed in `f72a0e5`, so that evidence carries to this head; the 307 tests were not rerun after the mobile-only commit. The disposable container was stopped. No shared Supabase database, Storage, app service, or frontend checkout was touched.
- Mobile dependencies were installed with `npm ci` inside this F3 worktree. No lockfile or source edit resulted from installation. The run used mock auth, mock fetch and React Native component rendering; it did not launch Android or Google OAuth.

## Test commands and results

Backend commands ran on parent `442c4b8` from `backend/`, with the isolated variables above and one fresh database per suite. This turn reran the changed component tests, the complete component suite and TypeScript typecheck on exact head `f72a0e5`.

| Command | Result | Evidence |
| --- | --- | --- |
| `pytest -q tests/test_handoff_integration_postgres.py` | **6 passed** | Seller-as-buyer, promotion, positive/negative CERT, public HTML/privacy, no-HTTP expiry. |
| `pytest -q tests/test_inspection_flow_postgres.py` | **40 passed** | BUYER/SELLER ownership, CONFIRM/REJECT/replay/races, Courier proof and pagination, four results, certificate rollback. |
| `pytest -q tests/test_orders_postgres.py` | **26 passed** | PostgreSQL reservation, payment, cancel and expiry races. |
| `pytest -q tests/test_unpaid_expiry_postgres.py` | **9 passed** | Worker dry-run/apply/restart/batches/two workers/failure retry and CLI. |
| `pytest -q tests/test_certificate_postgres.py` | **33 passed** | CERT constraints, RLS, immutable rows, downgrade and concurrent decisions. |
| `pytest -q tests/test_l1_migration_postgres.py` | **2 passed** | Both applied-branch adoption paths and data preservation. |
| `pytest -q tests/test_inspection_postgres.py` | **12 passed** | INSPECT schema/migration. |
| `pytest -q tests/test_wondee_migration_postgres.py` | **3 passed** | Wondee migration and one head. |
| `pytest -q tests/test_product_upload_schema.py` | **19 passed** | Product schema including PostgreSQL. |
| `pytest -q tests/test_orders_api.py tests/test_products_create.py tests/test_product_reads.py tests/test_certificate_urls.py tests/test_certificate_public_page.py` | **157 passed** | Product/Order/CERT SQLite API and unit checks. |
| `cd mobile && npm run test:logic` | **305 passed on parent `442c4b8`** | No logic service or logic test changed in `f72a0e5`; includes decision payload, public JSON and Courier pagination. Not rerun on this mobile-only commit. |
| `cd mobile && npx jest --runInBand --silent component-tests/inspection-connected.test.tsx component-tests/inspection-views.test.tsx` | **15 passed on `f72a0e5`** | Saved CONFIRM reload, recorded REJECT reason, shipping/return next step and no generic unavailable warning. Included in the complete component count below. |
| `cd mobile && npx jest --runInBand --silent` | **180 passed, 25 suites on `f72a0e5`** | All component tests, including public certificate, Courier scope/refresh and Order result notice. |
| `cd mobile && npm run typecheck` | **passed on `f72a0e5`** | TypeScript consumer shape and calls. |
| `cd backend && alembic heads`; `git diff --check` | **one head `714f11c84d53`; passed** | Graph and patch check. |

**Evidence totals: 307 backend and 305 mobile logic passed on the unchanged parent; 180 mobile component tests and typecheck passed on the new head. Zero failures or skips in these selected suites.** The 15 targeted component tests are included in the 180. The earlier backend suites emitted existing FastAPI/Starlette deprecation warnings; unsilenced Jest components on the parent emitted React `act(...)` warnings, with no failures.

## Acceptance matrix

| Gate | Result on PR #115 head | Limit |
| --- | --- | --- |
| Product → Order and roles | **PASS locally.** BUYER/SELLER purchase paths, self/staff denial, seller purchase history, product snapshot/image and payment/reservation constraints pass. | Device image rendering and real account state not observed. |
| INSPECT | **PASS locally.** Courier proof before Inspector receipt, assigned staff access, private selected evidence and all four final results pass. | Local storage and mock JWT; no real private Supabase Storage or staff devices. |
| CERT backend | **PASS locally.** Positive result and certificate are atomic, negative results have no certificate/decision, invalid/revoked public token behavior, no-store/privacy and one-time decision pass. No decision settlement mutation. | No physical unauthenticated QR/browser or shared deployment. |
| BUYER/SELLER decision consumer | **PASS in automated contract/component checks.** The app role guard accepts BUYER and SELLER; service posts the protected payload; Seller CONFIRM component submits, reloads and displays the saved decision; REJECT view shows its recorded reason and return step; backend covers both roles and CONFIRM/REJECT. | BUYER/REJECT on a physical app is still a device gate. |
| Certificate consumer | **PASS in automated checks.** Native service calls `/certificates/{token}/json`; revoked component displays invalid state without positive certification; QR URL remains backend HTML. | Networked app/browser flow not observed. |
| Courier pagination | **PASS in automated checks.** Service follows `next_offset`, deduplicates overlapping rows, scope switch and refresh restart at offset zero. | Real >100-job device UI and changing live queues not observed. |
| Order result label | **PASS in component check.** `RESULT_NOTIFIED` uses a neutral inspection notice and no invented certificate number. | Device rendering not observed. |
| Unpaid worker/migrations | **PASS in disposable PostgreSQL.** No-HTTP expiry and two-worker/payment races; one Alembic head; both supported adoption paths. | Scheduler/monitoring, shared migration history, DB owner review and backup/restore remain open. |

## Cleared feedback issue and required live gates

The previous **P2 saved-decision feedback** finding is cleared in `f72a0e5`: `ResultData` passes the persisted decision to `BuyerResultView`; a saved CONFIRM displays its choice and `SHIP_TO_BUYER` guidance, explicitly separating inspection acceptance from delivery receipt; a saved REJECT displays its reason and return step. Both states suppress the generic unavailable warning. The connected CONFIRM reload and saved REJECT component cases pass (15 focused tests across the two changed suites). This is component evidence, not a physical device observation.

L3/owner must still exercise a physical Android app with real BUYER and SELLER accounts, Google OAuth, private Supabase Storage, Courier/Inspector/Admin accounts, unauthenticated browser QR and revoked state, Order image rendering, account switching, and >100 Courier jobs. Shared database migration/backup review and worker scheduling/monitoring are separate rollout gates. FINISH shipment, receipt and settlement are outside this F3 acceptance. Do not close PRODUCT-08, ORDER-06, INSPECT-06 or CERT-06 from these local tests alone, and do not treat Draft/MERGEABLE PR #115 as merge approved.

Prior verdict history: L1 SHA `370831b` passed 307 backend tests but was **request-changes** for four Wondee consumer defects. PR #115 at `442c4b8` addressed those defects, with one P2 feedback gap remaining. This `f72a0e5` update closes the P2 gap in the tested component path; this report supersedes the earlier F3 verdicts for the exact head above.
