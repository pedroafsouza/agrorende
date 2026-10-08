# AgroRende

AgroRende is a pnpm 11 monorepo for the farm operations platform described in the normative documents under `docs/`.

## Prerequisites

- Node 24, matching `.node-version` and `engines.node`.
- pnpm 11.0.9 through Corepack or a global install.
- Docker with Compose v2.
- Xcode, Android Studio, and JDK 17 when working on the Expo mobile app.

## Current state

The repository is at the end of wave W1: task T00 (agent toolkit) and task T01 (foundation)
are committed. Everything compiles, migrates, seeds and boots, but nothing is a feature yet —
every route, screen and module is a placeholder that a later task fills in.

Read `docs/progress/T01.md` for the full picture: what was built, the assumptions taken, and
the open gaps. The one item that blocks continuing on another machine is described below.

### Blocked: `pnpm-lock.yaml` is missing and must be generated once

**The lockfile is deliberately not committed.** It has to be generated on a machine with
direct access to `https://registry.npmjs.org`, and then committed.

On the machine where T01 was built, npmjs was unreachable. Every request failed during the
TLS handshake:

```text
curl -sS https://registry.npmjs.org/
curl: (35) Recv failure: Socket is not connected

pnpm install
[ERR_PNPM_META_FETCH_FAIL] GET https://registry.npmjs.org/date-fns-tz: fetch failed
```

The workspace was installed through an internal mirror so that T01 could be verified. That
produces a lockfile whose entries carry non-npmjs tarball URLs and `sha1-` integrity hashes,
which would fail `pnpm install --frozen-lockfile` for everyone else and in CI. Committing it
would have broken the build rather than unblocked it, so it was left out.

To unblock the repository, on a machine with normal npm access:

```bash
rm -f pnpm-lock.yaml
pnpm install
pnpm check
git add pnpm-lock.yaml && git commit -m "chore: add pnpm lockfile"
```

The package manifests already pin the intended versions, so this only records resolutions —
it does not change which versions the workspace uses. Until the lockfile is committed, the
three `pnpm install --frozen-lockfile` steps in `.github/workflows/ci.yml` and
`.github/workflows/copilot-setup-steps.yml` cannot run, so CI stays red.

### Other things a human still has to do

- Trust this folder in Copilot CLI, then run `/mcp` once to authenticate Expo interactively.
  Agents never log in to Expo or write credentials into the repository.
- Log in to EAS and build a dev client before any mobile simulator work. `pnpm devloop --check`
  currently warns `EAS CLI: not logged in or not installed` and `Dev client: no
  apps/mobile/android or apps/mobile/ios project found`. Both are expected at this stage.
- Set the repository variable `ENABLE_E2E` to `true` when T11 lands; the `e2e` job in
  `ci.yml` is gated on it.

## First run

```bash
corepack enable
pnpm install
pnpm dev:setup
```

`pnpm dev:setup` copies `.env.example` to `.env` when it is missing, starts Docker Compose services, runs migrations, initializes local media storage, seeds the database, and seeds placeholder media.

## Local stack

Start infrastructure only:

```bash
docker compose up -d --wait mongo redis oidc-mock
```

Start the application services:

```bash
pnpm dev
```

Default local ports:

- Web and API: `http://localhost:3000`
- Realtime: `http://localhost:4001`
- Worker health: `http://localhost:4002`
- Mock OAuth2 server: `http://localhost:4003`
- MongoDB: `localhost:27017`
- Redis: `localhost:6379`

Run the mobile dev client:

```bash
pnpm devloop --lan
pnpm dev:mobile
```

Run the local readiness check:

```bash
pnpm devloop --check
```

## Data and seed

Reset and seed local data with:

```bash
pnpm db:reset
pnpm storage:seed
```

Seed and reset commands refuse to run when `APP_ENV=production`. Seed media is generated under `MEDIA_ROOT`, normally `./.data/media`.

## Validation

```bash
pnpm check
pnpm i18n:check
pnpm --filter web build
pnpm devloop --check
```

Use `pnpm check:only <filters>` for focused checks before a pull request.

## Repository layout

```text
apps/web        Next.js web app and API routes
apps/mobile     Expo mobile app
apps/realtime   Socket.IO realtime service
apps/worker     Background worker and scheduled jobs
packages/config Shared ESLint, Prettier, and TypeScript configuration
packages/contracts Shared DTOs, schemas, state machines, errors, and seam types
packages/db     MongoDB driver wrapper, schemas, migrations, indexes, tests, and seed
packages/core   Domain kernel, module seams, jobs, storage, events, and activity
packages/i18n   Locale registry, ICU helpers, pseudo-locale, and help URLs
packages/design-tokens Shared Campo claro design tokens
packages/api-client Generated or hand-written client package for API consumers
scripts         Dev loop, checks, setup, i18n validation, and smoke entry points
```

## Normative documents

- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/DELIVERY-PLAN.md`
- `docs/TASKS.md`
- `docs/ERRORS.md`
- `docs/LANDSCAPE.md`

These files are read-only for implementation agents unless a task explicitly says otherwise.
