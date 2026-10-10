# PERF-QUERIES-001 · Sort-supporting indexes for the hot admin lists and counts

Status: APPLIED
Requested by: PERF-QUERIES · Wave: post-W5 performance pass
Target: `docs/ARCHITECTURE.md` §5 index comments (owner: T01); `packages/db/src/indexes.ts`, `packages/db/migrations/` (owner: T01)
Kind: schema

## Problem

Most admin list queries filter by `organizationId` and sort by a date. The only index they can use is `{ organizationId: 1, syncVersion: 1 }`, so MongoDB reads every document of the organisation and sorts the results in memory. With 120,000 activity events, the ops activity feed examined all 120,040 documents to return 51 (147 ms). The asset history query examined 120,040 documents to return 0 (317 ms), because `$or: [{ entityId }, { "meta.assetId" }]` has no usable index. The KPI and cost roll-up queries over completed work orders examined 14,649 documents to return 3,601.

## Proposed change

Add these indexes to ARCHITECTURE §5 next to each collection's existing `// indexes(...)` comment:

| Collection | Keys | Serves |
|---|---|---|
| `activity_events` | `{ organizationId: 1, occurredAt: -1, _id: -1 }` | `GET /ops/activity` (keyset on `occurredAt`, `_id`) |
| `activity_events` | `{ entityId: 1, occurredAt: -1, _id: -1 }` | `GET /assets/:id/history`, first `$or` branch |
| `activity_events` | `{ "meta.assetId": 1, occurredAt: -1, _id: -1 }` | `GET /assets/:id/history`, second `$or` branch |
| `work_orders` | `{ organizationId: 1, dueAt: 1, createdAt: -1, _id: 1 }` | `GET /work-orders` list order |
| `work_orders` | `{ organizationId: 1, status: 1, completedAt: 1 }` | ops KPIs (done today, SLA, MTTR), costs roll-up |
| `field_reports` | `{ organizationId: 1, status: 1, receivedAt: -1 }` | ops KPIs open reports, ops live, ops alerts |
| `field_reports` | `{ organizationId: 1, occurredAt: -1, _id: -1 }` | `GET /field-reports` list order |
| `notifications` | `{ userId: 1, createdAt: -1, _id: -1 }` | `GET /notifications` list order |
| `rental_charges` | `{ rentalId: 1, isAuto: -1, createdAt: 1, _id: 1 }` | rental detail, charge lines, billing snapshot |
| `rentals` | `{ organizationId: 1, plannedStart: -1, _id: 1 }` | `GET /rentals` list order |
| `media` | `{ organizationId: 1, status: 1, createdAt: 1 }` | attention queue, stuck uploads |

The existing `{ organizationId: 1, status: 1 }` on `work_orders` and `{ organizationId: 1, occurredAt: 1 }` on `activity_events` are now prefixes or mirrors of the new indexes. They could be dropped in a later migration to save write cost; they were kept because §5 lists them.

## Workaround in place

None was needed. The indexes are in `PERF_QUERY_INDEXES` in `packages/db/src/indexes.ts`, which `INDEXES` (and therefore `ensureIndexes`) includes. Migration `0003-PERF-QUERIES` creates them idempotently on existing databases.

## Impact if rejected

The hot lists and counts stay full-organisation scans with blocking sorts, and their cost grows linearly with history.

## Resolution

Applied in `packages/db/src/indexes.ts` and `packages/db/migrations/0003-PERF-QUERIES.ts`, which is registered in `migrations/runner.ts` and covered by `packages/db/src/perfIndexes.test.ts`. The migration was run on the local `agrorende` dev database. The ARCHITECTURE §5 text still needs to be updated by its owner.
