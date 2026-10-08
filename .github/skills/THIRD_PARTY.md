# Third-party vendored skills

The ten skills under `.github/skills/` are vendored copies of upstream agent skills. Each
folder was copied whole (`SKILL.md` plus any `references/`, `scripts/` and `assets/`
contents) from the source repository's default branch at the pinned commit SHA recorded
below, and each folder carries the license of its source project.

These folders are read-only vendored code. Do not edit them by hand: change the pinned
SHA and re-vendor instead, so that the copy always matches an auditable upstream commit.

## Pinned sources

| Skill | Source repository | Source path | Commit SHA | License | Used for |
|---|---|---|---|---|---|
| `caveman` | `JuliusBrussee/caveman` | `skills/caveman` | `2e08b9177c07bb7249a8a2d1a6758e5db281d002` | Apache-2.0 | Chat voice of every agent and of every subagent report to the orchestrator |
| `caveman-review` | `JuliusBrussee/caveman` | `skills/caveman-review` | `2e08b9177c07bb7249a8a2d1a6758e5db281d002` | Apache-2.0 | One-line format for review findings (`ui-reviewer`, `pr-review`, wave gates) |
| `frontend-design` | `anthropics/skills` | `skills/frontend-design` | `683bc88e56f3e09ba94f7055977f3d3aa499f202` | Apache-2.0 (`LICENSE.txt`) | Visual work on the public site, the admin web app and the mobile app |
| `playwright-cli` | `microsoft/playwright-cli` | `skills/playwright-cli` | `b85c7a736bb473bf55b584e54a09ffa698d6d871` | Apache-2.0 | Screenshot-driven review of web and site pages |
| `expo-router` | `expo/skills` | `plugins/expo/skills/expo-router` | `d4f484024fec15196bfd3c272e953e3f983972cf` | MIT (`plugins/expo/LICENSE`) | Mobile navigation and route structure |
| `expo-native-ui` | `expo/skills` | `plugins/expo/skills/expo-native-ui` | `d4f484024fec15196bfd3c272e953e3f983972cf` | MIT (`plugins/expo/LICENSE`) | Native mobile UI components and platform behavior |
| `expo-design-system` | `expo/skills` | `plugins/expo/skills/expo-design-system` | `d4f484024fec15196bfd3c272e953e3f983972cf` | MIT (`plugins/expo/LICENSE`) | Mobile design tokens and UI-kit structure |
| `expo-animation` | `expo/skills` | `plugins/expo/skills/expo-animation` | `d4f484024fec15196bfd3c272e953e3f983972cf` | MIT (`plugins/expo/LICENSE`) | Reanimated and Gesture Handler motion work |
| `expo-data-fetching` | `expo/skills` | `plugins/expo/skills/expo-data-fetching` | `d4f484024fec15196bfd3c272e953e3f983972cf` | MIT (`plugins/expo/LICENSE`) | Mobile data loading and caching patterns |
| `expo-project-structure` | `expo/skills` | `plugins/expo/skills/expo-project-structure` | `d4f484024fec15196bfd3c272e953e3f983972cf` | MIT (`plugins/expo/LICENSE`) | Expo app layout and configuration conventions |

The six Expo skills have no license file of their own upstream, so `plugins/expo/LICENSE`
(MIT) was copied into each of their folders as `LICENSE`. `frontend-design` keeps its
upstream `LICENSE.txt`. `caveman`, `caveman-review` and `playwright-cli` receive the
Apache-2.0 `LICENSE` file of their source repository.

## Precedence

Vendored skills advise; they never override the project specification. ARCHITECTURE §3.7
"Campo claro" (48 dp minimum touch targets, outdoor contrast, icon plus text, a single
palette) overrides any aesthetic suggestion coming from `frontend-design` or from the Expo
skills in the field app.

## Update steps

1. Find the new upstream commit for the source you want to move, for example:

   ```bash
   git ls-remote https://github.com/expo/skills HEAD
   ```

2. Re-run the vendoring script with the new SHA, leaving the other sources pinned:

   ```bash
   EXPO_SHA=<new sha> ./scripts/vendor-skills.sh
   ```

   The script accepts `CAVEMAN_SHA`, `ANTHROPIC_SHA`, `PLAYWRIGHT_SHA` and `EXPO_SHA`.

3. Review the resulting diff before staging it. Check that no upstream change introduces
   credentials, network calls to unexpected hosts, or guidance that contradicts
   ARCHITECTURE §3.7.
4. Confirm every skill folder still contains `SKILL.md` with `name` and `description`
   frontmatter and a license file.
5. Update the SHA column of the table above (and the root `THIRD_PARTY.md` once T01
   creates it) with the new commit and the date of the update.
6. Run the skill smoke checks: load the updated skill in Copilot CLI and confirm it still
   resolves, then commit the vendored change on its own.
