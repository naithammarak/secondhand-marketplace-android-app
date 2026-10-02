# Package C API / integration handoff to A and E

Base A PR123 `94a26a0fbb7a0a82948d95de7db9af070707b770`. C isolated worktree `D:\projectsa\package-c`; do not copy its dependency directories or test PostgreSQL. A owns merge order for E; C's profile-screen/login-screen changes live only here.

## Task07 — independently consumable

Authenticated requests use `Authorization: Bearer <current session token>`.

```http
GET /profile
PATCH /profile
Content-Type: application/json

{"full_name":"ชื่อที่แก้ไข"}
```

```http
POST /profile/policy-acknowledgement
Content-Type: application/json

{"policy_version":"submission-2026-10-01"}
```

All return the same private projection (synthetic example; timestamps are server-generated):

```json
{"id":42,"full_name":"ชื่อที่แก้ไข","email":"buyer@example.test","role":"BUYER","status":"ACTIVE","privacy_policy_version":"submission-2026-10-01","privacy_acknowledged_at":"2026-10-02T06:00:00Z"}
```

Before acknowledgement both policy fields are null. Unsupported fields/version or invalid name → 422 `validation_error`; inactive writes → 403 `account_inactive`; no target user ID accepted. Saving name does not update historical Order snapshots. Same-policy POST retains first DB timestamp.

`createProfileService({baseUrl})`: `get(token,signal?)`, `save(token,name,signal?)`, `acknowledge(token,signal?)`. `useProfile()` exposes `profile,busy,error,reload,save,acknowledge`; operations return success boolean only for the same account generation. Mount `ProfileDetails key={session.user.id} model={model}`; use `model.profile.full_name` in identity card. Keep existing auth/verification gates and approved Seller Buyer navigation. `ConsentModal` persists acknowledgement internally and then invokes `onAgree`; cancellation just closes it.

No mock mode for these services: missing API configuration produces a retryable unavailable error. Shared timeout includes response-body reads. On account change/unmount hook cancels and rejects stale commits to UI. Server still authorizes every request.

## Migration / file ownership

`a02f20261002` → `c07f20261002` → reserved `c08f20261002`. No branch head. C owns new profile/review modules, existing review/consent components and isolated screen wiring. A applies C's profile identity/form/policy and removes old mock widgets before combining E's entry/navigation work. Preserve E's fulfillment controls. Do not replace the full E screen with an older copy.

Task08 final integration stays pending accepted B/task04. Test-only terminal fixtures must never be exposed in the regular API or app.
