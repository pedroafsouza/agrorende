# Agent instructions

Read `docs/ARCHITECTURE.md` (especially §3.7 "Campo claro"), `docs/DELIVERY-PLAN.md`, and the relevant `docs/TASKS.md` and `docs/ERRORS.md` entries before editing this area.

Use exact architecture names. This package owns `packages/motion/**` only. If a change is needed outside this folder (for example wiring an animation into an app screen), write a change request instead of editing that file.

## Rules

- The files in `lottie/` are generated artefacts. Never edit them by hand. Change the builder in `src/animations/<id>.ts` and run `pnpm --filter @agrorende/motion build:lottie`, then commit the regenerated JSON together with the source change.
- Every animation is original and hand-authored with the typed DSL in `src/lottie/builder.ts`. Do not download, trace or paste third-party Lottie files or other assets, and do not use the network.
- Use only the colours in `palette` (the Campo claro palette, plus white). No gradients, no text inside animations (text stays in translated UI copy), transparent background, flat geometric shapes with thick rounded strokes.
- Keep each animation at 30 fps, 2–5 seconds and under 40 KB. Looping animations must loop seamlessly, and every animation needs a meaningful still `posterFrame` for reduced-motion users.
- Generation must be deterministic: no `Math.random`, dates or environment-dependent values.

## Adding an animation

1. Add the id to `ANIMATION_IDS` and its entry (loop, poster frame, frames, size) to `src/meta.ts`.
2. Create `src/animations/<id>.ts` exporting a builder that returns `composition(...)`.
3. Register the builder in `src/animations/registry.ts`.
4. Add the static JSON import, the `animations` entry and the `loadAnimation` switch case in `src/index.ts`.
5. Add the expected loop flag in `test/motion.test.ts`.
6. Run `pnpm --filter @agrorende/motion build:lottie` and `pnpm check:only @agrorende/motion`.

Run the narrowest relevant validation before reporting completion. Use full prose in committed files; caveman voice is only for chat and review reports.

This package owns the product explainer and first-run Lottie animations, their generator, their metadata and their loaders for the landing site, the admin web app and the mobile app.
