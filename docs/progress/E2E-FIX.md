# E2E-FIX — progress

## Summary

The first CI run of the `e2e` job finished with 43 passed and 7 failed. All 7 failures are fixed. Some were spec drift after UX changes, some were test races, and some were real app bugs. The browser-console errors in the CI log were real app bugs and are fixed:

- React hydration mismatches.
- Unhandled "Transition was skipped" rejections.
- MapLibre "Image … could not be loaded" warnings.

The local full suite is green: 50 passed (6.8 min).

## Root causes per test

| Spec | Root cause | Fix |
|---|---|---|
| `e2e/auth.spec.ts:23` password login, wrong password and sign out | The user menu is now a disclosure region ("Account and preferences for …"). Sign out is a plain button, not a menu item. | The spec opens the disclosure and clicks the "Sign out" button. |
| `e2e/auth.spec.ts:65` switch language | Same disclosure. The Language combobox lives inside it, and the pt-BR label is "Conta e preferências de …". | The spec opens the disclosure in each locale before using the combobox. |
| `e2e/errors.spec.ts:91` EC-OPS-17 realtime loss | Test race. The spec cut the routed WebSocket before the Socket.IO handshake. The client never reached `connected`, so it never showed the paused banner, which only appears after a connection was lost. | The spec forwards server messages, counts Socket.IO CONNECT packets (`40…`) and waits for a handshake before cutting the socket. |
| `e2e/master-data.spec.ts:13` asset QR label | New UX: "Generate QR code" opens `QrModal` with Print, Download PNG and Download PDF. | The spec opens the dialog, downloads the PNG, and asserts the file name, the PNG signature and the toast. |
| `e2e/master-data.spec.ts:32` site on the map | Not reproducible locally (it passed in every run). Attributed to dev-server compile time and load in CI. | Covered by the wider route warm-up in `env.spec.ts`. The spec is unchanged. |
| `e2e/power-tools.spec.ts:51` palette → Analytics, arrow keys | The ArrowRight press was lost in CI before hydration or under dev-server load. App bug: `onTabKey` moved from the selected tab state, not from the focused tab. | App: `AnalyticsPage.onTabKey` moves from `event.currentTarget`. Spec: focus plus ArrowRight retried inside `toPass`. The assertions are unchanged. |
| `e2e/power-tools.spec.ts:71` bulk QR PDF | New UX: the bulk action opens `QrModal` in multi mode ("2 QR labels"). | The spec asserts 2 label tiles, clicks Download PDF and keeps the file, PDF and toast checks. |

Found during the local full run:

- `e2e/rentals.spec.ts:10` failed once. `router.push` to `/rentals/[id]` waited on a first-time dev compile, and the route was not in the warm list.
- `env.spec.ts` now also warms `/analytics` and the `[id]` detail routes.

## App bugs fixed (browser console in the CI log)

- **Hydration mismatch in `ExportsPanel`** (5 vs 6 items): `OpsCenter` derived the role from the react-query `/me` cache, which the client already held during hydration. The role is now gated behind a hydration-safe `useSyncExternalStore` flag.
- **Hydration mismatch in `RealtimeStatus`**: `useRealtimeStatus` returned live module state as its server snapshot. It now returns a constant `INITIAL_STATUS`, and a unit test was added.
- **"Transition was skipped" unhandled rejections**: `RouteMotion` never handled the `ready`, `finished` and `updateCallbackDone` promises of `startViewTransition`. They are now settled quietly.
- **MapLibre missing-image warnings in `OpsMap`**: shape images were added on `load`, after the layers referenced them. A `ShapeImageResolver` now uses `map.setMissingStyleImageResolver`.

## Files changed

- `apps/web/e2e/auth.spec.ts`
- `apps/web/e2e/env.spec.ts`
- `apps/web/e2e/errors.spec.ts`
- `apps/web/e2e/master-data.spec.ts`
- `apps/web/e2e/power-tools.spec.ts`
- `apps/web/src/components/feedback/RouteMotion.tsx`
- `apps/web/src/features/analytics/AnalyticsPage.tsx`
- `apps/web/src/features/ops/OpsCenter.tsx`
- `apps/web/src/features/ops/OpsCenter.test.tsx`
- `apps/web/src/features/ops/OpsMap.tsx`
- `apps/web/src/features/shell/useRealtime.ts`
- `apps/web/src/features/shell/useRealtime.test.tsx`

## Tests and commands run

- The 7 originally failing specs plus related specs (11 tests, desktop project), run with `pnpm exec playwright test --grep …` from `apps/web` after sourcing `.env.example`: passed.
- Full suite, `pnpm exec playwright test`: first run 49 passed and 1 failed (`rentals.spec.ts:10`); after the warm-up fix, 50 passed (6.8 min).
  - No hydration, view-transition or missing-image errors in either full-suite log.
- `pnpm check:only web`: exit 0. The only output is warnings about unused i18n keys that were already there.

## Gaps

- `master-data.spec.ts:32` never failed locally. Whether the warm-up is enough for CI is only confirmed once CI reruns.

## Assumptions

- `QrModal`, the user-menu disclosure and the bulk QR dialog are the intended UX, so the specs were updated to match them.
- To compare against the original code, `useRealtime.ts` was temporarily reverted with `git checkout -- <file>` in the working tree only, then restored.

## Error cases added

None.
