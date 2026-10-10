# AgroRende — Copilot instructions

<!--
  Agent toolkit block (T00, wave 0).
  Later tasks add build instructions around this block and keep it intact.
-->

## Agent toolkit

This repository ships its own agent toolkit: vendored skills in `.github/skills/`, the
read-only `ui-reviewer` agent in `.github/agents/`, and a single MCP server in `.mcp.json`.

### Chat voice

- Every agent — the orchestrator, every subagent and `ui-reviewer` — replies in caveman
  voice, using the `caveman` skill. Terse, answer first, no ceremony, every technical fact
  kept.
- A subagent's final reply to the orchestrator is a terse caveman report: status, gaps,
  change requests, failing commands quoted verbatim, and the path of its progress file.
  This keeps subagent reports from filling the orchestrator's context.
- Code, commands, paths, errors and tables stay verbatim inside caveman replies. Never
  compress a command, a file path, an error message or a number.
- Review findings — from `ui-reviewer`, from `pr-review` and from wave gates — use the
  `caveman-review` one-line format:

  ```
  <path or screen>:<line or state>: <severity> <problem>. <fix>.
  ```

- **Caveman never applies to other file content.** Source code, comments, documentation,
  progress files, change requests, commit messages, pull request text and all user-facing
  copy are written in full, ordinary prose.

### Skill map

| Work | Skills to load |
|---|---|
| Mobile UI (`apps/mobile`) | `expo-router`, `expo-native-ui`, `expo-design-system`, `expo-animation`, `expo-data-fetching`, `expo-project-structure`, plus `frontend-design` |
| Admin web (`apps/web`) and public site (`apps/landing`) | `frontend-design` plus `playwright-cli` |
| Any chat reply | `caveman` |
| Any review finding | `caveman-review` |

`docs/ARCHITECTURE.md` §3.7 "Campo claro" overrides every aesthetic suggestion a skill
makes: 48 dp minimum touch targets, outdoor contrast, icon together with text, and the one
palette defined there. When a skill and §3.7 disagree, §3.7 wins.

### Visual checks

- Use the `playwright-cli` skill for screenshots of the admin web app and the public site.
  `@playwright/test` remains the end-to-end test runner; the CLI skill is for review only.
- Use the Expo MCP server for mobile screenshots, taps and the view hierarchy, and only
  when a simulator is running with Metro started by `pnpm devloop --mobile --mcp`.
- The read-only `ui-reviewer` agent (`.github/agents/ui-reviewer.agent.md`) performs the
  reviews. It writes findings to `docs/reviews/<TASK>-ui.md`, one line per finding in the
  `caveman-review` format, and screenshots to `.data/reviews/`. The orchestrator runs it in
  the wave gate from wave 2 onward and sends blocking findings back to the owning task like
  a failing test.
- **Cloud agent note:** the GitHub-hosted Copilot coding agent reads the skills and agents
  in `.github/`, but it does not use the Expo MCP server, because Expo authentication is
  per developer. In the cloud, review web and site only and keep the GitHub and Playwright
  defaults.

### Folder trust and authentication

- Copilot CLI only loads `.mcp.json` after the human trusts this repository folder.
- After trusting the folder, the human runs `/mcp` once and authenticates Expo
  interactively. **Agents never log in to Expo or to any other service, never write
  credentials, tokens or authentication state into the repository, and never push.**

<!--
  Build instructions block (T01, wave 1).
  The agent toolkit block above was written by T00 and stays intact.
-->

## Build instructions

### Normative sources

`docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DELIVERY-PLAN.md`, `docs/TASKS.md` and
`docs/ERRORS.md` are the specification. They are read-only for every agent except the
tasks that `docs/DELIVERY-PLAN.md` §3 explicitly puts in charge of them. Every name that
ARCHITECTURE defines — packages, files, models, enums, mutation names, events, routes,
environment variables and error codes — is normative and must be used exactly.

Before writing code, read `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DELIVERY-PLAN.md`,
your task's section in `docs/TASKS.md` and the `docs/ERRORS.md` sections your task owns.
`docs/LANDSCAPE.md` is background and is not needed to build.

### Rules for every agent

These are the rules R1–R16 of `docs/DELIVERY-PLAN.md` §1, summarised. The plan is
authoritative where this summary is shorter.

| # | Rule |
|---|---|
| R1 | Read the specification first, and use ARCHITECTURE names exactly. |
| R2 | Stay in your lane: edit only the paths your task owns in `docs/DELIVERY-PLAN.md` §3. You may read everything, and you may always create `docs/progress/<TASK>.md` and `docs/change-requests/<TASK>-<NNN>.md`. |
| R3 | Write a change request instead of editing another owner's file. Work around the gap inside your own folder with a typed adapter and keep going. |
| R4 | Foundations are frozen after T01: no `pnpm add` or `pnpm remove`, no edits to `pnpm-lock.yaml`, `packages/db/**`, `packages/contracts/**`, the root configs or `.github/**`, apart from the explicit T18 and T19 exceptions. |
| R5 | Subagents never run state-changing git commands. The orchestrator commits once per task after the wave gate passes. |
| R6 | Use an isolated test database: set `MONGODB_DB=agrorende_<task>` and use `setupTestDb(name)` from `@agrorende/db/testing`. Media tests use `MEDIA_ROOT=.data/media-<task>`. |
| R7 | Be green before you call a task done: `pnpm check:only <filters>` for every package you touched, plus `pnpm i18n:check` when you touched translations. |
| R8 | No long-running processes in waves 2 and 3. Waves 4 and 5 may start servers and must stop them before finishing. |
| R9 | Every user-facing string is an ICU key present in every required locale (pt-BR and en). |
| R10 | Finish by writing `docs/progress/<TASK>.md` using the template in `docs/DELIVERY-PLAN.md` §7.1. |
| R11 | No silent stubs. `throw notImplemented("<name>")` is only allowed for a seam owned by another task, and everything unfinished is listed under *Gaps*. |
| R12 | Unit-test same-wave seams with `vi.mock` of that module's `service.ts`. |
| R13 | `docs/ARCHITECTURE.md` §19 conventions apply: strict TypeScript, no `any`, the four screen states, money in cents, the organisation timezone, and no personally identifying data in logs. |
| R14 | Never ask the user a question. Make a reasonable assumption, record it in the progress file and continue. |
| R15 | Public npm only. Never add a registry, a scope registry or an authentication token to `.npmrc` or to any other configuration file, and never publish a package. |
| R16 | Every error path follows `docs/ERRORS.md`: implement and test the EC entries your task owns, use the recovery kit, and never ship a dead end. New error cases go in your progress file under *Error cases added*. |

### Repository layout

The workspace is the pnpm monorepo described in `docs/ARCHITECTURE.md` §4: `apps/`
(`mobile`, `web`, `realtime`, `worker`, later `site`), `packages/` (`contracts`, `db`,
`core`, `api-client`, `i18n`, `design-tokens`, `config`), `scripts/`, `infra/` and `docs/`.

The dependency rules of `docs/ARCHITECTURE.md` §4 are enforced by ESLint and must not be
worked around:

- `packages/contracts` depends on `zod` only.
- Only `packages/db` imports the `mongodb` driver.
- `packages/core` imports `contracts` and `db`, and never imports Next.js or React, with
  the narrow exceptions listed in §4 for `jobs/**`, `modules/exports/**` and `pdf/**`.
- `apps/mobile` never imports `packages/core` or `packages/db` at runtime.

### Commands

| Command | Use |
|---|---|
| `pnpm install` | Install the workspace. The lockfile is frozen in continuous integration. |
| `pnpm dev:setup` | Start MongoDB and Redis, apply indexes and migrations, and seed the demo organisation. |
| `pnpm dev` | Run the admin web app, the realtime service and the worker together. |
| `pnpm check` | Typecheck, lint and test the whole workspace. |
| `pnpm check:only <filters>` | The same gate for the packages you touched. |
| `pnpm i18n:check` | Verify that every required locale has every key. |
| `pnpm db:seed` | Reseed the demo data. |

Node and pnpm versions are pinned by `.node-version` and by the `packageManager` field of
the root `package.json`. Use them; do not install a different toolchain.
