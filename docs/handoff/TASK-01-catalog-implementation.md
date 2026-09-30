# TASK-01 catalog implementation handoff

## Tested code

- Worktree branch: `codex/task01-catalog-demo`
- Catalog implementation SHA tested: `822fc99e3ac2e420d9188500daa157cdbce2fab6`
- Display database: PostgreSQL container `task01-catalog-demo`, loopback port `127.0.0.1:55445`, database `task01_catalog_demo_test`
- Runtime API: `http://127.0.0.1:8765`; Expo web: `http://127.0.0.1:8090`

The fixture contains six AVAILABLE demo products, six readable Thai categories, six brands, and a synthetic ACTIVE/APPROVED seller. Product names end in `(เดโม)` and descriptions say that browsing and buying are simulated and the goods are not real. All product illustrations are bundled SVGs served only when the API starts with `APP_ENV=demo`.

## Safe local seed and run

Use the isolated container above. Supply `TASK01_DEMO_DATABASE_URL` privately from that container's configuration; do not put the DSN in source control, shell history, or logs. The shared `task01_demo.py` guard validates environment/dotenv routing and configured target identity, and the seed also confirms the actual PostgreSQL connection is loopback port `55445` and database `task01_catalog_demo_test` before writing.

From the repository root, in the runtime shell that has this private environment set:

```sh
podman start task01-catalog-demo
cd backend
./.venv/bin/python scripts/task01_demo.py --migrate
./.venv/bin/python scripts/seed_task01_catalog.py
./.venv/bin/python scripts/seed_task01_catalog.py
./.venv/bin/python scripts/task01_demo.py --port 8765
```

The second seed run is a repeatability check. It uses a transaction-scoped advisory lock, refuses seller/product identity conflicts, creates only absent fixture rows, and leaves existing product fields untouched. SOLD, RESERVED, CANCELLED, and soft-deleted fixture products are preserved and never restored to AVAILABLE. It performs no deletes and does not create an external Auth account. The local image base defaults to `http://127.0.0.1:8765/task01-demo-assets`.

## Verification evidence

- PostgreSQL migration: `714f11c84d53`.
- Seed output: first run `created=6 kept=0 preserved-unavailable=0`; second run `created=0 kept=6 preserved-unavailable=0`.
- Database query: 6 products, all AVAILABLE; 6 categories; 6 product images.
- Public HTTP checks against the populated display database: `GET /products` returned 6; Thai `q` search returned 1; `category_id` filter returned 1; all six `GET /products/{id}` details returned 200; all six direct stored SVG URLs returned 200 with `image/svg+xml`. The live Expo web endpoint returned HTTP 200.
- Backend focused tests: `17 passed`; backend `compileall` passed.
- Mobile component test: `18 passed`; `npm run typecheck` passed.
- Changed-file ESLint passed with the baseline `react-hooks/set-state-in-effect` rule disabled. Unfiltered changed-file ESLint still reports that pre-existing error at `product-list-screen.tsx:216` and the pre-existing unused `theme` warning at line 70; the effect is present at the same location in the base revision.

The catalog UI now uses more readable search placeholder sizing/contrast. Category chips remain horizontally scrollable, cap their visual width, truncate to one line, and retain each complete category name for accessibility.

No browser screenshot or native-device verification was available during this implementation. Public API and Expo HTTP checks do not replace later visual/browser or Android acceptance.
