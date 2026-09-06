# Mobile Google Login (LOGIN-02)

## Implementation status

LOGIN-01 contract implemented for Expo SDK 57:

- Supabase Auth with Google OAuth.
- App scheme `secondhandmarketplace`.
- Native callback `secondhandmarketplace://auth/callback`.
- Web development callback `http://localhost:8081/auth/callback` when Expo Web runs on
  the default port; production uses the deployed HTTPS origin.
- Android application ID `com.kmutnb.secondhandmarketplace`.
- Supabase session persistence in native AsyncStorage or Web browser storage, with refresh
  while the app is active.
- Static Web rendering does not create or cache a Supabase client until a browser runtime
  is available.
- `GET /me` with the current Supabase access token in the `Authorization: Bearer` header.
- A service-layer `/me` mock returning `role: null` when `EXPO_PUBLIC_API_BASE_URL` is absent.
- Logout through `supabase.auth.signOut()` and return to Login.

The app does not contain a Google client secret, Supabase `service_role` key, database URL,
database password, or role mutation for `ADMIN`/`INSPECTOR`. The Mobile app only displays
the role returned by Backend; it never treats a client-supplied role as authorization.

Real Google Login QA is still `NOT RUN` on both Web and an Android Development Build.
The automated frontend checks do not replace provider account selection, browser redirect,
native deep-link, session restore or Backend `/me` evidence.

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
   This Google Cloud callback is separate from the app callback URLs below.
3. In Supabase Authentication URL configuration, add the native callback:
   `secondhandmarketplace://auth/callback`.
   Add the Web development callback used by Expo, for example:
   `http://localhost:8081/auth/callback`.
   Add the future production callback as the real deployed HTTPS origin, for example:
   `https://YOUR_WEB_DOMAIN/auth/callback`.
4. The app creates the callback at runtime with:
   `makeRedirectUri({ scheme: "secondhandmarketplace", path: "auth/callback" })`.
   Native uses the app scheme; Web uses the current browser origin and path. The exact
   protocol, hostname, port and pathname must match the callback being processed.
5. `app.json` registers the native scheme and Android package. Changing either value
   requires a new native build.

The platform-specific login flow is intentional. Native calls `signInWithOAuth` with
`provider: "google"`, the native redirect and `skipBrowserRedirect: true`, then opens the
returned URL with `WebBrowser.openAuthSessionAsync`. Web calls `signInWithOAuth` with
`skipBrowserRedirect: false` and lets Supabase redirect the current browser page directly;
Web does not call `openAuthSessionAsync` or open a popup after waiting for Supabase.
The central callback handler accepts only an exact match for protocol, hostname, port and
pathname, then supplies access/refresh tokens to `supabase.auth.setSession`. It never logs
or renders the callback.

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
npx expo export --platform web
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

## Web test procedure

1. Start Expo Web with `npx expo start --web` and record the actual browser origin shown
   by Expo. The default development origin is commonly `http://localhost:8081`.
2. In Supabase Authentication URL configuration, add that exact origin plus
   `/auth/callback`, for example `http://localhost:8081/auth/callback`. Do not substitute
   the Google Cloud callback from the previous section.
3. Open the Web app and press Google Login once. Confirm that Supabase redirects the same
   browser tab to Google; no popup or `openAuthSessionAsync` window should be opened.
4. Select the approved Google test account and verify return to the Web
   `/auth/callback` route, a signed-in session and the expected account state.
5. Refresh the page, log out and log in again. Also test provider denial, browser back or
   cancel, network loss and a retry after each failure.
6. Verify callback rejection for a wrong origin, port or pathname. Record only redacted
   screenshots/logs; never share tokens, codes, authorization headers or full callback URLs
   containing credentials.

## Android Development Build test procedure

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

Date: 2026-09-06. Branch: `login2-frontend`. `HEAD` and `origin/login2-frontend` are
currently both `b22652b`; the auth, test and guide changes below are still local and need a
commit/push before review can use the remote branch.
Local environment: Windows, Node 24.20.0. Manual Google Login QA: not run.

| Check | Actual result | Status |
| --- | --- | --- |
| Expo dependency compatibility | `expo install --check`: dependencies up to date | PASS |
| Expo Doctor | 21/21 checks passed | PASS |
| ESLint | `npm run lint`: no findings | PASS |
| TypeScript | `npm run typecheck`: no errors | PASS |
| Automated behavior | `npm.cmd test`: 37/37 tests passed, including callback validation, platform-specific OAuth behavior and static-render client coverage | PASS |
| Android JS export | 1,677 modules; Hermes bundle `entry-997f152a340bcfae0f9c13f6c2fbfbf1.hbc` | PASS |
| Web static export | `npx.cmd expo export --platform web`: 5 static routes, including `/auth/callback` | PASS |
| Web smoke response | Expo dev server returned HTTP 200 | PASS |
| Native manifest | scheme and Android application ID present after prebuild | PASS |
| Local APK | Gradle stopped: Android SDK location unavailable | NOT RUN / BLOCKED |
| EAS APK | EAS CLI returned `Not logged in` | NOT RUN / BLOCKED |
| Web Google account selection and callback | Real provider redirect and session QA not run | NOT RUN |
| Android Development Build Google account selection and callback | Real provider deep-link QA not run | NOT RUN |
| Supabase Authentication user record | Test project access unavailable | NOT RUN |
| Web cancel/retry and session restore/logout | Real browser QA not run | NOT RUN |
| Android cancel/retry and session restore/logout | Development Build QA not run | NOT RUN |
| BE `/me` token verification and mapping | Backend/environment/evidence unavailable | NOT RUN |
| Device log/screenshot inspection | No physical OAuth run | NOT RUN |
| Commit and push | No commit or push performed; remote remains at `b22652b` | NOT RUN |

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
