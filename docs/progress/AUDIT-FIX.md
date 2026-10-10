# AUDIT-FIX — production dependency audit

## Status

Done. `pnpm audit --prod --audit-level high` (the CI "Audit production dependencies" step) exits 0.
The user explicitly authorised dependency, `package.json`, `pnpm-workspace.yaml` and
`pnpm-lock.yaml` changes for this task (exception to R4).

## Advisories before the fix

| Severity | Package | Installed | Patched | Advisory | Path |
|---|---|---|---|---|---|
| critical | maplibre-gl | 5.24.0 | >=6.4.1 | GHSA-jrc7-96c5-q579 | apps/web, react-map-gl |
| high | node-forge | 1.4.0 | >=1.4.1 | GHSA-86w9-cpqp-85rv | apps/mobile via @expo/cli |
| high | braces | 3.0.3 | >=3.0.4 | GHSA-vfj7-8cjw-p6xm | apps/mobile via metro, micromatch |
| moderate | uuid | 7.0.3 | >=11.1.1 | GHSA-w5hq-g745-h8pq | apps/mobile via @expo/config-plugins, xcode |
| moderate | sprintf-js | 1.0.3 | >=1.1.4 | GHSA-hp3w-g68c-fv3c | apps/mobile via jest, js-yaml 3, argparse 1 |

## What changed

- `apps/web/package.json`: `maplibre-gl` `^5.13.0` to `^6.13.0` (resolved 6.13.0, published
  2026-10-06, so it satisfies `minimumReleaseAge: 1440`). `react-map-gl` 8.1.3 and
  `@vis.gl/react-maplibre` 8.1.3 accept `maplibre-gl >=4`, so they stay as they are.
- MapLibre 6 migration (`docs/guides/v5-to-v6-migration-guide.md` upstream): the package is now
  ESM only and finds its worker through `import.meta.url`, which does not resolve inside a webpack
  or Turbopack bundle. Without a worker URL the map stays blank with
  `Error: Worker failed to load. Check that the worker URL is correct.` The fix follows the
  upstream Next.js recipe:
  - new `apps/web/src/components/map/maplibreWorker.ts` exports `MAPLIBRE_WORKER_URL`, built with
    `new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url)`, so Next.js emits the
    worker as a hashed same-origin asset (`static/media/maplibre-gl-worker.<hash>.mjs`);
  - `MapView` and `OpsMap` pass it through the react-map-gl `workerUrl` prop, which calls
    `setWorkerUrl` before the map is created. `BoundaryDrawMap`, `SiteDetailPage`,
    `ReportDetailPage` and `AssetDetailPage` render through `MapView` and need no change.
  - The other breaking changes do not apply: the code uses no default `maplibre-gl` import, no
    `map.transform`, no `styleimagemissing`, no second `GeoJSONSource.setData` argument, no
    `#pragma mapbox` and no `JSON.parse` of nested GeoJSON properties. Test mocks
    (`OpsCenter.test.tsx`, `terraDrawMapLibre.test.ts`) only use types and `setData`, which are
    unchanged.
- `pnpm-workspace.yaml`:
  - override `"xcode>uuid": "^11.1.1"` (resolved 11.1.1). `xcode` only calls `require("uuid").v4()`,
    which the uuid 11 CommonJS build still exports; checked by calling `generateUuid()` from
    `apps/mobile` and by `npx expo config`.
  - `auditConfig.ignoreGhsas` for GHSA-86w9-cpqp-85rv (node-forge), GHSA-vfj7-8cjw-p6xm (braces)
    and GHSA-hp3w-g68c-fv3c (sprintf-js), each with a written justification in the file. This is
    the last resort the task allows: the patched versions do not exist on npmjs.org (latest
    published node-forge 1.4.0, braces 3.0.3, sprintf-js 1.1.3), so no override can reach them.
    All three are Expo/Metro/Jest tooling of `apps/mobile` and are not shipped in the app bundle or
    run by the web, realtime or worker services. Replace each ignore with an override when the fix
    is published.
- `pnpm-lock.yaml`: regenerated with `pnpm install` (maplibre-gl 6.13.0 with its new
  dependencies, uuid 11.1.1 for xcode, the override recorded).
- `.github/workflows/ci.yml`: the two stale comments saying the lockfile is "not committed yet"
  now say it is committed. The audit command is unchanged.
- `.github/dependabot.yml`: reviewed, no change needed.

## Verification

| Command | Result |
|---|---|
| `pnpm audit --prod --audit-level high` | exit 0 — "3 vulnerabilities found / Severity: 1 moderate (1 ignored) \| 2 high (2 ignored)" |
| `pnpm check:only web mobile landing` (after the dependency change) | passed: lint, typecheck, landing 74 tests, web 334 tests, mobile 199 tests |
| `pnpm i18n:check` | passed |
| `pnpm install --frozen-lockfile` | passed ("Already up to date") |
| `next build --webpack` (separate `NEXT_DIST_DIR`) | passed; emits `static/media/maplibre-gl-worker.<hash>.mjs` |
| `eslint`, `tsc --noEmit`, `vitest run` on `src/components/map`, `src/features/ops`, `src/features/sites` after the worker fix | passed (38 tests) |

A second `pnpm check:only web` after the worker fix failed in lint only because of files that
other lanes were editing at the same time (`src/components/media/MediaGallery.tsx`,
`src/features/assets/QrModal.tsx`, `src/features/work-orders/WorkOrdersListPage.test.tsx`); none of
them is touched by this task.

Visual check with playwright-cli: the admin dev server already on port 3000 was started before
the upgrade and still serves a cached module graph that points at the removed
`node_modules/maplibre-gl/dist/maplibre-gl.js`, so its pages fail with `ENOENT` until it is
restarted. It was not stopped. A temporary dev server from this worktree on port 3010
(`NEXT_DIST_DIR=.next-auditfix`, `next dev --webpack`) rendered the operations map with
clusters and markers, and the site detail map, without MapLibre errors. Screenshots:
`.data/reviews/audit-fix/ops-map.png` and `.data/reviews/audit-fix/site-detail-map.png`. The
temporary server, its build folders and the `.playwright-cli` folder were removed afterwards. The
`socket-token` 403 on port 3010 comes from the realtime origin allow-list and is unrelated.

## Gaps

- Restart the admin dev server on port 3000 to pick up maplibre-gl 6.
- Three advisories are ignored until npm publishes node-forge 1.4.1, braces 3.0.4 and
  sprintf-js 1.1.4.

## Error cases added

None.
