## Summary

Describe the change and name the task card it belongs to.

## Delivery-plan checklist

- [ ] I read `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DELIVERY-PLAN.md`, the task section in `docs/TASKS.md`, and the relevant `docs/ERRORS.md` sections.
- [ ] I edited only paths owned by this task, or I wrote a change request under `docs/change-requests/`.
- [ ] I did not add dependencies after T01, except where the delivery plan explicitly allows it.
- [ ] I used exact architecture names for packages, files, models, enums, mutation names, events, routes, env vars, and error codes.
- [ ] I kept user-facing strings as ICU keys in every required locale that this task owns.
- [ ] I followed `docs/ARCHITECTURE.md` §19 conventions: strict TypeScript, no `any`, no non-null assertions outside tests, no `console.log`, cents for money, and UTC BSON dates.
- [ ] I used an isolated test database such as `MONGODB_DB=agrorende_<task>` when tests touched MongoDB or Redis.
- [ ] I implemented recoverable error paths from `docs/ERRORS.md` and listed new proposed EC entries when needed.
- [ ] I wrote or updated `docs/progress/<TASK>.md` with tests, gaps, assumptions, and change requests.
- [ ] I ran `pnpm check:only <filters>` for touched packages or `pnpm check` for the workspace.
- [ ] I ran `pnpm i18n:check` when translations or localized copy changed.
- [ ] I did not commit secrets, local Expo login state, `.env`, or `.data/` contents.

## Validation

Paste the exact commands and decisive results.

```text

```

## Change requests and gaps

List open change requests, deferred work, or write `None`.
