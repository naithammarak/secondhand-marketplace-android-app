# B+C+D composed integration candidate

**Author checks pass; independent exact-head review pending. E/latest frontend and full release remain pending.**

## Frozen inputs

| Package | PR | Exact source |
|---|---|---|
| A foundation | #123 | `94a26a0fbb7a0a82948d95de7db9af070707b770` |
| B fulfillment/jobs plus reviewed unpaid fairness correction | #124 + #128 | `161f5dcf5ee655e7811acaa787ae1003c936f4a9` |
| C profile | #126 | `60abb9988530ff648d9b45cb49aa9843b2dae679` |
| C reviews | #127 | `7e36f5d214cb26f1e35e1613121454e03f89d88f` |
| D certificate revocation | #125 | `33e0100be5eb4272a14d1e81b55481885b843b34` |

All inputs are actual ancestors of this candidate. The B+C+D merge is in an isolated checkout. Only backend/app/main.py required manual production conflict resolution: union router imports/registration, C profile/order-review and D Admin-certificate cache guards, while preserving B fulfillment/private-cache and Unicode validation protection. Mobile source merged automatically, retaining C profile/review entry and D Admin/public-certificate views. Dependencies are unchanged.

## Actual composed API evidence

New backend/tests/test_bcd_api_integration_postgres.py drives the real FastAPI routes on a new empty owned PostgreSQL16 target. Terminal Order/Escrow/Settlement states are produced by normal business APIs, with local synthetic authentication and private Storage fixtures.

1. Buyer: edit/persist profile and policy acknowledgement; purchase/payment/inspection/certificate/confirm/physical delivery; receipt confirmation creates RELEASE; create persisted review, canonical idempotent replay, private review read and anonymous seller summary.
2. Repeat the normal completed-sale journey with an approved Seller acting as Buyer. Public reviewer identity stays anonymous.
3. Negative inspection followed by physical Seller return and full REFUND: review is ineligible and POST returns409; no Review row is inserted.
4. Composed missing-auth/private cache guards, Admin authorization, malformed Unicode422. After completed sale, certificate revoke publicly displays REVOKED without private reason and preserves RELEASE, review and receipt.

**4 passed,0 failed,0 skipped**. Green log/XML and retained initial fixture failures are hashed in [BCD-INTEGRATION-evidence.json](BCD-INTEGRATION-evidence.json). Initial2 failures were due to the test Seller lacking approved verification, and were resolved by preparing the correct synthetic Seller fixture. Public seller eligibility was preserved. The API run preceded the later B test skip-guard merge; production app/migration/mobile source is byte-identical after that merge. New test/report commits do not alter production source.

## Mobile and migrations

- Mobile typecheck: PASS, exit0.
- Seven affected component suites: **47 passed** (profile-screen, profile-persistence, review-modal, seller-reviews-modal, order-detail-screen, admin-certificate-screen, public-certificate-screen). These were observed in command stdout; no raw mobile log file was retained.
- One Alembic head: `c08f20261002 → c07f20261002 → a02f20261002`. The PostgreSQL fixture executed a fresh upgrade before the API journeys.
- Existing package-specific isolated review evidence remains attached to its original exact revisions; it is not represented as fully rerun on this composed candidate.

## Independent review and remaining delivery

Review this PR's latest remote head and actual base before accepting the composed routing/cache/mobile source and the C08 normal-API integration gate. Preserve the historical uncorrected B124 REQUEST_CHANGES record and accepted A/CD code records. Do not count unconfigured PostgreSQL skips as passes.

Latest E/frontend delivery source is requested from the user. This candidate does not capture the dirty original UI or change the current A demo. It has not been merged, migrated to a shared database, or activated in the five-minute scheduler. Android build/device, real Google login, private shared Storage, public HTTPS QR on another phone, final UI, handover and presentation remain full-release gates.

For reproduction use backend/.venv dependencies from the existing setup, synthetic DATABASE_URL/public origin before imports, and FINISH_TEST_DATABASE_URL pointing to a **new empty owned loopback PostgreSQL test database** with required anon/authenticated/service_role roles; then run `python -m pytest tests/test_bcd_api_integration_postgres.py -q`. The existing fixture rejects shared/nonempty/live targets. No .env or private env copies belong in this PR.
