# PERF-QUERIES · Why some admin queries feel slow, and the fixes

Status: DONE_WITH_GAPS
Wave: post-W5 performance pass · Agent finished: 2026-10-10 15:40

## Summary

Most of the slowness people notice in the admin comes from running it in Next.js development mode, not from the server or the database. On the demo data, a production build answers every admin API in 1–13 ms and serves every page in 8–17 ms.

The dev server (`next dev --webpack`) compiles each route the first time it is opened, which takes 3–34 seconds. It also recompiles whenever a file changes, and other agents are editing files all the time.

The real problems only show up once there is real history. To expose them, I built a scaled copy of the demo organisation:

- 17,876 work orders
- 120,040 activity events
- 12,411 field reports
- 55,055 notifications
- 4,608 rentals
- 4,040 assets

At that size, the work-order list took 1.3–3 s, and the activity feed, asset history, KPIs and cost roll-up each took 50–330 ms. The cause was missing sort indexes and one unbounded query.

I also found a front-end problem: the JSON for all 14 Lottie animations, 192 KB raw, was bundled eagerly into a chunk that every admin page loads.

## Done

- **Measurement.**
  - What I measured: every admin list and detail API and page, on the dev server (:3000) and a production build (:3400 on the demo data, :3401 on the scaled data). That covers ops (kpis, live, alerts, activity), attention, assets, work orders, rentals, customers, sites, plots, parts, stock, fuel, costs, team, devices, notifications, field reports, billing, search and exports.
  - How: first hit compared with warm runs (median and maximum of 5–8), using MongoDB profiler query shapes, `explain("executionStats")`, a Playwright browser timing run, and a review of the production client bundle.
  - Scripts: `.data/perf/*.mjs` (scratch files, not committed).
- **Work-order list no longer loads the whole organisation** (`packages/core/src/modules/workOrders/queries.ts`).
  - Before: `list()` read every matching work order, moved undated jobs last in memory, mapped every row to a DTO and SLA state, then cut one page.
  - Now it reads one page straight from MongoDB: dated jobs first (`dueAt: { $ne: null }`, skip and limit), then undated jobs (`dueAt: null`) for the rest of the page. It only counts dated jobs when the cursor jumps past all of them.
  - The order, cursors, filters and role redaction are identical.
  - The `atRisk` view keeps the in-memory filter, because the SLA state is computed in code. It only covers active, dated jobs.
- **Eleven sort-supporting indexes** (`packages/db/src/indexes.ts`, `PERF_QUERY_INDEXES`), with migration `packages/db/migrations/0003-PERF-QUERIES.ts` registered in `runner.ts`. The list is in change request PERF-QUERIES-001. I ran the migration on the local `agrorende` dev database.
- **Lottie JSON out of the shared bundle.**
  - New entry `@agrorende/motion/lazy` (`packages/motion/src/lazy.ts`, plus an exports map entry in `packages/motion/package.json`). It exports `loadAnimation`, `motionMeta` and the types without importing any JSON statically.
  - The package index re-exports the same `loadAnimation`, so mobile and landing are unchanged.
  - `apps/web/src/components/motion/Lottie.tsx` now imports from `@agrorende/motion/lazy`. Each animation becomes its own chunk (19–31 KB) that loads only when an animation is shown.

## Measurements

All times are server time in milliseconds, measured with `fetch` from the same machine. "Warm" is the median of 5 runs after the first hit. The machine was shared with other agents, so expect a few milliseconds of noise.

### Dev mode compared with production (demo data)

| Route | Dev first hit (compile) | Dev warm | Prod first hit | Prod warm |
|---|---|---|---|---|
| `/billing` page | 33,600 | ~60 | <20 | 8–17 |
| `/assets/[id]` page | 27,000 | ~60 | <20 | 8–17 |
| `GET /api/v1/billing-documents` | 21,700 | ~10 | <20 | 1–13 |
| `/ops` page | several seconds | 44–127 | 74 | 8–17 |
| Any API, warm | n/a | 8–120 (277 for `customers/[id]`) | n/a | 1–13 |

The long first hits are on-demand webpack compilation, which a production deployment does not have. One `rentals/[id]` request took 14 s because of a hot-module recompile triggered by a concurrent file edit.

### Scaled data, production build (warm median, ms)

"No indexes" is the old code without the new indexes. "Indexes only" is the old code with the new indexes. "After" is the new code with the new indexes, measured later while the machine was under heavier load from parallel test suites.

| Endpoint | No indexes | Indexes only | After (code + indexes) | Main cause |
|---|---|---|---|---|
| `GET /api/v1/work-orders` | 1,317 (3,057 under load) | 1,355 | **29** | Unbounded list, every row mapped in JS |
| `GET /api/v1/ops/activity` | 80 (162 under load) | 6 | 17 | Blocking sort over 120k events |
| `GET /api/v1/assets/:id/history` | 75 (326 under load) | 4 | 9 | `$or` on `entityId` / `meta.assetId` without an index |
| `GET /api/v1/ops/kpis` | 28 (146 under load) | 16 | 24 | Completed work orders scanned through the `status` index only |
| `GET /api/v1/costs/rollup` | 51 (103 under load) | 36 | 51 | Same as KPIs; 3,601 rows are a real result |
| `GET /api/v1/field-reports` | 22 | 11 | 17 | Blocking sort |
| `GET /api/v1/notifications` | 19 | 12 | 19 | Blocking sort through `{ userId, readAt }` |
| `GET /api/v1/attention` | 11 | 7 | 20 | Pending media scan |
| `GET /api/v1/exports/work-orders.csv` | 884 | 859 | ~1,000 | 4 MB CSV of 17,876 rows; expected |

Per query, from the MongoDB profiler on the scaled data, before the fix:

| Query | Documents examined | Returned | Time |
|---|---|---|---|
| Activity feed | 120,040 | 51 | 147 ms |
| Asset history | 120,040 | 0 | 317 ms |
| Work-order list | 17,876 | all | 98 ms in MongoDB, plus about 1.2 s mapping in Node |
| KPI and costs completed work orders | 14,649 | 3,601 | 289 ms |
| Open field reports (live view) | 12,411 | 101 | 63 ms |

After the fix, `explain` shows an `IXSCAN` with no `SORT` stage for the feed and the list. This is asserted in `packages/db/src/perfIndexes.test.ts`.

### Client bundle

| Page | JS before | JS after |
|---|---|---|
| Every admin page | ~1.2 MB raw, including the 192 KB Lottie chunk | `/ops` 1.06 MB, `/assets` 0.98 MB, `/work-orders` 0.83 MB |

## Root causes that are not problems

- **Dev mode.** On-demand compilation takes 3–34 s per route, and hot-module recompiles happen whenever a file changes. For demos and performance judgements, use `pnpm --filter web build && pnpm --filter web start`.
- **No N+1 queries.** Name lookups are batched with `$in` and `Promise.all`.
- **No COLLSCAN on hot paths.**
- **Cheap per-request work.**
  - The proxy only checks cookies.
  - The session check is a JWT verification.
  - The organisation settings lookup takes 0.1 ms (express index scan), so caching it is not worth it.
  - argon2 runs only on login, which takes about 44 ms.
- **Navigation.** Soft navigation in production takes 30–45 ms from click to URL change. The view-transition cap of 200 ms does not delay it.

## Tests

- `MONGODB_DB=agrorende_perf pnpm check:only @agrorende/core web @agrorende/motion @agrorende/db` → lint passed, typecheck passed. Tests: motion 115 passed, db 9 passed, core 615 passed, web 334 passed. i18n check passed.
- New tests:
  - `packages/db/src/perfIndexes.test.ts`: the migration creates every index, is idempotent, and the feed and list plans have no `SORT` stage.
  - `packages/core/src/modules/workOrders/service.test.ts`: "pages in due-date order with undated jobs last". It walks every page with limit 3 and compares the result to the full in-memory order, including a cursor that jumps past all dated jobs.
  - `packages/motion/test/motion.test.ts`: the lazy entry imports no JSON statically and shares the loader with the index.
  - `apps/web/src/components/motion/Lottie.test.tsx`: now mocks `@agrorende/motion/lazy`.
- During one full core run on a loaded machine, four concurrency tests (`events`, `numbering`, `withSyncTx`, `parts`) timed out at 5 s. They passed when run alone, and again in the final full run.

## Assumptions

- I treated the demo data set (16 work orders) as too small to show database cost, so I measured the index and query effects on a scaled copy (`agrorende_perfscale`). I dropped that copy afterwards.
- I added the indexes to `INDEXES` as a separate `PERF_QUERY_INDEXES` group so that `ensureIndexes` and new test databases get them. The migration creates exactly that group.
- I kept the existing indexes that the new ones make redundant, because ARCHITECTURE §5 lists them.

## Gaps

- ARCHITECTURE §5 index comments: the new indexes still need to be listed. See PERF-QUERIES-001; suggested owner T01.
- Work-order list prefetching (owner of `apps/web/src/components/data/*`):
  - Table row `<Link>`s prefetch the RSC payload of every visible row, and each prefetch runs twice.
  - Use `prefetch={false}` on row links, or prefetch on hover only.
- Page HTML and shell translations (owner of `apps/web/src/lib/i18n.server.ts` and the admin layout):
  - Page HTML is 123–166 KB, mostly because `ShellIntlProvider` serialises 10 message namespaces.
  - `web.json` is loaded twice, once in the root layout and once in the shell.
  - Trim `SHELL_NAMESPACES` to what the shell renders, and load page namespaces per route.
- `GET /api/v1/ops/live` returns up to 2,000 full documents per kind (560 KB on the scaled data) with no projection. Projecting only the map fields would cut payload and serialisation time. Suggested owner: ops.
- Search (`GET /api/v1/search`) uses case-insensitive regexes on six collections, which cannot use an index (40–70 ms on the scaled data). A text index or prefix-anchored regexes on normalised fields would fix it. Suggested owner: ops/search.
- `apps/landing/src/components/Lottie.tsx` still imports the eager package index. It should import `@agrorende/motion/lazy` as the web app does. Suggested owner: landing.
- Development speed: switching `next dev --webpack` to Turbopack would shorten first-hit compiles. Not done, because it is a root and app configuration change.

## Error cases added

- None.

## Change requests

- PERF-QUERIES-001: Sort-supporting indexes for the hot admin lists and counts (APPLIED; ARCHITECTURE text pending).

## Notes for the next wave

- Existing databases need `pnpm db:migrate` to pick up `0003-PERF-QUERIES`. New and test databases get the indexes through `ensureIndexes`.
- Do not build production output into a folder that ESLint and the boundaries test do not ignore, such as `.next-perf`. It broke `pnpm check:only` during this task and was deleted.
