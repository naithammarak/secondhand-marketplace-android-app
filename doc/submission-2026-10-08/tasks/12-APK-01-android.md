# 12 / APK-01 — Installable Android release

**Priority:** P0 · **Owner:** Build Codex + device owner where needed · **Depends:** 01–10 feature candidate; QA 11 before declaring final · **Target:** first APK 5–6 Oct; final 7 Oct

## Prompt สำหรับ Codex

```text
The context packet is doc/submission-2026-10-08 in the repository, or the separately supplied submission-2026-10-08 folder.

Produce the installable Android submission artifact from the combined complete-app candidate in secondhand-marketplace-android-app/mobile. Read AGENTS.md and required exact Expo version docs before code; read packet DOC-01-scope.md, RELEASE-DESIGN.md, QA-MATRIX.md and task 10 runtime report. Inspect app.json/app.config.js/eas.json, lockfile and installed toolchain. Use official current Expo/EAS/Android documentation for build configuration or signing behavior you need to verify.

Choose a preview/internal standalone APK with bundled JavaScript that starts without Metro/dev-server; do not hand over an Expo development client as the final installable app. Keep Android package com.kmutnb.secondhandmarketplace and existing secondhandmarketplace scheme unless an actual conflict demands a documented change. Display brand 2NDHAND consistently, select existing app icon/splash assets and correct version/build code. EXPO_PUBLIC_MOCK_MODE/catalog-only/buyer-only/visual-QA flags must not restrict the full submission app. Set the authorized reachable HTTPS API and public Supabase config; never put service keys/secrets into mobile env/artifacts. Fix camera/gallery permission descriptions for product/verification/delivery evidence and Android navigation/keyboard issues within scope.

Use existing authorized EAS login/build configuration or local Android toolchain as available, producing reproducible commands. Avoid adding dependencies or installing a large toolchain blindly; inspect bundled/local tools first. If credentials/signing/SDK/device connection are missing, complete the build configuration and deterministic preflight, then report the exact required user step; do not fabricate an APK. Cloud upload/build or shared credential changes require authorization if not already supplied.

Build, verify package/version, SHA256/size and JavaScript inclusion, then install and launch on a connected authorized real Android device using adb when available. Confirm cold start without Metro, guest catalog, real Google login return and task 11 main-flow checks against the reachable API. Share the APK through a local artifact link or authorized delivery channel, not a store publication. AAB/Play Store are not required for sideloading this course demo.

Deliver artifacts/android/ with actual APK, a hash/manifest and install/run instructions, reports/12-APK-01.md with source/API SHA, build environment and native evidence. Update reports/release-manifest.json only with proven fields. If code/environment changes after QA, rebuild and rerun affected native gates. Do not claim READY merely because the build job succeeded. Continue through an actual build and installation where access permits.
```

## Acceptance

- Real APK with bundled JS, correct package/version/brand, full API mode and no secrets.
- Installed Android cold launch without Metro and matched source/build/API manifest.
- Final readiness follows QA, not only compilation; missing access/artifact is explicit.
