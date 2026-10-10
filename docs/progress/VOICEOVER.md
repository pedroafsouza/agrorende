# VOICEOVER · Natural narration for the pt-BR demo video

Status: DONE
Wave: ad hoc (user request) · Agent finished: 2026-10-10 17:10

## Done

- Text-to-speech is now pluggable in `scripts/demo-video/tts.ts` through `DEMO_TTS`, with four engines:
  - `kokoro`: local and free; the documented default.
  - `elevenlabs`: needs `ELEVENLABS_API_KEY`.
  - `openai`: needs `OPENAI_API_KEY`.
  - `say`: the legacy macOS voice.
- Engine selection order: explicit `DEMO_TTS`, then an ElevenLabs key, then an OpenAI key, then Kokoro if its virtual environment exists, then `say` with a warning that includes the setup command.
- API keys are read from the environment only. They are never logged or written to any file, and they are not part of any cache filename.
- The audio cache key is a hash of engine, model, voice, speed and the spoken text. Changing one sentence re-synthesises (and, on paid engines, re-bills) only that sentence.
- ElevenLabs requests send the previous and next sentence as context, for natural intonation across sentences. The client retries on 429 and 5xx responses.
- Added the Kokoro helper `scripts/demo-video/kokoro_tts.py`:
  - It reads one JSON batch from stdin and loads the model once for all sentences.
  - It uses Kokoro-82M with lang `p` and the Homebrew `espeak-ng`.
  - It trims silence at both ends.
- Added the setup script `scripts/demo-video/setup-kokoro.sh`. It creates `.data/tts-venv` (Python 3.12, `kokoro==0.9.4`, `soundfile`) with `uv`.
- An explicit `DEMO_TTS=kokoro` without the venv stops with the setup command.
- Rewrote the narration in `scripts/demo-video/script.pt-BR.ts`:
  - Fast explainer pace with short, concrete sentences.
  - After the user's correction, there are no jokes, irony, slang or memes. The tone is warm, confident and respectful for farm owners, managers and technicians.
  - Scene ids, visuals, highlight flags and the order of on-screen actions are unchanged, and the product facts follow the PRD.
- Added a `PRONUNCIATION` lexicon that applies to every engine:
  - "AgroRende" is spoken as "Agrorrênde"; without it, Whisper heard "AgroHand".
  - "OS" is spoken as "ordem de serviço".
  - Captions keep the written text.
- Voice choice:
  - ElevenLabs: Lucas (`7lu3ze7orhWaNeSPowWx`, a native pt-BR library voice, "Engaging, Captivating and Kind") with `eleven_multilingual_v2` at speed 1.1, stability 0.45 and style 0.3. It was compared with Lax, Lendário and the premade Liam on the same sentence. Lax ("sarcastic") and Lendário ("hyped") did not fit the requested tone.
  - Kokoro: `pm_alex` at 1.12x. It was compared with `pf_dora` and `pm_santa` by listening, by Whisper transcription and by pitch and voicing statistics.
- `compose.ts` now trims an idle tail found with ffmpeg `freezedetect`, because the recordings were held for the old, longer narration. Footage plays at real speed and is only sped up when the actions themselves are longer than the narration; the final maximum is 1.28x.
- The landing cut budget was lowered from 12 MB to 6 MB, and the cut fails above it.
- Rendered with ElevenLabs Lucas, reusing the existing recordings (no re-record):
  - Full video `.data/video/agrorende-demo-pt-BR.mp4`: 413.4 s, 1920x1080 H.264 with AAC 48 kHz, -16.2 LUFS, 30.2 MB. Its VTT has 110 cues.
  - Landing cut `apps/landing/public/video/agrorende-demo-pt-BR.mp4`: 133.4 s, 1280x720, 3.5 MB. Its VTT has 36 cues, and the poster `.jpg` was refreshed.
- `docs/DEMO-VIDEO.md` was updated: outputs, chapter times, a new *Narration voice* section (engines, keys through the environment, Kokoro setup, voice choice, pronunciation), environment variables, prerequisites, the compose behaviour and the 6 MB budget.

## Tests

| Command | Result |
|---|---|
| `pnpm check:only landing` | passed (lint, typecheck, 13 files / 74 tests, i18n) |
| `cd apps/landing && SITE_URL=http://localhost:3191 pnpm build && pnpm e2e` | passed, 72 tests |
| one-off `tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess … scripts/demo-video/*.ts scripts/demo-video/lib/*.ts` | passed |
| `DEMO_TTS=kokoro pnpm exec tsx scripts/demo-video/run.ts --only tts` | passed, 35 scenes / 462.0 s (free default verified on the final script) |
| `DEMO_TTS=elevenlabs … run.ts --only tts,titles,compose,cut` | passed, 412.7 s narration |
| `ffprobe` on both mp4 files | 413.4 s and 133.4 s, h264 + aac |
| Caption sync | a Whisper transcription of 1:00–1:20 of the final audio matches the VTT cues at those times |
| Visual QA | frames at 200 s (full) and 40 s (cut) inspected |

## Assumptions

- ElevenLabs is used for the published render, as the user asked; Kokoro stays the documented free default.
- The quota of the ElevenLabs key could not be read, because the key has no `user_read` permission. Usage was about 16k characters in total (samples, two full scripts and a few changed sentences).
- `tts/durations.json` was left matching the ElevenLabs render, so `compose` and `cut` reproduce the published files without new API calls.
- The `next-env.d.ts` change made by `pnpm build` was reverted by hand.

## Gaps

- None for this task. The limitations of the existing video (English mock Google screen, the admin image 403 workaround, the "AMBIENTE LOCAL" bar) are unchanged and listed in `docs/DEMO-VIDEO.md`.

## Error cases added

- None.

## Change requests

- None.
