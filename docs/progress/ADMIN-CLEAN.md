# ADMIN-CLEAN · Admin spacing and visual clean-up (Ops Center, notifications, page context)

Status: DONE_WITH_GAPS
Wave: polish · Agent finished: 2026-10-10 13:55

## Done

- Shared spacing scale: new `apps/web/src/components/layout/page.css` defines `--ar-space-1…6`, page padding, `--ar-section-gap` (16 px, 24 px from 1024 px), `--ar-stack-gap` and `--ar-card-pad`. It sets the `#main` padding, the gap between top-level page sections, card padding (`.ar-card`), card header spacing and keeps record codes and numbers in tables on one line (`.ar-table`). It is imported by `PageContext`, which renders on every admin page, so no page needed a local hack.
- Shared components: `Detail.tsx` cards use `ar-card`/`ar-card-head`; `DataTable.tsx` tables get `ar-table` (fixes `AGR-000001` breaking at the hyphen on Máquinas and other lists).
- Page context panel (`features/shell/PageContext.tsx`): white surface with a thin border instead of the grey box, tighter padding, smaller icon tile hidden on phones, consistent gap to the page title; breadcrumb and the hide/show toggle stay on one row at 390 px (current crumb truncates), related-pages label sits on its own line on phones.
- Ops Center (`features/ops/**`):
  - KPI area: the loose "SLA cumprido / Tempo médio de reparo / Uso da frota" text is now a tidy summary line (`<dl data-testid="kpi-summary">`) aligned with the range switcher; eight KPI cards in a 4×2 grid (2 columns on phones) with equal height, the same padding and one-line labels from 640 px; alarm KPIs use one subtle treatment (warning tint and warning text colour) instead of orange borders.
  - Map layers: the wrapping chip row is replaced by one "Camadas · 6 de 6" button that opens a checkbox panel (`LayerMenu.tsx`); Escape or a click outside closes it; the satellite toggle lives in the same panel.
  - Map framing: the map fits the organisation's data once it loads (operators, reports, work orders, machines, rentals and plot boundaries; 56 px padding, max zoom 13). With no positioned data it opens on the region of the organisation's time zone, else on Brazil (`mapBounds.ts`). The "no one live" notice is compact and no longer covers the map attribution.
  - Alerts: the blue "Alertas parecidos agrupados" box is now a small muted caption under the heading (EC-OPS-21 still requires the message to be visible); group cards use a thin border with a 3 px coloured left edge; "Mostrar os N" never wraps; row padding is consistent.
  - "Equipe no mapa (0)" vs KPI "1 em serviço": the KPI counts people whose duty status is on duty, the map only lists people with a live phone position. The list now explains the difference ("1 pessoa em serviço ainda não enviou a posição do celular.").
  - Exports: buttons are full width and left aligned in a tighter list.
- Notifications (`features/notifications/NotificationsPage.tsx`, new `notificationDisplay.ts`): no blue unread background; unread rows show a small green dot and a bold title; one row padding; "Marcar como lida" is a quiet icon-and-text button at the top right (below the text on phones); record codes are pulled out of "WO-000002 · …" text into a small monospace tag next to the date.
- Plain wording for the phone-sync notification, fixed at the source (orchestrator-approved): `packages/i18n/locales/{pt-BR,en}/notifications.json` `DEVICE_STALE_SYNC` now reads "Celular com dados não enviados" / "Phone with unsent data", matching the Ops alert. `notificationDisplay` rewords notifications already stored with the old text. The bell panel (`flyout/NotificationsFlyout.tsx`) uses the same helper, so page and panel agree. `notificationHref` is unchanged.
- `operatorStore.test.ts` performance check made robust under parallel load: 5 warm-up rounds, 30 measured rounds, the median must stay under 50 ms and the fastest round under 25 ms (a real regression slows every round, so it still fails).

## Tests

- `pnpm check:only web` → lint passed, typecheck passed, 55 files / 314 tests passed.
- `pnpm i18n:check` → passed for pt-BR and en.
- `npx vitest run src/notify/templates.test.ts` (packages/core) → 4 passed.
- New tests: `features/ops/mapBounds.test.ts`, `features/notifications/notificationDisplay.test.ts`, and an Ops Center test for the KPI summary and the on-duty-but-not-on-map message.
- Screenshots (before and after, 1280 and 390, every main admin page): `.data/reviews/clean/before-*.png`, `.data/reviews/clean/after-*.png`, plus `after-ops-layers-open.png`, `after-flyout.png`, `after-ops-1280-viewport.png`, `after-ops-390-top.png`, `after-notifications-390-top.png`.

## Assumptions

- The organisation has no address on file, so its time zone is used as the fallback map region.
- EC-OPS-21 requires the "alerts grouped" message to stay visible, so it was made quieter rather than removed.
- The Ops KPI and the map count different things on purpose; the UI explains the gap instead of changing the core query.

## Gaps

- Work-order board cards and the costs table still join codes and names with "·"; settings labels wrap at 1280 px. These belong to other features · see ADMIN-CLEAN-001.
- Notifications whose body joins a code with "·" in the middle of the sentence (not at the start) still show the dot until the worker passes the code separately · ADMIN-CLEAN-001.
- The Next dev overlay shows one issue on every page: a hydration mismatch on `<html>` in `apps/web/src/app/layout.tsx` (the client theme script sets `data-theme` and `color-scheme` before hydration). Not introduced here; adding `suppressHydrationWarning` to `<html>` would fix it · root layout owner.
- MapLibre logs "image rental could not be loaded" warnings because shape images are registered on map load, after the first render of the symbol layers. Pre-existing and harmless · Ops follow-up.

## Error cases added

- None.

## Change requests

- ADMIN-CLEAN-001: Plain record references in notification and list text (OPEN)

## Edits outside owned paths (T10, T11, T12 only)

- `packages/i18n/locales/{pt-BR,en}/notifications.json`, `packages/core/src/notify/templates.test.ts`: `DEVICE_STALE_SYNC` wording, approved by the orchestrator.
- `apps/web/src/features/notifications/flyout/NotificationsFlyout.tsx`: uses `notificationDisplay`, approved by the orchestrator after admin-polish finished.
- `apps/web/src/features/ops/operatorStore.test.ts`: performance check robustness, requested by the orchestrator.

## Notes for the next wave

- New pages should rely on `page.css` (`--ar-section-gap`, `--ar-card-pad`, `.ar-card`, `.ar-table`) instead of local padding.
