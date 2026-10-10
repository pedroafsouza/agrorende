# APK-RELEASE · Unsigned Android APK attached to every GitHub Release

Status: DONE_WITH_GAPS
Wave: post-W5 (user request) · Agent finished: 2026-10-10 13:45

## Done
- New workflow `.github/workflows/android-apk.yml` (user request: "a GitHub pipeline that
  generates a not signed Android APK, added to the release"). Triggers: push of a `v*.*.*` tag
  and `workflow_dispatch` (inputs `tag`, `variant` = `production` | `preview`).
  Steps: tag format check, checkout (the tag), pnpm 11.0.9, Node 24 with pnpm cache, Temurin 17,
  `gradle/actions/setup-gradle@v4`, Android SDK check (`ANDROID_HOME` of the runner),
  `pnpm install --frozen-lockfile --filter "mobile..."`,
  `pnpm exec expo prebuild --platform android --no-install --clean`, removal of
  `signingConfig signingConfigs.debug` from the release buildType (asserted before and after),
  `./gradlew assembleRelease -x lintVitalRelease --no-daemon -PreactNativeArchitectures=...`,
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

## Tests
- `actionlint .github/workflows/android-apk.yml` (with shellcheck) → no findings.
- `APP_VARIANT=production CI=1 pnpm exec expo prebuild --platform android --no-install --clean`
  (in `apps/mobile`) → failed before the plugin fix, "Finished prebuild" after it.
- The workflow's signing-removal script, extracted verbatim and run on the fresh
  `android/app/build.gradle` → removed the release line, kept the debug buildType line, printed
  the block; a second run fails with the "Expo template changed" error as intended.
- `./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a` → BUILD FAILED in
  `lintVitalRelease` (see Gaps); with `-x lintVitalRelease` → BUILD SUCCESSFUL, 68.6 MB
  `app-release-unsigned.apk` containing `assets/index.android.bundle`.
- `apksigner verify app-release-unsigned.apk` → "DOES NOT VERIFY / Missing META-INF/MANIFEST.MF"
  (unsigned, as intended).
- The documented signing commands (`keytool`, `zipalign -p -f 4`, `apksigner sign`,
  `apksigner verify`) with a throwaway keystore → signed APK verifies. Throwaway files deleted.
- Not run: the workflow on GitHub (no push allowed).

## Assumptions
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
- `apps/mobile/locales/pt-BR.json` and `en.json` nest their strings under `"expo"`. Expo writes
  each top-level key as a native string, so Android gets `<string name="expo">"[object Object]"</string>`
  in `values-b+pt+BR` and `values-b+en` (no default), lint `ExtraTranslation` fails the release
  build, and the localized permission texts are not applied on Android or iOS. The workflow skips
  `lintVitalRelease` as a workaround. Fix: flatten the files to the Expo locale format (top-level
  keys such as `CFBundleDisplayName`, `NSCameraUsageDescription`, … and/or `ios` / `android`
  sections), then drop `-x lintVitalRelease`. Owner: mobile i18n.
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

## Notes for the next wave
- `apps/mobile/android/` was regenerated locally by `expo prebuild --clean` (git-ignored) with
  the release signing removed; run `expo prebuild --clean` again for a normal local release build.
