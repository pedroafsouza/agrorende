# MEDIA-TOKEN · Admin gallery shows broken images (403 media_token) and phones never upload thumbnails

Status: DONE_WITH_GAPS
Wave: post-delivery bug fix · Agent finished: 2026-10-10 15:58

## Root cause

There were two independent faults.

1. **The admin gallery requested blobs without a token.** `apps/web/src/components/media/MediaGallery.tsx`
   pointed `<img src>` straight at `/api/v1/media/:id/blob?variant=thumb` (and `/blob` for the lightbox).
   Blob routes are authorised by the signed URL token alone (ARCHITECTURE §7.7, the `t=` query
   parameter) and are excluded from the session proxy, so `verifyBlobToken` refused every request with
   `403 {"reason":"media_token"}`. Token signing and verification were already consistent: the secret,
   the clock, the path encoding and the variant names all match, and the new unit tests prove it. The
   correct entry point is `GET /api/v1/media/:id/url?variant=`, which checks the session and redirects
   (302) to a freshly signed blob URL with a five-minute lifetime.
2. **No thumbnail was ever stored.** ARCHITECTURE §7.7 step 2 says the phone renders a 320 px thumbnail
   (and a poster for videos) and uploads it before the original. `captureToDraft` in
   `apps/mobile/src/components/MediaCapture/drafts.ts` never called `processPhoto`, so `thumbUri` was
   always empty. The upload queue was ready to send it. Photos uploaded from the admin web app have
   no thumbnail by design. Even with a valid token, `variant=thumb` therefore answered
   `404 MEDIA_NOT_IN_STORAGE`.

## Done

- Core: `readUrl` accepts an opt-in `fallback=original`. When the requested `thumb` or `poster` is
  missing and the original is stored, the original is signed instead. The new exported
  `resolveReadVariant` holds the rule. `mediaUrlHandler` reads the query parameter. Requests without
  the parameter behave exactly as the specification says (`MEDIA_NOT_IN_STORAGE`), and an unknown
  fallback value is rejected with `VALIDATION_FAILED`.
  (`packages/core/src/modules/media/upload.ts`, `packages/core/src/auth/api/platform.ts`)
- Web: the gallery now loads `/api/v1/media/:id/url?variant=thumb&fallback=original` for tiles and
  `?variant=original` for the lightbox. These requests use the session cookie and are redirected to
  signed blob URLs. A new `MediaImage` component applies the recovery kit (ERRORS.md):
  - **AUTO:** on the first load error it silently refreshes the session and retries once with a
    cache-busting parameter.
  - **RETRY:** if the image still fails, it replaces the broken-image icon with a recovery tile:
    image-off icon, "Couldn't show this photo", a body line in the full-size view, and a 48 px
    "Try again" button. The tile has `role="alert"`.
  - An error that fired before hydration is detected from the element state.
  (`apps/web/src/components/media/MediaGallery.tsx`; new keys `common.media.loadFailed.title` and
  `.body` in `apps/web/messages/{en,pt-BR}/common.json`)
- Mobile: `captureToDraft` now runs the new `prepareCapture` step.
  - Photos go through the injectable `preparePhoto` dependency: a 2048 px JPEG at quality 0.8 plus a
    320 px thumbnail, as specified. The thumbnail is persisted as `thumbUri`, and the queue uploads it
    as `variant: "thumb"` before the original.
  - Videos go through the new `processVideoPoster` (expo-video `generateThumbnailsAsync` plus
    expo-image-manipulator), and the poster uploads as `variant: "poster"`.
  - If the preview step fails, the capture is kept without a preview rather than lost.
  - `MediaCapture` wires both defaults through a lazy import of `src/media/processing.ts`.
  (`apps/mobile/src/components/MediaCapture/drafts.ts`, `apps/mobile/src/components/MediaCapture/index.tsx`,
  `apps/mobile/src/media/processing.ts`)
- Mobile queue hardening: a preview larger than `PREVIEW_MAX_BYTES` (2 MB, mirroring the server's
  `VARIANT_MAX_BYTES`) is skipped instead of being sent. Sending it would earn the terminal
  `MEDIA_TOO_LARGE` and fail the whole row. Annotated photos store their full-size image as the
  preview, so this case can happen. (`apps/mobile/src/media/queue.ts`)

## Tests

New tests:
- `packages/core/src/modules/media/token.test.ts` (10 tests): valid, missing, wrong-media, wrong-op,
  wrong-variant, wrong-secret and expired tokens, plus the `resolveReadVariant` rules.
- `packages/core/src/auth/api/api.test.ts`, one new media test: a strict thumbnail request returns
  404; an unsigned blob returns 403 `media_token`; `fallback=original` returns a 302 to the original,
  and the blob then serves `image/jpeg` with status 200; an invalid fallback returns 422.
- `apps/web/src/components/media/MediaGallery.test.tsx` (6 tests): URL building, the silent retry, the
  recovery tile and its retry button, and the lightbox.
- `apps/mobile/test/engine/mediaThumbs.test.ts` (5 tests): the photo thumbnail is uploaded before the
  original; the video poster; a failed preview keeps the capture; signatures are left untouched; an
  oversized preview is skipped.

Commands and results:

| Command | Result |
|---|---|
| `pnpm check:only web` | Passed. Lint, typecheck and 382 tests passed. |
| `pnpm check:only mobile` | Passed. 208 tests passed (jest gate), plus 135 engine tests when run with `npx jest --selectProjects engine`. |
| `pnpm i18n:check` | Passed for pt-BR and en. |
| `pnpm check:only @agrorende/core` | Lint and typecheck passed. Tests passed only when no other agent was running vitest; see the next row. |
| `npx vitest run src/__tests__/tenancy.test.ts src/modules/ops/analytics.test.ts src/modules/parts/service.test.ts` (in `packages/core`) | 207 passed when nothing else was running. |

The core test step failed in runs made while other agents were running vitest at the same time
(14–15 foreign workers). `tenancy.test.ts`, `ops/analytics.test.ts` and `parts/service.test.ts` use the
fixed database names `agrorende_t10_tenancy` and `agrorende_t16_analytics`, so those runs collided: the
failures were 401s and E11000 duplicate keys. Once, `numbering` "has no gaps or duplicates under
concurrency" also failed under load. With the machine quiet, all of these passed. The media tests pass
in every run.

Visual check, with screenshots in `.data/reviews/media-token/`:
- `report-gallery-ok.png`: FR-000020 with a freshly uploaded photo that has no thumbnail. The tile
  shows the original through the fallback.
- `report-gallery-recovery.png`: FR-000001, whose demo file is missing from `.data/media`. The tile
  shows the recovery state instead of a broken image.

## Assumptions

- The thumbnail-to-original fallback is opt-in (`fallback=original`), so the specified
  `MEDIA_NOT_IN_STORAGE` response stays the default for clients that need to know a variant is missing.
  MEDIA-TOKEN-001 asks for the specification to record this.
- Thumbnails stay client-generated, as ARCHITECTURE §7.7 specifies. No worker thumbnail job was added.
- The visual check could not use the shared dev server on port 3000. Every route there returned a
  webpack error: `ENOENT ... node_modules/maplibre-gl/dist/maplibre-gl.js`, after maplibre-gl 6.13
  replaced its dist layout. That server was not touched. A second, temporary server ran on port 3100
  with `NEXT_DIST_DIR=.next-media-token APP_URL=http://localhost:3100`; it was stopped afterwards and its
  dist folder deleted. The port 3000 server needs a restart to pick up the new maplibre build.

## Gaps

- Media that already exist without a thumbnail stay that way. The gallery falls back to the original,
  which is correct but heavier. Backfilling thumbnails would need a worker job, which the specification
  does not have. The owner would be T01 if a job is wanted.
- The demo seed marks media as UPLOADED but writes no files to `.data/media`, so the demo gallery shows
  the recovery tile until media are re-captured or re-uploaded. This belongs to the seed owner.
- The video poster generation path runs only on a device (expo-video native module). The unit tests
  inject the dependency; the native call itself has not been exercised on a simulator.
- `scripts/demo-video/record.ts` (around lines 98–122) and `docs/DEMO-VIDEO.md` (line 81) describe a
  workaround for this bug. It is now obsolete, but those files belong to another lane and were not
  edited.

## Error cases added

- None new. The gallery applies the existing recovery kit (AUTO, then RETRY) for an image that fails
  to load, and EC-SYN-33 / `MEDIA_NOT_IN_STORAGE` keeps its meaning.

## Change requests

- MEDIA-TOKEN-001: Document the `fallback=original` option of the media read URL (OPEN).

## Edits outside owned paths (T10, T11, T12 only)

- None.

## Notes for the next wave

- Never point an `<img>` at `/api/v1/media/:id/blob` directly. Use `/api/v1/media/:id/url`, which
  signs the URL, or `mediaReadUrl()` from `apps/web/src/components/media/MediaGallery.tsx`.
