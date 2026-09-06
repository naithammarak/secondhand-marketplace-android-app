# Mobile Google Login (LOGIN-02)

## Implementation status

LOGIN-01 contract implemented for Expo SDK 57:

- Supabase Auth with Google OAuth.
- App scheme `secondhandmarketplace`.
- Mobile callback `secondhandmarketplace://auth/callback`.
- Android application ID `com.kmutnb.secondhandmarketplace`.
- Supabase session persistence in AsyncStorage and refresh while the app is active.
- `GET /me` with the current Supabase access token in the `Authorization: Bearer` header.
- A service-layer `/me` mock returning `role: null` when `EXPO_PUBLIC_API_BASE_URL` is absent.
- Logout through `supabase.auth.signOut()` and return to Login.

The app does not contain a Google client secret, Supabase `service_role` key, database URL,
database password, or role mutation for `ADMIN`/`INSPECTOR`. The Mobile app only displays
the role returned by Backend; it never treats a client-supplied role as authorization.

Physical Google login and BE verification are still `NOT RUN`: this machine has no test
Supabase environment values, Google test account, Android SDK/ADB or connected phone.
EAS CLI also reports `Not logged in`. The local Gradle build therefore stopped at the
missing Android SDK and did not produce an APK.

## Environment

Copy `.env.example` to `.env.local` and obtain these public test-environment values from
BE/Lead through the team-approved channel:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# Leave empty to use the temporary /me service mock.
EXPO_PUBLIC_API_BASE_URL=https://PHONE_REACHABLE_BACKEND_ORIGIN
```

`EXPO_PUBLIC_*` values are bundled into the app and are not secrets. Never place a Google
client secret, `service_role` key, database connection string/password, access token,
refresh token, provider token, authorization code or authorization header in an env file
committed to Git, logs, screenshots, analytics, issue or chat.

If `EXPO_PUBLIC_API_BASE_URL` is configured, Mobile reduces it to its HTTP(S) origin and
calls only `<origin>/me`. If absent, OAuth and Supabase sessions remain real but `/me` is
mocked as `{ role: null }`. The UI labels this mock explicitly; it is not BE evidence.

## Google, Supabase and Mobile redirect setup

1. Enable Google in Supabase Authentication providers using the server-side Google OAuth
   client values managed by the project owner. Never copy the Google secret into Mobile.
2. In Google Auth Platform, set the authorized redirect URI to the callback shown by the
   Supabase Google provider, normally:
   `https://PROJECT_REF.supabase.co/auth/v1/callback`.
3. In Supabase Authentication URL configuration, add exactly:
   `secondhandmarketplace://auth/callback`.
4. The app creates this URI with:
   `makeRedirectUri({ scheme: "secondhandmarketplace", path: "auth/callback" })`.
5. `app.json` registers the same scheme and Android package. Changing either value requires
   a new native build.

The selected flow is the Supabase native deep-link implicit flow. Mobile calls
`signInWithOAuth` with `provider: "google"`, the redirect above and
`skipBrowserRedirect: true`, then opens the returned URL with
`WebBrowser.openAuthSessionAsync`. The central callback handler accepts only the exact
scheme/host/path and supplies access/refresh tokens from the callback to
`supabase.auth.setSession`. It never logs or renders the callback.

Browser results, linking events and the initial cold-start URL share this handler. Concurrent
duplicate callbacks share one operation; completed callbacks do not repeat `/me`. Cancelling
dismisses the browser, invalidates the attempt and allows retry. A stale result cannot replace
the new attempt. Browser cancel/dismiss is separated from provider/browser errors.

## Install, checks and build

Run from `mobile`. On Windows PowerShell use `npm.cmd`/`npx.cmd` if script policy blocks the
`.ps1` launchers.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npx expo install --check
node node_modules/expo/bin/cli export --platform android --clear
```

Dependencies were installed using the LOGIN-01 command:

```sh
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill expo-auth-session expo-crypto expo-web-browser expo-dev-client
```

### EAS Android Development Build (recommended for the test phone)

`eas.json` defines an internal APK development-client profile. An authorized Expo project
owner runs:

```sh
npx eas-cli login
npx eas-cli build --platform android --profile development
```

Open the build URL on the Android test phone and install the APK, or install a completed
build from a computer with ADB:

```sh
npx eas-cli build:run --platform android --profile development --latest
```

Start the development server after installation:

```sh
npx expo start --dev-client
```

### Local Android Development Build

Install Android SDK 36, Build Tools 36, platform tools/ADB and set `ANDROID_HOME`, then:

```sh
npx expo prebuild --platform android
npx expo run:android --device
```

For an APK without installing directly:

```powershell
$env:GRADLE_USER_HOME = "$PWD\.gradle-local"
Set-Location android
.\gradlew.bat assembleDebug
```

The APK is normally `android/app/build/outputs/apk/debug/app-debug.apk`. A JS export is not
an APK and is not physical-device evidence. Rebuild after changes to scheme, application ID,
plugins or native dependencies. Do not use Expo Go as evidence for this callback contract.

## Phone test procedure

1. Record date/time, commit, build ID, environment, device model and Android version.
2. Verify the phone can reach the Backend origin (phone `localhost` is not the dev PC).
3. Launch the development build and press Google Login once.
4. Select the approved Google test account and verify return to
   `secondhandmarketplace://auth/callback`.
5. Verify Supabase Authentication → Users contains the account.
6. With real Backend enabled, have BE confirm `GET /me` token verification and user mapping
   using a request/correlation ID and timestamp. Do not copy the token to BE.
7. Close/back/cancel the browser and retry. Rapidly press Login and confirm one browser flow.
8. Test provider denial, network loss, duplicate callback, warm/cold callback and app restart.
9. Logout and verify the app returns to Login; reopen and verify no signed-in session remains.
10. Inspect app/device/backend logs and screenshots for tokens, codes, authorization headers
    and full callback URLs before sharing evidence.

On 401, Mobile requests one Supabase session refresh and retries `/me` once. A failed refresh
clears the local session and returns to Login. It does not refresh or loop Login for 403.

## Troubleshooting

- **App does not reopen:** confirm the installed build was rebuilt with the scheme, then use
  `npx uri-scheme open secondhandmarketplace://auth/callback --android` only with a callback
  containing no credentials.
- **Redirect mismatch:** compare the Google callback shown by Supabase, Supabase redirect
  allowlist and Mobile URI character-for-character.
- **No session:** confirm both callback tokens reach the central handler and AsyncStorage is
  available. Never print the values while diagnosing.
- **`/me` unavailable:** leave `EXPO_PUBLIC_API_BASE_URL` unset for the labeled mock, or use an
  HTTP(S) origin reachable by the phone. 401 triggers one SDK refresh; 403 is displayed without
  a Login loop; network and 5xx states can be retried.
- **Native config changed:** rebuild and reinstall; Metro reload cannot change manifest data.

## Verification record

Date: 2026-09-06. Branch: `login2-frontend`. Base commit: `e91ac4f` plus working changes.
Local environment: Windows, Node 24.20.0. Physical device: unavailable.

| Check | Actual result | Status |
| --- | --- | --- |
| Expo dependency compatibility | `expo install --check`: dependencies up to date | PASS |
| Expo Doctor | 21/21 checks passed | PASS |
| ESLint | `npm run lint`: no findings | PASS |
| TypeScript | `npm run typecheck`: no errors | PASS |
| Automated behavior | 32 tests: callback validation, duplicate/cancel/stale attempts, bearer `/me`, error mapping, one refresh | PASS |
| Android JS export | 1,677 modules; Hermes bundle `entry-997f152a340bcfae0f9c13f6c2fbfbf1.hbc` | PASS |
| Web smoke response | Expo dev server returned HTTP 200 | PASS |
| Native manifest | scheme and Android application ID present after prebuild | PASS |
| Local APK | Gradle stopped: Android SDK location unavailable | NOT RUN / BLOCKED |
| EAS APK | EAS CLI returned `Not logged in` | NOT RUN / BLOCKED |
| Google account selection and callback on phone | Test credentials/build/phone unavailable | NOT RUN |
| Supabase Authentication user record | Test project access unavailable | NOT RUN |
| Cancel/retry and duplicate press on phone | Development build unavailable | NOT RUN |
| Session restore/logout on phone | Development build unavailable | NOT RUN |
| BE `/me` token verification and mapping | Backend/environment/evidence unavailable | NOT RUN |
| Device log/screenshot inspection | No physical OAuth run | NOT RUN |

Suggested evidence: a redacted Login → account selection → callback → account result video,
cancel/retry video, build ID, test timestamp, request/correlation ID and BE confirmation that
the Supabase token was valid and the user mapping succeeded. Raw credentials are never evidence.

## References checked

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [Expo SDK 57 AuthSession](https://docs.expo.dev/versions/v57.0.0/sdk/auth-session/)
- [Expo SDK 57 WebBrowser](https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser/)
- [Expo SDK 57 Linking](https://docs.expo.dev/versions/v57.0.0/sdk/linking/)
- [Supabase Native Mobile Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Supabase Auth with React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native)
