# Wondee UI/UX redesign — delivery

28 September 2026 · local implementation, not deployed.

**CORE REDESIGN COMPLETE** and **VISUAL COVERAGE COMPLETE** for the selected scope. **FULL INTEGRATION COMPLETE is not claimed.** Inspection/CERT/FINISH integration and real Android/OAuth/Storage acceptance remain blocked or not run as specified below.

## Revision and scope

- Branch: `codex/wondee-ui-redesign`.
- Worktree: `/home/tmk/.codex/worktrees/a234/secondhand-marketplace-android-app`.
- Base and refreshed `origin/main`: `8254f8d224f62aa765f978f65f110139410a09ab`.
- Final application/backend implementation SHA: `3440c6ae0942842fa46f7ec8165fb20e05f8d9b9`. The following delivery commit contains evidence/documentation only; resolve it with `git log -1 --format=%H -- docs/features/WONDEE-UI-REDESIGN-DELIVERY.md`.
- Alembic predecessor `c93b7e5a1d84`; new single head `19d4be72a610`.
- Source: parent `docs/project-plan/wondee-ui-redesign` production spec and immutable reference HTML/mascot showcase. File hashes: [source snapshot](wondee-evidence/source-snapshot.json). Source reference browser review compared the app area, excluding demo/sidebar/phone chrome.
- Original checkout, untracked planning/prototype work and other feature branches were preserved. No remote push/merge, issue closure, shared migration or deployment was performed.

| Work | Delivered |
|---|---|
| WUI-00 | Isolated main-based worktree; current PR containment audit; source snapshot |
| WUI-01 | Semantic dark/light/system theme, saved preference, local licensed Prompt/Plus Jakarta Sans, vector Wondee brand/8 mascot variants, reduced-motion/focus guards, fields/skeleton/empty/error/modal/zoom primitives |
| WUI-02 | Server-default Buyer, compatibility route closed to seller self-selection, login without role chooser, preserved login-return intent |
| WUI-03 | Buyer seller application with shop_name, private existing upload path, latest-request policy, atomic approval + Seller promotion, status/account refresh and account isolation |
| WUI-04 | Seller may purchase another seller's item; explicit sales/purchases list; public approved shop projection without PII; money/idempotency/expiry behavior preserved |
| WUI-05 | Three tabs and all existing customer/product/admin/receipt screens restyled, protected product deep links, safe account-change behavior |
| WUI-06 | Ship, queue, three-step work, four result outcomes, certificate view components; production routes gated unavailable because dependencies are absent |
| WUI-07 | Regression/migration/PG concurrency tests, exports, visual evidence, updated [UX-01](UX-01-wondee-marketplace.md) and [VERIFY-00](VERIFY-00-seller-verification.md) contracts |

## Screens, routes and API mapping

Every visual row below has dark/light captures at **320×740** and **390×844**. PASS in this table means reviewed web appearance and the listed component behavior, not native or live integration. Images are named `<scene>-<theme>-<width>.jpg` in [wondee-evidence](wondee-evidence/); corresponding `.txt` files contain DOM snapshots.

| V-ID / scene | Production route | Data/API and boundary | Result |
|---|---|---|---|
| V01 `guest` | `/profile` | No private data; login CTA and local theme | PASS |
| V02 `buyer` | `/profile` | `/auth/me`, `/verifications/me`; open-shop CTA | PASS |
| V03 `seller` | `/profile`, `/sell` | Backend Seller + current-owner APPROVED gate | PASS |
| V04 `login` | `/login`, `/auth/callback` | Existing Google/Supabase flow, `/auth/google`, `/auth/me`; OAuth device NOT RUN | PASS visual/component |
| V05 `form` | `/seller-verification` | GET `/verifications/me`, POST multipart `/verifications` including shop_name | PASS |
| V06 `pending` | `/seller-verification` | Latest PENDING; no duplicate submit or selling | PASS |
| V07 `approved` | `/seller-verification` | Latest APPROVED, refresh `/auth/me`; no optimistic role promotion | PASS |
| V08 `rejected` | `/seller-verification` | Server rejection reason, new request rather than history overwrite | PASS |
| V09 `catalog` | `/`, `/products` | GET `/products`, `/categories`; real query/category/pagination store | PASS |
| V10 `detail` | `/products/[id]` | GET `/products/{id}`; 4:3 gallery, zoom, seller projection, one buy CTA | PASS |
| V11 `checkout` | `/checkout/[productId]` | GET `/orders/checkout-quote`, POST `/orders`; server totals, simulated payment copy | PASS |
| V12 `orders` | `/orders` | GET `/orders?role=buyer|seller`; explicit view, stale-request discard | PASS |
| V13 `order-paid` | `/orders/[orderId]` | GET order; POST cancel/payments/simulate; recorded timeline and receipt access | PASS |
| V14 `ship` | `/orders/[orderId]/ship-to-center` | View accepts carrier/tracking; production does no request pending verified shipping API | PASS fixture; integration BLOCKED |
| V15 `inspector-queue` | `/inspections` | Data/filter/count props; Inspector guard; production unavailable | PASS fixture; integration BLOCKED |
| V16 `inspector-work1/2/3` | `/inspections/[inspectionId]` | Receive/start/evidence/result callback interfaces; selected 1–5, summary 10–2000 and confirmation | PASS fixture/component; integration BLOCKED |
| V17 `result-PASS`, `result-MINOR_ISSUE`, `result-NOT_AS_DESCRIBED`, `result-FAKE` | `/orders/[orderId]/inspection` | Outcome/summary/selected-image/next-action props; negatives never show cert/decision | PASS fixture/component; integration BLOCKED |
| V18 `certificate` | Modal in result view | Supplied certificate number/date; real HTTPS public URL and optional actual QR only when capability exists | PASS unavailable fixture; public HTML/QR BLOCKED |
| V19 `create`, `edit`, `mine` | `/product/new`, `/product/[id]/edit`, `/product/mine` | Existing product options/upload/create/PATCH/cancel and GET `/products/me`; approval gate on nested layout | PASS |
| V20 `admin`, `receipt` | `/admin-verifications`, `/receipt/[orderId]` | Existing `/admin/verifications` list/detail/id-card/decision and `/orders/{id}/receipt`; masking/owner guards preserved | PASS |
| V21 `shared` | Shared components | Eight mascot variants; skeleton, empty/error, field focus, confirmation and image zoom | PASS visual/component; native motion NOT RUN |

Existing `/buy-by-product-id` is the compatibility entry for product purchase; `/explore` remains the existing auxiliary route. Neither adds a new workflow. Backend authorization remains authoritative for every private route.

## Verification actually run

Environment: Fedora host; existing project Python 3.14 virtualenv; Expo SDK 57 / React Native 0.86.3; local Chromium in-app browser. Backend tests combine SQLite API tests and a disposable **PostgreSQL 16** Podman container named `wondee-test-pg-a234`, reachable only on `127.0.0.1:55439`. Separate test databases were used for auth, orders, verification and Wondee migrations. Storage and token/OAuth boundaries in unit/API tests use test fakes; these are not live Supabase tests.

| Check | Actual result | Evidence |
|---|---|---|
| Full backend `python -m pytest -q` | **480 passed**, 0 failed, 0 skipped; 3 warnings | [backend log](wondee-evidence/backend-final.log) |
| Mobile `npm run test:logic` | **296 passed**, 0 failed, 0 skipped | [logic log](wondee-evidence/logic-final.log) |
| Mobile `npm run test:components` | **147 passed / 18 suites** | [component log](wondee-evidence/components-final.log) |
| `npm run typecheck` | PASS | [typecheck](wondee-evidence/typecheck-final.log) |
| `npm run lint` | PASS | [lint](wondee-evidence/lint-final.log) |
| `npx expo export --platform web --output-dir dist/wondee-web` | PASS | [web export](wondee-evidence/web-export.log) |
| `npx expo export --platform android --output-dir dist/wondee-android` | PASS, Hermes JS/assets only; not APK/device proof | [Android export](wondee-evidence/android-export.log) |
| Normal export fixture isolation | PASS; no QA banner/account/certificate/shim markers in 66 web files or 48 Android files | [scan result](wondee-evidence/bundle-isolation.json) |
| Git diff whitespace check | PASS after normalizing bundled OFL text line endings; license wording preserved | Local `git diff --check` / staged check |

Backend source is unchanged from the full backend run at `f993bf16baba6168ef53ade29bedc62882fae6e1`; the final commit changes only inspection presentation/tests/fixtures.

The three backend warnings concern existing Starlette/httpx compatibility, anyio's deprecated portal alias, and the deliberately invalid JWT algorithm test's short SHA512 test key. Component output also records non-failing React `act(...)` warnings from asynchronous test updates; these are retained in the log and no console errors were suppressed. Saved logs have only leading/trailing blank lines and trailing spaces normalized for Git. The animation boundary in Jest is a deterministic static mock; component tests prove motion eligibility/cleanup decisions, not native animation execution.

Reproduction (from `mobile`): run the four npm commands above and the two exports **without** `WONDEE_VISUAL_QA=1`. Visual preview instructions are in [mobile/visual-tests/README.md](../../mobile/visual-tests/README.md).

Backend reproduction uses `postgresql+psycopg://` URLs. Set `DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, `ORDER_TEST_DATABASE_URL`, `TEST_DATABASE_URL` and `WUI_TEST_DATABASE_URL` to **separate disposable local test databases**, then run `python -m pytest -q` from `backend` with its requirements installed. The Wondee migration fixture deliberately drops its disposable public schema and refuses non-localhost/non-test targets. Existing PostgreSQL suites also reset schemas; never point any of these variables at shared Supabase/production. No test credential is needed in this document.

### Functional acceptance coverage

| Acceptance IDs | Observed proof | Remaining boundary |
|---|---|---|
| T01–T04 guest/catalog/login return/account switch | Existing logic + changed login/profile/component regressions; real guest web routes verified | Real Google Android success/cancel return NOT RUN |
| T05–T06 default role/legacy compatibility | Auth API + DB migration + role-route tests PASS | Deployed old-client rollout NOT RUN |
| T07–T09 Buyer application/validation/duplicates | API/component/PG single-pending race PASS; no promotion on submit | Live Storage upload, picker permissions, actual device NOT RUN |
| T10–T11 approve/reject/stale/inactive/rollback | Latest-request guard, transaction rollback and PG concurrent review PASS | Live admin-to-mobile session propagation NOT RUN |
| T12–T13 Seller buying/ownership/self-purchase | API/order/component regressions PASS; staff disallowed, self-purchase remains conflict | Multi-device integrated journey NOT RUN |
| T14 public seller projection | Exact API response/PII exclusion/legacy fallback tests PASS; bounded batched lookup | Live catalog service NOT RUN |
| T15–T17 catalog query/recovery/product operations | Existing store/API/upload safeguards and component suites PASS | Actual network interruption / expired signed URLs on device NOT RUN |
| T18–T21 quote/idempotency/expiry/future states | Order API/store/PG regressions PASS, unknown condition decoder added | Production money/settlement acceptance not in scope |
| T22 theme persistence | Provider tests plus actual web theme reload PASS | Native restart/system theme/font failure on device NOT RUN |
| T23 Thai text/viewport/keyboard | All standard visual states and key wider screens reviewed; web Tab moves shop → bank; bottom form reachable; sticky buy CTA visible | Native text scaling 1.3/2.0, IME and hardware-back NOT RUN |
| T24 accessibility | Semantic contrast pairs ≥4.5:1, focus/input boundary ≥3:1; motion/background/focus cleanup component tests; web keyboard/zoom PASS | TalkBack/VoiceOver, complete keyboard audit, native motion NOT RUN |

Migration coverage: empty DB → head; predecessor + null/Buyer/Seller/Admin/Inspector and suspended legacy data → head; legacy approved request preserved with null shop; invalid name constraints; DB Buyer default; downgrade → predecessor → upgrade; one intended head. **Downgrade keeps normalized BUYER values**, because their previous null origin cannot be safely reconstructed. Upgrade from separately applied INSPECT/CERT revisions is BLOCKED until graph reconciliation, not covered by empty-DB success.

## Visual evidence and manual smoke

Main matrix: **29 scenes × 2 themes × 2 widths = 116 captures**, covering V01–V21, plus **7 key scenes × 2 themes × 2 widths (430×932 / 768×1024) = 28 captures**. Combined standard viewport matrix: **144 captures**, with no horizontal document overflow. Additional 320px empty/error/loading captures and manual focus/scroll/zoom screenshots are separate from that count. These images use synthetic identities/data and local SVG shirts; yellow banners explicitly identify fixtures. They do not prove API binding.

- [390 dark overview 1](wondee-evidence/contact-dark-390-1.jpg), [2](wondee-evidence/contact-dark-390-2.jpg), [3](wondee-evidence/contact-dark-390-3.jpg), [4](wondee-evidence/contact-dark-390-4.jpg).
- [390 light overview 1](wondee-evidence/contact-light-390-1.jpg), [2](wondee-evidence/contact-light-390-2.jpg), [3](wondee-evidence/contact-light-390-3.jpg), [4](wondee-evidence/contact-light-390-4.jpg).
- [320 dark overview 1](wondee-evidence/contact-dark-320-1.jpg), [2](wondee-evidence/contact-dark-320-2.jpg), [3](wondee-evidence/contact-dark-320-3.jpg), [4](wondee-evidence/contact-dark-320-4.jpg).
- [320 light overview 1](wondee-evidence/contact-light-320-1.jpg), [2](wondee-evidence/contact-light-320-2.jpg), [3](wondee-evidence/contact-light-320-3.jpg), [4](wondee-evidence/contact-light-320-4.jpg).
- Key wide-screen [430 dark](wondee-evidence/contact-dark-430.jpg), [430 light](wondee-evidence/contact-light-430.jpg), [768 dark](wondee-evidence/contact-dark-768.jpg), [768 light](wondee-evidence/contact-light-768.jpg).
- [Supplemental states](wondee-evidence/contact-supplemental.jpg), rejection dialog [dark](wondee-evidence/decision-reject-dark-320.jpg) / [light](wondee-evidence/decision-reject-light-320.jpg); callbacks in these fixtures remain inert.
- [Evidence manifest](wondee-evidence/evidence-manifest.json) binds file hashes, dimensions and environment to the final implementation.
- [Main viewport measurements](wondee-evidence/viewport-results.json), [additional measurements](wondee-evidence/additional-viewport-results.json). Measurements complement visual inspection; they do not prove no vertical clipping.

Actual production-router web smoke on port 8767 (no QA aliases, no API configured):

| Case | Expected / actual | Evidence |
|---|---|---|
| Public catalog without API | Honest unavailable + retry, no sample inventory — PASS | [DOM](wondee-evidence/production-api-missing-dark-1280.txt), [1280×720 image](wondee-evidence/production-api-missing-dark-1280.jpg) |
| Guest switches light theme, reloads | Light remains selected — PASS | [DOM](wondee-evidence/production-theme-reload-light-1280.txt), [image](wondee-evidence/production-theme-reload-light-1280.jpg) |
| Guest `/product/new` | Login; no private product form — PASS | [DOM](wondee-evidence/production-guest-product-guard.txt) |
| Guest `/orders/42/inspection` | Login; no order/evidence data — PASS | [DOM](wondee-evidence/production-guest-inspection-guard.txt) |
| Fixture evidence zoom | Opens dialog, 1×→2×, closes and returns focus — PASS (visual only) | [image](wondee-evidence/evidence-zoom-dark-320.jpg) |

## Dependencies and release gates

Read-only GitHub refresh on 28 September 2026: [PR inventory](wondee-evidence/dependency-inventory.json), [issue inventory](wondee-evidence/dependency-issues.json). Issue/PR state alone was not used as implementation acceptance.

| Dependency / owner for follow-up | Current state | Gate before enabling |
|---|---|---|
| [#92](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/92), [#97](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/97) | Merge commits contained in main | Regressions passed in this delivery |
| INSPECT BE/DB owner — [#93](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/93), [#94](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/94) | Merged into feature-stack bases; merge commits **not contained in main** | Reconcile migration graph and authorization contract; verify actual shipping/receive/start/evidence/result APIs and DB rollback/concurrency |
| INSPECT mobile owner — [#95](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/95) | OPEN on `feat/inspect-02-03-api` | Reuse its verified service/store/routes when integrated, bind these views without duplicate workflows; test ownership including Seller-as-buyer |
| CERT feature owner / Lead — [#100](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/100) | OPEN, no named assignee | Atomic issue, real public HTTPS HTML/QR, negative outcome restrictions and exactly-once decision; inspection acceptance is not receipt |
| FULFILLMENT / FINISH owner / Lead — [#98](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/98) | OPEN, no named assignee | Courier delivery proof, server deadline, exactly-once RELEASE/REFUND and device/DB acceptance under their contracts |
| QA / release owner | Native tooling/device/test accounts unavailable here | Android install + OAuth/deep link, IME/back, large text, TalkBack, real private Storage/RLS and cross-account sessions |

**I01 PASS:** absent inspection capabilities produce honest unavailable routes and no simulated production workflow. **I02–I11 BLOCKED:** seller shipment, courier proof, inspector assignment, evidence/result/certificate transaction, negative return behavior, Seller-as-buyer private result access, public QR, buyer decision and final settlement need the dependencies above. Their fixture appearance is complete; their live feature acceptance is not.

The precise pending contracts (not registered/enabled by this change) are:

- INSPECT: `POST /orders/{order_id}/ship-to-center`, `GET /orders/{order_id}/inspection-progress`, `GET /inspections`, `GET /inspections/{id}`, POST `/{id}/receive`, `/{id}/start`, `/{id}/evidence`, `/{id}/result`, and `GET /inspection-evidence/{id}`. Supply verified, idempotent services; carrier/tracking trim to 1–100 characters.
- CERT: `GET /orders/{order_id}/inspection`, `POST /orders/{order_id}/inspection/decision`, `GET /certificates/{public_token}` as public HTML. The prepared REJECT dialog accepts an optional trimmed reason up to 500 characters; CONFIRM carries none. Missing certificate fails closed even if positive capability flags conflict. Audit Seller-as-buyer and inactive-reader policy against the upstream contracts before binding.
- FINISH/FULFILLMENT: verified courier proof/confirmation, `GET /orders/{id}/delivery`, `POST /orders/{id}/confirm-receipt`, `POST /orders/{id}/report-not-received`, settlement and dispute APIs. Do not derive receipt/settlement from an inspection decision or a client timer.

Before release, coordinate shop_name validation with compatible mobile/backend versions and audit the target DB's actual revisions. Retain existing consent/audit/purge follow-ups documented in VERIFY-00; this redesign does not claim to implement them. No real payments or fund release were enabled.
