# AgroRende

AgroRende is a pnpm 11 monorepo for the farm operations platform described in the normative documents under `docs/`.

## Prerequisites

- Node 24, matching `.node-version` and `engines.node`.
- pnpm 11.0.9 through Corepack or a global install.
- Docker with Compose v2.
- Xcode, Android Studio, and JDK 17 when working on the Expo mobile app.

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
