# SELL · UI review

| Field | Value |
|---|---|
| Date | 2026-10-10 |
| Screens reviewed | Landing `/`, `/recursos`, `/planos`, `/ajuda` (pt-BR, en; light, dark; 390×844, 820×1180, 1440×900; default, reduced motion, lite). Admin `/getting-started` (all five steps plus done; pt-BR, en; light, dark, outdoor; three viewports; loading, error, offline), `/ops` progress card, Lottie empty states on assets, rentals, team, work orders and reports, user menu with theme and language. Mobile intro, EmptyState, Envios (SyncCenter) and job completion by code review only. |
| Not reviewed | Pseudo-locale `en-XA` on web and landing: neither runtime ships it (web SUPPORTED_LOCALES is pt-BR and en; landing has pt-br and en). Landing outdoor theme: the landing has no outdoor theme. Mobile on device: no simulator or Metro with MCP was running, so mobile was reviewed from source only, with no screenshots, no 1.3× font-scale check and no Metro console. OS font scale 1.3× on web was not exercised. |
| Screenshots | .data/reviews/sell/ |

The review drove a real browser against the landing dev server on port 3300 and the admin web app on port 3000, signed in as the demo admin. No data was created or deleted: empty, error, loading and progress-card states were produced by intercepting API responses in the browser, and the offline save attempt failed on the client before reaching the server. Touch targets on the landing and the admin screens met the 48 px minimum (only the visually hidden skip link is smaller), there was no horizontal overflow at any viewport, reduced motion correctly swapped every animation for its poster, and lite mode hid the animation stages. The console showed only font and CSS preload warnings on the landing; on the admin it showed a hydration mismatch on the root `<html>` style and MapLibre missing-image warnings on `/ops`, both of which predate these commits and are not counted as findings.

No finding breaks a §3.7 rule outright, hides a recovery action or makes a primary action unreachable, so there are no blocking findings. The major findings are mostly about the sales story and plain language: the pricing page has two primary actions, the hero promises a video that does not exist yet, looping animations on the admin cannot be paused, and a few screens say the wrong thing about where data is.

## Blocking

None.

## Major

apps/landing/src/views/Pricing.tsx:90: major proposal card renders WhatsApp "Pedir uma proposta" as second filled primary next to "Testar grátis"; two primaries on one page (.data/reviews/sell/landing-pricing-pt-BR-light-1440x900-default.png). Make proposal `variant="secondary"`.
apps/landing/src/views/Home.tsx:97: major hero "Ver o vídeo do produto" links to Recursos#video, which only says "Vídeo de demonstração em breve", with no player (.data/reviews/sell/landing-home-pt-BR-light-1440x900-default.png). Render the link only when `demoVideoAssets().video` is true.
apps/web/src/components/motion/Lottie.tsx:45: major looping animations (report-offline in Reports empty state, loading, empty) play forever with no pause control; WCAG 2.2.2 and plan §6 (.data/reviews/sell/reports-pt-BR-light-1440x900-empty.png). Add pause toggle like landing Lottie, or play once and rest on poster frame.
apps/web/src/features/onboarding/GuidePage.tsx:180: major machine, team and work-order steps show three forward actions, "Pular esta etapa", "Continuar" and a primary that stays disabled until the name is typed; "Continuar" and "Pular" do the same thing and at 390 the secondary sits above the primary (.data/reviews/sell/getting-started-pt-BR-light-1440x900-machine.png, .data/reviews/sell/getting-started-pt-BR-outdoor-390x844-machine.png). Keep one primary plus one skip link; drop the duplicate "Continuar".
apps/web/src/features/onboarding/GuideProgressCard.tsx:68: major "Ocultar" sets `dismissed` forever with no undo, and `/getting-started` has no nav or command-palette entry, so the guide is lost unless the URL is typed (.data/reviews/sell/ops-pt-BR-light-1440x900-card.png). Add "Primeiros passos" to the user menu or command palette, or show an undo toast.
apps/web/src/features/shell/UserMenu.tsx:46: major `role="menu"` without menu keyboard behaviour: focus is not moved in, arrow keys do nothing, and the menu holds a `<select>` and `<label>` that are not menu items (.data/reviews/sell/usermenu-pt-BR-light-1440x900-open.png). Drop `role="menu"`/`menuitem` and use a disclosure popover with a focus trap, or implement roving focus.
apps/web/messages/pt-BR/errors.json:139: major error copy for INVALID_CREDENTIALS (139), REFRESH_REUSED (249), RESET_LINK_EXPIRED (304), STORAGE_FULL (319) and UNAUTHENTICATED (334) now says "deste celular" or "no celular", but the admin runs in a desktop browser. Split the web copy from the mobile copy or use "neste aparelho".
apps/mobile/src/features/sync/SyncCenterScreen.tsx:62: major any non-empty outbox shows "Salvo no celular / Será enviado quando tiver sinal", including conflicts and REJECTED rows that need action, and also while online. Branch the header: conflicts or rejected → "Precisa da sua atenção"; online and pending → "Enviando".

## Minor

apps/web/src/components/shell/theme.css:104: minor outdoor `[class*="border"]` rule turns `border-t` separators into full boxes around StepActions and user-menu sections (.data/reviews/sell/getting-started-en-outdoor-390x844-default.png, .data/reviews/sell/usermenu-pt-BR-outdoor-390x844-open.png). Exclude `border-t`, `border-b` and similar from the outdoor rule.
apps/web/src/features/onboarding/GuideProgressCard.tsx:39: minor card counts "2 de 4" while the guide says "Etapa x de 5" (.data/reviews/sell/ops-card-pt-BR-light-1440x900-default.png). Use the same count on both.
apps/web/src/features/onboarding/GuideProgressCard.tsx: minor outdoor progress track is light grey on white with no border, so it barely shows (.data/reviews/sell/ops-pt-BR-outdoor-1440x900-card.png). Give the track a 1 px border in outdoor.
apps/web/src/features/onboarding/GuidePage.tsx:Stepper: minor at 390 the stepper shows numbers and checks only, the current step cannot be told apart in outdoor, and done/pending words are sr-only (.data/reviews/sell/getting-started-en-outdoor-390x844-default.png). Show "Etapa x de 5" and a visible ring on the current step.
apps/web/src/features/onboarding/GuidePage.tsx:summary: minor done/pending word in the summary list is sr-only, so status is an icon only on screen. Show the word.
apps/web/src/features/onboarding/GuidePage.tsx:welcome: minor welcome step has a redundant "Pular esta etapa" next to "Começar" (.data/reviews/sell/getting-started-en-outdoor-390x844-default.png). Remove skip on welcome.
apps/web/src/features/onboarding/GuidePage.tsx:MachineStep: minor "Mais detalhes" uses the ExternalLink icon but stays in-app at /assets/new and drops the typed name. Use the ArrowRight icon and pass the name as a query param.
apps/web/src/features/onboarding/GuidePage.tsx:MachineStep: minor placeholder "Ex.: Trator John Deere 6110J" reads like a filled value in light theme. Move the example to the hint text below the field.
apps/web/src/features/onboarding/GuidePage.tsx:StepActions: minor disabled primary in outdoor is pale green with a white label, low contrast (.data/reviews/sell/getting-started-pt-BR-outdoor-390x844-machine.png). Use the kit disabled tokens (surface-muted with fg-muted text).
apps/web/messages/pt-BR (work-orders empty state): minor empty-state action "Nova OS" uses an acronym, against the plan's plain-Portuguese rule (.data/reviews/sell/work-orders-pt-BR-light-1440x900-empty.png). Use "Novo conserto" or "Nova ordem de serviço".
apps/web/messages/pt-BR (reports empty state): minor "Nenhum relato na fila" uses "fila" jargon (.data/reviews/sell/reports-pt-BR-light-1440x900-empty.png). Use "Nenhum relato novo".
apps/web reports empty state:1440x900: minor the empty-state primary action sits below the fold under a large animation (.data/reviews/sell/reports-pt-BR-light-1440x900-empty.png). Shrink the animation or place the action above it.
apps/web team empty state: minor the empty state and the page header both show a "Convidar pessoa" primary (.data/reviews/sell/team-pt-BR-light-1440x900-empty.png). Hide the header action while empty.
apps/web/src/components/motion/Lottie.tsx:dark: minor the light #f1f3f5 animation stage is a bright box in dark theme; this also applies to the landing (.data/reviews/sell/landing-home-pt-BR-dark-1440x900-default.png). Dim the stage in dark theme, for example to the surface-muted token.
apps/web/src/features/onboarding/GuidePage.tsx:offline: minor offline save shows the compact "Você está sem conexão" with no guidance on what happens to the typed data. Add "Seus dados continuam aqui; tente de novo com sinal".
apps/web/src/features/onboarding/GuidePage.tsx:error: minor a guide load failure reuses the INTERNAL copy "Envio pausado… O app vai tentar de novo sozinho", which does not fit a page load (.data/reviews/sell/getting-started-pt-BR-light-1440x900-error.png). Use load-specific copy with a "Tentar de novo" action.
apps/landing/src/views/Home.tsx:steps: minor `h3` inside a `span` is invalid nesting, and step 3's two-line title pushes its number badge out of line. Use a `div` wrapper and `items-start`.
apps/web/src/features/shell/ThemeToggle.tsx: minor Light and Bright-sun icons are near-identical (Sun vs SunMedium) and the selected theme has no check icon (.data/reviews/sell/usermenu-pt-BR-light-1440x900-open.png). Use a distinct outdoor icon and add a Check to the selected item.
apps/mobile/src/features/jobs/JobCompleteScreen.tsx: minor "Voltar ao serviço" uses the ArrowRight icon for a back action, the toast duplicates the done screen, and the body always says "vão quando tiver sinal" even after the data was sent. Use ArrowLeft, drop the toast and branch the copy on the outbox state.
apps/mobile/src/ui/Lottie.tsx: minor looping animations have no off-screen pause (plan §6). Pause on blur with useIsFocused or AppState.
apps/mobile/src/auth/ui/IntroScreen.tsx: minor the `introSeen` flag is per device, so a second technician on a shared phone never sees the intro. Key it per user.
apps/mobile/src/features/jobs/JobsScreen.tsx: minor the Done tab empty state reuses the `first-work-order` animation and its message. Use the `empty` animation on Done.

## Fixes

Applied in the ADMIN-POLISH pass. Screenshots are in `.data/reviews/polish/`.

### Major

- Pricing WhatsApp button: it now uses the secondary variant, so the plan's sign-up primary is the only primary action (`apps/landing/src/views/Pricing.tsx`).
- Home hero video link: it renders only when `public/video/agrorende-demo-pt-BR.mp4` exists at build time, through `hasDemoVideo()` in `apps/landing/src/lib/demoVideo.ts`. `e2e/pages.spec.ts` and `e2e/ctas.spec.ts` assert the link when the file is there and its absence otherwise.
- Web Lottie: looping animations get a visible pause/play control (`common.motion.pause` and `common.motion.play`) (`apps/web/src/components/motion/Lottie.tsx`).
- GuidePage actions:
  - Each step has one primary and a quiet "Pular esta etapa" link, or "Continuar" once the step is already done.
  - The duplicate secondary "Continuar" is gone.
  - At 390 px the primary comes first in the DOM and on screen. From `sm` up it sits on the right.
- Guide reachability:
  - "Ocultar" shows an undo toast that says the guide is still in the account menu.
  - ADMIN users get "Primeiros passos" in the user menu and "Abrir Primeiros passos" in the command palette.
  - The card now counts "2 de 4 tarefas", so it no longer competes with the guide's "Etapa x de 5".
- UserMenu: it is a disclosure (`aria-expanded`/`aria-controls`, `role="region"`) instead of `role="menu"`. Focus moves into the panel, Escape closes it and returns focus to the button, and a click outside closes it (`useDisclosure.ts`). Theme choices use `aria-pressed` and show a check on the selected one.
- Web error copy: INVALID_CREDENTIALS, REFRESH_REUSED, RESET_LINK_EXPIRED, STORAGE_FULL and UNAUTHENTICATED no longer mention "celular". They talk about the browser or the device, or drop the reference, in both pt-BR and en.
- SyncCenterScreen header: it branches on state.
  - Rejected rows, failed uploads or unacknowledged conflicts → "Alguns envios precisam da sua atenção".
  - Sending → "Enviando…" with the `loading` animation.
  - Offline with pending work → "Salvo no celular. Será enviado quando tiver sinal".
  - Online and waiting → "Será enviado na próxima sincronização".
  - Everything sent → the success state.

### Minor

- theme.css: the outdoor border rule no longer boxes `border-t` and `border-b` separators.
- The outdoor progress track has a border, and the disabled primary uses the kit's disabled tokens.
- Stepper: the current step has a visible ring, and the summary shows "(concluída)" or "(pendente)" on screen.
- The welcome step has no skip.
- MachineStep:
  - "Mais detalhes" uses ArrowRight and passes the typed name to `/assets/new?name=…`, which prefills the form.
  - The example moved from the placeholder to the hint.
- "Nova OS" became "Nova ordem de serviço".
- "Nenhum relato na fila" became "Nenhum relato novo" ("No new reports").
- ThemeToggle: the outdoor icon is now Contrast, and the selected option shows a check.
- Landing Home steps: `h3` sits inside a `div` instead of a `span`.

### Not done

- These minors are left open: the reports empty-state fold, the team empty-state duplicate action, the dark Lottie stage, the guide offline and load-error copy, and the mobile JobComplete, Lottie off-screen pause, IntroScreen and JobsScreen items. They are outside this pass's owned files or were left for their owners.
