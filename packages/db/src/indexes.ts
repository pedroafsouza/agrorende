import type { CreateIndexesOptions, IndexSpecification } from "mongodb";

import type { CollectionName } from "./types.js";

export interface IndexDefinition {
  readonly collection: CollectionName;
  readonly keys: IndexSpecification;
  readonly options?: CreateIndexesOptions;
}

function index(collection: CollectionName, keys: IndexSpecification, options?: CreateIndexesOptions): IndexDefinition {
  return { collection, keys, options };
}

const partialString = (field: string): CreateIndexesOptions => ({
  unique: true,
  partialFilterExpression: { [field]: { $type: "string" } },
});

const ARCHITECTURE_INDEXES: readonly IndexDefinition[] = [
  index("users", { organizationId: 1, syncVersion: 1 }),
  index("users", { email: 1 }, partialString("email")),
  index("refresh_tokens", { organizationId: 1 }),
  index("refresh_tokens", { userId: 1 }),
  index("refresh_tokens", { familyId: 1 }),
  index("refresh_tokens", { tokenHash: 1 }, { unique: true }),
  index("user_identities", { userId: 1 }),
  index("user_identities", { provider: 1, subject: 1 }, { unique: true }),
  index("auth_links", { userId: 1, kind: 1 }),
  index("auth_links", { codeHash: 1 }, { unique: true }),
  index("platform_audit_events", { organizationId: 1, createdAt: 1 }),
  index("devices", { organizationId: 1, lastSyncAt: 1 }),
  index("devices", { installationId: 1, userId: 1 }, { unique: true }),
  index("device_diagnostics", { organizationId: 1, createdAt: 1 }),
  index("sites", { organizationId: 1, syncVersion: 1 }),
  index("plots", { organizationId: 1, syncVersion: 1 }),
  index("seasons", { organizationId: 1, syncVersion: 1 }),
  index("customers", { organizationId: 1, syncVersion: 1 }),
  index("assets", { organizationId: 1, syncVersion: 1 }),
  index("assets", { organizationId: 1, code: 1 }, { unique: true }),
  index("field_reports", { organizationId: 1, syncVersion: 1 }),
  index("work_orders", { organizationId: 1, syncVersion: 1 }),
  index("work_orders", { organizationId: 1, status: 1 }),
  index("work_orders", { organizationId: 1, assigneeId: 1 }),
  index("work_order_parts", { organizationId: 1, syncVersion: 1 }),
  index("comments", { organizationId: 1, syncVersion: 1 }),
  index("comments", { entityType: 1, entityId: 1 }),
  index("rentals", { organizationId: 1, syncVersion: 1 }),
  index("rentals", { organizationId: 1, status: 1 }),
  index("rentals", { assetId: 1, plannedStart: 1 }),
  index("rental_charges", { organizationId: 1, syncVersion: 1 }),
  index("inspections", { organizationId: 1, syncVersion: 1 }),
  index("damages", { organizationId: 1, syncVersion: 1 }),
  index("damages", { assetId: 1, repairedAt: 1 }),
  index("checklist_templates", { organizationId: 1, syncVersion: 1 }),
  index("media", { organizationId: 1, syncVersion: 1 }),
  index("media", { "parent.type": 1, "parent.id": 1 }),
  index("media", { damageId: 1 }),
  index("location_pings", { organizationId: 1, recordedAt: 1 }),
  index("location_pings", { userId: 1, recordedAt: 1 }, { unique: true }),
  index("location_pings", { recordedAt: 1 }, { expireAfterSeconds: 2_592_000 }),
  index("activity_events", { organizationId: 1, syncVersion: 1 }),
  index("activity_events", { organizationId: 1, occurredAt: 1 }),
  index("activity_events", { entityType: 1, entityId: 1 }),
  index("notifications", { organizationId: 1, syncVersion: 1 }),
  index("notifications", { userId: 1, readAt: 1 }),
  index("export_jobs", { organizationId: 1, status: 1, createdAt: 1 }),
  index("event_outbox", { dispatchedAt: 1, createdAt: 1 }),
  index("event_outbox", { dispatchedAt: 1 }, { expireAfterSeconds: 604_800 }),
  index("processed_mutations", { organizationId: 1, mutationId: 1 }),
  index("processed_mutations", { organizationId: 1, "result.status": 1, resolvedAt: 1 }),
  index("processed_mutations", { processedAt: 1 }, { expireAfterSeconds: 34_560_000 }),
  index("maintenance_plans", { organizationId: 1, syncVersion: 1 }),
  index("fuel_logs", { organizationId: 1, syncVersion: 1 }),
  index("parts", { organizationId: 1, syncVersion: 1 }),
  index("parts", { organizationId: 1, sku: 1 }, { unique: true }),
  index("stock_locations", { organizationId: 1, syncVersion: 1 }),
  index("stock_levels", { organizationId: 1, syncVersion: 1 }),
  index("stock_levels", { partId: 1, stockLocationId: 1 }, { unique: true }),
  index("stock_movements", { organizationId: 1, syncVersion: 1 }),
  index("billing_documents", { organizationId: 1, syncVersion: 1 }),
];

/**
 * Sort-supporting indexes added by PERF-QUERIES (change request PERF-QUERIES-001). Each one lets a
 * hot admin list or count read its page straight from the index instead of scanning the whole
 * organisation and sorting in memory. Migration 0003-PERF-QUERIES creates them on existing databases.
 */
export const PERF_QUERY_INDEXES: readonly IndexDefinition[] = [
  index("activity_events", { organizationId: 1, occurredAt: -1, _id: -1 }),
  index("activity_events", { entityId: 1, occurredAt: -1, _id: -1 }),
  index("activity_events", { "meta.assetId": 1, occurredAt: -1, _id: -1 }),
  index("work_orders", { organizationId: 1, dueAt: 1, createdAt: -1, _id: 1 }),
  index("work_orders", { organizationId: 1, status: 1, completedAt: 1 }),
  index("field_reports", { organizationId: 1, status: 1, receivedAt: -1 }),
  index("field_reports", { organizationId: 1, occurredAt: -1, _id: -1 }),
  index("notifications", { userId: 1, createdAt: -1, _id: -1 }),
  index("rental_charges", { rentalId: 1, isAuto: -1, createdAt: 1, _id: 1 }),
  index("rentals", { organizationId: 1, plannedStart: -1, _id: 1 }),
  index("media", { organizationId: 1, status: 1, createdAt: 1 }),
];

export const INDEXES: readonly IndexDefinition[] = [...ARCHITECTURE_INDEXES, ...PERF_QUERY_INDEXES];
