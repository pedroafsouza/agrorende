# REVIEW-PERF-VIDEO · Code review fixes for the query performance and demo video work

Status: DONE
Wave: post-W7 maintenance · Agent finished: 2026-10-10 16:05

## Done
- Work order list: the "dated rows before the cursor" fallback now uses `countDocuments(datedFilter)` instead of loading every dated `_id` (`packages/core/src/modules/workOrders/queries.ts`). `ScopedCollection` gained a tenant-scoped `countDocuments` so the count keeps the organisation filter (`packages/db/src/scoped.ts`).
- Redundant indexes: `work_orders {organizationId, status}` (prefix of `{organizationId, status, completedAt}`) and `activity_events {organizationId, occurredAt: 1}` (prefix of `{organizationId, occurredAt: -1, _id: -1}`, scanned backwards for ascending sorts and usable for `occurredAt` ranges) were removed from `INDEXES` and moved to a new `REDUNDANT_INDEXES` list (`packages/db/src/indexes.ts`). Every query that filtered or sorted on them (`status` filters, ops analytics `occurredAt` ranges, exports by `occurredAt`) is served by the longer index through the prefix rule.
- New migration `0004-DROP-REDUNDANT-INDEXES` (`packages/db/migrations/0004-DROP-REDUNDANT-INDEXES.ts`, registered in `migrations/runner.ts`). It looks each index up with `listIndexes` by key and drops it only when present, and skips missing collections, so it is idempotent. Migration 0003 was left untouched because it is already applied on the local dev database.
- Landing `Lottie` imports `loadAnimation` and `motionMeta` from `@agrorende/motion/lazy`, so the shared chunk no longer pulls every animation JSON; the `vi.mock` in `Lottie.test.tsx` targets the lazy entry. The type-only `AnimationId` imports in `Animation.tsx` and `Features.tsx` became `import type` from the lazy entry so they cannot leave a side-effect import of the eager entry behind.
- Mobile `metro.config.cjs` web API proxy: chooses `node:https` or `node:http` from the target protocol, keeps any path prefix of `AGRORENDE_WEB_API_PROXY` (and the query string), rejects non-HTTP protocols, and wraps the whole proxy setup in `try/catch` so an invalid proxy URL or an upstream error answers 502 instead of crashing Metro.
- `scripts/demo-video/tts.ts`: sentence audio file names include a 12-character SHA-256 of voice, rate and text (`ttsCacheKey`), so a changed sentence, voice or rate is never served from the cache.
- `scripts/demo-video/expo-web.sh`: `set -euo pipefail`; finds `fnm` with `command -v fnm` and falls back to `/opt/homebrew/bin/fnm`; fails with a clear message unless Node 24 is active.
- `scripts/demo-video/compose.ts`: removed the fallback that copied the highlights VTT over the full-film captions; the highlights step now throws when `paths.finalVtt` is missing.

## Tests
- `packages/core/src/modules/workOrders/service.test.ts` (new cases): `due=week` paging returns only dated active jobs inside the week, in due order, and ends with `nextCursor: null`; a cursor past the total returns an empty page and a null cursor for the plain, `week`, `atRisk` and `assigneeId=none` views; `q` + `assigneeId=none` keeps undated jobs last across pages; `due=atRisk` pages the in-memory SLA-filtered list one item at a time and matches the unpaged result. The existing "jump past the dated rows" case exercises the `countDocuments` fallback.
- `packages/db/src/perfIndexes.test.ts` (new cases): redundant indexes are no longer declared and each is a key prefix of a remaining index; migration 0004 drops them from an older database, is idempotent and leaves the PERF-QUERIES indexes in place. `indexes.test.ts` count updated (61 → 59 architecture indexes).
- `apps/mobile/test/engine/metroWebProxy.test.ts` (new): proxies `/api/*` through the real Metro middleware with a path-prefixed upstream, leaves other paths to Metro, answers 502 for an invalid URL, an `ftp:` URL and an unreachable upstream, and uses TLS for an `https:` target.
- `MONGODB_DB=agrorende_perffix pnpm check:only @agrorende/core @agrorende/db landing mobile` → exit 0 (core 630 passed, db 11 passed, landing 74 passed, mobile 208 passed; typecheck and lint done).
- `pnpm db:migrate` on the local `agrorende` database → `migrations applied: 0004-DROP-REDUNDANT-INDEXES`; `listIndexes` afterwards no longer shows the two dropped indexes.
- `scripts/demo-video/*.ts` are not covered by `scripts/tsconfig.json`; an ad-hoc `tsc --noEmit --allowImportingTsExtensions --module nodenext --moduleResolution nodenext --strict --skipLibCheck` over `tts.ts` and `compose.ts` passed. `bash -n scripts/demo-video/expo-web.sh` passed.

## Assumptions
- Editing `packages/db/**` (indexes, migration, `ScopedCollection.countDocuments`) is in scope because the review explicitly asked for index and migration changes there.
- Existing `.data/video/work/tts/*.wav` files without the hash are simply ignored; the next run synthesises the hashed names once.

## Gaps
- None.

## Error cases added
- None.

## Change requests
- None.

## Notes for the next wave
- `packages/core/src/__tests__/tenancy.test.ts`, `numbering/index.test.ts`, `sync/withSyncTx.test.ts` and `testing/setupTestDb.test.ts` flaked (organisation-A digest mismatch or 5 s timeouts) while the machine load average was above 10 and other agents shared MongoDB; they pass when rerun. A transient `apps/web/.next-auditfix-build` folder from another agent also tripped the core boundaries test once.
