# MOTION — `@agrorende/motion` Lottie animations

## Status

Done. `pnpm --filter @agrorende/motion build:lottie` and `pnpm check:only @agrorende/motion` (lint, typecheck, 113 tests) pass.

## What was done

- A small typed DSL (`src/lottie/builder.ts`) that emits Lottie (bodymovin 5.7.4) JSON: shape layers, groups, rectangles, ellipses, paths from points (polyline, Catmull-Rom smoothing, arcs), strokes with round caps and joins, fills, trim paths, transforms, and keyframed opacity, position, scale, rotation and colour with ease-in-out, ease-out, overshoot and hold easing. Strict TypeScript, no `any`. Colours are typed to the Campo claro palette only.
- Fourteen original, hand-authored animations, one file each in `src/animations/`, sharing parts (tractor, phone, check badge, checkbox, key, person, cloud, leaf) from `src/animations/parts.ts`.
- A deterministic generator (`src/generate.ts`) that writes the committed artefacts `lottie/<id>.json`.
- A public API in `src/index.ts`: `ANIMATION_IDS`, `AnimationId`, `MotionMeta`, `motionMeta`, `LottieJson`, eager `animations` (static JSON imports for Metro) and lazy `loadAnimation(id)` (static switch of dynamic imports for Next.js and Turbopack). The package also exports `./lottie/*.json`.
- Tests (`test/motion.test.ts`): determinism against a fresh generation, basic schema, 2–5 s duration, metadata consistency, palette-only colours (static and animated fills and strokes), size under 40 KB, poster frame inside `[ip, op)`, loop flags, and lazy loading; the builder palette is cross-checked against `@agrorende/design-tokens`.
- A visual check: every animation was rendered with lottie-web (SVG renderer) in headless Chromium at six frames each, and the weak ones were fixed (tractor contrast on the welcome field, viewfinder and offline-bars sizing in report-offline, leaf size in empty, checklist alignment in rental-handover). The temporary scripts and screenshots were deleted.

## Animations

| id | loop | poster frame | duration | size | bytes |
|---|---|---|---|---|---|
| welcome | no | 119 | 4.0 s | 800×500 | 19325 |
| report-offline | yes | 62 | 5.0 s | 512×512 | 31096 |
| flow-loop | yes | 0 | 5.0 s | 512×512 | 9656 |
| machine-cost | yes | 80 | 4.0 s | 512×512 | 18900 |
| office-live | yes | 90 | 5.0 s | 512×512 | 14496 |
| invite-team | no | 119 | 4.0 s | 512×512 | 10370 |
| first-machine | no | 89 | 3.0 s | 512×512 | 13044 |
| first-work-order | no | 104 | 3.5 s | 512×512 | 9659 |
| signature | no | 104 | 3.5 s | 512×512 | 10997 |
| success | no | 59 | 2.0 s | 512×512 | 12226 |
| empty | yes | 0 | 4.0 s | 512×512 | 5903 |
| saved-on-phone | yes | 90 | 4.0 s | 512×512 | 6491 |
| rental-handover | no | 119 | 4.0 s | 512×512 | 16017 |
| loading | yes | 40 | 2.7 s | 512×512 | 3489 |

## Files

- `packages/motion/AGENTS.md`
- `packages/motion/package.json` (added `sideEffects`, the `./lottie/*.json` export and `files`)
- `packages/motion/src/index.ts`, `src/meta.ts`, `src/generate.ts`
- `packages/motion/src/lottie/builder.ts`, `src/lottie/types.ts`
- `packages/motion/src/animations/parts.ts`, `src/animations/registry.ts`, `src/animations/<id>.ts` (14 files)
- `packages/motion/lottie/<id>.json` (14 generated files)
- `packages/motion/test/motion.test.ts`

## How to add an animation

1. Add the id to `ANIMATION_IDS` and its entry to `src/meta.ts`.
2. Create `src/animations/<id>.ts` with a builder that returns `composition(...)`, using only `palette` colours and no text.
3. Register the builder in `src/animations/registry.ts`.
4. Add the static JSON import, the `animations` entry and the `loadAnimation` case in `src/index.ts`.
5. Add the expected loop flag in `test/motion.test.ts`.
6. Run `pnpm --filter @agrorende/motion build:lottie`, then `pnpm check:only @agrorende/motion`.

## Assumptions

- `loading` uses the same 512×512 canvas as the other square animations; it is small in bytes, and consumers scale it down.
- `welcome` uses an 800×500 hero canvas; all others are 512×512.
- In `welcome` the tractor is terra-600 so that it stands out against the green field.
- `motionMeta` and `MotionMeta` live in `src/meta.ts` and are re-exported from `src/index.ts`.

## Gaps

- Not yet rendered with `lottie-react-native` on a device or simulator; only lottie-web (SVG) was checked visually.
- Contrast on a dark theme was not checked; the animations assume a light surface.
- No consumer wiring yet: the landing site, the admin web app and the mobile app still have to import the package (owned by other tasks).

## Error cases added

None.
