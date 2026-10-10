# DEMO-VIDEO · End-to-end pt-BR product demo video

Status: DONE_WITH_GAPS
Wave: ad hoc (user request) · Agent finished: 2026-10-10 15:40

## Done

- Full demo `.data/video/agrorende-demo-pt-BR.mp4`: 594.1 s, 1920x1080, H.264 30 fps, AAC 48 kHz, integrated loudness -16.1 LUFS, 37.7 MB. Captions `.data/video/agrorende-demo-pt-BR.vtt`: 102 cues, one per narrated sentence, monotonic and parsed.
- Highlights cut for the landing site in `apps/landing/public/video/`: `agrorende-demo-pt-BR.mp4` (184.4 s, 1280x720, 4.4 MB), `agrorende-demo-pt-BR.vtt` and poster `agrorende-demo-pt-BR.jpg`. The file names match `apps/landing/src/lib/demoVideo.ts` and `Features.tsx`, so no landing source edit was needed.
- Reproducible pipeline in `scripts/demo-video/` (`run.ts` with stages assets, tts, record, titles, compose, cut; narration in `script.pt-BR.ts`; launcher `expo-web.sh` for the field app on web). Documented in `docs/DEMO-VIDEO.md` with chapters and timestamps.
- The field app runs on web (react-native-web through `expo start --web`), so the phone footage is the real app, recorded in a Playwright 390x844 touch viewport and composited in a phone frame. The HTML-scene fallback was not needed.
- Web support for `apps/mobile`, without changing native behaviour:
  - dependencies added with `npx expo install`: `react-native-web`, `react-dom`, `@expo/metro-runtime`, plus `lottie-web` for the web Lottie player (`apps/mobile/package.json`, `pnpm-lock.yaml`);
  - `app.config.ts`: `web: { bundler: "metro", output: "single" }`;
  - `metro.config.cjs`: web-only resolver aliases for `react-native-maps` and `react-native-signature-canvas`, and a dev proxy from `/api/*` on the Metro server to the API (enabled only by `AGRORENDE_WEB_API_PROXY`), which avoids a CORS change in `apps/web`;
  - `.web.ts(x)` variants: `src/auth/deviceUsersNative.web.ts`, `src/auth/secureVault.web.ts`, `src/features/notifications/pushNative.web.ts`, `src/lib/app/prefs.web.ts`, `src/lib/app/profileCache.web.ts`, `src/lib/app/webStorage.ts`, `src/media/expoFiles.web.ts`, `src/ui/Lottie.web.tsx`, `src/web-shims/react-native-maps.tsx`, `src/web-shims/react-native-signature-canvas.tsx`;
  - `src/lib/app/session.ts`: the HTTP transport calls `fetch` through a wrapper, because browsers throw "Illegal invocation" when `fetch` is called with another `this`.

## Tests

| Command | Result |
|---|---|
| `pnpm check:only mobile` | passed (lint, typecheck, 37 suites / 199 tests) |
| `pnpm i18n:check` | passed for pt-BR and en |
| `cd apps/landing && SITE_URL=http://localhost:3191 pnpm build && pnpm e2e` | passed, 72 tests |
| `pnpm check:only landing` | passed |
| `ffprobe` on both mp4 files | durations 594.1 s and 184.4 s, codecs h264 + aac |
| Visual QA | frames every 20 s of the full video, the cut and the poster were inspected |

## Assumptions

- `pnpm db:seed -- --force` was used for a clean story instead of `pnpm db:reset`; it wipes sessions, so simulate was restarted afterwards.
- The signup rate-limit key in Redis was cleared so the "Locadora Dourada" signup could be recorded more than once.
- The poster keeps the name `agrorende-demo-pt-BR.jpg` that the landing code expects, rather than `agrorende-demo-poster.jpg`.
- Work order WO-000016 was reset in MongoDB to completed and unverified before the final costs recording, because an earlier attempt had already verified it.

## Gaps

- Admin image blobs answer 403 (`{"reason":"media_token"}`) and the app never uploads thumbnails. The recorder serves the stored JPEG from `.data/media` when an admin image request fails; the product bug itself is not fixed.
- The mock Google sign-in screen is in English.
- The phone checklist shows the generic seeded items.
- The "AMBIENTE LOCAL" bar and occasionally the Next.js dev indicator are visible in admin frames.
- The narration is the synthetic macOS voice Luciana.
- The work-order board page froze during recording, so the verification scene opens `/work-orders/<id>` directly.

## Error cases added

None.

## Change requests

None.

## Edits outside owned paths (T10, T11, T12 only)

Not applicable. The user explicitly allowed the `apps/mobile` dependency and web-shim changes and the `pnpm-lock.yaml` update.

## Notes for the next wave

- Regenerate with `pnpm exec tsx scripts/demo-video/run.ts`; see `docs/DEMO-VIDEO.md` for prerequisites.
- Intermediate files live in `.data/video/work/` (git-ignored, about 380 MB); they can be deleted, and cached TTS and recordings are reused when present.
