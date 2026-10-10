# FILTERS-ALIGN — progress

## Status

Done. `pnpm check:only web` passes (typecheck, lint, 58 test files with 334 tests) and `pnpm i18n:check` passes for pt-BR and en.

## Request

"Consider aligning the filters and space. They are a bit jumping sometimes. Perhaps displaying that in a better order would make them less jump."

## Before

Screenshots: `.data/reviews/filters/before-<route>-{1280,390}.png`.

I found these causes of jumping and misalignment:

1. **The search refetched on every keystroke.** Search inputs were uncontrolled and wrote to the URL on each key. Each key changed the query key, so the table dropped to a five-row skeleton of a different height and then came back.
2. **Every filter change replaced the table with a skeleton.** List queries did not keep previous data, so changing a select collapsed the table and pushed everything below it.
3. **The skeleton did not match the table.** The loading view was a stack of bars, not the bordered table card, so the first load also jumped.
4. **Widths were inconsistent.** Pages mixed `max-w-xs`, `max-w-48` and `max-w-56`. Some selects were sized by their content, so a long selected value changed the row. On phones the selects were narrower than the screen and in no consistent grid.
5. **The order and alignment differed between pages.** Some pages put a visible label above each control and some used an aria-label only. The work-orders board toolbar used `items-center gap-2` while the table view used `items-end gap-3`.
6. **There was no result count and no way to clear filters.**

## After

Screenshots: `.data/reviews/filters/after-<route>-{1280,390}.png`, plus `after-assets-empty-1280.png` and `after-work-orders-filtered-390.png`.

In the browser I measured the filter bar height and the table's top position before, during and after typing a search on `/assets` at 1280 wide, and after changing a select on `/work-orders?view=table` at 390 wide. Neither value changed: the bar stayed at 108 px and 228 px, and the table top stayed at 541 px and 897 px. The skeleton never appeared after the first load.

## What changed

- **New `apps/web/src/components/data/FilterBar.tsx`.**
  - `FilterBar` lays filters out in a fixed order: search, then selects, then toggles, then a right-aligned end slot with the result count and a "Limpar filtros" / "Clear filters" button.
  - The clear button and the count are always mounted. While inactive they are only `invisible`, and the button is also `aria-hidden` with `tabIndex=-1`, so they keep their space.
  - `FilterSearch` is a controlled search input with a leading icon and a 300 ms debounce. It adopts outside URL changes, such as clear-filters or the back button, without overwriting what the person is typing.
- **Layout CSS in `apps/web/src/components/layout/page.css` (`.ar-filterbar*`).**
  - Every control is 48 px high, using the existing `control` and `Checkbox` minimums.
  - From 640 px wide the bar is a wrapping flex row aligned to the bottom edge. The search grows from 15rem up to 24rem. Every select has the same fixed width (`--ar-filter-select-w: 13rem`), so the selected value never resizes it. The end slot is pushed right.
  - Below 640 px the bar is a two-column grid. The search, the toggles and the end slot take the full width, and the selects take two per row; an odd last select spans both columns.
- **`DataTable`** renders the toolbar as given; the old flex wrapper is gone. It has a new `isRefreshing` prop that sets `aria-busy` and dims the table, and it uses the new table-shaped `TableLoadingState` as its loading view (in `States.tsx`). `QueryState` accepts a custom `loading` node.
- **List queries use `placeholderData: keepPreviousData`.** Rows stay on screen and dim while the next result loads. Work orders keep previous data only within the same view, because the board and the table use different page sizes.
- **New i18n keys in `apps/web/messages/{pt-BR,en}/common.json`:** `filters.clear`, `filters.results` (ICU plural) and `filters.resultsMore` (for example "50+ resultados").
- **Migrated pages:** Assets (toolbar section only), Customers, Rentals, Fuel, Costs, Work orders (board and table share one bar), Platform organisations, Sites, Team, Stock, Templates, Parts, Billing and the Reports inbox.
  - Parts, Billing and the Reports inbox were not in the original list. I migrated them because removing the `DataTable` toolbar wrapper would otherwise have broken their layout.
  - The Platform organisations page's own debounce was replaced by `FilterSearch`.
- **Costs labour note.** The "labour hidden" note now sits below the table instead of between the filters and the table, so it no longer pushes the table down when the rollup arrives.
- **Tests.** New `apps/web/src/components/data/FilterBar.test.tsx` covers the reserved clear button, the count, the debounce and outside resets. Existing aria-labels, test ids and URL filter keys are unchanged, so no other tests needed changes.

## Decisions

- The result count shows the rows on the current page, followed by "+" when another page exists. The API returns cursor pages without a total, so this is the honest number.
- At 1280 wide, pages with many filters (Assets, Work orders, Costs) wrap the end slot onto its own line. The wrap depends only on the viewport width, never on the filter state, so it does not jump.
- On phones, long option labels in the half-width selects are truncated by the native select. I accepted this to keep the two-column grid predictable.

## Gaps

- The bulk-print QR region on Assets mounts above the table when rows are selected. That region is owned by the qr-modal agent and was not changed.
- Rentals and Billing keep their status tab row above the filter bar, as before.
- The Fuel page's asset filter is an `EntityPicker`, not a search box. It occupies the search slot and keeps its own behaviour.
- During one gate run, lint failed on a foreign `apps/web/.next-perf/` build folder created by another agent. The folder was later removed, and the final gate run was green.

## Error cases added

None.

## Review fixes

A code review of the filter bar migration raised one important finding, several maintainability nits, one question and a list of missing tests. All of them are addressed.

### Search box behaviour

- `FilterSearch` used to recognise its own value coming back through the URL only when that value matched the last value it had emitted. A slow echo of an older value could overwrite a newer keystroke. The component now remembers every value it has emitted that the URL has not yet echoed. A matching echo is consumed and ignored. Any other outside value, such as "Clear filters" or browser navigation, cancels the pending search and is adopted.
- The search text is trimmed before it is compared and emitted. Whitespace-only input counts as an empty search and clears the filter. This replaces the local trimming the platform organisations page did.
- Pressing Enter or leaving the field sends the pending search at once, without waiting for the 300 ms debounce. The caller's own `onKeyDown` and `onBlur` handlers still run.
- On unmount the pending search is cancelled, not sent. Each list page writes its filters to the URL with `router.replace`. Sending a late search while the person navigates away would pull them back to the page they were leaving. Enter and blur already cover the "I finished typing" case.
- The latest `onSearch` callback is always used, even when the parent passes a new function between keystrokes.

### Shared helpers

- `FilterBar` accepts a `page` prop, which is any cursor page with `items` and an optional `nextCursor`. The result count and the "more results" marker are derived from it. Twelve list pages now pass `page={query.data}` instead of repeating `count` and `hasMore`. Costs still passes `count`, because its report returns rows rather than a cursor page.
- The dimmed "refreshing" wrapper is now a single `RefreshingFrame` component in `components/data/States.tsx`. It sets `aria-busy` and `opacity-60` while refreshing. `DataTable`, the Costs page and the Work orders board use it, so the duplicated class lists are gone.

### The question about hasMore

The Parts, Stock, Templates and Platform organisations pages showed no "more results" marker. I checked the API:

- `GET /parts` returns `{ items }` with a fixed limit of 1000.
- Stock levels return `{ items }`.
- Checklist templates always return `nextCursor: null`.
- Platform organisations return the whole list wrapped as `{ items }`.

None of these endpoints page today, so there is no real "more" state to show. The four pages still pass `page={query.data}`. They will show the marker automatically if the endpoints start returning `nextCursor`.

### Tests added

- `components/data/FilterBar.test.tsx`, rewritten with 20 tests:
  - the debounce restarts on each keystroke;
  - clearing emits `null`;
  - whitespace-only input is trimmed;
  - a late URL echo does not overwrite a pending keystroke;
  - an outside reset cancels the pending search;
  - Enter and blur flush the search;
  - unmount cancels the pending search;
  - the latest `onSearch` is used;
  - the result count reads correctly for 0, 3 and "more", with pt-BR plurals;
  - the `page` prop is applied;
  - `showCount={false}` keeps the clear button;
  - the inactive clear button has `tabIndex` -1.
- `components/data/DataTable.test.tsx`, 2 new tests:
  - while refreshing, the old rows stay visible with `aria-busy` and `opacity-60`, and `aria-busy` is removed afterwards;
  - while loading, the table renders its loading state and the toolbar stays mounted.
- `features/work-orders/WorkOrdersListPage.test.tsx`, new with 2 integration tests:
  - typing sends exactly one request with `q` after 300 ms, and the old rows stay dimmed until it resolves;
  - switching from board to table does not reuse the previous view's data, which checks the custom `placeholderData`.

`pnpm check:only web` and `pnpm i18n:check` pass.
