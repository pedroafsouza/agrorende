# APK-RELEASE · Unsigned Android APK attached to every GitHub Release

Status: DONE
Wave: post-W5 (user request) · Agent finished: 2026-10-10 13:55

## Done
- New workflow `.github/workflows/android-apk.yml` (user request: "a GitHub pipeline that
  generates a not signed Android APK, added to the release"). Triggers: push of a `v*.*.*` tag
  and `workflow_dispatch` (inputs `tag`, `variant` = `production` | `preview`).
  Steps: tag format check, checkout (the tag), pnpm 11.0.9, Node 24 with pnpm cache, Temurin 17,
  `gradle/actions/setup-gradle@v4`, Android SDK check (`ANDROID_HOME` of the runner),
  `pnpm install --frozen-lockfile --filter "mobile..."`,
  `pnpm exec expo prebuild --platform android --no-install --clean`, removal of
  `signingConfig signingConfigs.debug` from the release buildType (asserted before and after),
  `./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=...`,
  check that `apksigner verify` fails, rename to `agrorende-<tag>[-preview]-unsigned.apk`, write
  `<name>.sha256`, upload as workflow artifact (30 days), then wait up to 30 minutes for the
  release that `release.yml` creates and `gh release upload <tag> ... --clobber`.
  Permissions `contents: write` on the job only; timeout 75 minutes; concurrency
  `android-apk-<tag>-<variant>`, no cancellation.
- Build-time configuration: `APP_VARIANT`, `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_API_URL`,
  `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_SITE_URL` (from repository variables `APP_HOST`, `WS_HOST`,
  `SITE_HOST`, defaulting to the production hosts, or the staging hosts for `preview`),
  `EXPO_PUBLIC_SUPPORT_WHATSAPP`, `EXPO_PUBLIC_SENTRY_DSN`, `EAS_UPDATE_URL`, `EAS_PROJECT_ID`,
  secret `GOOGLE_MAPS_ANDROID_API_KEY`, `ANDROID_APK_ARCHS` (default `armeabi-v7a,arm64-v8a`),
  `SENTRY_DISABLE_AUTO_UPLOAD=true`. No secret is committed.
- `docs/RELEASING.md`: new §6.1 "Android APK (unsigned)" (trigger, manual run, configuration,
  why unsigned, `keytool` / `zipalign` / `apksigner` / `adb install` commands) and step 6 in §4.3.
- Fixed `apps/mobile/plugins/withNavigationQueries.js`: it passed `manifest.manifest` to
  `AndroidConfig.Manifest.ensureToolsAvailable`, which expects the whole `AndroidManifest`
  object, so every `expo prebuild --platform android` failed with
  `TypeError: [android.manifest]: withAndroidManifestBaseMod: Cannot read properties of undefined (reading '$')`.
  It now passes `mod.modResults`; the generated manifest has the `google.navigation`, `geo` and
  `waze` query intents.
- Follow-up: restructured `apps/mobile/locales/pt-BR.json` and `en.json` to the Expo locale
  format (Expo docs "Translating app metadata"; `@expo/config-plugins` `utils/locales.js` sends
  top-level keys to both platforms and the `ios` / `android` objects to one platform). Each file
  now has a single `ios` object with `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocationAlwaysUsageDescription`,
  `NSLocationWhenInUseUsageDescription` and `NSPhotoLibraryUsageDescription`, with the existing
  translations. Android no longer gets the `<string name="expo">"[object Object]"</string>`
  resource, so the workflow no longer skips `lintVitalRelease`. `docs/TRANSLATING.md` step 6 and
  `docs/RELEASING.md` §6.1 updated.

## Tests
- `actionlint .github/workflows/android-apk.yml` (with shellcheck) → no findings.
- `APP_VARIANT=production CI=1 pnpm exec expo prebuild --platform android --no-install --clean`
  (in `apps/mobile`) → failed before the plugin fix, "Finished prebuild" after it.
- The workflow's signing-removal script, extracted verbatim and run on the fresh
  `android/app/build.gradle` → removed the release line, kept the debug buildType line, printed
  the block; a second run fails with the "Expo template changed" error as intended.
- `./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a` → BUILD FAILED in
  `lintVitalRelease` on the old locale files (fixed in the follow-up); with `-x lintVitalRelease` → BUILD SUCCESSFUL, 68.6 MB
  `app-release-unsigned.apk` containing `assets/index.android.bundle`.
- `apksigner verify app-release-unsigned.apk` → "DOES NOT VERIFY / Missing META-INF/MANIFEST.MF"
  (unsigned, as intended).
- The documented signing commands (`keytool`, `zipalign -p -f 4`, `apksigner sign`,
  `apksigner verify`) with a throwaway keystore → signed APK verifies. Throwaway files deleted.
- Follow-up, after the locale restructure:
  - `APP_VARIANT=production CI=1 pnpm exec expo prebuild --platform android --no-install --clean`
    → finished; `values-b+en/strings.xml` and `values-b+pt+BR/strings.xml` are `<resources/>`.
  - `./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a` (signing removed
    by the workflow script, lint enabled) → `:app:lintVitalRelease` ran, BUILD SUCCESSFUL in
    5m 51s, 68.6 MB `app-release-unsigned.apk`; `apksigner verify` → DOES NOT VERIFY (unsigned).
  - `APP_VARIANT=production CI=1 pnpm exec expo prebuild --platform ios --no-install` → `en.lproj`
    and `pt-BR.lproj/InfoPlist.strings` contain the six translated usage descriptions. The
    generated `apps/mobile/ios/` (not git-ignored) was deleted afterwards.
  - `actionlint .github/workflows/android-apk.yml` → no findings.
  - `pnpm check:only mobile` → FAILED in lint, only in the video agent's untracked
    `apps/mobile/src/ui/Lottie.web.tsx` (`'StyleProp' is defined but never used`, `'ViewStyle'
    is defined but never used`). Typecheck (`pnpm run typecheck`) also fails only there (3 errors,
    first `src/ui/Lottie.web.tsx(76,13): error TS2322`). `pnpm run test` → 37 suites, 199 tests
    passed. `eslint plugins app.config.ts` → clean. Not fixed (not my file).
- Not run: the workflow on GitHub (no push allowed).

## Assumptions
- The localized app name (`expo.name` / `CFBundleDisplayName` / `app_name`) was dropped from the
  locale files: it was "AgroRende" in both languages, and a localized `app_name` would hide the
  `AgroRende Dev` / `AgroRende Staging` variant names on Android.
- The notification permission text was dropped: neither iOS nor Android has an app-defined
  usage description for notifications, so Expo has no key to write it to.
- A separate workflow instead of a job in `release.yml`: the release job there is gated on the
  staging deployment and uses Docker; the APK build is independent and long.
- No `release: published` trigger: `release.yml` creates the release with `GITHUB_TOKEN`, which
  never triggers other workflows, and a release created in the UI also pushes the tag, which would
  build twice. The tag push plus a polling wait gives exactly one upload per tag.
- The job uses no GitHub Environment (no reviewer approval for an unsigned test artifact), so it
  reads repository-level variables only, with production host defaults.
- Only `armeabi-v7a` and `arm64-v8a` are built by default to keep the runner build time down.
- The APK version is the `version` in `app.config.ts` and `versionCode` 1; the tag is in the file
  name only (`app.config.ts` is owned by another agent).

## Gaps
- The release must be created by `release.yml` within 30 minutes of the APK finishing; otherwise
  rerun `android-apk` manually with `tag=vX.Y.Z`.

## Error cases added
- None (CI only).

## Change requests
- None. No change needed in `apps/mobile/package.json`, `app.config.ts` or `metro.config.cjs`.

## Edits outside owned paths (T10, T11, T12 only)
- `.github/workflows/android-apk.yml`: new, explicitly requested by the user.
- `apps/mobile/plugins/withNavigationQueries.js`: one-line bug fix required for any Android
  prebuild.
- `apps/mobile/locales/pt-BR.json`, `apps/mobile/locales/en.json`, `docs/TRANSLATING.md`: locale
  format fix, requested by the orchestrator.

## Notes for the next wave
- `apps/mobile/android/` was regenerated locally by `expo prebuild --clean` (git-ignored) with
  the release signing removed; run `expo prebuild --clean` again for a normal local release build.
