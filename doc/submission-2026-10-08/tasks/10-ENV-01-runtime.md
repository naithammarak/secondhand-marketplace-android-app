# 10 / ENV-01 — Reachable full API, Auth, private Storage and runner

**Priority:** P0 · **Owner:** Runtime Codex · **Depends:** prepare now; activate combined candidate 01–09 · **Target:** 5 Oct

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Prepare and validate the submission runtime for the current secondhand-marketplace-android-app candidate. Read the packet README.md, DOC-01-scope.md, FINISH-00-release-gates.md, QA-MATRIX.md, task 05 runner runbook and existing integration rollout docs. Inspect configuration by variable names and presence only; never print .env values, JWTs, cookies, database URLs containing credentials or service keys.

Make the complete API and Expo/Android app runnable with documented commands and environment examples. A phone cannot reach the host using 127.0.0.1; choose an already-authorized reachable HTTPS API/staging host for the final build, and document a LAN-only development alternative distinctly. PUBLIC_CERTIFICATE_BASE_URL must point to the actual externally reachable HTTPS certificate API origin, not a local Expo page or an https://localhost startup bypass. Configure CORS/auth redirect/scheme/package and Supabase Google/provider return paths from official current docs when needed. Keep service-role keys server-only; app env uses only public/anon values and API origin. Never copy credentials into the packet or mobile bundle.

Validate private identity/inspection/delivery Storage permissions, actual authenticated upload/read, expired/foreign access rejection and public certificate HTML/JSON/QR without login. Rehearse migrations with backup/restore on an isolated disposable PostgreSQL environment; produce exact one-head deployment/rollback steps and a non-destructive preflight for the shared target. Stage scheduler configuration and health/failed-run monitoring from task 05, including no-HTTP behavior and restart.

The user authorized preparing local work, not automatically resetting/stamping/migrating shared or production DBs, changing remote auth policies, or exposing a new public tunnel. Perform reversible local/isolated setup autonomously. For a final shared write/remote configuration not already authorized, first produce the concrete preflight, target/backup plan and exact command/config diff, then request only the necessary approval with its reason. Missing credentials or service access are actual blockers; finish independent scripts/docs/checks while they remain unavailable. Do not substitute mocks and call integration complete.

Deliver env examples, start/stop/health/runbook instructions, redacted runtime evidence and reports/10-ENV-01.md with deployed API SHA, migration head, reachable origin, worker command/schedule and explicitly unexercised gates. Do not interrupt unrelated running sessions. Continue through setup and authorized validation, not just a list of environment variables.
```

## Acceptance

- A real phone can reach the full API; Google redirect works for the Android package/scheme.
- Public QR origin and private authenticated Storage work with correctly separated credentials.
- Migration/runner preflight is concrete; actual unapproved shared rollout remains clearly pending.
