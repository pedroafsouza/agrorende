# Agent instructions

Read `docs/ARCHITECTURE.md`, `docs/DELIVERY-PLAN.md`, this task's section in `docs/TASKS.md`, and the relevant `docs/ERRORS.md` entries before editing this area.

Use exact architecture names for packages, files, models, enums, mutation names, events, routes, environment variables, and error codes. Stay inside the ownership map in `docs/DELIVERY-PLAN.md` §3. If a change is needed outside this area, write a change request instead of editing that file.

Run the narrowest relevant validation before reporting completion. Use full prose in committed files; caveman voice is only for chat and review reports.

This package is the only place that may use the official `mongodb` driver or raw collection access. Keep migrations, indexes, schemas, testing helpers, factories, and seed data deterministic.
