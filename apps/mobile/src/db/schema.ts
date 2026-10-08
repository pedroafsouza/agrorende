import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export * from "./mirror.generated";

/**
 * Local-only tables (ARCHITECTURE §7.1). They are never wiped by a scope reset.
 * Mirror tables for every pulled entity live in `mirror.generated.ts`.
 */

export const OUTBOX_STATUSES = ["PENDING", "IN_FLIGHT", "REJECTED"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const MEDIA_FILE_STATES = ["WAITING_PARENT", "QUEUED", "UPLOADING", "UPLOADED", "DONE", "FAILED"] as const;
export type MediaFileState = (typeof MEDIA_FILE_STATES)[number];

export const DRAFT_KINDS = ["FIELD_REPORT", "CHECK_OUT", "CHECK_IN", "WO_COMPLETE"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const outbox = sqliteTable(
  "outbox",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    entityType: text("entityType").notNull(),
    entityId: text("entityId").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    occurredAt: text("occurredAt").notNull(),
    lat: real("lat"),
    lng: real("lng"),
    status: text("status").$type<OutboxStatus>().notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("lastError"),
    nextAttemptAt: text("nextAttemptAt"),
    inFlightAt: text("inFlightAt"),
    pushAttemptId: text("pushAttemptId"),
    createdAt: text("createdAt").notNull(),
  },
  (table) => [
    uniqueIndex("outbox_id_unique").on(table.id),
    index("outbox_status_seq_idx").on(table.status, table.seq),
    index("outbox_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const mediaFiles = sqliteTable(
  "media_files",
  {
  mediaId: text("mediaId").primaryKey(),
  localUri: text("localUri").notNull(),
  thumbUri: text("thumbUri"),
  mimeType: text("mimeType").notNull(),
  sizeBytes: integer("sizeBytes"),
  kind: text("kind").notNull(),
  priority: integer("priority").notNull().default(0),
  state: text("state").$type<MediaFileState>().notNull(),
  uploadId: text("uploadId"),
  partSize: integer("partSize"),
  partsDone: text("partsDone", { mode: "json" }),
  bytesSent: integer("bytesSent").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: text("nextAttemptAt"),
  wifiOnly: integer("wifiOnly").notNull().default(0),
  doneAt: text("doneAt"),
  deleteAfter: text("deleteAfter"),
  },
  (table) => [index("media_files_state_idx").on(table.state, table.priority)],
);

export const locationBuffer = sqliteTable(
  "location_buffer",
  {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recordedAt: text("recordedAt").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  accuracyM: real("accuracyM"),
  speedMps: real("speedMps"),
  heading: real("heading"),
  batteryLevel: real("batteryLevel"),
  workOrderId: text("workOrderId"),
  sentAt: text("sentAt"),
  },
  (table) => [index("location_buffer_recorded_idx").on(table.recordedAt)],
);

export const drafts = sqliteTable("drafts", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<DraftKind>().notNull(),
  refId: text("refId"),
  step: text("step").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  updatedAt: text("updatedAt").notNull(),
});

export const conflicts = sqliteTable("conflicts", {
  id: text("id").primaryKey(),
  mutationId: text("mutationId").notNull(),
  name: text("name").notNull(),
  entityType: text("entityType").notNull(),
  entityId: text("entityId").notNull(),
  code: text("code").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: text("createdAt").notNull(),
  acknowledgedAt: text("acknowledgedAt"),
});

export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const diagnosticsQueue = sqliteTable("diagnostics_queue", {
  id: text("id").primaryKey(),
  createdAt: text("createdAt").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: text("nextAttemptAt"),
});
