# MOBILE-SPACING · UI review

| Field | Value |
|---|---|
| Date | 2026-10-11 |
| Screens reviewed | Mobile app on the Expo web build (react-native-web), signed in as the demo technician: login, intro, Hoje, Serviços (Hoje, Feitos empty, map toggle), job detail, checklist, peças, concluir, Relatos list, report detail, new report, Locações list, rental detail, checkout wizard, Mais, Máquinas (asset picker), Configurações, Avisos, Envios (sync centre), scan fallback, fuel log, new rental (role-blocked empty state), style guide. pt-BR, light theme. |
| Viewports | Android 412×915 at DPR 2.625 (Pixel class) and iOS 390×844 at DPR 3 (iPhone 14), both `isMobile` and `hasTouch`. |
| Not reviewed | Native iOS and Android binaries (no simulator with Metro and the Expo MCP server was running), the dark and outdoor themes, en and pseudo-locale, 1.3× font scale. The `/assets` URL collides with the Metro asset handler on web ("Could not extract asset path from URL"), so the asset list was reached through Mais → Máquinas. |
| Screenshots | `.data/reviews/mobile-spacing/` (`before-*` and `after-*`, `<tag>-<android|ios>-NN_<route>.png`) |

The admin API on port 3000 sends no CORS headers to the Expo web origin, so the screenshot harness answers preflight requests and adds CORS headers inside the Playwright browser context (`ctx.route`). This is a review-only workaround; no app code was changed for it.

Each task below groups the findings that share one root cause. Findings use the `caveman-review` line format. All seven tasks are fixed in shared components first, so every screen that uses them inherits the fix.

## T1 · Header sync badge and title — DONE

app/(app)/(tabs)/_layout.tsx:27: major `headerRight` SyncBadge sits flush against the right screen edge and top-aligns against the header (`alignSelf: flex-start` in SyncBadge); every tab screen (before-android-03_today.png, before-ios-03_today.png). Wrap it in a header container with 16 dp end inset and vertical centring.
app/(app)/_layout.tsx:21: major same flush-right SyncBadge on every stack screen (job detail, settings, sync centre, notifications). Same wrapper; on native-stack (iOS/Android binaries) the system already insets header items, so only the JavaScript header gets the extra inset.
app/(app)/(tabs)/_layout.tsx:24: minor header title renders regular weight, weaker than the in-content headings on outdoor screens. Set `headerTitleStyle.fontWeight` 600 on both navigators.

Fix: new `HeaderSyncBadge` in `src/ui/SyncBadge.tsx` (end inset `space[4]`, start inset `space[2]`, centred; `nativeHeader` skips the end inset on native-stack outside web). Both layouts use it and set the header title weight to 600.
Before/after: the badge touched the right edge at 412 and 390; after, it sits 16 dp in, vertically centred with the title.

## T2 · Screen banner slot clips banners — DONE

src/ui/Screen.tsx:22: major `banner` renders full-bleed outside the content padding, so `Banner` cards (radius 12, 2 dp border) are clipped by the screen edges: job detail "Peça indisponível", rental detail "Locação em atraso", Hoje offline and organisation banners (before-android-30-job-detail.png, before-android-35-rental-detail.png). Inset the banner slot like the content (16 dp sides, 16 dp top, 8 dp between banners) and keep a separate full-bleed `ribbon` slot for the environment ribbon.
src/features/jobs/JobsScreen.tsx:33: major the two `Segmented` controls passed as `banner` touch both screen edges, with their 1–2 dp borders cut off at the sides (before-android-04_jobs.png, before-ios-04_jobs.png). Same fix; drop the local `styles.banner` wrapper.
src/features/home/TodayScreen.tsx:39: minor EnvironmentRibbon mixed into `banner` with card-style banners. Move it to the new `ribbon` prop (also `MoreScreen.tsx:35`).
src/features/rentals/RentalDetailScreen.tsx:97: minor local `styles.stack` re-implements the banner gap. Use the Screen banner slot gap instead.

Fix: `Screen` gains `ribbon` (full-bleed) and an inset `banner` slot whose top padding only appears when a banner actually renders (measured with `onLayout`, so an online `OfflineBanner` that returns null leaves no gap).
Before/after: the segmented controls and banners ran edge to edge with clipped corners; after, they align with the 16 dp content gutter and show all four borders.

## T3 · ListItem divider doubles the card border — DONE

src/ui/ListItem.tsx:47: major every row draws a bottom hairline, so the last or only row inside a `Card` draws a stray line 16 dp above the card's own border: Hoje (Relatar problema, Próximo serviço, Locações de hoje), Mais, Configurações, rental detail, Envios (before-android-03_today.png, before-android-07_more.png, before-android-08_settings.png). Add a `divider` prop and have `Card` turn it off for a row that is not followed by another row.
src/features/settings/SettingsScreen.tsx:139: minor Wi-Fi video row nests a ListItem inside a hand-made flex row, so its divider stops short of the Switch and the Switch floats outside the row (before-android-08_settings.png). Put the Switch in the ListItem `right` slot.
src/features/settings/PushMuteCard.tsx:66: minor same nested-row pattern with a hard-coded `minHeight: 48` for the push mute Switch. Same fix.

Fix: `ListItem` takes `divider` (default true). `Card` walks its direct children and passes `divider={false}` to a `ListItem` that is not followed by another `ListItem`, unless the caller set `divider` explicitly. Flat lists outside cards keep their separators.
Before/after: single-row cards showed a line under the row plus the card border; after, only the card border remains, and multi-row cards keep separators between rows only.

## T4 · Status pills squeeze row titles — DONE

src/features/jobs/widgets.tsx:40: major the status pill in `right` takes a fixed column, so "Próximo serviço" and its subtitle wrap over four lines at 390 (before-ios-03_today.png). Render pills under the subtitle in a wrapping row.
src/features/jobs/JobRow.tsx:21: major up to three stacked pills (status, overdue or priority, pending) in `right` squeeze the job title into a narrow column and make rows uneven in height (before-android-04_jobs.png). Move them to the new `badges` slot.
src/features/rentals/RentalRow.tsx:37: major same with rental status and pending pills. Same fix.
src/features/reports/MyReportsScreen.tsx:38: major same with report status and pending pills (before-android-05_reports.png). Same fix.
src/features/notifications/NotificationsScreen.tsx:62: minor unread pill squeezes the notification body. Same fix.
src/features/assets/AssetDetailScreen.tsx:77: minor fuel-pending and history status pills in `right` (also line 89). Same fix.
src/components/AssetPicker.tsx:40: minor condition or "Selecionada" pill in `right` squeezes the machine name. Same fix.
src/features/reports/ReportDetailScreen.tsx:122: minor work-order status pill in `right`. Same fix.
src/ui/ListItem.tsx:39: minor pills in `right` were top-aligned while the chevron was centred. The `right` slot is now a centred, end-aligned column capped at half the row width.

Fix: `ListItem` gains `badges` (rendered in the text column as a wrapping row, gap 8, 4 dp above). Short trailing content (counts, one short badge, a Switch, one action) stays in `right`.
Before/after: titles wrapped to three or four lines beside a column of pills; after, the title and subtitle use the full row width and the pills wrap underneath.

## T5 · Segmented labels truncate — DONE

src/ui/Segmented.tsx:37: major labels are forced to one line, so options with three or more choices truncate: checklist "Confor…", "Não co…" (before-android-31-job-checklist.png), asset picker "Ler…", "Bu…" (before-android-37-assets.png), settings navigation app "Mapa do s…", "Google M…" (before-android-08_settings.png), fuel picker. With three or more options, stack the icon above a two-line centred label; with five or more, wrap into rows of three.

Fix: `Segmented` switches to a stacked cell layout (icon over label, `numberOfLines={2}`, centred) at three or more options and wraps cells at `flexBasis: 33.33%` at five or more.
Before/after: labels ended in an ellipsis; after, every label is fully readable and every cell stays at least 48 dp tall.

## T6 · NumberField overflows its card — DONE

src/ui/NumberField.tsx:44: blocking on `/fuel/new` and the parts quantity, the row of decrease button, input, unit and increase button is wider than a 390 or 412 screen, so the increase button is cut off at the right edge and cannot be tapped (before-android-14_fuel_new.png). Put the input (with its unit) on its own full-width row and the two steppers below it, each half the width.
src/ui/NumberField.tsx:44: minor steppers were borderless `IconButton`s next to a bordered input. Use bordered `Button compact variant="secondary"` (48 dp, icon plus text).

Fix: input row on top, then a row of two `Button compact` steppers with `flex: 1`.
Before/after: the "+" stepper was off screen; after, both steppers are fully visible, 48 dp tall and share the row.

## T7 · Hard-coded spacing off the 4-pt scale — DONE

src/ui/Button.tsx:60: minor `paddingHorizontal: 20` and `gap: 10` are off the token scale. Use `space[4]` and `space[2]`.
src/ui/Banner.tsx:126: minor `gap: 10`. Use `space[3]`.
src/ui/EmptyState.tsx:162: minor `gap: 10`; ErrorState the same. Use `space[3]`.
src/ui/IconButton.tsx:204: minor `gap: 6`; StatusPill, SyncBadge, Chip, InlineError the same. Use `space[1]` for icon-to-label in pills and `space[2]` elsewhere.
src/ui/NumberField.tsx:76: minor `gap: 6` between label and field; TextField and Slider the same. Use `space[2]`.
src/ui/Badge.tsx:19: minor `borderRadius: 6` is not a token. Use `radius.controls`.
src/ui/*.tsx: minor every remaining literal gap, padding and margin in the shared UI (Screen, Card, ListItem, BottomSheet, ConfirmDialog, Toast, Skeleton, Header, EnvironmentRibbon, FullScreenError) is a raw number. Use `space[n]` from `src/ui/theme.ts`.

Fix: every gap, padding and margin in `src/ui/**` now reads from `space`. 6 snaps to 8 (4 inside pills), 10 snaps to 12 (8 inside buttons), 20 becomes 16 for button side padding.
Before/after: no visual regression; spacing inside banners, empty states and buttons is now on the same 4-pt rhythm as cards and lists.

## Also fixed

src/ui/Icon.tsx:20: major on web the lucide SVG received `importantForAccessibility`, which React rejects as an unknown DOM prop; in development this raised the LogBox warning toast over the bottom of every screen and hid the tab bar and footers. Pass `aria-hidden` on web and the native accessibility props on native.

## Not fixed

src/features/jobs/checklist (checklist screen): minor "0 de 10 respondidos" appears both in the header and above the list. Content duplication rather than spacing; left to the jobs feature owner.
src/features/reports/ReportDetailScreen.tsx:116: minor section headings get the same 16 dp gap above and below, so a heading does not visually hug its content. Needs a section component (heading plus content group); left as a follow-up because it touches every detail screen.
src/components/PermissionPrompt.tsx:21: minor the card looks bottom-heavy. The space is the ghost "alternate" button's own 48 dp touch target, which §3.7 requires; no change.
app/(app)/rentals/new.tsx: minor on iOS the route redirected to Hoje during review while Android showed the "Só o escritório cria locações" empty state. Role gating, not spacing; not investigated further.
