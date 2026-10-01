# 01 / INT-01 — One complete release base

**Priority:** P0 · **Owner:** Integration Codex · **Depends:** 00 · **Target:** 1–2 Oct

## Outcome / ownership

One repeatable complete-app candidate preserving current UI and the INSPECT/CERT work, with applicable checkout/order fixes from #117–120. Own integration/provenance/migration reconciliation; do not implement FINISH/profile/reviews here. Downstream tasks consume the delivered commit.

## Prompt สำหรับ Codex

```text
Implement INT-01 in the existing secondhand-marketplace-android-app repository. Deadline is 8 October 2026, Asia/Bangkok. Locate doc/submission-2026-10-08 (or the supplied packet folder). Read README.md, DOC-01-scope.md, FINISH-00-release-gates.md, RELEASE-DESIGN.md and manifests/baseline-2026-10-01.json. Apply repository AGENTS.md instructions; inspect branch, HEAD, status and local/remote state before edits. In mobile, read the exact Expo version documentation required by its AGENTS.md before writing code.

The baseline has substantial tracked/untracked UI and integration changes outside HEAD 939e4f763c8185e5478b1d4962e746b7a2321a8d. Preserve them. Inspect current PR heads/bases #108–120 and actual ancestry; do not blindly merge every PR. #115 is an earlier full-app candidate; #119 is catalog-only and #120 buyer-only without payment/Seller/Admin/INSPECT/CERT. Reuse applicable #117 persisted-checkout/idempotency fixes and #120 authenticated order fixes in the complete app, resolving overlapping changes explicitly. Do not release a restricted runtime as the complete marketplace. Synthetic catalog data may only target an isolated approved demo DB.

Create a safe integration candidate from the supplied latest working tree, using an isolated worktree/branch if the checkout has unrelated concurrent changes. Save a recoverable source diff and whitelist only nonsecret source files if needed; do not bundle .env, tokens, DB dumps or node_modules. If latest UI exists only in an unprovided session/worktree, record that exact missing input and continue the independent provenance/schema audit; do not silently replace it with an old branch.

Reconcile one Alembic migration head and route registrations, including certificate HTML/JSON and existing courier APIs. Confirm startup configuration uses the real PUBLIC_CERTIFICATE_BASE_URL variable and that app/API mode can browse, login, access orders, seller, inspector/admin/courier work and certificates. Add focused regression checks only for integrations changed here; use an isolated PostgreSQL DB, not a shared reset/stamp. Run relevant backend tests and mobile logic/component/type checks; document baseline failures separately.

Deliver a local release commit or precisely reproducible integration patch, upstream/source SHA inventory, migration head, test report, preserved UI diff inventory and doc/submission-2026-10-08/reports/01-INT-01.md using templates/TASK-REPORT.md. Populate the candidate fields of templates/RELEASE-MANIFEST.json in reports/release-manifest.json, leaving unverified fields null. Hand the exact base to tasks 02/07/09. Do not force-push, mass-merge, deploy shared migrations or claim device acceptance. Continue through implementation and verification rather than returning only a plan.

When task commits 02–10 are delivered, return as integration owner to combine them into the same candidate, reconcile hotspots/migrations, rerun affected integration checks, update provenance and freeze the source used by task 12. This is a follow-up phase of INT-01, not a new unrelated release branch.
```

## Acceptance

- Latest supplied UI survives and provenance distinguishes HEAD from dirty content.
- Full runtime contains retained roles/APIs; catalog-only and buyer-only flags are not active in the submission build.
- Checkout success/receipt comes from persisted successful payment; timeout/retry/account change do not duplicate orders/payments.
- Alembic has one expected head; preserved data and API smoke proven in an isolated environment.
- Downstream base is reproducible and contains no credentials.
