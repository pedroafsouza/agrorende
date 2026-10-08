#!/usr/bin/env bash
#
# vendor-skills.sh - re-vendor the 10 pinned agent skills of ARCHITECTURE section 4.3
# into .github/skills/<name>/.
#
# Each skill folder is copied whole (SKILL.md plus any references/, scripts/, assets/)
# from the source repository at a pinned commit SHA, and the upstream license file is
# copied into the skill folder when the folder does not carry its own license.
#
# Requirements: git and a network connection. The repository has no package manifest in
# wave 0, so this script uses git only; any optional tooling must be run with
# `npx` or `pnpm dlx`.
#
# SHA inputs
# ----------
# The four source SHAs are the only inputs. Override them per run with environment
# variables, or edit the defaults below after reviewing the upstream diff:
#
#   CAVEMAN_SHA        JuliusBrussee/caveman      (caveman, caveman-review)
#   ANTHROPIC_SHA      anthropics/skills          (frontend-design)
#   PLAYWRIGHT_SHA     microsoft/playwright-cli   (playwright-cli)
#   EXPO_SHA           expo/skills                (the six expo-* skills)
#
# Find the current SHA of a source with:
#
#   git ls-remote https://github.com/expo/skills HEAD
#
# Example:
#
#   EXPO_SHA=<new sha> ./scripts/vendor-skills.sh
#
# After running: review the diff, confirm every skill folder still has SKILL.md and a
# license file, then update the SHA table in .github/skills/THIRD_PARTY.md.

set -euo pipefail

CAVEMAN_SHA="${CAVEMAN_SHA:-2e08b9177c07bb7249a8a2d1a6758e5db281d002}"
ANTHROPIC_SHA="${ANTHROPIC_SHA:-683bc88e56f3e09ba94f7055977f3d3aa499f202}"
PLAYWRIGHT_SHA="${PLAYWRIGHT_SHA:-b85c7a736bb473bf55b584e54a09ffa698d6d871}"
EXPO_SHA="${EXPO_SHA:-d4f484024fec15196bfd3c272e953e3f983972cf}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$REPO_ROOT/.github/skills"

WORK_DIR="$(mktemp -d)"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

# fetch_repo <checkout-name> <github repo> <sha>
# Clones the repository without blobs and checks out exactly the pinned commit.
fetch_repo() {
  local name="$1" repo="$2" sha="$3"
  local dest="$WORK_DIR/$name"

  echo "==> fetching https://github.com/$repo at $sha"
  git init --quiet "$dest"
  git -C "$dest" remote add origin "https://github.com/$repo.git"
  git -C "$dest" fetch --quiet --depth 1 --filter=blob:none origin "$sha"
  git -C "$dest" checkout --quiet FETCH_HEAD
}

# vendor_skill <checkout-name> <source path in repo> <skill name> <license file or "">
# Copies the whole skill folder, then copies the fallback license when the skill folder
# carries no license of its own.
vendor_skill() {
  local name="$1" src_path="$2" skill="$3" license_src="${4:-}"
  local src="$WORK_DIR/$name/$src_path"
  local dest="$SKILLS_DIR/$skill"

  if [ ! -d "$src" ]; then
    echo "error: $src_path not found in $name checkout" >&2
    exit 1
  fi

  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$src/." "$dest/"

  if [ ! -e "$dest/LICENSE" ] && [ ! -e "$dest/LICENSE.txt" ] && [ ! -e "$dest/LICENSE.md" ]; then
    if [ -n "$license_src" ] && [ -f "$WORK_DIR/$name/$license_src" ]; then
      cp "$WORK_DIR/$name/$license_src" "$dest/LICENSE"
    else
      echo "error: no license available for skill $skill" >&2
      exit 1
    fi
  fi

  if [ ! -f "$dest/SKILL.md" ]; then
    echo "error: $skill has no SKILL.md" >&2
    exit 1
  fi

  echo "    vendored $skill"
}

mkdir -p "$SKILLS_DIR"

fetch_repo caveman JuliusBrussee/caveman "$CAVEMAN_SHA"
vendor_skill caveman "skills/caveman" caveman "LICENSE"
vendor_skill caveman "skills/caveman-review" caveman-review "LICENSE"

fetch_repo anthropics anthropics/skills "$ANTHROPIC_SHA"
vendor_skill anthropics "skills/frontend-design" frontend-design "LICENSE.txt"

fetch_repo playwright microsoft/playwright-cli "$PLAYWRIGHT_SHA"
vendor_skill playwright "skills/playwright-cli" playwright-cli "LICENSE"

fetch_repo expo expo/skills "$EXPO_SHA"
for skill in expo-router expo-native-ui expo-design-system expo-animation expo-data-fetching expo-project-structure; do
  vendor_skill expo "plugins/expo/skills/$skill" "$skill" "plugins/expo/LICENSE"
done

echo
echo "Vendored 10 skills into .github/skills/ at:"
echo "  JuliusBrussee/caveman    $CAVEMAN_SHA"
echo "  anthropics/skills        $ANTHROPIC_SHA"
echo "  microsoft/playwright-cli $PLAYWRIGHT_SHA"
echo "  expo/skills              $EXPO_SHA"
echo
echo "Next: review the diff and update the SHA table in .github/skills/THIRD_PARTY.md."
