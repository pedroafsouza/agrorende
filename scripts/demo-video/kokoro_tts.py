"""
Batch text to speech with Kokoro-82M for the demo video narration (docs/DEMO-VIDEO.md).

Reads one JSON object from stdin and loads the model once for every sentence:

    {"voice": "pm_alex", "speed": 1.12, "lang": "p",
     "items": [{"text": "Olá!", "out": "/abs/path/s01-01.wav"}]}

Writes one 24 kHz mono WAV per item, with leading and trailing silence trimmed to a short pad,
and prints one JSON line per written file.
"""

import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")

import espeakng_loader  # noqa: E402

# The espeakng-loader wheel looks for its data in the path it was built in; prefer the Homebrew
# espeak-ng (`brew install espeak-ng`), whose library knows where its own data lives.
_BREW = os.environ.get("HOMEBREW_PREFIX", "/opt/homebrew")
if os.path.exists(f"{_BREW}/lib/libespeak-ng.dylib"):
    espeakng_loader.get_library_path = lambda: f"{_BREW}/lib/libespeak-ng.dylib"
    espeakng_loader.get_data_path = lambda: f"{_BREW}/share/espeak-ng-data"

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from kokoro import KPipeline  # noqa: E402

SAMPLE_RATE = 24000
PAD = int(0.04 * SAMPLE_RATE)


def trim(audio: np.ndarray) -> np.ndarray:
    loud = np.flatnonzero(np.abs(audio) > 0.01)
    if loud.size == 0:
        return audio
    return audio[max(0, loud[0] - PAD) : min(audio.size, loud[-1] + PAD)]


def main() -> None:
    request = json.load(sys.stdin)
    voice = request["voice"]
    speed = float(request.get("speed", 1.0))
    pipeline = KPipeline(lang_code=request.get("lang", "p"), repo_id="hexgrad/Kokoro-82M")
    for item in request["items"]:
        chunks = [np.asarray(audio, dtype=np.float32) for _, _, audio in pipeline(item["text"], voice=voice, speed=speed) if audio is not None]
        if not chunks:
            raise SystemExit(f"Kokoro produced no audio for: {item['text']}")
        gap = np.zeros(int(0.12 * SAMPLE_RATE), dtype=np.float32)
        joined = chunks[0]
        for chunk in chunks[1:]:
            joined = np.concatenate([joined, gap, chunk])
        sf.write(item["out"], trim(joined), SAMPLE_RATE)
        print(json.dumps({"out": item["out"]}), flush=True)


if __name__ == "__main__":
    main()
