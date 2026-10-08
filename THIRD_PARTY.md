# Third-party inventory

This inventory covers repository-level package dependencies and vendored agent skills.

Vendored agent skills are documented in `.github/skills/THIRD_PARTY.md`. Keep that file as the source of truth for the copied skill folders and their pinned upstream SHAs.

## Package-manager policy

AgroRende uses pnpm 11 with the public npm registry only. Workspace packages are private and are not published.

## Runtime and application dependencies

| Package | Version source | Used by | License |
|---|---|---|---|
| `zod` | `pnpm-workspace.yaml` catalog | `@agrorende/contracts` validation schemas | MIT |
| `mongodb` | `pnpm-workspace.yaml` catalog | MongoDB Node driver access in `@agrorende/db` | Apache-2.0 |
| `bson` | `pnpm-workspace.yaml` catalog | BSON dates, object values, and MongoDB document support | Apache-2.0 |
| `ioredis` | `pnpm-workspace.yaml` catalog | Redis access for realtime, queues, and tests | MIT |
| `jose` | `pnpm-workspace.yaml` catalog | JWT and OIDC token verification | MIT |
| `pino` | `pnpm-workspace.yaml` catalog | Structured logging in services | MIT |
| `socket.io-client` | `pnpm-workspace.yaml` catalog | Realtime client protocol support | MIT |
| `date-fns` | `pnpm-workspace.yaml` catalog | Date formatting helpers in `@agrorende/i18n` | MIT |
| `date-fns-tz` | `pnpm-workspace.yaml` catalog | Time-zone formatting helpers in `@agrorende/i18n` | MIT |
| `react` | `pnpm-workspace.yaml` catalog | Web, mobile, PDF, and UI packages | MIT |
| `react-dom` | `pnpm-workspace.yaml` catalog | Web rendering | MIT |
| `react-hook-form` | `pnpm-workspace.yaml` catalog | Web and mobile form state | MIT |
| `@hookform/resolvers` | `pnpm-workspace.yaml` catalog | Form validation adapters | MIT |
| `uuidv7` | `pnpm-workspace.yaml` catalog | UUID v7 identifier generation | Apache-2.0 |

## Development and build dependencies

| Package | Version source | Used by | License |
|---|---|---|---|
| `typescript` | `pnpm-workspace.yaml` catalog | TypeScript compiler | Apache-2.0 |
| `@types/node` | `pnpm-workspace.yaml` catalog | Node.js type declarations | MIT |
| `@types/react` | `pnpm-workspace.yaml` catalog | React type declarations | MIT |
| `vitest` | `pnpm-workspace.yaml` catalog | Unit tests | MIT |
| `tsup` | `pnpm-workspace.yaml` catalog | Package builds | MIT |
| `tsx` | `pnpm-workspace.yaml` catalog | TypeScript script runner | MIT |
| `eslint` | `pnpm-workspace.yaml` catalog | Linting | MIT |
| `@eslint/js` | `packages/config/package.json` | ESLint JavaScript presets | MIT |
| `typescript-eslint` | `packages/config/package.json` | TypeScript ESLint presets and parser | MIT |
| `eslint-plugin-i18next` | `packages/config/package.json` | User-facing string linting | ISC |
| `globals` | `packages/config/package.json` | ESLint global variable definitions | MIT |
| `prettier` | `pnpm-workspace.yaml` catalog | Formatting | MIT |
| `@playwright/cli` | root `package.json` | Browser automation CLI for agents and review | Apache-2.0 |

## Container images used in local and CI infrastructure

| Image | Source | Used by | License |
|---|---|---|---|
| `mongo:8` | Docker Hub Official Image | Local and CI MongoDB replica set | MongoDB Server Side Public License v1 |
| `redis:7` | Docker Hub Official Image | Local and CI Redis | BSD-3-Clause |
| `ghcr.io/navikt/mock-oauth2-server:2.1.10` | GitHub Container Registry | Local OAuth2 test fixture | MIT |

## Maintenance

When a package is added, removed, or moved, update this file in the same change. When vendored skills are updated, update `.github/skills/THIRD_PARTY.md` and keep this file pointing to it instead of duplicating the vendored table.
