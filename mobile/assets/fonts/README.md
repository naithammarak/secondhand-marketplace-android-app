# Bundled Thai fonts

Kanit Medium/SemiBold and Noto Sans Thai Regular/Medium are bundled locally so the app does not depend on Google Fonts requests at runtime. The unmodified TTF files are from `@expo-google-fonts/kanit@0.4.1` and `@expo-google-fonts/noto-sans-thai@0.4.2` on npm. No new runtime package is required.

Both families are licensed under the SIL Open Font License 1.1; the corresponding license files are included here. Upstream: [Kanit](https://github.com/google/fonts/tree/main/ofl/kanit), [Noto Sans Thai](https://github.com/google/fonts/tree/main/ofl/notosansthai).

The root layout loads these assets with the existing [`expo-font` SDK 57 API](https://docs.expo.dev/versions/v57.0.0/sdk/font/).
