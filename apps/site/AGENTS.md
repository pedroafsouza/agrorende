# Agent instructions

Read `docs/ARCHITECTURE.md` (§3.7 "Campo claro" and §22 for the site), `docs/DELIVERY-PLAN.md`, the T19 section of `docs/TASKS.md`, the EC-SITE entries of `docs/ERRORS.md` and `docs/SITE.md` before editing this app.

This app is the public marketing and help site. It is a static export (`output: "export"`): there is no server, no API route, no middleware, no cookies, no analytics and no third-party request. Every page exists in `pt-br` and `en`, every string comes from `messages/<locale>/site.json` (or the shared error catalogue for the help pages), and every route is listed in `src/lib/routes.ts`.

Rules that are easy to break:

- Inline scripts must never change text that React renders, because React hydrates the whole document and a mismatch wipes the change. Use a client component instead; attributes on `<html>` are the only exception.
- Every new request must stay same-origin. The Playwright suite fails on any cross-origin request, any console error and any cookie.
- Keep the error-code list on the help page compact: it is the heaviest page and sits close to the 2.5 s LCP budget.
- Fonts are Latin subsets in `src/fonts/`; when new copy needs a glyph outside the subset, `test/fonts.test.ts` fails and `docs/SITE.md` explains how to regenerate the files.

Validation, from the repository root:

| Command | What it proves |
|---|---|
| `pnpm check:only site` | Lint, typecheck and unit tests. |
| `pnpm --filter site build` | Static export plus `scripts/postbuild.ts` (root redirect page, `404.html`, payload cleanup, error-code coverage check). |
| `pnpm --filter site e2e` | Playwright smoke, axe, link checker, recovery and CTA journeys against `out/` on port 3191. |
| `pnpm --filter site lhci` | Lighthouse CI budgets against `out/` on port 3192. |

Use full prose in committed files; caveman voice is only for chat and review reports.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->
