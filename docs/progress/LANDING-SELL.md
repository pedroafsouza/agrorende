# LANDING-SELL — simpler-to-sell landing site

## Status

Done. The landing site follows `docs/plans/SIMPLER-TO-SELL.md` §1, §2, §3 and §6 and the Landing section of `docs/reviews/sell-simplicity-review.md`. All gates below pass.

## What was done

- **Lottie component.** `apps/landing/src/components/Lottie.tsx` is a client component that lazily loads `lottie-web/build/player/lottie_light` and `loadAnimation(id)` from `@agrorende/motion`, using the SVG renderer.
  - Each animation sits on a fixed aspect-ratio stage taken from `motionMeta`, so the layout does not shift. The stage stays light in dark mode.
  - The animation itself is decorative and `aria-hidden`.
  - With reduced motion the poster frame is shown and nothing plays.
  - An IntersectionObserver plays the animation on screen and pauses it off screen.
  - `playOnce` stops after the first run.
  - Lite mode defers loading.
  - Looping animations get a 48 px pause/play button with an icon and a translated label (`motion.pause`, `motion.play`).
  - The player is destroyed on unmount.
  - `Animation.tsx` is the server wrapper that passes the labels.
  - Tests: `Lottie.test.tsx`, with lottie-web mocked.
- **Home** (`src/views/Home.tsx`) has seven sections:
  1. Hero: outcome headline, one sentence, primary CTA, WhatsApp, a quiet link to `/recursos/#video`, and `welcome` played once.
  2. Problem: today compared with AgroRende.
  3. How it works: three steps, with `report-offline`, `flow-loop` and `machine-cost`.
  4. Works without signal: `saved-on-phone`.
  5. Mission: `office-live`.
  6. Buyer FAQ: six questions plus a link to all of them.
  7. Final CTA.

  The CSS demos (`Demos.tsx`, the `.demo` CSS and the demo pause script) and the pending pilot-results section (`StatusChip.tsx`) were removed.
- **CTAs.** There is one primary CTA everywhere: "Testar grátis por 30 dias" / "Try free for 30 days" → `APP_URL/signup`. "Falar no WhatsApp" is the only secondary CTA. E-mail appears only in the footer and on the help page, and "Entrar" stays a quiet header link.
  - `ContactActions` gained `channels` and `variant`.
- **Recursos** (`src/views/Features.tsx`):
  - `section#video` checks for `public/video/agrorende-demo-pt-BR.mp4` at build time. When the file exists it renders `<video controls preload="none">` with a pt-BR captions track and an optional poster.
  - When the file is missing it shows the `flow-loop` animation with "Vídeo de demonstração em breve".
  - After the video come three job blocks (`report-offline`, `rental-handover`, `machine-cost`) and then the modules in brief.
- **Planos.**
  - The "values still being defined" copy was removed.
  - With prices hidden, a "Pedir uma proposta" card opens WhatsApp.
  - With prices shown, the page adds the example line "Equipe com 5 técnicos: R$ 745 por mês" and the caveat at body size.
- **Ajuda.** Contact (WhatsApp and e-mail) comes first, then the questions. The error-code search is inside a collapsed `<details id="codigos">` titled "Tem um código de erro do aplicativo?". It opens automatically for `?q=` and `#codigos`. The error pages are unchanged.
- **Legal.** The pending-review banner became a small footnote at the end of the article (`data-legal-review="pending"` kept).
- **Copy.** The pt-BR and en copy had a jargon pass per plan §1: no "ERP de campo", sync, CSV, telemetria or triagem. New meta titles and descriptions. The Open Graph cards were regenerated with a wrapped headline (`scripts/images.ts` `wrapWords`).
- **Accessibility.**
  - Body text is 18 px.
  - Leads are capped below 75ch.
  - Focus is visible on the new controls.
  - e2e touch-target checks cover the signup, WhatsApp, video link and animation toggle.
- **Docs.** `docs/LANDING.md` was updated: pages table, CTA rule, animations, video and legal footnote.

## Assumptions

- **Contract terms:**
  - No minimum term (sem fidelidade).
  - Nothing is charged automatically after the 30-day trial, because payments are P1.
  - Data is kept for 90 days after cancelling.
  - Support is in Portuguese during business hours by WhatsApp and e-mail.

  All four need business confirmation.
- No looping animation is longer than 5 s, but they loop indefinitely, so every looping animation gets the pause control (WCAG 2.2.2).
- **Animation choices:**
  - Job 2 on Recursos uses `rental-handover`.
  - The mission section uses `office-live`.
- **Video poster:** optional, at `/video/agrorende-demo-pt-BR.jpg`.
- Running `pnpm images` also re-rendered the favicons from `assets/logo.svg` with differences. Those four icon files were restored to the committed version; only `public/og/*.png` were kept.

## Gaps

- The demo video files do not exist yet, so Recursos shows the "em breve" fallback until `public/video/agrorende-demo-pt-BR.{mp4,vtt}` are added and the site is rebuilt.
- `Picture.tsx` and the hero and feature images in `public/img/` are no longer used on the pages. They were kept because the hero image feeds the Open Graph cards; they can be removed in a cleanup.
- Legal review of the privacy policy, terms and DPA is still pending.
- `apps/landing/next-env.d.ts` shows as modified, because `next build` and `next dev` rewrite it. It was left as is.

## Validation

| Command | Result |
|---|---|
| `pnpm check:only landing` | passed |
| `pnpm i18n:check` | passed |
| `cd apps/landing && SITE_URL=http://localhost:3191 pnpm build` | passed |
| `cd apps/landing && pnpm e2e` | 72 passed; 0 broken links |

Screenshots of home, recursos and planos (light and dark, 1280 and 390 px) are in `.data/reviews/landing-sell/`.

## Error cases added

None.
