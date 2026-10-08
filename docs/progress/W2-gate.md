# W2-gate · Wave 2 gate: change requests T02–T05

Status: DONE_WITH_GAPS
Wave: W2 gate · Agent finished: 2026-10-09 00:16

## Done
The orchestrator applied the following change requests between waves (DELIVERY-PLAN §2.2 step 4). Each one is marked `Status: APPLIED`, and its `## Resolution` section describes the change in full.

- T02-001: passwords are now hashed with Argon2id (`@node-rs/argon2`). The legacy `sha256:` and `scrypt$` hashes still verify and are upgraded on login. `arctic` was added to `packages/core` for T10 (`packages/core/src/auth/password.ts`).
- T02-002, T04-001, T05-001: `packages/core/package.json` gained subpath exports, including `./auth/api`, `./seams`, `./activity`, `./events`, `./jobs`, `./notify`, `./modules/locations`, `./modules/exports` and `./modules/*`.
  - `@agrorende/db` was added to `apps/worker` and `apps/realtime`, and the worker `tsconfig.json` now uses `rootDir: "../.."`.
  - The web, realtime and worker adapters import by package name.
- T02-003, T04-003, T05-002: `packages/core/src/seams.ts` delegates every T02, T04 and T05 seam to the module implementations.
- T02-004, T04-002: `recordActivity` (`packages/core/src/activity`) and `events.emit`/`dispatchPending` (`packages/core/src/events`) are implemented. `writeOutbox` and `writeActivity` delegate to them.
- T03-001, T03-002: the mobile export now bundles.
  - The `expo-crypto` plugin was removed and `apps/mobile/metro.config.cjs` was added, with a `.js` resolver.
  - Installed with `expo install`: `react-native-worklets`, `expo-image-picker`, `expo-document-picker` and `expo-screen-orientation`.
  - Added as devDependencies: `msw`, `@react-native/assets-registry`, `@testing-library/react-native` and `test-renderer`.
- T03-003: the home widget names `QuickReportCard`, `MyReportsCard`, `NextJobCard` and `RentalsTodayCard` were accepted.
- T03-004: the ownership was accepted, and the T03 row of `docs/DELIVERY-PLAN.md` §3.3 now lists `app/index.tsx`, `jest.config.js` and `src/i18n/*.ts`.
- T04-004: `withApi` verifies the access token, builds the core `Ctx` and enforces roles (`apps/web/src/server/withApi.ts`).
- T04-005: `apps/web` builds with webpack, using `extensionAlias` for `.js`, and `@agrorende/db` was added to `transpilePackages` (`apps/web/next.config.ts`, `apps/web/package.json`).
- T04-006: `apps/web` has Vitest, Testing Library and jsdom, with tests for the URL state helpers and `CpfCnpjInput`.
- T04-007: `qrcode` was added. The asset `qr.png` route and the `SharePanel` QR code (`QrSvg`) are implemented.
- T04-008: the theme variables now drive the page colours in `globals.css`, and the touch-target rule is scoped.
- T05-003: `ON_HOLD` was added to `OperatorStateEnum` and is used by `deriveOperatorState`.
- T05-004: the push job uses `expo-server-sdk` (`createExpoPushClient`).
- T05-006: `JOB_NAMES` and `JOB_QUEUES` were completed, and `enqueueJob` now goes through BullMQ, with the prefix `agrorende` or `agrorende:<db>`. Web export creation enqueues `exports.build`.
- T05-007: `LocationBatchNackSchema` and `orgRoom` were added to the realtime contracts.
- T05-009: `ulimits.nofile` for the mongo service in `docker-compose.yml` is now 65536. The container was not restarted.

Two lint fixes were needed so that `pnpm check` passes:
- `packages/core/eslint.config.js` allows `bullmq` in `src/jobs/**`, `csv-stringify` in `src/modules/exports/**` and `@react-pdf/renderer` in `src/pdf/**`, as ARCHITECTURE §4 intends.
- `apps/mobile/eslint.config.js` treats `metro.config.cjs` as CommonJS.

## Tests
- `pnpm install --frozen-lockfile` → exit 0, "Already up to date" (no-op).
- `pnpm check` → exit 0. Test counts:

  | Package | Tests passed |
  |---|---|
  | contracts | 266 |
  | core | 101 |
  | api-client | 29 |
  | design-tokens | 2 |
  | db | 2 |
  | web | 6 |
  | worker | 23 |
  | realtime | 10 |
  | mobile (Jest) | 59 |

- `pnpm i18n:check` → exit 0, "i18n-check passed for pt-BR, en". Only warnings for unused keys.
- `pnpm --filter web build` → exit 0.
- `pnpm --filter mobile exec expo export --platform android` → exit 0. The `apps/mobile/dist` output was deleted afterwards.

## Assumptions
- The demo seed keeps its `sha256:` password hashes. Login verifies them and rehashes them to Argon2id, so the seed did not need to change.
- `apps/web` uses webpack for `dev` and `build`, because Turbopack cannot alias `.js` specifiers to `.ts` sources.
- Next.js 16 route handlers receive their second argument as `unknown` and read it through `routeContextOf`. That is the only type that satisfies both route type checks.
- `@testing-library/react-native` 14 uses `test-renderer` instead of `react-test-renderer`, so that package was installed.

## Gaps
- T04-007: the printable QR sheet (`POST /api/v1/assets/qr-sheet`, a P1 PDF) is still `notImplemented` · not in the change request scope · T04 follow-up or T10.
- T03-003: the home cards are still link cards until T06, T07 and T08 export their widgets and switch the re-export line in `src/features/home/widgets.ts` · by design · T06, T07, T08.
- T05-009: the new Mongo file limit takes effect only when the container is recreated · docker changes were not allowed at the gate · developer.
- The remaining pending web component tests from T04 are not written yet; the runner is exercised by two suites · T04 follow-up or T11.

## Error cases added
- None.

## Change requests
- T02-001 · Argon2 (APPLIED)
- T02-002 · Platform handler exports (APPLIED)
- T02-003 · T02 seams (APPLIED)
- T02-004 · Events emit and dispatch (APPLIED)
- T02-005 · Notification templates in i18n (DEFERRED-T10)
- T03-001 · Android export (APPLIED)
- T03-002 · Mobile dependencies (APPLIED)
- T03-003 · Home widget names (APPLIED)
- T03-004 · Mobile path ownership (APPLIED)
- T04-001 · Core module exports (APPLIED)
- T04-002 · recordActivity and events (APPLIED)
- T04-003 · T04 seams (APPLIED)
- T04-004 · withApi core ctx (APPLIED)
- T04-005 · Web build (APPLIED)
- T04-006 · Web test runner (APPLIED)
- T04-007 · QR dependency (APPLIED)
- T04-008 · Theme variables and touch targets (APPLIED)
- T05-001 · Core exports for apps (APPLIED)
- T05-002 · Location seams (APPLIED)
- T05-003 · ON_HOLD state (APPLIED)
- T05-004 · expo-server-sdk (APPLIED)
- T05-005 · Apple revoke seam (DEFERRED-T10)
- T05-006 · exports.build enqueue (APPLIED)
- T05-007 · Realtime contract additions (APPLIED)
- T05-008 · Notification mute settings (DEFERRED-T10)
- T05-009 · Mongo open-file limit (APPLIED)
- T05-010 · CSV header catalogue (DEFERRED-T10)

## Notes for the next wave
- W3 producers should call `recordActivity(tx, row)` from `@agrorende/core/activity` and `emit(tx, event)` from `@agrorende/core/events` inside their transaction. After the commit they call `dispatchPending()`; the worker's `events.dispatch` job is the retry path.
- Jobs are enqueued with `enqueueJob(name, payload, { jobId })` from `@agrorende/core/jobs`. Only `packages/core/src/jobs/**` may import `bullmq`.
- Web routes get an authenticated core `Ctx` from `route(roles, handler)` in `apps/web/src/lib/core.server.ts`. The web app builds with `next build --webpack`.
- Core modules are imported by package name, for example `@agrorende/core/modules/<module>/service`. Never import them by relative path across packages.
- Mobile feature tasks can now use `expo-image-picker`, `expo-document-picker`, `expo-screen-orientation`, `msw` and `@testing-library/react-native`.
