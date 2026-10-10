# ADMIN-SELL · Simpler to sell, admin web, phase "Now"

Status: DONE_WITH_GAPS
Wave: post-W5 (SIMPLER-TO-SELL plan) · Agent finished: 2026-10-10 12:45

## Done
- SIMPLER-TO-SELL §6.1, Lottie player: `apps/web/src/components/motion/Lottie.tsx` (+ `Lottie.test.tsx`).
  - Lazily imports `lottie-web/build/player/lottie_light` (no eval) together with `loadAnimation(id)` from `@agrorende/motion`, and uses the SVG renderer.
  - The root is `aria-hidden` and sizes itself with an aspect-ratio box taken from `motionMeta[id]`, so it causes no layout shift.
  - With reduced motion it stops on `posterFrame` and never plays, and it follows changes to the media query.
  - An IntersectionObserver plays the animation when visible and pauses it off screen. The `playOnce` prop disables looping, and a finished animation is not replayed.
  - The player is destroyed on unmount.
  - In the dark theme it sits on a light rounded stage (`--ar-motion-stage` in `components/shell/theme.css`).
- SIMPLER-TO-SELL §2 and §4, guided first run ("Primeiros passos") at `/getting-started`, ADMIN only. The guard is `ADMIN_PREFIXES` in `src/proxy.ts`, and the page shows a FORBIDDEN view to other roles.
  - Code: `src/app/(admin)/getting-started/page.tsx` and `src/features/onboarding/{GuidePage,GuideProgressCard,guideStorage,useGuideProgress}.ts(x)`.
  - There are five steps, each with its own animation:
    - Boas-vindas (`welcome`).
    - Primeira máquina (`first-machine`): name and type only, sent with `POST /assets`, plus a "Mais detalhes" link to `/assets/new`.
    - Convidar a equipe (`invite-team`): one technician through `POST /users`, then a share panel with a WhatsApp `https://wa.me/?text=` link carrying the invite code.
    - Primeira ordem de serviço (`first-work-order`): the title is pre-filled and the machine from step 2 is pre-selected; it uses `POST /work-orders`.
    - Pronto (`success`): what happens next, the App Store and Google Play links, and a summary of the tasks.
  - The page has a numbered stepper (`aria-current="step"`) and "Etapa X de 5". Every step has skip and back, and "Continuar depois" returns to the overview.
  - Progress is resumed from localStorage, using the key `agrorende.guide.v1.<orgId>`.
  - Completion comes from real data:
    - the `GET /org/subscription` `gettingStarted` steps (`assets`, `team`, `app`), which are the same source the old checklist used;
    - plus `GET /work-orders?limit=1`.
- On the overview (`/ops`), `GuideProgressCard` replaces the old `GettingStartedPanel`, which was deleted.
  - It shows "Primeiros passos 2 de 4", a progress bar, Continuar and Ocultar.
  - It is hidden when every task is done, when the admin hides it, or when the admin has finished the guide.
  - A brand-new organisation (no machines) is redirected to the guide once.
- SIMPLER-TO-SELL §6.3, empty states: `EmptyState` (`components/data/States.tsx`) has a new optional `animation?: AnimationId` prop. The animation is applied only when a list is empty and not filtered:
  - assets → `first-machine`;
  - work orders → `first-work-order`;
  - team → `invite-team`;
  - rentals → `rental-handover`;
  - reports → `report-offline`, plus a new "Convidar a equipe" button.
  - The empty-state copy now says why each page matters.
- SIMPLER-TO-SELL §1, plain-Portuguese pass in pt-BR, with the en copy adjusted to match:
  - Central de operações → Visão geral.
  - Atenção → Pendências.
  - Dispositivos → Celulares da equipe.
  - Templates → Modelos de checklist.
  - CSV → planilha.
  - Última sincronização → Última atualização do celular.
  - The search box reads "Buscar (Ctrl+K)".
  - "Código do erro" → "Código para o suporte".
  - "aparelho" → "celular" in the remaining copy.
  - The user-visible "Realtime provider placeholder" (`web.shell`) was removed, together with the dead foundation `components/foundation/AdminShell.tsx`.
  - `RealtimeStatus` now renders nothing while connected or connecting. In the top bar it is shown only to ADMIN.
- SIMPLER-TO-SELL §6.5, top bar: the org name, search, notifications and user menu stay. The theme choices (`ThemeChoices`, 4 × `menuitemradio`, 48 px) and the language select moved into `UserMenu`, which also closes on Escape.

## Tests
- `pnpm check:only web` → lint passed, typecheck passed, test passed (47 files, 272 tests).
- `pnpm i18n:check` → passed for pt-BR and en.
- New tests:
  - `src/components/motion/Lottie.test.tsx`: 5 tests with lottie-web mocked, covering lazy load, reduced motion, IntersectionObserver, playOnce and destroy.
  - `src/features/onboarding/guide.test.tsx`: 9 tests covering steps, skip, resume, the form errors, non-admin, the card and the one-time redirect.
- Updated tests that asserted the old strings:
  - `AdminShell.test.tsx`, `PageContext.test.tsx`, `ExportControls.test.tsx`, `OpsCenter.test.tsx` and `CommandPalette.test.tsx`;
  - the e2e specs `auth.spec.ts`, `ops.spec.ts` and `power-tools.spec.ts`.
- Visual check (playwright-cli, local dev server): the guide steps 1–5, the `/ops` card, the asset empty state (list mocked empty) and the user menu, in light and dark, at 1280 and 390 widths.
  - Screenshots are in `.data/reviews/admsell-*.png`, which is git-ignored.
  - Fix applied after review: the guide animation is smaller on phones (`max-w-40`, tighter gap).

## Assumptions
- Route `/getting-started` follows the existing `(admin)` route group and the proxy prefix list.
- The card counts four tasks: machine, invite, work order and a connected technician phone. The guide itself has five steps, because "Boas-vindas" and "Pronto" are not tasks.
- The English label for "Pendências" is "To do".
- Guide state is stored in localStorage per organisation (falling back to the user id). "Dismissed", "finished" and "offered" live there; completion never does.
- The overview's own `RealtimeStatus` badge shows to every office role, but only when the connection is broken, next to the existing paused banner.
- The demo organisation now has one test machine ("Trator teste guia", AGR-000040) and one work order ("Revisão geral"), created by the visual check. No invite was created.

## Gaps
- SIMPLER-TO-SELL "Next": module switches and hiding pages are deliberately not implemented. Owner: next phase.
- `/imports` ("Importar planilha") is still the foundation placeholder page and is out of scope here. Owner: whoever implements the imports feature.
- `tenancy.gettingStarted.*` keys and `features/tenancy/GettingStartedCard.tsx` are now unused, apart from the re-export in `features/tenancy/index.ts`. They were kept to keep this change focused and can be removed in a later clean-up.
- The local dev server answered authenticated requests slowly during review (`/api/v1/auth/me` took about 34 s, and `/notifications` returned 500). This is unrelated to this task, but it made one 390 px light screenshot of the guide impossible; the dark 390 px screenshot covers that layout.
- Existing hydration warning on the branding `<style>` tag (the `--color-*` attributes) is pre-existing and not part of this task.

## Error cases added
- None new. The guide forms use the existing recovery kit (`ErrorAlert` with the `docs/ERRORS.md` copy and retry). Progress loading shows an error with retry, and non-admins get the FORBIDDEN view.

## Change requests
- None. No backend change was needed.

## Edits outside owned paths (T10, T11, T12 only)
- None. Only `apps/web/**` and this file were edited.

## Notes for the next wave
- Use `<Lottie id=… playOnce />` from `@/components/motion/Lottie` for any new admin animation. Pass `animation` to `EmptyState` instead of building a new empty state.
- Guide state helpers (`useGuideState`, `readGuide`, `writeGuide`) are exported from `@/features/onboarding`.
