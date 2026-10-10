# MEDIA-TOKEN-001 · Document the `fallback=original` option of the media read URL

Status: OPEN
Requested by: MEDIA-TOKEN · Wave: post-delivery bug fix
Target: docs/ARCHITECTURE.md §7.7 step 9 and the media route table (owner: T01)
Kind: contract

## Problem
ARCHITECTURE §7.7 step 9 says that `GET /api/v1/media/:id/url?variant=` answers `MEDIA_NOT_IN_STORAGE`
when the requested variant is not stored. Photos uploaded from the admin web app never have a thumbnail,
and phone captures made before this fix have none either, so a gallery that asks for `variant=thumb`
could never show those photos.

## Proposed change
Add an optional `fallback=original` query parameter to `GET /api/v1/media/:id/url`. When it is present
and the requested `thumb` or `poster` variant is missing, the route signs the stored original instead
of failing. Without the parameter the behaviour is unchanged, so `MEDIA_NOT_IN_STORAGE` still reaches
clients that need to know a variant is missing (EC-SYN-33). Any other `fallback` value is rejected with
`VALIDATION_FAILED`.

## Workaround in place
The parameter is already implemented in `packages/core/src/modules/media/upload.ts` (`readUrl`,
`resolveReadVariant`) and `packages/core/src/auth/api/platform.ts` (`mediaUrlHandler`), and the admin
gallery uses it. Only the specification text is missing.
