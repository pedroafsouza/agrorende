# BRAND-MARK · AgroRende mark and logo redesign

Status: DONE_WITH_GAPS
Wave: post-W5 polish · Agent finished: 2026-10-10 13:36

## Done
- Concept exploration, scoring, construction, clear space, minimum sizes, colour variants and do/don't rules for the new "Cabeceira" mark (`docs/brand/LOGO.md`). The mark is a capital A made of two converging furrows, with the headland row as crossbar and a live-report node (white ring, Terra core) on it, replacing the gear and leaf.
- Deterministic generator rewritten (`packages/design-tokens/brand/generate.py`). Pure geometry on a 64-unit grid, a separately hinted 16-unit favicon drawing, and the wordmark outlined from Geist SemiBold with the font's own kerning. Output is byte-identical between runs. It writes `agrorende-mark.svg`, `agrorende-mark-mono.svg`, `agrorende-mark-reversed.svg`, `agrorende-favicon.svg`, `agrorende-logo.svg`, `agrorende-logo-dark.svg`, `app-icon.svg`, `adaptive-foreground.svg`, `adaptive-monochrome.svg` and `splash-icon.svg`, and regenerates `apps/web/src/components/brand/BrandLogo.tsx` with the same exports and props.
- Rasteriser updated (`apps/landing/scripts/brand.ts`): the favicon drawing is used for `icon.svg` and the 16 and 32 px `.ico` entries, and the mobile lockup PNGs are rendered at the lockup's own ratio (861 × 192, shown at 179 × 40 by `LoginScreen`). All assets were regenerated with `pnpm --filter landing brand`:
  - `apps/web/src/app/{icon.svg,favicon.ico,apple-icon.png}`
  - `apps/landing/public/{icon.svg,favicon.ico,icon-192.png,icon-512.png,apple-touch-icon.png,brand/*}`
  - `apps/mobile/assets/images/{icon,adaptive-icon,adaptive-icon-monochrome,splash-icon,logo,logo-dark}.png`
- Mobile: `LoginScreen` logo width 185 → 179 (`apps/mobile/src/auth/ui/LoginScreen.tsx`); Android 13 themed icon wired with `android.adaptiveIcon.monochromeImage` (`apps/mobile/app.config.ts`, only that key changed).
- `apps/landing/src/components/Logo.tsx`: the image width now matches the new lockup ratio (179 × 40). Props are unchanged.
- Visual review in `.data/reviews/brand/`:
  - `sheet.png` is the contact sheet. It shows the mark at 16 to 192 px on white and on #0f1a14; the favicon drawing against the master; mono and reversed variants; circle, squircle and safe-zone masks; and both lockups.
  - `sheet-gray.png` is the same sheet in greyscale.
  - Admin screenshots, sidebar expanded and collapsed, light and dark, at 1280 and 390 px.
  - Landing header screenshots, light and dark, at 1280 and 390 px.

## Tests
- `pnpm check:only mobile` → failed on other agents' uncommitted `apps/mobile/src/ui/Lottie.web.tsx` only (lint `4:52 'StyleProp' is defined but never used`, `4:68 'ViewStyle' is defined but never used`; tsc `src/ui/Lottie.web.tsx(76,13): error TS2322`). `pnpm --filter mobile test` → 37 suites, 199 tests passed; ESLint on `app.config.ts` and `src/auth` is clean.
- `pnpm check:only landing` → passed (typecheck, lint, tests, i18n).
- `pnpm check:only web` → failed. The failures are all in other agents' uncommitted work; none touch brand files:
  - Lint: `apps/web/src/features/notifications/flyout/NotificationsFlyout.test.tsx 25:46 error import() type annotations are forbidden`.
  - Typecheck: the same flyout test, and `src/features/ops/OpsCenter.tsx(233,25)` with an `onDuty` prop mismatch.
  - Vitest: 9 OpsCenter tests and the PRD §5 permissions REST test fail; 297 tests pass.
- No test, snapshot or end-to-end spec references the logo files, `BrandLogo`, `BrandMark` or the old lockup width.
- `.data/brandenv/bin/python packages/design-tokens/brand/generate.py`, run twice → identical SHA-1 for every output.

## Assumptions
- "Safe zone 66 %" is read as Android's 66 dp safe circle on the 108 dp adaptive canvas; the glyph is fitted inside it with a 6 % margin.
- The wordmark is one colour (Graphite 900 on light, white on dark, `var(--ar-text)` in the admin web app). The Terra node is the only accent; a second colour on "Rende" would compete with it.
- The favicon drawing is used for `icon.svg` in the admin web app and the site, because browsers render that file mostly at 16 to 32 px. The master drawing is used from 48 px up.
- The palette follows `docs/ARCHITECTURE.md` §3.7: Mata 600 tile, Terra 600 node and Graphite 900 wordmark. Terra on Mata is only about 1.2:1, so the node always sits in a white ring (Terra on white is about 3.6:1).
- The generator needs `fonttools` and `brotli` only to outline the wordmark. They are installed in a local virtual environment at `.data/brandenv`; no workspace dependency was added.

## Gaps
- `pnpm check:only web` and `pnpm check:only mobile` are red because of other agents' in-flight work (see Tests).

## Error cases added
- None.

## Change requests
- None.

## Edits outside owned paths (T10, T11, T12 only)
- None. Only brand files were edited: the generator, the rasteriser, the two logo components and the generated assets.

## Notes for the next wave
- Regenerate brand assets with:
  1. `.data/brandenv/bin/python packages/design-tokens/brand/generate.py`
  2. `pnpm --filter landing brand`
- Render the contact sheet with `node .data/brand-scratch/final-sheet.mjs`.
- Never hand-edit the SVGs, the PNGs or `BrandLogo.tsx`.
