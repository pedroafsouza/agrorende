# DEV-WIKI · Developer wiki (pt-BR) and business README

Status: DONE_WITH_GAPS
Wave: post-W5 (ad hoc request) · Agent finished: 2026-10-10 14:31

## Done
- Wrote the developer wiki in Brazilian Portuguese as GitHub-Wiki-compatible Markdown in
  `docs/wiki/`, with Portuguese page names:
  - `Home.md`: what AgroRende is, the three jobs, quick links, reading guide per profile and the
    normative documents.
  - `Primeiros-Passos.md`: prerequisites, clone to running admin, what `pnpm dev:setup` does,
    ports, landing, mobile dev client, Expo web preview, daily loop and common problems.
  - `Comandos-e-Scripts.md`: every root script, `pnpm devloop` flags, `pnpm simulate` and
    per-package commands.
  - `Usuarios-de-Demonstracao.md`: organisations A and B, every seeded login and its use, the
    platform console, the OIDC mock, the "Demonstração" pill, seed contents and reseeding.
  - `Stack.md`: versions per layer, read from the `package.json` files.
  - `Arquitetura.md`: monorepo map, dependency rules, offline-first sync, realtime rooms and
    events, tenancy, auth and roles, worker jobs and environments, with mermaid diagrams.
  - `Tour-pelo-Codigo.md`: "if you want to change X, look at Y" table and per-app/package folders.
  - `Testes-e-Qualidade.md`: local gate, isolated test databases, e2e stack, chaos suite, CI
    workflows, lockfile notes and UI review.
  - `Releases.md`: summary of `docs/RELEASING.md`, including the unsigned Android APK on tags and
    how to sign it.
  - `Design-System.md`: Campo claro rules, tokens, themes, brand files, Lottie motion, style guides
    and the `ui-reviewer` agent.
  - `Convencoes.md`: rules R1–R16, code conventions, errors, i18n, commits with trailer and the
    agent toolkit.
  - `Glossario.md`: pt-BR ↔ English product terms, navigation labels, roles and the words we avoid.
  - `Perguntas-Frequentes.md`: FAQ and troubleshooting.
  - `_Sidebar.md` and `_Footer.md`.
- Added `docs/wiki/README.md` with publishing instructions. This file is not published.
- Rewrote the root `README.md` in pt-BR as business-only content:
  - logo and one sentence, who it is for, the problem, the three jobs;
  - how it works (campo → escritório → custo), benefits and the high-level roadmap;
  - a "Para desenvolvedores" section that links to the wiki.
- Moved every technical detail of the old English README into the wiki: setup, labels, devloop,
  daily loop, seed logins, mobile, demo traffic, scripts, tests, ports and documentation table.
  - Coverage was checked with a script that compared every inline code token, URL and fenced
    command from `git show HEAD:README.md` against the wiki text. All 130 tokens are present;
    four exist only in translated form (`<filtros>`, `<senha>`, `<segundos>`, `<nome>`).

## Tests
- Documentation only; there are no documentation tests. Ad hoc verification scripts (inline
  Python, no files written):
  - Every `blob/main` and `tree/main` URL and every backticked repo path in `docs/wiki/*.md` and
    `README.md` exists. The only miss is `apps/mobile/ios`, a generated folder that is mentioned
    on purpose.
  - Every wiki page link targets an existing page, and every `Page#anchor` matches a heading slug.
  - Image paths in `README.md` exist.

## Assumptions
- The wiki and the README are written in pt-BR as the user requested. Code, commands and paths
  stay verbatim.
- Code links are absolute URLs to the `main` branch, because the GitHub wiki is a separate
  repository. Links show 404 for paths that are not yet merged to `main`.
- Parentheses in route-group URLs are percent-encoded (`%28admin%29`) so they survive Markdown
  link parsing.
- No product screenshots are committed. The README uses the brand logo
  (`packages/design-tokens/brand/agrorende-logo.svg`) and the landing illustrations
  (`apps/landing/assets/hero-field.svg`, `feature-f3.svg`, `feature-f4.svg`), labelled as
  illustrations.
- README business copy is taken from `docs/plans/SIMPLER-TO-SELL.md` §1 and §8, from
  `docs/PRD.md` and from the approved landing copy in `apps/landing/messages/pt-BR/site.json`.
  - No prices, discounts, guarantees or SLAs are stated. The only commercial fact is the 30-day
    trial (`TRIAL_DAYS=30` in `.env.example`).
  - "No credit card" and the pricing model are left out on purpose.
  - The roadmap carries a note that it may change.
- Release names "Primeira safra" and "Segunda safra" are cited from PRD §14.

## Gaps
- The wiki is not published. A human must enable the wiki, create the first page in the GitHub UI
  and push the pages, as described in `docs/wiki/README.md`. Agents never push (R5).
- `.github/workflows/ci.yml` (around line 46) has a stale comment: it says `pnpm-lock.yaml` is not
  committed and points to a README "Current state" section that no longer exists. The lockfile is
  committed. Suggested owner: whoever next edits `.github/**`.
- `@sentry/nextjs` is not a dependency of `apps/web`; only the mobile app has
  `@sentry/react-native`. `Stack.md` states this instead of assuming web error reporting.
- `packages/motion/src/animations/parts.ts` exists, but there is no generated `lottie/parts.json`,
  so the wiki's Lottie catalogue leaves `parts` out.
- No real UI screenshots exist in the repository. `apps/landing/scripts/screenshots.ts` can
  generate them; when it does, the README illustrations can be swapped for real captures.

## Error cases added
- None.

## Change requests
- None.

## Edits outside owned paths (T10, T11, T12 only)
- `README.md`: rewritten at the user's explicit request; this agent owns it for this task.

## Notes for the next wave
- Keep `docs/wiki/` in sync when scripts, ports, seed logins or workflows change, then republish.
- The normative specification stays in `docs/`; the wiki summarises it and the footer says so.
