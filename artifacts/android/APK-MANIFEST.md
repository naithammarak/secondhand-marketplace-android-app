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
