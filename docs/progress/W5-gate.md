# W5-gate · Wave 5 gate: change requests T11, T12, T13 and T18

Status: DONE_WITH_GAPS
Wave: W5 gate · Agent finished: 2026-10-09 05:55

## Done
The gate agent applied every open W5 change request between waves (DELIVERY-PLAN §2.2 step 4), removed the workarounds that the requesting tasks had put in place, fixed the pre-existing actionlint warnings and closed the R9 gap that T11 reported in the Ops live feed. As gate agent it was allowed to edit root configuration, `.github/**`, package manifests and `pnpm-lock.yaml`. Each change request now has a `Status` line and a `## Resolution` section in full prose.

### Change requests applied
- **T11-001 · Playwright as a real dependency.**
  - `@playwright/test` (^1.64.0) and `@axe-core/playwright` (^4.13.0) are `devDependencies` of `apps/web`.
  - The `apps/web/node_modules` symlinks and the scratch folder `.data/e2e-deps` are gone.
  - `pnpm-workspace.yaml` gained an `overrides` block. It pins the `playwright`, `playwright-core` and `@playwright/test` dependencies of the root `@playwright/cli` toolkit package to 1.64.0. Without it, the alpha build that `@playwright/cli` requests was hoisted and shadowed the `playwright` binary, and `pnpm --filter web exec playwright test` failed with "two different versions of @playwright/test". `playwright-cli` still works on the stable build.
- **T11-002 · actionlint SC2034.** The mock OIDC wait loops in `.github/workflows/ci.yml` and `.github/workflows/copilot-setup-steps.yml` use `_` instead of the unused `attempt` variable. actionlint exits 0 for every workflow.
- **T12-001 · Chaos suite in the gate.**
  - `apps/mobile` has `vitest` and a `test:chaos` script.
  - The new `tsconfig.test.json` typechecks the suite.
  - The harness uses the msw `onUnhandledFrame` option.
  - A `chaos` job in `ci.yml` runs the suite three times after `checks`.
- **T12-002 · Sync attention on the screens (APPLIED-PARTIAL).**
  - `SyncAttention.tsx` (`useSyncAttention`, `SyncAttentionBanners`) and `pendingWork.ts` (`sendEverythingNow`, `savePendingWorkCopy`) are in `apps/mobile/src/features/sync`.
  - Sync Center shows every attention code. Home shows the backlog, stale-device and trimmed-location codes.
  - The C6 reauthentication banner counts pending items.
  - Settings → Conta offers "Enviar agora" and "Salvar cópia".
  - `allowMobileDataForAll` lets "Enviar agora" send Wi-Fi-only media once.
  - New keys are present in pt-BR and en.
  - The parts still open are listed under *Gaps*.
- **T12-003 · Schema-update context on push.** `MUTATION_MIN_APP_VERSION` and `compareAppVersions` are in `packages/contracts/src/sync.ts`. `packages/core/src/sync/push.ts` adds `context: "schemaUpdate"` and `minAppVersion` to validation rejections from apps older than the minimum version.
- **T13-001 · Worker dependencies.** `apps/worker` declares `@agrorende/api-client` and `socket.io-client`. `simulate.ts` imports them by package name, which replaces the relative paths.
- **T13-002 · Seed matches §17.**
  - Active seed work orders go only to Organization A field technicians. Carlos keeps exactly one open job, the ON_HOLD one.
  - AGR-000012 has no seeded report or job.
  - `packages/db/test/seed.test.ts` asserts these rules. The seams test and `docs/DEMO.md` were updated.
  - The Playwright spec `apps/web/e2e/ops.spec.ts` expected technician Pedro to show "Available". It now accepts any live state and asserts that "Out of date" is gone, because Pedro now has an active job.
- **T13-003 · Shared ops live DTO types.** The contracts export `OpsLiveDTO` and the `Live*DTO` types. `packages/api-client/src/types.ts` re-exports them, which replaces its hand-written copies, and a new client test covers them.
- **T18-001 · Docker context.** `.dockerignore` uses recursive patterns. `infra/docker/clean-context.sh` and its `RUN` steps in the three Dockerfiles are removed.
- **T18-002 · Worker bundle layout.**
  - `apps/worker/src/jobs/index.ts` loads peer jobs through literal dynamic imports in `PEER_JOB_MODULES`, with no lookup on disk.
  - Apple token revocation comes from the new `@agrorende/core/auth/apple` export.
  - `infra/docker/bundle.mjs` bundles the worker into `dist/index.mjs` plus hashed chunks. The worker Dockerfile runs that file.
  - The bundle was built and started against local MongoDB and Redis on a spare health port. The health check answered and the scans ran. The bundle and its Redis keys were deleted afterwards.
- **T18-003 · Production guard and runtime realtime URL.**
  - `@agrorende/core/startup` (`assertProductionEnv`) refuses mock issuers, a non-SRV MongoDB URI and missing secrets when `APP_ENV=production`. Realtime and the worker call it at startup; the web app calls it from `src/instrumentation.ts`.
  - The web app reads the realtime URL at runtime. The root layout renders it into a meta tag, and `useRealtime` reads it with `clientRealtimeUrl()`.
  - `infra/docker/web-entrypoint.sh` and the build-time placeholder are removed.
- **T18-004 · EAS project id (APPLIED-PARTIAL).**
  - `apps/mobile/app.config.ts` reads `EAS_PROJECT_ID` through `resolveEasProjectId`. The id is optional locally, required during EAS builds, and must always be a UUID.
  - `.env.example` documents the variable.
  - `mobile.yml` fails early with a clear error when the repository variable is empty.

### Other fixes
- **R9 in the Ops live feed.**
  - `apps/web/src/features/ops/ActivityFeed.tsx` now translates activity actions such as `workOrder.complete` through `ops.activity.actions.*`, and the from and to statuses through `ops.activity.status.*`, in pt-BR and en.
  - Unknown actions and statuses show a neutral translated label, never the raw key.
  - `ActivityFeed.test.tsx` covers both locales and the fallback.

## Tests
- `pnpm install --frozen-lockfile` → exit 0, "Already up to date". This was run after the lockfile update and again after the Playwright `overrides`.
- `MONGODB_DB=agrorende_w5cr pnpm check` → exit 0. It was run twice, the second time after the `overrides` change. Test counts:

  | Package | Tests passed |
  |---|---|
  | contracts | 273 |
  | core | 466 |
  | api-client | 30 |
  | design-tokens | 2 |
  | db | 7 |
  | i18n | 11 |
  | web | 172 |
  | worker | 36 |
  | realtime | 10 |
  | mobile (Jest) | 138 |

- `pnpm i18n:check` → exit 0, "i18n-check passed for pt-BR, en". It printed warnings only, for unused keys.
- `pnpm --filter mobile test:chaos` → exit 0, 5 files, 58 tests.
- `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest` → exit 0 with no findings.
- `pnpm --filter web exec playwright test` → the first full run gave 44 passed and 2 failed: the ops "operator appears live" test on desktop and on tablet. The cause was the T13-002 seed change described above. After the spec fix, `playwright test e2e/ops.spec.ts` → 6 passed. The servers on ports 3100, 4101 and 4103 and the e2e OIDC container were stopped afterwards.
- The orchestrator still has to run the web build and the Expo export. They were not run here, as instructed.

## Assumptions
- `pnpm` skipped re-resolution after the `overrides` change while it trusted the cached workspace state. The state file `node_modules/.pnpm-workspace-state-v1.json` was moved aside once to force resolution; pnpm recreated it.
- The demo seed keeps Pedro, Lucas, Rafael and Joana as the technicians who carry the seeded active jobs, so the board and the map still look busy in the demo.
- "Salvar cópia" shares a JSON manifest through the system share sheet. Adding a zip library to the mobile app would be a dependency decision for the mobile owner.
- The production guard only runs when `APP_ENV=production`, so local, CI and e2e runs that use the mock OIDC server are unaffected.

## Gaps
- **T12-002, zip export.** "Salvar cópia" exports the manifest, which lists the media paths, but not the media files themselves.
- **T12-002, EC-SYN-31.** `SAME_USER_MULTIPLE_DEVICES` needs a server source for the user's other devices with pending work. The screens pass none, so that banner never shows.
- **T12-002, Wi-Fi state.** The sync store does not track Wi-Fi, so `WIFI_ONLY_MEDIA_WAITING` assumes that the phone is not on Wi-Fi.
- **T18-004, human step.** A human must create the EAS project (`eas init` on the Expo account) and set the repository variable `EAS_PROJECT_ID` to its UUID, next to the `EXPO_TOKEN` secret. Until then, the EAS jobs in `mobile.yml` fail early with a clear error.

## Error cases added
- None.

## Change requests
- T11-001 · Playwright packages as web devDependencies (APPLIED)
- T11-002 · actionlint warning in `ci.yml` (APPLIED)
- T12-001 · Chaos suite script, typecheck and CI job (APPLIED)
- T12-002 · Sync attention and pending work on the mobile screens (APPLIED-PARTIAL)
- T12-003 · Schema-update context on push rejections (APPLIED)
- T13-001 · Worker dependencies for the simulator (APPLIED)
- T13-002 · Demo seed matches ARCHITECTURE §17 (APPLIED)
- T13-003 · Shared ops live DTO types (APPLIED)
- T18-001 · Recursive `.dockerignore` (APPLIED)
- T18-002 · Bundle-friendly worker job loading (APPLIED)
- T18-003 · Production environment guard and runtime realtime URL (APPLIED)
- T18-004 · EAS project id from configuration (APPLIED-PARTIAL)

## Notes for the next wave
- **Playwright.** Run the E2E suite with `pnpm --filter web exec playwright test`. The workspace `overrides` keep a single Playwright version, so remove them only together with `@playwright/cli`'s alpha pin.
- **Worker jobs.** A new peer job module must be added to `PEER_JOB_MODULES` in `apps/worker/src/jobs/index.ts` with a literal `import()`, or it will not be bundled.
- **Production environment.** A new required production secret belongs in `productionEnvProblems` in `packages/core/src/startup/productionEnv.ts`.
- **Realtime URL.** Read the realtime URL on the client through `clientRealtimeUrl()` from `@/lib/realtimeUrl`. Do not read `NEXT_PUBLIC_REALTIME_URL` directly.
- **Seed.** Tests that depend on who holds which seeded work order should use `packages/db/test/seed.test.ts` as the reference.
