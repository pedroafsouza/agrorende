# W6-gate · Wave 6 gate: change requests T14, T15, T16 and T17

Status: DONE
Wave: W6 gate · Agent finished: 2026-10-09 06:50

## Done
The gate agent applied every open W6 change request (DELIVERY-PLAN §2.2 step 4) and turned the known red items of the wave green. As gate agent it was allowed to edit paths outside a single task's lane. Each change request now reads `Status: APPLIED` and ends with a `## Resolution` section in full prose. T15-003 was already resolved by its owner, and T07-001 was already applied, so the gate did not touch them.

### Change requests applied
- **T14-001 · Critical-window SLA (BR-F2-2).**
  - `WorkOrderSettings` in `packages/core/src/modules/workOrders/common.ts` now carries the organisation time zone.
  - `createFromSource` and `patch` (when `dueAt` is reset to `null`) compute the deadline with `dueAtFor`. A job for a category inside an active critical window of the current season gets the halved SLA.
  - Three new cases in `sla.p1.test.ts` cover it: a tractor inside the window gets 12 hours, a category outside the window and a season without a window get 24 hours, and a patch reset also gets 12 hours.
- **T14-002 · External cost only after completion.**
  - `setExternalCost` in `workOrders/external.ts` rejects a cancelled job with `WO_CANCELLED`, and any job that is not COMPLETED or VERIFIED with `INVALID_TRANSITION`.
  - `setExternalCostFromCompleted` stays as an alias for the route.
- **T14-003 · Worker jobs.** `maintenance.dueScan` and `stock.lowScan` are registered in `PEER_JOB_MODULES` (`apps/worker/src/jobs/index.ts`), and `platform.test.ts` asserts both handlers.
- **T14-004 · Parts messages in the work-order provider.**
  - `WorkOrdersIntl` loads the `jobs` and `parts` namespaces.
  - The `PartsMessages` wrapper is deleted.
  - The web `comments/mountPoints.test.tsx` renders the real external-cost panel and billing actions instead of expecting placeholders.
- **T15-001, T16-001, T17-001 · Tenancy coverage.**
  - `packages/core/src/__tests__/tenancy.test.ts` now covers every T14–T17 route:
    - parts
    - stock locations, levels and movements
    - maintenance plans
    - billing documents, including the preview and PDF routes
    - fuel logs and consumption
    - comments
    - field-report link-asset
    - analytics and boundaries
    - search
    - the plot read
    - the QR sheet
  - Organisation A records for the P1 modules are created in `beforeAll`, because the seed has none: a billing document, a fuel log, a catalog part with stock, a warehouse and a maintenance plan.
  - `comment.create` and `fuelLog.create` expect `NOT_FOUND`.
  - The new rows exposed one tenant gap: `fuelConsumption` echoed a foreign asset id with an empty series. It now answers `NOT_FOUND` for an asset outside the caller's organisation, and the fuel service test was updated.
- **T15-002, T17-002 · Mobile mutator barrel.** `apps/mobile/src/sync/mutators/index.ts` imports `./fuel` and `./comments`. The dead `fuelLogs.ts` stub is deleted.
- **T15-004, T16-003 · api-client types.** `packages/api-client/src/types.ts` gained `CostRollupResponse`, which `costsRollup` now returns. `SearchResponse` uses light `SearchHit` rows keyed by `SearchType` with `q` and `tookMs`. `AnalyticsResponse` gained `from`, `to`, `seasonId`, `summary` and the optional `cost`, and `AnalyticsSeriesPoint` gained the optional `secondary`.
- **T16-002 · Shell search button.** The disabled search input in `apps/web/src/features/shell/AdminShell.tsx` is now a button that calls `openCommandPalette()` and declares `aria-keyshortcuts="Control+K Meta+K"`. `shell.searchSoon` reads "Search or run a command (Ctrl+K)" and "Buscar ou executar um comando (Ctrl+K)". The new `AdminShell.test.tsx` covers it.
- **T16-004 · DataTable selection.** `apps/web/src/components/data/DataTable.tsx` takes an optional `selection` prop (`selectedIds`, `onChange`, `label`, `pageLabel`).
  - It renders a 48 dp checkbox column and a select-page header checkbox, both kept out of the row click.
  - `AssetsListPage` moved to the shared slot.
  - The new `DataTable.test.tsx` and the existing asset list tests cover it.
- **T17-003 · Unread badge on the More screen.** The notifications entry shows an info badge with the unread count, covered by the new `apps/mobile/test/ui/moreScreen.test.tsx`.
- **T17-004 · Annotation originals pruning.** Session housekeeping in `apps/mobile/src/lib/app/session.ts` calls `pruneAnnotationOriginals` before `pruneMediaFiles` and ignores its failures.
- **T17-005 · Mobile mount points.** `apps/mobile/test/ui/mountPoints.test.tsx` renders the real comment thread for each entity type with a test runtime.

### Red items fixed
- **TS6142 in the worker and realtime typechecks.** The billing service imports the `.tsx` PDF document, so `apps/worker/tsconfig.json` and `apps/realtime/tsconfig.json` now set `"jsx": "react-jsx"`. A variable import specifier was rejected because it would break Next bundling.
- **`E11000 duplicate key` on `sync_counters` in the billing tests.** The rentals harness (`packages/core/src/modules/rentals/testing/harness.ts`), which the billing, fuel and P1 rental tests share, now upserts the two counters with `$setOnInsert` instead of inserting them. A leftover or concurrently written counter no longer fails the setup. Test database names were audited: every test file uses its own database and drops it at teardown.
- **Route roles.** Every new route passes explicit roles to `withApi` through `route(OFFICE | ANY_ROLE | ADMIN_ONLY, …)`. The only route without a `route()` call is `imports/[entity]`, a `notImplemented` stub that also declares office roles. The services behind `ANY_ROLE` routes (fuel-log entry, parts catalog read, stock reads and movements, comments) enforce the finer FIELD rules themselves.

## Tests
- `pnpm install --frozen-lockfile` → already up to date.
- `MONGODB_DB=agrorende_w6cr pnpm check` (first run) → exit 0:
  - contracts 273 passed
  - core 612 passed (50 files)
  - web 243 passed (43 files)
  - worker 40 passed
  - realtime 10 passed
  - api-client 30 passed
  - db 7 passed
  - i18n 11 passed
  - design-tokens 2 passed
  - mobile 196 passed (36 suites)
- `MONGODB_DB=agrorende_w6cr pnpm check` (second run) → exit 0 with the same counts, so no flakiness was observed.
- `pnpm i18n:check` → passed for pt-BR and en. Three pre-existing unused-key warnings remain (`pdf.rental.keptCopy`, `pdf.workOrder.completionTitle`, `pdf.workOrder.evidenceCount`).
- `pnpm --filter web exec playwright test` (ports 3100, 4101 and 4103) → 50 passed in 5.4 minutes. Every Playwright server stopped at the end. The shared Mongo (27017), Redis (6379) and OIDC (4003) containers were not touched.

## Assumptions
- The existing `shell.searchSoon` key is kept and used as the button label rather than renamed, so no other locale file or test had to change.
- The `DataTable` selection prop takes an explicit `pageLabel` in addition to the proposed `label(row)`, because the header checkbox needs its own accessible name and the copy belongs to the feature namespace.
- The mobile `assetCostSummary` adapter is kept. It already accepts the real roll-up shape, and removing it brings no benefit.
- `fuelConsumption` for a foreign or unknown asset answers `NOT_FOUND`, in line with every other read by id (ARCHITECTURE §11).

## Gaps
- None known. Neither the web build nor the Expo export was run, as the gate instructions required.

## Error cases added
- None.

## Change requests
- T14-001, T14-002, T14-003, T14-004: APPLIED.
- T15-001, T15-002, T15-004: APPLIED. T15-003 was already resolved by its owner.
- T16-001, T16-002, T16-003, T16-004: APPLIED.
- T17-001, T17-002, T17-003, T17-004, T17-005: APPLIED.

## Notes for the next wave
- New bulk actions should use the `selection` prop of `DataTable` instead of a page-local checkbox column.
- New P1 records that need tenancy coverage can be created in the `beforeAll` of `tenancy.test.ts` through the `A1` fixture object, before `collectOrgAIds` runs.
- Logs of the verification runs are in `.data/w6cr-check2.log`, `.data/w6cr-check3.log` and `.data/w6cr-e2e.log`.

## Orchestrator follow-up

The orchestrator's gate run found `src/auth/oauth.test.ts` failing intermittently with `OAUTH_PROVIDER_ERROR`. The mock OIDC container's clock runs up to one second ahead of the host, so whole-second `nbf` and `iat` claims could fail validation. `verifyIdToken` in `packages/core/src/auth/oidc.ts` now passes a 60-second `clockTolerance` (`ID_TOKEN_CLOCK_TOLERANCE_S`), which is common practice for OIDC clients. `pnpm check` then passed twice in a row.
