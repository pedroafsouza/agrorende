# ADMIN-POLISH · SELL review fixes, notifications flyout, centred search, brand block and demo indicator

Status: DONE_WITH_GAPS
Wave: polish · Agent finished: 2026-10-10 13:45

Scope after the fleet re-scope: jobs A (SELL review fixes), B (bell flyout), E (centred search and palette placement) and F (brand block and demo indicator). Job C (spacing pass for /ops, the /notifications page list and the page context panel) moved to the `ops-clean` agent. Job D (route progress, page transitions, loading skeletons, Button `pending`) moved to the `page-motion` agent. Neither was done here.

## Done

- A · SELL review fixes. All eight majors and most minors are done; the per-item list is in the "Fixes" section of `docs/reviews/SELL-ui.md`. Main paths:
  - `apps/landing/src/views/{Home,Pricing}.tsx`
  - `apps/landing/src/lib/demoVideo.ts`
  - `apps/landing/e2e/{pages,ctas}.spec.ts`
  - `apps/web/src/components/motion/Lottie.tsx`
  - `apps/web/src/features/onboarding/{GuidePage,GuideProgressCard}.tsx`
  - `apps/web/src/features/shell/{UserMenu,ThemeToggle,useDisclosure}.tsx`
  - `apps/web/src/features/command-palette/CommandPaletteDialog.tsx`
  - `apps/web/src/features/assets/{NewAssetPage,AssetForm}.tsx` (name prefill from the guide)
  - `apps/web/messages/*/{errors,tenancy,admin,jobs,reports,common}.json`
  - `apps/mobile/src/features/sync/SyncCenterScreen.tsx` and `apps/mobile/src/i18n/*/sync.json` (header keys)
- B · Notifications flyout (`apps/web/src/features/notifications/flyout/`). `features/shell/NotificationsBell.tsx` re-exports the flyout.
  - The bell no longer navigates. It opens a dialog anchored to the bell with the unread count, the latest eight notifications and "Marcar todas como lidas".
  - Each row is compact: a type icon, a bold title when unread, a one-line body, a relative time ("há 2 h") and an unread dot.
  - Clicking a row marks it read, closes the panel and opens the related record. "Ver todas as notificações" links to `/notifications`.
  - States: loading skeleton (no pulse under reduced motion), error with retry, and an empty state with the small `empty` Lottie.
  - Accessibility: `aria-expanded`/`aria-controls` on the bell, the dialog is labelled by its heading, and focus moves into it. Escape or a click outside closes it and returns focus to the bell. Targets are 48 px.
  - At 390 px the panel is a full-width sheet under the top bar.
- E · Top bar and palette.
  - From `sm` up, the top bar is a three-column grid (`1fr · minmax(0,35rem) · 1fr`). The search field sits at the true centre of the content area and is 48 px tall like the other controls.
  - Below `sm`, the search collapses to a 48 px icon button (`shell-search-icon`) that opens the same palette.
  - The command palette opens horizontally centred at 15vh, at most 40rem (640 px) wide. `Dialog` gained an optional `className`.
- F · Brand block and demo indicator (`features/shell/AdminShell.tsx` and `features/shell/demo.tsx`).
  - The brand block is spaced out: the mark, then "AgroRende", then one tenant slot under it, and a divider before the navigation. The collapsed sidebar shows only the mark, and the full tenant name stays in its `title` tooltip.
  - Real tenant: the tenant slot shows the full tenant name in muted text on one line, with an ellipsis only when it is very long.
  - Demo tenant: the tenant slot shows only the "Demonstração" pill (flask icon and text, warning tokens). The org name is not shown next to it, following the user's correction.
  - A thin demo banner, "Você está no ambiente de demonstração. Os dados são fictícios.", sits under the top bar. It can be closed for the browser session (`sessionStorage`).
  - Messages are in pt-BR and en under `admin.shell.demo.*`.

## Tests

- `pnpm i18n:check` → passed.
- `pnpm check:only landing` → passed.
- `cd apps/landing && SITE_URL=http://localhost:3191 pnpm build` → passed.
- `pnpm e2e` (landing) → 2 failures in `e2e/ctas.spec.ts`, because the video link is now hidden while the video file is absent. After the spec was updated, `npx playwright test e2e/ctas.spec.ts` → 14 passed. The rest of the suite was already green on the first run.
- `pnpm check:only web` → failed, and every failure is in files owned by `ops-clean`, which is editing them right now:
  - `tsc` error at `src/features/ops/OpsCenter.tsx(233,25)`: `onDuty` is not on the props type.
  - 9 failures in `src/features/ops/OpsCenter.test.tsx`.
  - Lint passes, and every other web test passes, including the new ones.
- New web tests:
  - `src/features/notifications/flyout/NotificationsFlyout.test.tsx` (7 tests): open/close, Escape returning focus, click outside, mark one read and navigate, read rows without a link, mark all, empty and error with retry, relative time.
  - `src/features/shell/UserMenu.test.tsx` (3 tests): disclosure behaviour.
  - `src/features/shell/demo.test.tsx`: demo detection and session dismissal.
  - `src/features/shell/AdminShell.test.tsx`: phone search icon, tenant slot, demo pill and banner.
  - `src/features/onboarding/guide.test.tsx`: the count now reads "2 of 4 tasks".
- `pnpm check:only mobile` → failed, only in `apps/mobile/src/ui/Lottie.web.tsx` (lint: `'StyleProp'`/`'ViewStyle'` unused; tsc TS6133 and TS2322). That file belongs to the demo-video agent and was not touched.
  - `npx eslint src/features/sync/SyncCenterScreen.tsx` → clean.
  - `npx jest test/ui/syncAttention.test.tsx` → 3 passed.

## Assumptions

- Demo detection:
  - The organisation model has no demo flag, and there is no `demo-agro` slug.
  - The seeded demo organisation is `uuid(1)` in `packages/db/seed/index.ts` (`018fd000-0000-7000-8000-000000000001`, "AgroRende Demo Agro"), so `isDemoOrg()` matches that id.
  - `NEXT_PUBLIC_DEMO_MODE=1` (or `true`) forces the indicator for any organisation.
- No "Reiniciar demo" link: no demo reset endpoint exists (only password-reset routes), and the brief said not to build one.
- The flyout imports `notificationHref` from `features/notifications/NotificationsPage.tsx` (owned by `ops-clean`) instead of duplicating the entity path map. If that export moves, the flyout import must follow.
- The flyout's own messages live under `admin.shell.notificationsPanel.*`, so the `admin.notifications` object that `ops-clean` is editing is left alone. The flyout still reuses `admin.notifications.{title,markAllRead,emptyTitle,emptyBody,unread}`.
- The guide name prefill makes the asset form dirty, so the unsaved-changes guard applies. That is intended.
- At 390 px the sidebar is a drawer, so "expanded/collapsed" screenshots at 390 show the drawer open and closed.

## Gaps

- SELL minors still open: the reports empty-state fold, the team empty-state duplicate action, the dark Lottie stage, the guide offline and load-error copy, and the mobile JobComplete, Lottie pause, IntroScreen and JobsScreen items. They are outside this pass or belong to other owners.
- No dedicated jest test for the SyncCenter header branches. The mobile test files are outside the single mobile file this pass owns; the existing `syncAttention.test.tsx` still passes.
- The web gate stays red until `ops-clean` finishes `OpsCenter.tsx` and its tests.

## Error cases added

- None.

## Change requests

- None.

## Notes for the next wave

- Screenshots are in `.data/reviews/polish/`:
  - Before: `before-<route>-{1280,390}.png`.
  - After: `after-shell-{expanded,collapsed}-{light,dark}-{1280,390}.png`, `after-flyout-{1280,390}.png`, `after-palette-{1280,390}.png`, `after-topbar-390.png`, `after-usermenu-1280.png` and `after-getting-started-{1280,390}.png`.
- `page-motion` mounts its provider with one line in a layout and adds `pending` to `Button`. The Button edits in this pass are limited to the disabled-primary tokens.
