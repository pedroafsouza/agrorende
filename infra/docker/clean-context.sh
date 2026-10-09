#!/bin/sh
# Removes developer-machine leftovers from a Docker build context copied into the builder stage
# (T18.1, change request T18-001): nested node_modules with host binaries, env files other than
# .env.example, local media folders, build caches and TypeScript build info.
set -eu
find . -type d \( -name node_modules -o -name .data -o -name .next -o -name .expo -o -name .turbo -o -name coverage \) -prune -exec rm -rf {} +
find . -type f \( -name '.env' -o -name '.env.*' -o -name '*.tsbuildinfo' \) ! -name '.env.example' -exec rm -f {} +
