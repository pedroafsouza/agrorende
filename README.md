# AgroRende

AgroRende is a field operations platform for agricultural service and equipment-rental companies in
Brazil. Field staff use an offline-first mobile app (Android and iOS) to report problems on machines,
work through repair jobs and hand rental equipment over to customers, even with no signal in the
field. The office uses a web console to dispatch technicians, watch them on a live map, verify work,
manage rentals and see what every machine costs. Each customer company is a separate organization
(tenant) with its own data, and AgroRende staff manage organizations from a platform console.

The product is specified in [`docs/PRD.md`](docs/PRD.md) and the technical design in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## How commands are labelled

Every command in this README carries one of two labels:

- **[automated-local]**: runs unattended on a developer machine. It was executed while writing this
  file, starting from a clean `pnpm dev:setup`.
- **[human]**: needs a person: a phone, an interactive sign-in, an account at Apple, Google or Expo,
  or a decision. Agents never run these steps.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 LTS | Pinned in `.node-version`. Use `fnm`, `nvm` or `volta` to switch. |
| pnpm | 11 | Pinned in the `packageManager` field of `package.json`. Enable it with `corepack enable` (or `npm i -g pnpm@11`). |
| Docker | Desktop or Engine with Compose v2 | Runs MongoDB 8 (single-node replica set), Redis 7 and a mock OpenID Connect provider for Google and Apple. |
| Xcode and CocoaPods | Current | macOS only, to build the iOS dev client. Optional if you only work on the web. |
| Android Studio and JDK 17 | Current | To build the Android dev client. Set `ANDROID_HOME`. Optional if you only work on the web. |
| Expo account | Free | Optional in development. Needed for EAS builds and EAS Update. |

At least 10 GB of free disk space is required; `pnpm devloop --check` verifies it.

## First-time setup

```bash
corepack enable          # [human] once per machine; may need sudo depending on how Node was installed
pnpm install             # [automated-local]
pnpm devloop --check     # [automated-local] read-only environment check; exits 1 when a required item fails
pnpm dev:setup           # [automated-local] see below
pnpm dev                 # [automated-local] web on :3000, realtime on :4001, worker health on :4002
```

`pnpm devloop --setup` does `pnpm install`, `pnpm devloop --lan` and `pnpm dev:setup` in one step.

`pnpm dev:setup` does the following:

1. Copies `.env.example` to `.env` when `.env` is missing. The defaults work locally as they are.
2. Starts MongoDB, Redis and the OIDC mock with `docker compose up -d` and waits until they are healthy.
3. Runs `pnpm db:migrate` (indexes and ordered data migrations).
4. Runs `pnpm storage:init` (creates the local media folders under `MEDIA_ROOT`).
5. Runs `pnpm db:seed` (the demo organizations, people, machines and jobs).
6. Runs `pnpm storage:seed` (placeholder photos for the seeded media).

Then open <http://localhost:3000> and sign in with one of the seed logins below.

## The developer loop (`pnpm devloop`)

`pnpm devloop` without flags opens an interactive menu for people. Agents and CI always use the flags.

| Command | Label | What it does |
|---|---|---|
| `pnpm devloop` | [human] | Menu with the actions below. |
| `pnpm devloop --check` | [automated-local] | Read-only check. Required items: Node 24, pnpm 11, Docker running, MongoDB healthy, Redis reachable, ports 3000/4001/4002/4003/27017/6379 free or used by our compose services, 10 GB free disk, and `.env` containing every key of `.env.example`. Warnings only: Java 17 and `ANDROID_HOME`, Xcode and CocoaPods, EAS CLI login, an installed dev client. |
| `pnpm devloop --setup` | [automated-local] | `pnpm install`, then `--lan`, then `pnpm dev:setup`. |
| `pnpm devloop --lan` | [automated-local] | Detects the machine's LAN IPv4 address, writes `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WS_URL` to `apps/mobile/.env`, and prints a QR code of the API URL. |
| `pnpm devloop --target <local\|staging>` | [automated-local] | Points the mobile `.env` at local services or at staging, to test a dev client against staging. |
| `pnpm devloop --reset` | [automated-local] | `pnpm db:reset` plus `pnpm storage:seed`. Keeps the Docker volumes. Refuses when `APP_ENV=production`. |
| `pnpm devloop --mobile <android\|ios>` | [human] | Rebuilds the dev client when the native fingerprint changed, otherwise starts Metro. Needs a phone or simulator. |
| `pnpm devloop --mobile --mcp` | [human] | Starts Metro with the Expo MCP server enabled, so local agents can take screenshots and tap in the simulator. Requires `/mcp` Expo authentication by a person. |
| `pnpm devloop --doctor` | [automated-local] | `expo-doctor`, `pnpm i18n:check`, an outdated-package summary and `pnpm audit --prod`. Needs network access. |
| `pnpm devloop --clean` | [automated-local] | Removes `apps/web/.next`, the generated `apps/mobile/android` and `apps/mobile/ios` folders and `node_modules/.cache`. Never touches Docker volumes or `.env`. |

### The daily loop

1. **First time:** `corepack enable`, then `pnpm devloop --check`, then `pnpm devloop --setup`.
2. **Every day:** `pnpm dev` for web, realtime and worker in watch mode, and `pnpm dev:mobile` for
   Metro, with the dev client open on your phone.
3. **JavaScript-only change:** Fast Refresh picks it up. **Native change** (a new Expo plugin,
   permission or native library): the fingerprint changes, so run
   `pnpm devloop --mobile android` or `pnpm devloop --mobile ios` to rebuild the dev client
   (or `eas build --profile development`).
4. **Data or index change:** `pnpm db:migrate`.
5. **Before a pull request:** `pnpm check:only "...[origin/main]"` and `pnpm i18n:check`.
6. **Production-like run:** `docker compose -f docker-compose.yml -f infra/compose/app.yml up --build`
   runs the three production images against the local infrastructure (see `docs/RELEASING.md`).

## Seed logins

Every seeded account uses the password **`agrorende123`**. The seed is deterministic and its
timestamps are relative to the moment you seed, so the demo always looks current.

**Organization A, "AgroRende Demo Agro"** (active, Ribeirão Preto region):

| Email | Person | Role | Use it for |
|---|---|---|---|
| `admin@agrorende.dev` | Ana Admin | ADMIN | Settings, team, subscription |
| `gerente@agrorende.dev` | Paulo Gerente | MANAGER | Reports and costs |
| `despacho@agrorende.dev` | Marina Despacho | MANAGER | Dispatch and the Operations Center |
| `inspetor@agrorende.dev` | Joana Inspetora | FIELD | Reporting problems in the app |
| `tecnico1@agrorende.dev` | Carlos Técnico | FIELD | Repair jobs in the app (also bound to the mock Google subject `mock-google-tecnico1`) |
| `tecnico2@agrorende.dev` | Pedro Técnico | FIELD | Simulated technician |
| `tecnico3@agrorende.dev` | Lucas Técnico | FIELD | Simulated technician |
| `locacao@agrorende.dev` | Rafael Locação | FIELD | Rental hand-overs |
| `convite@agrorende.dev` | Bruno Convidado | FIELD | Has not joined yet. Invite code `K7QM2XPA9F`, valid for 7 days after seeding. |

**Organization B, "Fazenda Boa Vista"** (on a trial that ends 5 days after seeding):
`admin@boavista.dev` (ADMIN). It exists to prove that tenants never see each other's data.

**Platform console:** <http://localhost:3000/platform/login>. Staff sign in with Google only. Locally
the page shows a "Google (mock) as…" email field; enter `staff@agrorende.dev`, which is listed in
`PLATFORM_ADMIN_EMAILS` in `.env.example`.

**Google and Apple sign-in** go to the local mock provider on port 4003. When the mock shows its
login page, type any user name and, in the claims box, a JSON object such as
`{"email":"you@example.dev","email_verified":true,"name":"Your Name"}`.
The mock is for local development only and is never deployed.

## Running the mobile app

Expo Go is **not** supported, because the app uses native modules (SQLite, background location,
camera, secure storage). You need a **dev client** build of the app.

1. **[human]** Put the phone and the computer on the same Wi-Fi network.
2. **[automated-local]** `pnpm devloop --lan` writes `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WS_URL`
   to `apps/mobile/.env`, for example `http://192.168.0.10:3000` and `http://192.168.0.10:4001`.
   On an emulator or simulator on the same machine, `http://localhost:3000` also works on iOS and
   `http://10.0.2.2:3000` on Android.
3. **[human]** Install the dev client once: `npx expo run:android` or `npx expo run:ios` from
   `apps/mobile`, or `eas build --profile development` and install the build.
4. **[human]** `pnpm dev:mobile` starts Metro. Open the AgroRende Dev app and scan the QR code.

The development variant is called "AgroRende Dev" (`app.agrorende.field.dev`, URL scheme
`agrorende-dev`), so it can sit next to the staging and store apps on the same phone.

## Demo traffic

```bash
pnpm simulate            # [automated-local] needs `pnpm dev` running
```

`pnpm simulate` signs in the seeded technicians (Carlos, Pedro, Lucas and Rafael), puts them on duty
and drives them around the Ribeirão Preto region at 40–80 km/h, so the Operations Center map moves.
When a simulated technician has an assigned job, the simulator accepts it, drives to it, starts work
with a photo, fills in the checklist and completes it. Press Ctrl-C to stop; every simulated user is
set off duty before the process exits.

| Flag | Default | Meaning |
|---|---|---|
| `--speed <n>` | `1` | Time multiplier. `--speed 20` makes a 5-minute repair take 15 seconds. |
| `--users <emails>` | the four technicians | Comma-separated list of seeded emails to simulate. |
| `--base-url <url>` | `APP_URL` or `http://localhost:3000` | Web/API server. |
| `--ws-url <url>` | `NEXT_PUBLIC_REALTIME_URL` or `http://localhost:4001` | Realtime server. If it is unreachable, positions go through the REST API instead. |
| `--password <pw>` | `SEED_PASSWORD` or `agrorende123` | Password of the simulated users. |
| `--duration <seconds>` | none | Stop by itself after this long. |
| `--help` | | Print the usage text. |

The full demo script is in [`docs/DEMO.md`](docs/DEMO.md).

## Scripts

| Script | Label | What it does |
|---|---|---|
| `pnpm dev` | [automated-local] | Web (3000), realtime (4001) and worker (health on 4002) in watch mode. |
| `pnpm dev:setup` | [automated-local] | First-time local setup (see above). |
| `pnpm dev:mobile` | [human] | Metro for the Expo dev client. |
| `pnpm dev:landing` | [automated-local] | Public website on 3300. |
| `pnpm build` / `pnpm build:landing` | [automated-local] | Production builds; `build:landing` serves the static site on 3301. |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | [automated-local] | One step of the quality gate across the workspace. |
| `pnpm check` | [automated-local] | Lint, typecheck and test everything. |
| `pnpm check:only <filters>` | [automated-local] | The same gate for selected packages, for example `pnpm check:only worker web`. |
| `pnpm i18n:check` | [automated-local] | Fails on missing or extra translation keys, invalid ICU messages, placeholder mismatches and empty strings. `--locale <x>` checks one locale. |
| `pnpm db:migrate` | [automated-local] | Ensure indexes and run data migrations. |
| `pnpm db:seed` | [automated-local] | Seed the demo data. Refuses a non-empty database unless `--force` (which clears it first) and always refuses when `APP_ENV=production`. |
| `pnpm db:reset` | [automated-local] | Drop the selected database, migrate, seed and storage-seed. |
| `pnpm db:shell` | [automated-local] | `mongosh` inside the MongoDB container. |
| `pnpm storage:init` · `pnpm storage:seed` | [automated-local] | Create the media folders; render placeholder photos for seeded media. |
| `pnpm simulate` | [automated-local] | Live demo traffic (see above). |
| `pnpm smoke` | [automated-local] | End-to-end check against running servers: health, login, a report with a photo, a realtime event, `/ops/live` and a CSV export. Accepts `--base-url` and `--ws-url`. |

## Tests

| Command | Label | Notes |
|---|---|---|
| `pnpm check` | [automated-local] | Needs MongoDB, Redis and the OIDC mock from `pnpm dev:setup`. |
| `pnpm check:only <filters>` | [automated-local] | Use `MONGODB_DB=agrorende_<name>` to keep test data apart from your dev database. |
| `pnpm i18n:check` | [automated-local] | Run whenever you touch a translation file. |
| `pnpm smoke --base-url http://localhost:3000 --ws-url http://localhost:4001` | [automated-local] | With `pnpm dev` running. |

## Ports

| Port | Service |
|---|---|
| 3000 | Office web app and REST API (`/api/v1`) |
| 4001 | Realtime (Socket.IO) |
| 4002 | Worker health |
| 4003 | Mock OIDC provider for Google and Apple (end-to-end tests use 4103) |
| 3300 · 3301 | Public site (dev · static) |
| 27017 · 6379 | MongoDB · Redis |

Every port can be moved with an environment variable: `PORT` for the web app, `REALTIME_PORT`,
`WORKER_HEALTH_PORT`, and then `APP_URL`, `NEXT_PUBLIC_REALTIME_URL` and `REALTIME_CORS_ORIGINS` to
match.

## Documentation

| Document | For |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | What the product does and why. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How it is built; every name it defines is normative. |
| [`docs/ERRORS.md`](docs/ERRORS.md) | Every error case, its code and the user's way out. |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Operating staging and production: secrets, providers, backups, restores, devices, logs. |
| [`docs/RELEASING.md`](docs/RELEASING.md) | Environments, releases and deployment. |
| [`docs/DEMO.md`](docs/DEMO.md) | The 10-minute product demo. |
| [`docs/SUPPORT.md`](docs/SUPPORT.md) | What support does for each error case, team and account help. |
| [`docs/TRANSLATING.md`](docs/TRANSLATING.md) | Adding or changing a language. |
| [`docs/DELIVERY-PLAN.md`](docs/DELIVERY-PLAN.md) · [`docs/TASKS.md`](docs/TASKS.md) | How the build is organized into tasks and waves. |
