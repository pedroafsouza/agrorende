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
| Admin web (`apps/web`) and public site (`apps/site`) | `frontend-design` plus `playwright-cli` |
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
