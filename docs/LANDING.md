# AgroRende landing site

The public landing site lives in `apps/landing` (package `landing`; it was called `apps/site` until October 2026). It is the marketing, pricing, help and legal surface of AgroRende at `https://agrorende.com.br`, and the target of every "Learn more" link in the mobile and web apps (`helpUrl(code, locale)` from `@agrorende/i18n`). This document covers how it is built, where its content comes from, what is still pending before launch and which dependencies it brought in. ARCHITECTURE §22 is the normative description; this file is the working guide.

## 1. What the site is

- **Static export.** `next.config.ts` sets `output: "export"`. `pnpm --filter landing build` runs `next build --webpack` and then `scripts/postbuild.ts`, and the result in `apps/landing/out/` is plain HTML, CSS, JavaScript, fonts and images. There are no API routes, no middleware, no server actions, no cookies, no analytics and no third-party requests. Playwright fails the build in CI if any page makes a cross-origin request, logs a console error or sets a cookie.
- **Two locales, prefixed paths.** Portuguese lives under `/pt-br/` and English under `/en/`. The route table in `src/lib/routes.ts` is the single source of every path, and the language switch in the header maps each page to its counterpart.
- **Campo claro.** The visual direction is ARCHITECTURE §3.7: the one palette from `@agrorende/design-tokens`, 48 px minimum touch targets, outdoor contrast in light and dark mode, and an icon together with text on every action. The pages are white by default whatever the operating system prefers; the "Dark mode" button in the header switches to the dark theme, and that choice is the only thing the site stores (`agrorende.landing.theme` in localStorage, never a cookie). Where the `frontend-design` skill suggested something else, §3.7 won.

### 1.1 Pages

| Page | Portuguese | English | Notes |
|---|---|---|---|
| Home | `/pt-br/` | `/en/` | Seven sections: hero, today versus with AgroRende, how it works in three steps, works without signal, mission, buyer FAQ, final CTA. JSON-LD: Organization, SoftwareApplication, FAQPage (buyer questions). |
| Features | `/pt-br/recursos/` | `/en/features/` | Product video (`#video`), one block per job (field report, proof of work, machine cost), then the modules in brief. |
| Pricing | `/pt-br/planos/` | `/en/pricing/` | Numeric prices only with `SITE_SHOW_PRICES=true`; otherwise a "Pedir uma proposta" card that opens WhatsApp. With prices shown, an example line for a team of five technicians. |
| Help | `/pt-br/ajuda/` | `/en/help/` | WhatsApp and e-mail first, then common questions; the searchable error-code index sits in a collapsed `<details id="codigos">`, opened automatically by `?q=` or `#codigos`. |
| Error help | `/pt-br/ajuda/erros/<code-kebab>/` | `/en/help/errors/<code-kebab>/` | One page per code in `ERROR_META`, 188 per locale. |
| Unknown code | `/pt-br/ajuda/erros/codigo-desconhecido/` | `/en/help/errors/unknown-code/` | EC-SITE-07; `noindex`. |
| Privacy policy | `/pt-br/privacidade/` | `/en/privacy/` | Legal-review marker and terms version. |
| Terms of use | `/pt-br/termos/` | `/en/terms/` | Legal-review marker and terms version. |
| DPA | `/pt-br/dpa/` | `/en/dpa/` | Legal-review marker and terms version. |
| Account deletion | `/pt-br/excluir-conta/` | `/en/delete-account/` | SITE-10; the steps in the app plus the e-mail route. |
| Not found | `/pt-br/404/` (also `/404.html`) | `/en/404/` | EC-SITE-02; `noindex`. |

`/` has no page of its own: Caddy redirects it by `Accept-Language`, and `out/index.html` is a fallback that sends the visitor to `/pt-br/` with a meta refresh when a host serves the files without that rule.

### 1.2 Configuration

Everything is read at build time by `src/lib/config.ts`; changing a value means rebuilding the site.

| Variable | Default | Effect |
|---|---|---|
| `SITE_URL` | `https://agrorende.com.br` | Origin of canonical, `hreflang`, Open Graph and sitemap URLs. |
| `APP_URL` | `https://app.agrorende.com.br` | Target of the only primary CTA, "Testar grátis por 30 dias" (`APP_URL/signup`) and "Entrar" (`APP_URL/login`). |
| `SITE_SHOW_PRICES` | off | `true` shows the numeric price on the pricing page. |
| `SITE_WHATSAPP`, then `PLATFORM_SUPPORT_WHATSAPP` | `+5511999999999` | Public WhatsApp number for `wa.me` links and the copy panel. The default is a placeholder. |
| `SITE_CONTACT_EMAIL` | `contato@agrorende.com.br` | Public contact address. |
| `SITE_PRIVACY_EMAIL` | `privacidade@agrorende.com.br` | Data-protection contact shown on the legal pages. |
| `SITE_APP_STORE_URL`, `SITE_PLAY_STORE_URL` | unset | Store badges appear only when the matching URL is set. |
| `TERMS_VERSION` | `2026-10-08` | Version marker printed on the three legal pages; keep it equal to the web app's value. |

`deploy.yml` builds the site on the runner with `SITE_URL=https://${{ vars.SITE_HOST }}` and `APP_URL=https://${{ vars.APP_HOST }}`, so staging links point at staging, and passes the optional variables above from the GitHub environment.

## 2. Content notes

- **Copy.** Every interface string is an ICU message in `apps/landing/messages/pt-BR/site.json` and `apps/landing/messages/en/site.json`, checked by `pnpm i18n:check` and by `src/i18n/messages.test.ts`. Portuguese is the source language; English is a faithful translation, not a rewrite.
- **Legal texts.** The privacy policy, terms of use and DPA are typed content in `apps/landing/content/<locale>/{privacy,terms,dpa}.ts`, so headings and anchors are checked by the compiler and the same structure exists in both locales.
- **Error help pages** are generated from `ERROR_META` in `@agrorende/contracts/errors` and the `errors` namespace of `@agrorende/i18n`: title, body, action, the optional `help` copy, the recovery patterns and the EC entries of `docs/ERRORS.md`. Nothing is hand-written per code, so a new error code gets its help page on the next build. `scripts/postbuild.ts` fails the build if any code lacks a page in either locale or if `helpUrl(code, locale)` disagrees with the site route.
- **No invented proof.** There are no testimonials, customer logos, ratings or usage metrics. When real ones exist they need written permission before they go on the site.
- **Pricing.** The PRD hypothesis of R$ 149 per field user per month is in `src/views/Pricing.tsx` and only shows with `SITE_SHOW_PRICES=true`. Until pricing is confirmed the page offers a conversation instead of a number.
- **One primary CTA.** Every page offers "Testar grátis por 30 dias" (`APP_URL/signup`) as the primary action and "Falar no WhatsApp" as the only secondary one. E-mail appears only in the footer and on the help page; "Entrar" stays a quiet header link.
- **Contact without lead capture.** WhatsApp and e-mail CTAs open `wa.me` and `mailto:` links with prefilled, localized text. The site never stores or sends what the visitor writes. When the hand-off fails, a panel offers to copy the phone number, address and message (EC-SITE-03 and EC-SITE-04).

## 3. Images, fonts and screenshot sources

- **Animations.** The home and features pages use the Lottie animations from `@agrorende/motion` through `src/components/Lottie.tsx` (wrapped by the server component `Animation.tsx`). The component loads `lottie-web/build/player/lottie_light` and the animation JSON lazily in the browser, so no `unsafe-eval` is needed and the content security policy is unchanged. Each animation sits on a light rounded stage with a fixed aspect ratio from `motionMeta`, also in dark mode, because the drawings assume a light surface. Animations are decorative (`aria-hidden`); the text beside them carries the story. With `prefers-reduced-motion: reduce` the poster frame is shown and nothing plays. An IntersectionObserver plays an animation only while it is on screen, every looping animation has a 48 px pause and play button, `playOnce` animations stop after one run, lite mode loads nothing, and the player is destroyed on unmount.
- **Product video.** The features page looks for `public/video/agrorende-demo-pt-BR.mp4` at build time, with captions in `agrorende-demo-pt-BR.vtt` and an optional poster `agrorende-demo-pt-BR.jpg`. When the video exists it renders a `<video controls preload="none">` with a Portuguese captions track; until then it shows the `flow-loop` animation and "Vídeo de demonstração em breve". Adding the files and rebuilding is enough to switch.

- **Illustrations.** The hero and the five feature images (no longer shown on the pages since the Lottie animations replaced them; the hero image still feeds the Open Graph cards) are drawn placeholders in `apps/landing/assets/*.svg` in the Campo claro palette. `pnpm --filter landing images` (`scripts/images.ts`, sharp) renders them to AVIF and WebP at 640, 1024 and 1600 px in `public/img/`, writes the Open Graph cards per locale in `public/og/`, the favicon set, and `src/lib/images.generated.ts`, which the `<Picture>` component reads for sizes and placeholder colours. The outputs are committed so the build never needs sharp.
- **Product screenshots are missing.** None of the images is a real screenshot yet. `pnpm --filter landing screenshots --storage <state.json>` captures the admin web screens listed in `scripts/screenshots.ts` (attention, work orders, fuel, rentals, costs and sites, in pt-BR and en, 1600 × 1000) to `.data/site-screenshots/` when the local stack is running and a signed-in demo session is supplied; without the stack it prints the list of missing shots and exits successfully. A person then picks and crops the shots, saves them as new sources in `assets/` and reruns `images`. Mobile screenshots (field home, outbox, work-order completion) must be captured from a simulator by hand.
- **Fonts.** Geist Sans and Geist Mono (SIL Open Font License, `src/fonts/OFL.txt`) are self-hosted through `next/font/local` as variable WOFF2 files cut down to the Latin range, about 33 KB each. They were taken from the `geist` npm package 1.7.2 (`dist/fonts/geist-sans/Geist-Variable.woff2` and `dist/fonts/geist-mono/GeistMono-Variable.woff2`) and subset with fontTools:

  ```sh
  pyftsubset Geist-Variable.woff2 --flavor=woff2 --layout-features='*' \
    --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD' \
    --output-file=src/fonts/Geist-Variable-latin.woff2
  ```

  `test/fonts.test.ts` fails when any message, legal text or error copy uses a character outside the subset; regenerate the files with a wider range when that happens. Only Geist Sans is preloaded; Geist Mono loads on demand, and the error-code list on the help page uses the system monospace font so that page never waits for it.

## 4. Building, testing and serving

| Command | What it does |
|---|---|
| `pnpm dev:landing` | Development server on port 3300 (`next dev`). |
| `pnpm build:landing` or `pnpm --filter landing build` | Static export to `apps/landing/out/` plus `scripts/postbuild.ts`. |
| `pnpm --filter landing serve` | Serves `out/` on port 3301 with `scripts/serve.ts`, a small mirror of the Caddy site block: same redirects, 404 mapping, cache headers, security headers, gzip and case-sensitive paths. `--port` overrides the port. |
| `pnpm check:only site` | Lint, typecheck and unit tests (Vitest, 57 tests). |
| `pnpm --filter landing e2e` | Playwright against `out/` on port 3191 (`SITE_E2E_PORT` overrides it): smoke and axe on every page in both locales, desktop and Pixel 7, the link checker, SEO metadata, the EC-SITE journeys, JavaScript disabled and the same-origin, no-console-error and no-cookie assertions. |
| `pnpm --filter landing lhci` | Lighthouse CI (mobile, simulated throttling, three runs per page so one slow run does not fail the budget) on port 3192 with the budgets in `lighthouserc.json`; the summary is written to `.data/lhci-site/`. |

The canonical URLs are baked in at build time, so the end-to-end SEO test expects the build to use `SITE_URL=http://localhost:3191`, as CI does.

### 4.1 Continuous integration, release and deploy

- `ci.yml`, job `build`: builds the site with `SITE_URL=http://localhost:3191`, installs Chromium, runs `pnpm --filter landing e2e` and `pnpm --filter landing lhci`, and uploads the results when a step fails. Lint, typecheck and unit tests run in the `checks` job through `pnpm check`.
- `release.yml`, job `site`: builds the production site and uploads `site.tar.gz` (the contents of `apps/landing/out`) as the `site` artifact.
- `deploy.yml`: builds the site for the target environment and copies `apps/landing/out/` to `/srv/agrorende/site` with `rsync --delete`. `infra/compose/vm.yml` mounts that directory read-only at `/srv/site` in the Caddy container.

### 4.2 Caddy site block

`infra/caddy/Caddyfile` serves the site on `SITE_HOST` and redirects `www.` to the apex. The block:

- redirects `/` with `302` and `Vary: Accept-Language` to `/en/` when the first language starts with `en`, and to `/pt-br/` otherwise, keeping the query string;
- sends `Cache-Control: public, max-age=31536000, immutable` for `/_next/static/*`, one week for images, icons and fonts (their names are stable), and `no-cache` for HTML;
- adds the Content-Security-Policy (`default-src 'self'`, inline scripts and styles allowed for the static export, no frames, no third parties) and a Permissions-Policy that turns off camera, microphone and geolocation, on top of the shared security headers;
- answers 404s under `/pt-br/ajuda/erros/` and `/en/help/errors/` with the unknown-code page, other English paths with `/en/404/`, and everything else with `/404.html`. The pages themselves correct wrong-case and unsupported locale prefixes (EC-SITE-01) in the browser.

`scripts/serve.ts` mirrors this block; change both together.

## 5. Error cases

| Entry | Code | How the site handles it |
|---|---|---|
| EC-SITE-01 | `SITE_LOCALE_UNSUPPORTED` | An unknown prefix such as `/es/` gets the 404 page, whose head script moves the visitor to the same path under `/pt-br/` (or `/en/` for an English browser) with a dismissible "language not available yet" banner. Wrong-case prefixes such as `/PT-BR/` are lower-cased. Without JavaScript the 404 page links home and to help. |
| EC-SITE-02 | `SITE_PAGE_NOT_FOUND` | Localized 404 page with links to home, help and contact; HTTP status 404; `noindex`. |
| EC-SITE-03 | `WHATSAPP_UNAVAILABLE` | If the `wa.me` window is blocked or the page never loses focus, a panel offers to copy the phone number and the prefilled message, or to write an e-mail. |
| EC-SITE-04 | `MAIL_CLIENT_UNAVAILABLE` | If the `mailto:` hand-off does not happen, a panel offers to copy the address, subject and message. |
| EC-SITE-05 | `JS_DISABLED` | Every page is complete HTML. A `<noscript>` note explains that some shortcuts are simpler; the menu, FAQ and help index work as native `<details>` and links. |
| EC-SITE-06 | `SITE_SLOW_NETWORK` | Text and CTAs render first; images are lazy and sized. Save-Data, a 2G connection, `?lite=1` or a failed image switches to lite mode, which hides decorative images and shows a notice with a retry. |
| EC-SITE-07 | `SITE_ERROR_CODE_UNKNOWN` | An unknown code path shows the unknown-code page with the code as text, a link to the help search prefilled with it and the contact options. An upper-case known code goes to its canonical page. |

## 6. Legal review

The privacy policy, terms of use and DPA are drafts written from the PRD and ARCHITECTURE (LGPD roles, data categories, retention, sub-processors, account deletion). Each page ends with a small footnote saying the text is under legal review (`data-legal-review="pending"`) and the terms version (`data-terms-version`). A lawyer must review all three texts in both languages before launch. After the review, remove the marker in `src/views/Legal.tsx` and set `TERMS_VERSION` to the reviewed version in the site build and the web app together.

## 7. Launch checklist

- [ ] Legal review of the privacy policy, terms of use and DPA in both languages; remove the pending-review marker and set `TERMS_VERSION`.
- [ ] Set the real public WhatsApp number in `SITE_WHATSAPP` or `PLATFORM_SUPPORT_WHATSAPP`, and confirm the contact and privacy addresses receive mail.
- [ ] Decide on pricing and set `SITE_SHOW_PRICES` accordingly.
- [ ] Replace the placeholder illustrations with real product screenshots (section 3) and rerun `pnpm --filter landing images`.
- [ ] Set `SITE_APP_STORE_URL` and `SITE_PLAY_STORE_URL` once the apps are published.
- [ ] Point the DNS for the apex and `www` at the VM and set `SITE_HOST` in the GitHub environments.
- [ ] After the first deploy, check `https://<host>/` redirects by language, `/sitemap.xml` and `/robots.txt` answer, and submit the sitemap to search engines.
- [ ] Run `pnpm --filter landing lhci` against the built site and confirm the budgets still pass.

## 8. Dependencies

All of these were added to `apps/landing/package.json` under the W7 R4 exception in DELIVERY-PLAN §3; no other package changed.

| Package | Version installed | Why |
|---|---|---|
| `next` | 16.3.8 | Static export. |
| `next-intl` | 4.14.9 | ICU messages and locale handling. |
| `lucide-react` | 0.561.0 | Icons next to every action label. |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.3 | Styling with the design tokens. |
| `@playwright/test` | 1.64.0 | End-to-end checks. |
| `@axe-core/playwright` | 4.13.0 | Accessibility checks. |
| `@lhci/cli` | 0.15.1 | Lighthouse CI budgets. |
| `sharp` | 0.35.5 | `scripts/images.ts` (development only). |
| `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@types/react-dom` | as locked | Component tests. |

The `geist` package was tried for fonts and then removed in favour of the subset files in `src/fonts/`. Installing `@lhci/cli` added `socks` to the lockfile, which pnpm records as a peer of the existing `mongodb@7.7.0` entry (`mongodb@7.7.0(socks@2.8.10)`); the `mongodb` version did not change.
