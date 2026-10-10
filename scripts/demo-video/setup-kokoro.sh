#!/bin/bash
# Creates the local Python environment for the Kokoro narration voice (docs/DEMO-VIDEO.md).
# Everything lands in .data/tts-venv (git-ignored); the model downloads on first use (~330 MB).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENV="$ROOT/.data/tts-venv"

command -v brew >/dev/null || { echo "Homebrew is required (https://brew.sh)." >&2; exit 1; }
command -v uv >/dev/null || brew install uv
command -v espeak-ng >/dev/null || brew install espeak-ng

uv venv --python 3.12 "$VENV"
uv pip install --python "$VENV/bin/python" "kokoro==0.9.4" "soundfile==0.14.0"
echo "Kokoro is ready: $VENV"
