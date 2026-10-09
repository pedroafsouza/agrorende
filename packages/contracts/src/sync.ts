import { z } from "zod";

import { PushStatusEnum } from "./enums.js";
import { LocaleSchema } from "./settings.js";

/**
 * Wire contracts for the offline sync protocol (ARCHITECTURE sections 7.3 and 7.5).
 * These schemas are shared by the mobile sync engine and the server handlers.
 */

export const IsoDateTimeSchema = z.string().datetime();
export const UuidSchema = z.string().uuid();

/** Names of every mutation in the catalog of ARCHITECTURE section 7.3. */
export const MutationNameEnum = z.enum([
  "fieldReport.create",
  "fieldReport.update",
  "fieldReport.withdraw",
  "media.register",
  "media.update",
  "media.delete",
  "workOrder.transition",
  "workOrder.complete",
  "workOrder.saveChecklist",
  "workOrder.addPart",
  "workOrder.removePart",
  "comment.create",
  "inspection.submit",
  "rental.checkout",
  "rental.checkin",
  "asset.updateReadings",
  "user.setDuty",
  "notification.markRead",
  "fuelLog.create",
]);
export type MutationName = z.infer<typeof MutationNameEnum>;

/** Device health reported on every push (ARCHITECTURE section 7.3). */
export const DeviceStatusSchema = z.object({
  appVersion: z.string().min(1),
  runtimeVersion: z.string().min(1),
  pendingMutations: z.number().int().nonnegative(),
  pendingUploads: z.number().int().nonnegative(),
  pendingBytes: z.number().int().nonnegative(),
  oldestPendingAt: IsoDateTimeSchema.optional(),
  batteryLevel: z.number().min(0).max(1).optional(),
  freeStorageBytes: z.number().int().nonnegative().optional(),
  scopeEpoch: z.number().int().nonnegative(),
  clockOffsetMs: z.number().int().optional(),
  pushStatus: PushStatusEnum.optional(),
});
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

/** Telemetry carries no personally identifiable information. */
export const TelemetryEventSchema = z.object({
  name: z.string().min(1),
  occurredAt: IsoDateTimeSchema,
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export const MutationEnvelopeSchema = z.object({
  /** The client generated mutation id, used for idempotency. */
  id: UuidSchema,
  name: MutationNameEnum,
  payload: z.unknown(),
  occurredAt: IsoDateTimeSchema,
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type MutationEnvelope = z.infer<typeof MutationEnvelopeSchema>;

export const PUSH_BATCH_MIN = 1;
export const PUSH_BATCH_MAX = 50;

/**
 * Lowest app version whose payload schema each mutation accepts (EC-SYN-09). Raise an entry
 * when a mutation's payload changes in a way older apps cannot satisfy; a payload that fails
 * validation from an app below this version is rejected with `VALIDATION_FAILED` and the
 * `schemaUpdate` context, so the device asks the user to update instead of "check the data".
 */
export const MUTATION_MIN_APP_VERSION: Readonly<Partial<Record<MutationName, string>>> = {};

/** Compares dotted numeric app versions (`1.2.10` > `1.2.9`); non-numeric parts count as 0. */
export function compareAppVersions(left: string, right: string): number {
  const parts = (value: string): number[] => value.split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < 3; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}
export const TELEMETRY_BATCH_MAX = 50;

export const PushRequestSchema = z.object({
  deviceId: UuidSchema,
  clientTime: IsoDateTimeSchema,
  deviceStatus: DeviceStatusSchema,
  /** One to fifty envelopes, in ascending client sequence order. */
  mutations: z.array(MutationEnvelopeSchema).min(PUSH_BATCH_MIN).max(PUSH_BATCH_MAX),
  telemetry: z.array(TelemetryEventSchema).max(TELEMETRY_BATCH_MAX).optional(),
});
export type PushRequest = z.infer<typeof PushRequestSchema>;

export const MutationStatusEnum = z.enum(["APPLIED", "REJECTED", "RETRY"]);
export type MutationStatus = z.infer<typeof MutationStatusEnum>;

/**
 * Snapshot of the server row returned with a rejection so the device can rebase.
 * `null` means the entity is no longer inside the caller's pull scope and the
 * local row must be evicted.
 */
export const MutationSnapshotSchema = z.object({
  table: z.string().min(1),
  row: z.record(z.string(), z.unknown()),
});
export type MutationSnapshot = z.infer<typeof MutationSnapshotSchema>;

/**
 * `code` is an `ErrorCode` from ARCHITECTURE section 21.5. It is typed as a
 * string here so that the wire schema does not depend on the error catalog
 * module; handlers narrow it with `ErrorCodeSchema` from `./errors.js`.
 */
export const MutationResultSchema = z.discriminatedUnion("status", [
  z.object({
    id: UuidSchema,
    status: z.literal("APPLIED"),
    /** Server assigned values, for example `{ number: "FR-000482" }`. */
    assigned: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    id: UuidSchema,
    status: z.literal("REJECTED"),
    code: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
    ref: z.string().optional(),
    message: z.string(),
    snapshot: MutationSnapshotSchema.nullable().optional(),
  }),
  z.object({
    id: UuidSchema,
    status: z.literal("RETRY"),
    retryAfterMs: z.number().int().nonnegative().optional(),
  }),
]);
export type MutationResult = z.infer<typeof MutationResultSchema>;

export const PushResponseSchema = z.object({
  results: z.array(MutationResultSchema),
  serverTime: IsoDateTimeSchema,
});
export type PushResponse = z.infer<typeof PushResponseSchema>;

/**
 * Collections pulled to the device, in the fixed order of ARCHITECTURE section 7.5.
 * The last five entries are P1 tables.
 */
export const TABLE_ORDER = [
  "organization",
  "users",
  "sites",
  "plots",
  "seasons",
  "customers",
  "assets",
  "checklistTemplates",
  "damages",
  "fieldReports",
  "workOrders",
  "workOrderParts",
  "rentals",
  "rentalCharges",
  "inspections",
  "media",
  "activityEvents",
  "notifications",
  "comments",
  "parts",
  "stockLocations",
  "stockLevels",
  "maintenancePlans",
  "fuelLogs",
] as const;

export const TableNameSchema = z.enum(TABLE_ORDER);
export type TableName = z.infer<typeof TableNameSchema>;

/** Bootstrap phases of the first sync (ARCHITECTURE section 7.5). */
export const SYNC_PHASES = [1, 2, 3] as const;
export type SyncPhase = (typeof SYNC_PHASES)[number];

/** Decoded shape of the opaque base64url pull cursor. */
export const PullCursorSchema = z.object({
  v: z.literal(1),
  phase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  snap: z.number().int().nonnegative(),
  after: z.number().int().nonnegative(),
});
export type PullCursor = z.infer<typeof PullCursorSchema>;

export const PULL_PAGE_LIMIT = 1000;

export const PullRequestSchema = z.object({
  /** Opaque base64url token; absent on the first ever pull. */
  cursor: z.string().min(1).optional(),
  deviceId: UuidSchema,
  scopeEpoch: z.number().int().nonnegative(),
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

export const PullResponseSchema = z.object({
  cursor: z.string().min(1),
  /** The client loops immediately while true. */
  hasMore: z.boolean(),
  /** The client keeps dirty rows, resets clean mirrors and rebases. */
  resetRequired: z.boolean(),
  scopeEpoch: z.number().int().nonnegative(),
  /** Full rows in DTO shape, upserted by the client. Only changed tables are present. */
  changes: z
    .partialRecord(TableNameSchema, z.array(z.record(z.string(), z.unknown())))
    .default({}),
  /** Tombstoned ids, deleted by the client. Only affected tables are present. */
  deleted: z.partialRecord(TableNameSchema, z.array(UuidSchema)).default({}),
  /** The caller's own mutation resolutions since the cursor. */
  resolvedMutations: z.array(MutationResultSchema).default([]),
  serverTime: IsoDateTimeSchema,
});
export type PullResponse = z.infer<typeof PullResponseSchema>;

/** Health probe body expected before any credentialed push or pull. */
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  app: z.literal("agrorende"),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Offline time normalization tolerance (ARCHITECTURE section 7.3 step 2.5). */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/** Exponential backoff for RETRY and network errors: 2 s, 4 s ... capped at 5 min, with jitter. */
export const SYNC_BACKOFF_BASE_MS = 2_000;
export const SYNC_BACKOFF_MAX_MS = 5 * 60 * 1000;
export const SYNC_BACKOFF_JITTER_RATIO = 0.2;

/** Throughput below this threshold sends mutations and thumbnails first. */
export const SLOW_LINK_BYTES_PER_SECOND = 50 * 1024;

/** Maximum synced documents written in a single sync transaction. */
export const MAX_SYNCED_DOCS_PER_TX = 500;

/**
 * Returns the backoff delay for a retry attempt, in milliseconds, before jitter.
 * Attempt 1 waits `SYNC_BACKOFF_BASE_MS`.
 */
export function syncBackoffMs(attempt: number): number {
  const exponent = Math.max(0, Math.floor(attempt) - 1);
  return Math.min(SYNC_BACKOFF_BASE_MS * 2 ** exponent, SYNC_BACKOFF_MAX_MS);
}

/** Media metadata carried by mutations that attach evidence (ARCHITECTURE section 7.3). */
export const MediaParentRefSchema = z.object({
  type: z.string().min(1),
  id: UuidSchema,
});

export const MediaMetaSchema = z.object({
  id: UuidSchema,
  kind: z.string().min(1),
  tag: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  capturedAt: IsoDateTimeSchema,
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  parent: MediaParentRefSchema,
  checklistItemKey: z.string().min(1).optional(),
  damageId: UuidSchema.optional(),
});
export type MediaMeta = z.infer<typeof MediaMetaSchema>;

/** Language frozen on customer facing documents. */
export const DocumentLocaleSchema = LocaleSchema;
