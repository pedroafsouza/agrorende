import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";

import { collection, collections, COLLECTION_NAMES, getDb, type CollectionName } from "@agrorende/db";

import type { Db } from "./usage";

/** Staff identity recorded on audit rows written by the worker. */
export const SYSTEM_ACTOR = "system@agrorende.app";

/**
 * Dependency-safe purge order: children before parents, people and identities after the work that
 * references them, counters last. Collections not listed here are swept afterwards by `organizationId`.
 */
export const PURGE_ORDER = [
  "location_pings",
  "activity_events",
  "notifications",
  "comments",
  "media",
  "event_outbox",
  "processed_mutations",
  "export_jobs",
  "device_diagnostics",
  "devices",
  "stock_movements",
  "stock_levels",
  "stock_locations",
  "parts",
  "fuel_logs",
  "maintenance_plans",
  "billing_documents",
  "rental_charges",
  "damages",
  "inspections",
  "rentals",
  "work_order_parts",
  "work_orders",
  "field_reports",
  "checklist_templates",
  "assets",
  "plots",
  "sites",
  "seasons",
  "customers",
  "auth_links",
  "refresh_tokens",
  "user_identities",
  "users",
  "number_sequences",
  "org_usage",
] as const satisfies readonly CollectionName[];

/** Never purged: the platform audit trail outlives the tenant. */
const KEEP: readonly CollectionName[] = ["platform_audit_events", "organizations", "sync_counters"];

export interface PurgeResult {
  readonly organizationId: string;
  readonly deleted: Readonly<Record<string, number>>;
  readonly mediaFolders: readonly string[];
}

function insideRoot(root: string, relative: string): string {
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error("Purge path escapes MEDIA_ROOT");
  return target;
}

/**
 * Deletes every row of one organisation and its media/export folders, then writes `org.purge` to the
 * platform audit. Only the given organisation's rows match; other tenants are never touched.
 */
export async function purgeOrganization(organizationId: string, options: { readonly mediaRoot: string; readonly now: Date; readonly db?: Db; readonly actorEmail?: string }): Promise<PurgeResult> {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Purge needs an organisation UUID");
  const db = options.db ?? (await getDb());
  const org = await collections.organizations(db).findOne({ _id: organizationId }, { projection: { _id: 1, name: 1, status: 1, purgeAfter: 1 } });
  const deleted: Record<string, number> = {};
  const listed = new Set<string>(PURGE_ORDER);
  const rest = COLLECTION_NAMES.filter((name) => !listed.has(name) && !KEEP.includes(name));
  for (const name of [...PURGE_ORDER, ...rest]) {
    const result = await collection(db, name).deleteMany({ organizationId } as never);
    if (result.deletedCount > 0) deleted[name] = result.deletedCount;
  }
  const folders = [`org/${organizationId}`, `exports/${organizationId}`];
  for (const folder of folders) {
    await rm(insideRoot(options.mediaRoot, folder), { recursive: true, force: true });
  }
  const counter = await collection(db, "sync_counters").deleteOne({ _id: organizationId });
  if (counter.deletedCount > 0) deleted.sync_counters = counter.deletedCount;
  const orgResult = await collections.organizations(db).deleteOne({ _id: organizationId });
  if (orgResult.deletedCount > 0) deleted.organizations = orgResult.deletedCount;
  await collections.platformAuditEvents(db).insertOne({
    _id: randomUUID(),
    actorEmail: options.actorEmail ?? SYSTEM_ACTOR,
    action: "org.purge",
    organizationId,
    reason: "purgeAfter reached",
    details: { name: org?.name ?? null, purgeAfter: org?.purgeAfter?.toISOString() ?? null, deleted, mediaFolders: folders },
    createdAt: options.now,
  });
  return { organizationId, deleted, mediaFolders: folders };
}

/** `orgs.purge`: purges every CANCELLED organisation whose `purgeAfter` has passed. */
export async function runOrgPurge(options: { readonly mediaRoot: string; readonly now: Date; readonly db?: Db }): Promise<PurgeResult[]> {
  const db = options.db ?? (await getDb());
  const due = await collections
    .organizations(db)
    .find({ status: "CANCELLED", purgeAfter: { $ne: null, $lte: options.now } }, { projection: { _id: 1 } })
    .toArray();
  const results: PurgeResult[] = [];
  for (const org of due) {
    results.push(await purgeOrganization(org._id, { ...options, db }));
  }
  return results;
}
