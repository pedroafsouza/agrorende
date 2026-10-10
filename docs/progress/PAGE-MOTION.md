# PAGE-MOTION · Admin page transitions and loading feedback

Status: DONE_WITH_GAPS
Wave: post-W7 polish · Agent finished: 2026-10-10 13:41

User request: "Pages could have a cool easy transition among them or some loading… while the users wait the answer… look modern and quick."

## Done
- Route progress bar (`apps/web/src/components/feedback/RouteMotion.tsx`, `routeEvents.ts`, `apps/web/src/instrumentation-client.ts`):
  - A thin 3 px `mata-600` bar sits at the top of the content area. Its position comes from the bounds of `<main>` and the bottom of the sticky header, so it never covers the sidebar.
  - It starts on an internal link click (a document click listener in the capture phase that ignores modifier keys, `target=_blank`, downloads, external links and hash-only links) and on any router push (Next 16 `onRouterTransitionStart`).
  - It only appears if the navigation is still pending after 120 ms, so fast navigations never flicker.
  - It trickles toward 90 %. When the pathname or search parameters change it fills to 100 % and fades out.
  - A 15 s safety timeout clears a navigation that never commits.
  - It exposes `data-testid="route-progress"` with `data-state` set to idle, running or done.
- Page transition:
  - Only the main content (`[data-route-page]`) fades in and rises 6 px, over 180 ms with `cubic-bezier(0.16,1,0.3,1)`. The sidebar and the top bar stay still.
  - The View Transitions API is used when supported, with the root transition disabled. The update callback is capped at 200 ms. If the route has not committed by then, the transition is skipped and the WAAPI fallback runs on commit, so navigation is never blocked.
  - If WAAPI is missing, a CSS `data-entering` keyframe is used instead.
- Provider mount: `apps/web/src/app/(admin)/layout.tsx` wraps `{children}` in `RouteMotionProvider`.
- Skeletons (`apps/web/src/components/feedback/PageSkeleton.tsx`, `feedback.css`):
  - `PageSkeleton` has four variants: list (page head, filter row, table rows), dashboard (KPI cards plus a map block), detail (header, tabs, two columns) and form (sections of label/field pairs plus an actions row).
  - Every skeleton has the same outer spacing as the real page, so there is no layout shift when content arrives.
  - The shimmer is subtle and uses `color-mix` on `--ar-text`, so it works in the light, dark and outdoor themes.
  - `SlowLoadingNotice` shows the existing `loading` Lottie together with "Carregando…" (`common.states.loading`) after 2 s. The Lottie plays once and rests, to respect WCAG 2.2.2 and to avoid the pause control covering a small animation.
- `loading.tsx` files (26) under `apps/web/src/app/(admin)/`:
  - Group root.
  - `ops` and `analytics`, using the dashboard variant.
  - `assets`, `billing`, `customers`, `rentals`, `reports`, `sites`, `team`, `templates` and `work-orders`, using the list variant, each with an `[id]` detail.
  - `assets/new`, `rentals/new`, `work-orders/new`, `settings` and `account`, using the form variant.
- In-page data fetches: `LoadingState` in `apps/web/src/components/data/States.tsx` now renders a skeleton instead of a spinner, and shows the slow notice after 2 s. Every react-query page that uses it gets this automatically.
- Button `pending` (`apps/web/src/components/ui/Button.tsx`):
  - Shows an inline spinner, sets `disabled`, `aria-busy="true"` and `data-pending`, and keeps a stable width. The spinner sits in the icon slot, or is centred over a transparent label.
  - `busy` stays as a deprecated alias.
  - Wired into these forms:
    - `FormDialog`
    - `ConfirmDialog`
    - `NewRentalPage`
    - `NewWorkOrderPage`
    - `AssignDialog`
    - `SettingsPage`
    - `TemplateEditorPage`
    - `CloseRentalDialog`
    - `ExtendRentalDialog`
- Reduced motion: no fade, rise, shimmer, spinner rotation or view transition. The bar still appears, without the trickle or glow animation. Nothing causes layout shift.

## Tests
- `npx vitest run src/components/feedback src/components/ui/Button.test.tsx src/features/ops/operatorStore.test.ts` (in `apps/web`) → 4 files, 25 passed. This covers:
  - the 120 ms delay threshold
  - completion on a route change
  - the click filter
  - the safety timeout
  - the view transition cap and `skipTransition`
  - the reduced-motion branch
  - the skeleton variants and the slow notice
  - Button pending: spinner, aria-busy, disabled, stable width and the busy alias
- `pnpm check:only web` → lint passed, typecheck passed, tests 312 passed and 1 failed. The failure is the timing assertion `OperatorStore > processes a batch of 300 operator fixes and one frame well under 50 ms` (`AssertionError: expected 101.71420899999998 to be less than 50`) in `src/features/ops/operatorStore.test.ts`. That file is owned by ops-clean, and the test passes when run on its own, so it is load-sensitive.
- `pnpm i18n:check` → passed for pt-BR and en, with only pre-existing unused-key warnings.
- Visual check with playwright-cli (session `motion`). Screenshots are in `.data/reviews/motion/`:
  - `01-nav-midload.png`, `02-nav-slow.png`, `03-nav-done.png` and `04-transition-frame.png`: navigation.
  - `10-skeleton-list.png`, `10-skeleton-dashboard.png`, `10-skeleton-detail.png`, `10-skeleton-form.png` and `11-slow-notice.png`: skeletons.
  - `20-inpage-loading.png` and `21-inpage-slow.png`: in-page loading.
  - `30-skeleton-dashboard-dark.png` and `31-skeleton-reduced.png`: dark theme and reduced motion.
  - `40-button-pending.png`: button width measured at 171.89 px before and during pending, with `aria-busy="true"`.

## Assumptions
- No new i18n keys. The slow notice reuses `common.states.loading`.
- The click listener is a backup for `onRouterTransitionStart`, because a running dev server only picks up the new `instrumentation-client.ts` after a restart. Starts are idempotent, so the two sources never double-trigger.
- The skeleton previews were captured on a temporary preview route, which has since been deleted. The dev server does not prefetch, so a held RSC request does not render `loading.tsx` in dev. Production prefetch shows them as designed.

## Gaps
- `notifications` and `getting-started` have no dedicated `loading.tsx`. They fall back to the group default list skeleton. Their owners, ops-clean and admin-polish, can add a specific variant.
- Data spinners inside components that do not use `LoadingState` (for example small inline widgets) were left as they are, because swapping them was not trivial.

## Error cases added
- None.

## Change requests
- None.

## Edits outside owned paths (T10, T11, T12 only)
- `apps/web/src/components/ui/Button.tsx`: added the `pending` prop narrowly, as permitted.
- `apps/web/src/app/(admin)/layout.tsx`: one-line provider mount, as permitted.

## Notes for the next wave
- Use `<Button pending={mutation.isPending}>` for new mutation forms. `busy` is deprecated.
- New route segments should add a `loading.tsx` that renders `<PageSkeleton variant="…" />`.
- Wrap programmatic navigations outside Next's router in `emitNavigationStart(href)` from `@/components/feedback` so the bar shows.
