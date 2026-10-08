# Agent instructions

Read `docs/ARCHITECTURE.md`, `docs/DELIVERY-PLAN.md`, this task's section in `docs/TASKS.md`, and the relevant `docs/ERRORS.md` entries before editing this area.

Use exact architecture names for packages, files, models, enums, mutation names, events, routes, environment variables, and error codes. Stay inside the ownership map in `docs/DELIVERY-PLAN.md` §3. If a change is needed outside this area, write a change request instead of editing that file.

Run the narrowest relevant validation before reporting completion. Use full prose in committed files; caveman voice is only for chat and review reports.

This app owns the Expo mobile shell and route tree according to the delivery-plan ownership map. Expo MCP is local-only; cloud agents do not use it.
