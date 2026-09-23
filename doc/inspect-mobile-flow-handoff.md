# INSPECT mobile flow handoff (stacked on API PR #94)

This branch connects the mobile app to the INSPECT-02/03 API backed by PostgreSQL. It follows the current draft [INSPECT-00 #54](https://github.com/naithammarak/secondhand-marketplace-android-app/issues/54); keep this PR draft until the contract is approved. Merge order: [INSPECT-01 PR #93](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/93), [API PR #94](https://github.com/naithammarak/secondhand-marketplace-android-app/pull/94), then this mobile PR.

## User path

1. After payment, Seller opens their Order, enters carrier/tracking and reports shipment. The Order and progress show `SHIPPING_TO_CENTER`.
2. Inspector opens the queue, receives the item, starts work, uploads up to five private images, selects 1–5 images, and submits one of `PASS`, `MINOR_ISSUE`, `NOT_AS_DESCRIBED`, `FAKE` with a summary. The queue can load more than the first page. A qualifying result is shown as saved only after the API returns a Certificate. A Certificate failure is shown as retryable and the API rolls back the result.
3. Buyer opens their Order and sees shipment/inspection progress. After finalization, the Buyer sees the result, summary, selected images fetched with their Bearer token, and the Certificate link when present.

The app sends an `Idempotency-Key` with each mutation. On an uncertain response it retains the key and payload for retry. For an uncertain image upload it retries the same picked file rather than opening the picker again. Backend authorization and database constraints remain the authority for access and duplicate prevention.

## Setup and verification

- Configure `EXPO_PUBLIC_API_BASE_URL` to the API origin reachable by the device. The API must have migration `c7e4b21a9d08`, `CERT_PUBLIC_ORIGIN`, and a private evidence store configured as described in [API handoff](inspect-02-03-api-handoff.md).
- Sign in with separate real Seller, Inspector and Buyer accounts on a test environment. Create and pay a fresh Order before running the flow. Refresh the Order or queue after another actor's action. Do not use a shared database for destructive setup.
- `npm run typecheck`, `npm run lint`, `npm run test:logic`, and `npm run test:components` run the mobile checks. The backend's PostgreSQL flow suite executes actual HTTP requests and SQL writes for all four outcomes, permissions, concurrency and replay.

## Still pending

- No physical-device or emulator run with three signed-in accounts against a staged API has been performed here. Mobile checks verify compilation, request construction and existing component behavior; the PostgreSQL API tests verify the database path. This is not evidence that the full app path works on a device.
- The private Supabase bucket and public Certificate origin must be provisioned for the deployment environment. The Certificate link currently opens a minimal public JSON verification response; QR layout and the final CERT contract are not implemented.
- #54 is still a draft, so any approved changes to roles, transitions, fields or Certificate policy must be reconciled before merge. The API and mobile PRs remain draft.

## Device smoke run, 2026-09-24

An isolated local PostgreSQL database named `inspect_device_test` was created and migrated to `c7e4b21a9d08`; the repository's configured shared `DATABASE_URL` was overridden, never migrated or reset. The API ran on port 8765 with a private local evidence directory and `CERT_PUBLIC_ORIGIN` pointing at its LAN address. From the same Windows host, `GET /health` via the LAN IP returned `200`; unauthenticated inspection queue and evidence requests returned `401`, and an unknown public Certificate token returned `404`. These checks establish only local service readiness, not reachability from another device or a full user flow.

Expo's web export completed and included `/inspections` and `/inspections/[inspectionId]`. The Seller → Inspector → Buyer device steps for both `PASS` and a negative result remain **not run**: this host has no `adb`, Android SDK or emulator, and no three accessible test sign-ins were supplied. There are therefore no device screenshots or app errors to attach yet. When an Android device is available, run the app with `EXPO_PUBLIC_API_BASE_URL` set to the test API address reachable from that device, sign in with separate test accounts, and record each step, the selected image on Buyer's Order, and the Certificate or negative outcome. Do not treat the web export or API suite as a substitute for that run.
