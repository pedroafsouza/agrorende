# ADMIN-POLISH · SELL review fixes, notifications flyout, centred search, brand block, demo indicator and guide modal

Status: DONE_WITH_GAPS
Wave: polish · Agent finished: 2026-10-10 13:45 · Job G (guide modal) finished: 2026-10-10 14:45

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

- G · "Primeiros passos" as a floating modal (`apps/web/src/features/onboarding/GuideModal.tsx`, `GettingStartedRoute.tsx`, `GuidePage.tsx`, `guideStorage.ts`).
  - `GuideModalProvider` wraps the admin shell in `app/(admin)/layout.tsx` and exposes `useGuideModal()` (`open`, `close`, `isOpen`). It returns `null` outside the provider, so callers fall back to a link to `/getting-started`.
  - Opening:
    - It opens by itself once for a brand-new organisation. This uses the same `agrorende.guide.v1.<orgId>` state and the same `offered` flag; the overview card no longer redirects.
    - On demand it opens from the user menu (now a button), the command palette action, and the overview card's "Continuar".
    - `/getting-started` (`GettingStartedRoute`): an ADMIN gets the modal opened over `/ops` (`router.replace("/ops")`). Other roles, and any render without the provider, get the page (`GuidePage`), as before.
  - Desktop: a centred dialog up to 720 px wide (`45rem`) with a dimmed, blurred backdrop.
    - Enter: fade, scale 0.96→1 and an 8 px rise over 220 ms on a spring-like curve.
    - Exit: 150 ms ease-in.
  - At 390 px it is a bottom sheet: full width, a drag-handle visual, max 90dvh with scrolling inside, sliding up over 280 ms.
  - Steps:
    - The modal shows the compact stepper (dot over label) and a thin progress bar.
    - Moving between steps slides the step panel 32 px in the direction of travel. The step's Lottie remounts and plays once.
    - Each step keeps one primary action, a quiet "Pular esta etapa" and "Voltar", plus "Fechar" (X) and "Continuar depois" in the footer.
  - Navigating actions ("Mais detalhes" for a machine, "Ir para a visão geral") close the modal first, then navigate.
  - The guide state is shared live between the modal, the overview card and the page. `writeGuide` dispatches `agrorende:guide-change`, every `useGuideState` listens to it and to `storage` events, and patches merge over the stored copy. Progress is still read from real data through React Query, so the checklist updates as tasks complete.
  - Accessibility:
    - Native modal `<dialog>` with `showModal()`: the background is inert and Tab stays inside.
    - `aria-modal="true"`, labelled by the "Primeiros passos" heading.
    - Escape (the `cancel` event), the X, "Continuar depois" and a backdrop click close it. Focus returns to the trigger; for the user menu that is the menu button.
    - The page does not scroll behind the modal while it is open.
  - Reduced motion: opacity-only fades for the dialog, the backdrop and the step changes.
  - New messages: `tenancy.guide.actions.close` in pt-BR and en.

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
- Job G: `pnpm check:only web` → passed (lint, typecheck, 56 test files / 322 tests, i18n). `pnpm i18n:check` → passed.
  - `src/features/onboarding/GuideModal.test.tsx` (8 tests):
    - opens by itself once for a brand-new organisation, and not when machines exist;
    - re-opens from the user menu, closes on Escape and returns focus to the menu button;
    - closes from the X and from "Continuar depois";
    - slides forward and back in the direction of travel, and a navigating link closes it and the card re-opens it at the same step;
    - reduced motion uses fades only;
    - the deep link becomes the modal over `/ops`, and non-admins keep the page.
  - In `guide.test.tsx`, the card's first-run redirect test was replaced: the card never redirects now.
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
- The earlier web gate failure in `OpsCenter.tsx` is resolved: `pnpm check:only web` passed on the job G run.

## Error cases added

- None.

## Change requests

- None.

## Notes for the next wave

- Screenshots are in `.data/reviews/polish/`:
  - Before: `before-<route>-{1280,390}.png`.
  - After: `after-shell-{expanded,collapsed}-{light,dark}-{1280,390}.png`, `after-flyout-{1280,390}.png`, `after-palette-{1280,390}.png`, `after-topbar-390.png`, `after-usermenu-1280.png` and `after-getting-started-{1280,390}.png`.
- Guide modal screenshots are in `.data/reviews/guide/` (reviewed):
  - `modal-{welcome,machine}-{light,dark}-{1280,390}.png`
  - mid-transition: `enter-mid-{1280,390}.png` (dialog scaling in, sheet sliding up) and `slide-mid-{1280,390}.png` (step slide)
  - `deeplink-1280.png` (`/getting-started` → modal over `/ops`)
  - The script is `guide.js`.
- Known visual nit: the `first-machine` Lottie has a light stage baked in, which shows as a light card in dark mode. This was already listed as a SELL minor (dark Lottie stage).
- `page-motion` mounts its provider with one line in a layout and adds `pending` to `Button`. The Button edits in this pass are limited to the disabled-primary tokens.
