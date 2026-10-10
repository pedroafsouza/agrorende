# AgroRende demo video (pt-BR)

This document explains how the end-to-end product demo video is produced, how to regenerate it and what its known limitations are.

## Outputs

| File | What it is |
|---|---|
| `.data/video/agrorende-demo-pt-BR.mp4` | Full demo, about 6 min 53 s (413 s), 1920x1080, H.264 30 fps + AAC 48 kHz, loudness normalised to -16 LUFS. Git-ignored. |
| `.data/video/agrorende-demo-pt-BR.vtt` | Sentence-accurate pt-BR captions for the full demo (110 cues). |
| `apps/landing/public/video/agrorende-demo-pt-BR.mp4` | Highlights cut, about 2 min 13 s (133 s), 1280x720, about 3.5 MB (36 cues). |
| `apps/landing/public/video/agrorende-demo-pt-BR.vtt` | Captions for the highlights cut. |
| `apps/landing/public/video/agrorende-demo-pt-BR.jpg` | Poster frame for the landing player. |

The landing site switches from its fallback to the real `<video>` element when `public/video/agrorende-demo-pt-BR.mp4` exists at build time (`apps/landing/src/lib/demoVideo.ts`, `apps/landing/src/views/Features.tsx`, hero link in `Home.tsx`).

## Chapters (full video)

| Start | Chapter |
|---|---|
| 0:00 | Abertura: the landing hero, the one sentence and the mission |
| 0:53 | Nova empresa: Locadora Dourada signs up with (mock) Google, then the "Primeiros passos" guide: first machine, invite a technician, first work order |
| 2:20 | Técnico no celular: the three intro cards, a broken-tractor report made without signal, "Salvo no celular", signal returns and the report appears in the office (split screen) |
| 3:28 | Escritório: overview and map, Pendências, opening the report, dispatching Carlos |
| 4:26 | Reparo no celular (Carlos): accept, on the way, arrived, before photo, part at R$ 185,00, checklist, after photo, hour meter, customer signature, success screen |
| 5:49 | Verificação e custos: verify the order, machine AGR-000012 and its cost, overdue rental RN-000005, costs per farm and season |
| 6:37 | Encerramento: the three jobs and "Teste grátis por 30 dias" |

Exact scene start times are written by the composer to `.data/video/work/clips/timeline.json`.

## Pipeline

All code is TypeScript in `scripts/demo-video/`, run with tsx:

```sh
pnpm exec tsx scripts/demo-video/run.ts                      # every stage
pnpm exec tsx scripts/demo-video/run.ts --only compose,cut   # selected stages
pnpm exec tsx scripts/demo-video/run.ts --only record --recorders joana,office,carlos
pnpm exec tsx scripts/demo-video/run.ts --force              # regenerate cached artefacts
```

| Stage | File | What it does |
|---|---|---|
| `assets` | `assets.ts` | Renders the phone bezel, backgrounds and the sample tractor photo (drawn from SVG, no downloaded images). |
| `tts` | `tts.ts`, `kokoro_tts.py` | Synthesises every narration sentence separately with the selected voice engine (see *Narration voice*), so captions are timed per sentence. Audio is cached per engine, model, voice, speed and text, so changing one sentence only re-synthesises that sentence. |
| `record` | `record.ts`, `lib/browser.ts` | Playwright recorders `landing`, `signup`, `joana`, `office`, `carlos`, `costs`. Desktop scenes record at 1920x1080 with a visible cursor and click highlight; phone scenes run the Expo app on web in a 390x844 touch viewport. Each recorder writes a `.webm` plus scene marks to `.data/video/work/raw/`. |
| `titles` | `titles.ts` | Records the chapter title cards (logo, heading and a Lottie from `packages/motion/lottie`). |
| `compose` | `compose.ts` | Builds one clip per scene (phone frame or split screen for phone scenes), fits video to narration (an idle tail found with `freezedetect` is trimmed, so footage plays at real speed; it is only sped up, at most 2.5x, when the on-screen actions are longer than the narration), concatenates, normalises loudness and writes the final mp4 and VTT. |
| `cut` | `compose.ts` | Assembles the scenes flagged `highlight: true` into the 720p landing cut, its VTT and poster; fails if the file exceeds 6 MB. |

The narration, chapters, scenes and highlight flags live in `scripts/demo-video/script.pt-BR.ts`. Change the text there and rerun `tts`, `compose` and `cut`.

## Narration voice

The narration is written in a fast, direct explainer pace: short sentences, concrete actions, no jokes or slang, in a warm and respectful tone for farm owners, managers and technicians. `tts.ts` picks the engine in this order: `DEMO_TTS` if set, then ElevenLabs if `ELEVENLABS_API_KEY` is set, then OpenAI if `OPENAI_API_KEY` is set, then Kokoro if its virtual environment exists, then macOS `say` with a warning.

| Engine | Cost | Default voice | Notes |
|---|---|---|---|
| `kokoro` | Free, local | `pm_alex` at 1.12x | Kokoro-82M, pt-BR male voice. The free default. |
| `elevenlabs` | Paid API | Lucas, `7lu3ze7orhWaNeSPowWx`, `eleven_multilingual_v2`, 1.1x | Native pt-BR voice from the ElevenLabs voice library ("Engaging, Captivating and Kind"). Used for the published render. Requests send the neighbouring sentences as context for natural intonation. |
| `openai` | Paid API | `ash`, `gpt-4o-mini-tts`, 1.1x | Instructed to sound warm, energetic and natural in Brazilian Portuguese. |
| `say` | Free, macOS | `Luciana` | Legacy, robotic. |

Keys are read from the environment only. Pass them inline on the command and never write them into a file:

```sh
ELEVENLABS_API_KEY=… DEMO_TTS=elevenlabs pnpm exec tsx scripts/demo-video/run.ts --only tts,titles,compose,cut
```

Kokoro setup (once): `scripts/demo-video/setup-kokoro.sh` installs `espeak-ng` and `uv` with Homebrew if missing, then creates `.data/tts-venv` (Python 3.12) with `kokoro==0.9.4` and `soundfile`. The first run downloads the model from Hugging Face. If the virtual environment is missing, `DEMO_TTS=kokoro` stops with the setup command.

Pronunciation fixes live in `PRONUNCIATION` in `script.pt-BR.ts` and apply to every engine: "AgroRende" is spoken as "Agrorrênde" (otherwise the voices say "AgroHand"), and "OS" as "ordem de serviço".

Voice choice: Kokoro voices `pf_dora`, `pm_alex` and `pm_santa` were compared; `pm_alex` had the most natural intonation. On ElevenLabs, the native pt-BR library voices Lax, Lucas and Lendário and the premade Liam were compared on the same sentence and checked with a Whisper transcription; Lucas was chosen as the warmest delivery that is still energetic, without sounding hyped or ironic.

## Prerequisites

1. macOS with `ffmpeg`/`ffprobe` in `/opt/homebrew/bin`, and a narration engine (see *Narration voice*; the free default needs `scripts/demo-video/setup-kokoro.sh` once).
2. Node and pnpm from the repository pins, and Playwright Chromium installed (it already is for `apps/landing` and `apps/web`).
3. Local services running: `pnpm dev:setup` (MongoDB, Redis, the mock Google OIDC on :4003), then `pnpm dev` (admin web :3000, realtime :4001, worker :4002) and the landing dev server on :3300.
4. Clean demo data: `pnpm db:seed -- --force`. Clear the signup rate limit so the "Locadora Dourada" signup works again: `docker exec <redis container> redis-cli del 'rl:signup-ip:ip:::1'`.
5. The mobile app on web: `scripts/demo-video/expo-web.sh` starts `expo start --web` on :8081 with a dev proxy to the API on :3000 (log in `.data/video/work/logs/expo-web.log`). Stop it by PID when done.
6. Optional background activity on the office map: `pnpm simulate --users tecnico2@agrorende.dev,tecnico3@agrorende.dev,locacao@agrorende.dev`. Restart it after every seed and stop it by PID when done.

### Environment variables

| Variable | Default | Use |
|---|---|---|
| `DEMO_LANDING_URL`, `DEMO_ADMIN_URL`, `DEMO_MOBILE_URL`, `DEMO_OIDC_URL` | `:3300`, `:3000`, `:8081`, `:4003` on localhost | Service addresses. |
| `DEMO_PASSWORD` | `agrorende123` | Password of the seeded users. |
| `DEMO_TTS` | auto | Narration engine: `kokoro`, `elevenlabs`, `openai` or `say`. |
| `DEMO_VOICE`, `DEMO_SPEED` | per engine | Voice id or name and speaking speed (see *Narration voice*). |
| `DEMO_RATE` | `165` | Words per minute for the legacy `say` engine. |
| `ELEVENLABS_API_KEY`, `OPENAI_API_KEY` | unset | API keys, read from the environment only. |
| `DEMO_ELEVENLABS_MODEL`, `DEMO_OPENAI_MODEL` | `eleven_multilingual_v2`, `gpt-4o-mini-tts` | Model overrides. |
| `DEMO_KOKORO_PYTHON` | `.data/tts-venv/bin/python` | Python interpreter with Kokoro installed. |
| `DEMO_SKIP_WARM` | unset | Set to `1` to skip pre-compiling admin pages before recording. |
| `DEMO_WORK_ORDER_ID` | looked up | Database id of WO-000016 for the verification scene. |
| `DEMO_MONGO_CONTAINER` | `pedro-souza-expert-giggle-mongo-1` | Container used to look the work order up with `mongosh`. |

## How the mobile footage was made

The field app runs through react-native-web (`expo start --web`) in a Playwright Chromium page with a phone viewport, and is composited into a phone frame. The Android emulator is not used. Web-only shims live next to the native files as `.web.ts(x)` variants in `apps/mobile/src` (storage, secure vault, push, Lottie, media files) and in `apps/mobile/src/web-shims` (map placeholder and a canvas signature pad); native behaviour is unchanged. Offline is emulated with Playwright `context.setOffline(true)`.

## Limitations

- The narration is a synthetic (neural) voice, not a human speaker. Captions follow the script text, so they can differ slightly from what the voice says (for example, "Agrorrênde" is spelled that way for the voice only).
- The mock Google sign-in screen is in English, because it comes from the OIDC mock.
- Admin image blobs answer 403 (`media_token`) and the app does not upload thumbnails, so the recorder serves the stored JPEG from `.data/media` when an admin image request fails.
- The checklist on the phone shows the generic seeded items.
- Rerunning the `costs` recorder after a verification needs the work order reset to "completed, not verified" (or a fresh seed).
- The "AMBIENTE LOCAL" bar and, in a few frames, the Next.js dev indicator are visible in the admin screens.
- The admin dev server can be slow to compile; the recorders warm the pages first and use long timeouts.
