# 07 / PROFILE-01 — Persisted basic profile

**Priority:** P1 requested addition · **Owner:** Full stack Codex · **Depends:** 01; migration follows 02 · **Target:** 2–4 Oct

## Prompt สำหรับ Codex

```text
Implement PROFILE-01 in the current secondhand-marketplace-android-app release base. Locate the submission-2026-10-08 packet, read README.md, DOC-01-scope.md, PROFILE-REVIEWS-contract.md, RELEASE-DESIGN.md and FINISH-00-release-gates.md. Apply AGENTS.md; before mobile code read its required exact Expo version docs. Work through implementation and verification. The deadline is 8 October 2026; keep the minimal selected scope, not a new settings subsystem.

Inspect backend User/auth schemas and mobile auth-provider/profile-screen/consent-modal. Existing User has full_name, email, role and status; Google login for an existing user already should preserve full_name. Add GET /profile, PATCH /profile {full_name}, and POST /profile/policy-acknowledgement using the exact packet contract, existing verified identity/auth/error policies and private own-user projection. Only active users may write. Strict JSON must reject email/role/status/provider ID/address/phone injection. Persist policy version+DB acknowledgement time with paired-null fields; never invent legacy consent. Same-version retry keeps the first timestamp.

Coordinate the nullable migration after task 02 with its migration owner; publish one Alembic head, not an independent branch. Preserve existing /auth/me response consumers unless a compatible addition is necessary. Profile editing must not change Order buyer/seller address snapshots, verification details or role. Approved Seller retains Buyer capability; seller application uses the existing verified workflow, not a role picker.

Wire profile data/edit/save and readonly email/role/status to APIs, replacing fake fallback names with a truthful empty/loading state. Keep guest Login CTA and existing seller status/application CTA. Provide readable Thai prototype terms/privacy text explaining data purpose and private evidence access, recorded acknowledgement and how the demo administrator receives access/correction/deletion requests outside the app. Do not invent a public support address or promise implemented self-service export/delete. Remove the optional photo-reuse consent switch and unsupported privacy actions; acknowledgement is not a blanket reuse consent or a claim of legal certification. Preserve current theme/visual changes.

Test save→GET/reload/relogin, invalid/control/overlong names, cross-account access and field injection, inactive write rejection, acknowledgement replay/unsupported version, migration preservation, failed save and stale responses after account change. Run isolated PostgreSQL/API tests, focused mobile tests and typecheck. Deliver code, API examples and reports/07-PROFILE-01.md with base/head and migration chain. Use templates/TASK-REPORT.md; mark actual Android/login steps pending if not exercised. Do not mutate shared DB, force-push or claim unrun tests.
```

## Acceptance

- Edited name survives reload/login and belongs to authenticated User only.
- Policy acknowledgement persists accurately; legacy users are not falsely marked accepted.
- Role/status/email readonly; Seller application and guest access follow the chosen UX.
- No fake name, unsupported privacy promise or role selection privilege shortcut.
