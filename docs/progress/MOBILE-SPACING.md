# MOBILE-SPACING — Mobile spacing, border and margin review

## Status

DONE

## Wave

Out-of-band polish task, run after the delivery waves at the user's request.

## Done

The mobile app was reviewed in the Expo web build with Playwright. Every main screen was captured at an Android viewport (412x915, DPR 2.625, touch enabled) and an iOS viewport (390x844, DPR 3). The findings are in `docs/reviews/MOBILE-SPACING-ui.md`, in the caveman-review format, grouped into tasks T1–T7. Every task was fixed in the shared UI kit first and then re-checked with new screenshots.

- **T1 — spacing tokens.** Hardcoded padding, margin and gap values across `apps/mobile/src/ui/**` now use the `space[...]` scale from `src/ui/theme.ts`. Radii use `radius.*`.
- **T2 — list rows.** `ListItem` has a `badges` slot that wraps under the title, and a constrained `right` slot capped at 50 % width. It also has a `divider` prop. `Card` turns off the divider on the last row, so there are no double borders against the card edge. Status pills on jobs, rentals, reports, assets, notifications, the report detail and the asset picker moved into `badges`. Settings switches moved into the `right` slot.
- **T3 — header and safe area.** The new `HeaderSyncBadge` gives the header sync badge an end inset, so it no longer touches the screen edge on web and in the JS header. Header titles use weight 600.
- **T4 — banners and ribbons.** `Screen` has a full-bleed `ribbon` slot and an inset `banner` slot. The banner slot only adds top spacing when it has content.
- **T5 — segmented controls.** Controls with three or more options stack the icon above a two-line label. Controls with five or more options wrap. Labels are no longer clipped.
- **T6 — number field.** The decrease and increase steppers are now full-width labelled secondary buttons on their own row. Each is 48 dp or taller, with icon and text.
- **T7 — screen callers.** Today, More, Jobs and Rental detail use the new `ribbon` and `banner` slots instead of hand-rolled wrappers.
- **Also fixed:** on web, `Icon` passes `aria-hidden` instead of native-only accessibility props. Those props raised a LogBox warning overlay that covered the screen.

## Tests

`pnpm check:only mobile` exited 0. Its output included:

```
[devloop:ok] lint passed
[devloop:ok] typecheck passed
[test] Test Suites: 39 passed, 39 total
[test] Tests:       211 passed, 211 total
[devloop:ok] test passed
[i18n] [devloop:ok] i18n-check passed for pt-BR, en
[devloop:ok] i18n:check passed
```

No translation strings were changed.

## Assumptions

- The local API on port 3000 sends no CORS headers to the Expo web origin. The Playwright harness adds the headers inside the browser context, so no app code was changed for this.
- The web build stands in for the native Android and iOS layouts. The native-stack header already insets `headerRight` on device, so `HeaderSyncBadge` drops its end padding when `nativeHeader` is set on a native platform.

## Gaps

- The checklist screen shows "0 de 10 respondidos" twice: once in the header and once in the progress area. That is a content duplication, not a spacing issue, so it was left as it is.
- The section-heading rhythm on report detail could be tighter. It was left unchanged.
- The iOS-viewport run of `/rentals/new` redirected, so that screen was only reviewed on Android.
- Native binaries were not captured on a simulator. The Expo MCP server was not used.
- The dark and outdoor themes and the English locale were not reviewed visually.
- On web, the settings screen shows a "Something went wrong" card for the push section. That is expected without native push support, and its spacing is correct.

## Error cases added

None.

## Change requests

None.

## Edits outside owned paths

None. Only `apps/mobile/**`, `docs/reviews/MOBILE-SPACING-ui.md` and this file were edited. While this task ran, the admin API on port 3000 was temporarily unavailable. The cause was a CSS parse error in `apps/web`, which belongs to another agent and was not touched.

## Notes for the next wave

- Put pills and secondary status in the `ListItem` `badges` prop rather than `right`. Keep `right` for chevrons, switches and short values.
- `Card` only manages dividers for `ListItem` elements that are its direct children. Rows wrapped in fragments or Views must set `divider` themselves.
- Screenshots and the Playwright harness are in `.data/reviews/mobile-spacing/`. Run `node shoot.mjs <tag> [android|ios]` and add `EXTRA=./extra.mjs` for the detail screens.
