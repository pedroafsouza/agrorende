# Agent instructions

Read `docs/ARCHITECTURE.md`, `docs/DELIVERY-PLAN.md`, this task's section in `docs/TASKS.md`, and the relevant `docs/ERRORS.md` entries before editing this area.

Use exact architecture names for packages, files, models, enums, mutation names, events, routes, environment variables, and error codes. Stay inside the ownership map in `docs/DELIVERY-PLAN.md` §3. If a change is needed outside this area, write a change request instead of editing that file.

Run the narrowest relevant validation before reporting completion. Use full prose in committed files; caveman voice is only for chat and review reports.

This app owns the Next.js web shell and API routes according to the delivery-plan ownership map. Keep `output: "standalone"` and environment behavior aligned with `APP_ENV`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
