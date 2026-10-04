# APK manifest — preview build 1

| Field | Value |
|---|---|
| File | `2ndhand-preview-26a7628.apk` (not committed; 113,840,900 bytes) |
| SHA-256 | `e0785c115d2ce50ac7b33cf30d3179dbe93280784eab3414e9390564d70be0a6` |
| Download | https://expo.dev/artifacts/eas/u6vGaDyAU60DgZZE_rGsuTuJ07PFOVM2m48TMsrvKxo.apk |
| EAS build | https://expo.dev/accounts/thammaraknai/projects/mobile-expo/builds/4d7b1b7f-3ada-469e-b3a8-ecf6e028433d |
| Source commit | `26a7628ddb98f156c7ad7cc7d66ed72bb64cba3a` (branch `codex/e-ui-integration-2026-10-03`, PR #133) |
| Profile | EAS `preview` (internal distribution, APK, bundled Hermes JS; no Metro/dev client) |
| Package / version | `com.kmutnb.secondhandmarketplace` / 1.0.0 |
| API | https://secondhand-api-gksn.onrender.com (Render, Docker, commit `fa247af` backend) |
| DB migration head | `r01e20261002` (team Supabase) |
| Checks | `assets/index.android.bundle` present; API URL present in bundle; no server secret/JWT found in bundle (string scan) |

Not yet verified on a real device: install, cold launch, Google login return, camera/gallery, QR on another phone (QA checklist A–G).

# APK manifest — preview build 2

| Field | Value |
|---|---|
| File | `2ndhand-preview-24fb9ce.apk` (not committed; 113,885,684 bytes) |
| SHA-256 | `0ad72c1cc7607cc1522982c3957744b457e3c073fd2c724f41a62e59c2aa33ee` |
| Download | https://expo.dev/artifacts/eas/EM8J6lVvwQ7u0oIulheR6EK9QE5qDNCQdqYZBpMsEsk.apk |
| EAS build | https://expo.dev/accounts/thammaraknai/projects/mobile-expo/builds/07c1f0e2-7345-432a-8e28-98fec22e5fd9 (finished 2026-10-04 13:35 UTC) |
| Source commit | `24fb9ce578d6fb7ab8af988b2119cf03cbeef13e` |
| Profile | EAS `preview` (same as build 1) |
| Package / version | `com.kmutnb.secondhandmarketplace` / 1.0.0 (install over build 1) |
| Changes since build 1 | custom brand entry; native image uploads sent as expo-file-system `File` for product images, seller ID card, inspection evidence and courier delivery proof (Expo SDK 57 `expo/fetch` rejects `{ uri, name, type }` parts) |
| Checks | `assets/index.android.bundle` present |

Not yet verified on a real device: product image upload, custom brand, seller verification submit, C4 inspection → certificate + QR, courier proof → confirm delivery.
