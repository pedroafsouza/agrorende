import type { ActivityEvent, Asset } from "@agrorende/db";

import type { Ctx } from "../../context";
import { reject } from "../../errors";
import { AssetListFilterSchema, type AssetDTO, type AssetHistoryEntry, type AssetListFilter } from "./dto";
import { clampLimit, escapeRegex, pageOf, parseCursor, readDb, type Page, parseInput } from "./kit";
import { toAssetDto } from "./service";

export async function listAssets(ctx: Pick<Ctx, "orgId">, raw: Partial<AssetListFilter> = {}): Promise<Page<AssetDTO>> {
  const f = parseInput(AssetListFilterSchema, raw);
  const db = await readDb(ctx);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (f.category !== undefined) filter.category = f.category;
  if (f.condition !== undefined) filter.condition = f.condition;
  else if (f.includeRetired !== "true") filter.condition = { $ne: "RETIRED" };
  if (f.siteId !== undefined) filter.$or = [{ currentSiteId: f.siteId }, { homeSiteId: f.siteId }];
  if (f.rentable !== undefined) filter.isRentable = f.rentable === "true";
  if (f.q !== undefined && f.q.length > 0) {
    const pattern = new RegExp(escapeRegex(f.q), "iu");
    const search = [{ code: pattern }, { name: pattern }, { plate: pattern }, { serialNumber: pattern }];
    if (filter.$or === undefined) filter.$or = search;
    else filter.$and = [{ $or: filter.$or }, { $or: search }];
    if (filter.$and !== undefined) delete filter.$or;
  }
  const offset = parseCursor(f.cursor);
  const limit = clampLimit(f.limit);
  const docs: Asset[] = await db.assets.find(filter).sort({ code: 1, _id: 1 }).skip(offset).limit(limit + 1).toArray();
  return pageOf(docs.map(toAssetDto), offset, limit);
}

export async function getAsset(ctx: Pick<Ctx, "orgId">, assetId: string): Promise<AssetDTO> {
  const db = await readDb(ctx);
  const doc = await db.assets.findOne({ _id: assetId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "ASSET", entityId: assetId });
  return toAssetDto(doc);
}

/** Asset history: its own events plus any event whose meta references it (WOs, reports, rentals). */
export async function assetHistory(
  ctx: Pick<Ctx, "orgId">,
  assetId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<Page<AssetHistoryEntry>> {
  const db = await readDb(ctx);
  const exists = await db.assets.findOne({ _id: assetId }, { projection: { _id: 1 } });
  if (exists === null) return reject("NOT_FOUND", { entityType: "ASSET", entityId: assetId });
  const offset = parseCursor(opts.cursor);
  const limit = clampLimit(opts.limit);
  const rows: ActivityEvent[] = await db.activity_events
    .find({ $or: [{ entityId: assetId }, { "meta.assetId": assetId }] })
    .sort({ occurredAt: -1, _id: -1 })
    .skip(offset)
    .limit(limit + 1)
    .toArray();
  const items = rows.map((row) => ({
    id: row._id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorId: row.actorId ?? null,
    fromStatus: row.fromStatus ?? null,
    toStatus: row.toStatus ?? null,
    meta: row.meta,
    occurredAt: row.occurredAt.toISOString(),
  }));
  return pageOf(items, offset, limit);
}
