import { AppError } from "@agrorende/contracts/errors";
import type { AssetCategory, AssetCondition, WorkOrderStatus } from "@agrorende/contracts/enums";
import type { EntityRef } from "@agrorende/contracts/dto";
import type { AssetSummary, Ctx as SeamCtx, Tx } from "@agrorende/contracts/seams";
import type { Asset } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { next as nextNumber } from "../../numbering/index.js";
import {
  AssetCreateInputSchema,
  AssetRetireInputSchema,
  AssetUpdateInputSchema,
  type AssetCreateInput,
  type AssetDTO,
  type AssetRetireInput,
  type AssetUpdateInput,
} from "./dto.js";
import { assertVersion, dbTx, newId, stampCreate, stampUpdate, toDto, writeActivity, parseInput } from "./kit.js";

export const REPAIR_STATUSES: readonly WorkOrderStatus[] = ["IN_PROGRESS", "ON_HOLD"];
export const OPEN_STATUSES: readonly WorkOrderStatus[] = ["OPEN", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ON_SITE"];
const MANUAL_CONDITIONS: readonly AssetCondition[] = ["OUT_OF_SERVICE", "RETIRED"];

export function toAssetDto(doc: Asset): AssetDTO {
  return toDto<AssetDTO>(doc);
}

export function toSummary(doc: Asset): AssetSummary {
  return {
    id: doc._id,
    code: doc.code,
    name: doc.name,
    category: doc.category,
    condition: doc.condition,
    ownerType: doc.ownerType,
    homeSiteId: doc.homeSiteId ?? null,
    currentSiteId: doc.currentSiteId ?? null,
    currentRentalId: doc.currentRentalId ?? null,
    lastLat: doc.lastLat ?? null,
    lastLng: doc.lastLng ?? null,
    hourMeter: doc.hourMeter ?? null,
    odometerKm: doc.odometerKm ?? null,
    tankCapacityL: doc.tankCapacityL ?? null,
    isRentable: doc.isRentable,
    defaultRateCents: doc.defaultRateCents ?? null,
    defaultRateUnit: doc.defaultRateUnit ?? null,
  };
}

async function loadAsset(tx: Tx, assetId: string): Promise<Asset> {
  const doc = await dbTx(tx).db.assets.findOne({ _id: assetId, deletedAt: null });
  if (doc === null) {
    return reject("NOT_FOUND", { entityType: "ASSET", entityId: assetId });
  }
  return doc;
}

/** Seam `assets.getSummary` (DELIVERY-PLAN §4). */
export async function getSummary(tx: Tx, assetId: string): Promise<AssetSummary> {
  return toSummary(await loadAsset(tx, assetId));
}

/** Seam `assets.listSummaries` (DELIVERY-PLAN §4). `orgId` is enforced by the scoped tx. */
export async function listSummaries(
  tx: Tx,
  orgId: string,
  f: { ids?: string[]; category?: AssetCategory; includeRetired?: boolean },
): Promise<AssetSummary[]> {
  const scopedTx = dbTx(tx);
  if (scopedTx.orgId !== orgId) {
    reject("FORBIDDEN", { orgId });
  }
  const filter: Record<string, unknown> = { deletedAt: null };
  if (f.ids !== undefined) filter._id = { $in: f.ids };
  if (f.category !== undefined) filter.category = f.category;
  if (f.includeRetired !== true) filter.condition = { $ne: "RETIRED" };
  const docs = await scopedTx.db.assets.find(filter).sort({ code: 1 }).toArray();
  return docs.map(toSummary);
}

/** Pure rule of ARCHITECTURE §6.4, exported for tests and for read-side previews. */
export function deriveCondition(
  current: AssetCondition,
  facts: { readonly hasRepairWorkOrder: boolean; readonly hasOpenWorkOrder: boolean; readonly hasBlockingReport: boolean; readonly hasSevereDamage: boolean },
): AssetCondition {
  if (MANUAL_CONDITIONS.includes(current)) return current;
  if (facts.hasRepairWorkOrder) return "IN_REPAIR";
  if (facts.hasOpenWorkOrder || facts.hasBlockingReport || facts.hasSevereDamage) return "NEEDS_REPAIR";
  return "OPERATIONAL";
}

/** Seam `assets.recomputeCondition` (DELIVERY-PLAN §4, ARCHITECTURE §6.4). */
export async function recomputeCondition(tx: Tx, assetId: string, actorId: string | null = null): Promise<AssetCondition> {
  const scopedTx = dbTx(tx);
  const asset = await loadAsset(tx, assetId);
  if (MANUAL_CONDITIONS.includes(asset.condition)) {
    return asset.condition;
  }
  const db = scopedTx.db;
  const [repair, open, report, damage] = await Promise.all([
    db.work_orders.findOne({ assetId, deletedAt: null, status: { $in: [...REPAIR_STATUSES] } }, { projection: { _id: 1 } }),
    db.work_orders.findOne({ assetId, deletedAt: null, status: { $in: [...OPEN_STATUSES] } }, { projection: { _id: 1 } }),
    db.field_reports.findOne(
      { assetId, deletedAt: null, status: { $in: ["SUBMITTED", "IN_REVIEW"] }, $or: [{ machineOperable: false }, { priority: "CRITICAL" }] },
      { projection: { _id: 1 } },
    ),
    db.damages.findOne({ assetId, deletedAt: null, severity: "SEVERE", repairedAt: null }, { projection: { _id: 1 } }),
  ]);
  const next = deriveCondition(asset.condition, {
    hasRepairWorkOrder: repair !== null,
    hasOpenWorkOrder: open !== null,
    hasBlockingReport: report !== null,
    hasSevereDamage: damage !== null,
  });
  if (next !== asset.condition) {
    const now = new Date();
    await db.assets.updateOne({ _id: assetId }, { $set: { condition: next, conditionChangedAt: now, ...stampUpdate(scopedTx, now) } });
    await writeActivity(scopedTx, {
      entityType: "ASSET",
      entityId: assetId,
      action: "asset.conditionChanged",
      actorId,
      fromStatus: asset.condition,
      toStatus: next,
      occurredAt: now,
    });
  }
  return next;
}

/**
 * Seam `assets.applyReadings` (DELIVERY-PLAN §4). Readings are monotonic: a value lower than
 * the stored one is ignored and reported back, never rejected.
 */
export async function applyReadings(
  tx: Tx,
  ctx: SeamCtx,
  assetId: string,
  r: { hourMeter?: number; odometerKm?: number; source: EntityRef; meterReplaced?: boolean },
): Promise<{ ignored: ("hourMeter" | "odometerKm")[] }> {
  const scopedTx = dbTx(tx);
  const asset = await loadAsset(tx, assetId);
  const ignored: ("hourMeter" | "odometerKm")[] = [];
  const set: Record<string, number> = {};
  const changes: Record<string, { from: number | null; to: number }> = {};
  for (const key of ["hourMeter", "odometerKm"] as const) {
    const value = r[key];
    if (value === undefined) continue;
    const current = asset[key] ?? null;
    if (r.meterReplaced !== true && current !== null && value < current) {
      ignored.push(key);
      continue;
    }
    if (current !== value) {
      set[key] = value;
      changes[key] = { from: current, to: value };
    }
  }
  if (Object.keys(set).length > 0) {
    const now = new Date();
    await scopedTx.db.assets.updateOne({ _id: assetId }, { $set: { ...set, ...stampUpdate(scopedTx, now) } });
    await writeActivity(scopedTx, {
      entityType: "ASSET",
      entityId: assetId,
      action: r.meterReplaced === true ? "asset.meterReplaced" : "asset.readingsUpdated",
      actorId: ctx.userId,
      meta: { changes, source: r.source },
      occurredAt: now,
    });
  }
  return { ignored };
}

/** Seam `assets.setCustody` (DELIVERY-PLAN §4), used by rentals check-out and check-in. */
export async function setCustody(tx: Tx, assetId: string, c: { currentRentalId: string | null; currentSiteId?: string }): Promise<void> {
  const scopedTx = dbTx(tx);
  await loadAsset(tx, assetId);
  const set: Record<string, unknown> = { currentRentalId: c.currentRentalId, ...stampUpdate(scopedTx) };
  if (c.currentSiteId !== undefined) set.currentSiteId = c.currentSiteId;
  await scopedTx.db.assets.updateOne({ _id: assetId }, { $set: set });
}

function fieldError(path: string, code: string): never {
  throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path, code }] });
}

async function assertUniqueCode(tx: Tx, code: string, exceptId?: string): Promise<void> {
  const filter: Record<string, unknown> = { code, deletedAt: null };
  if (exceptId !== undefined) filter._id = { $ne: exceptId };
  const clash = await dbTx(tx).db.assets.findOne(filter, { projection: { _id: 1 } });
  if (clash !== null) fieldError("code", "duplicate");
}

export async function createAsset(tx: Tx, ctx: Ctx, raw: AssetCreateInput): Promise<AssetDTO> {
  const input = parseInput(AssetCreateInputSchema, raw);
  const scopedTx = dbTx(tx);
  const code = input.code ?? `AGR-${String(await nextNumber(ctx, { key: "AGR" })).padStart(6, "0")}`;
  await assertUniqueCode(tx, code);
  const now = new Date();
  const doc: Asset = {
    _id: newId(now.getTime()),
    organizationId: scopedTx.orgId,
    ...stampCreate(scopedTx, now),
    deletedAt: null,
    code,
    name: input.name,
    category: input.category,
    make: input.make ?? null,
    model: input.model ?? null,
    year: input.year ?? null,
    serialNumber: input.serialNumber ?? null,
    plate: input.plate ?? null,
    ownerType: input.ownerType,
    ownerCustomerId: input.ownerCustomerId ?? null,
    condition: "OPERATIONAL",
    conditionChangedAt: now,
    homeSiteId: input.homeSiteId ?? null,
    currentSiteId: input.homeSiteId ?? null,
    currentPlotId: null,
    lastLat: null,
    lastLng: null,
    lastLocatedAt: null,
    hourMeter: input.hourMeter ?? null,
    odometerKm: input.odometerKm ?? null,
    tankCapacityL: input.tankCapacityL ?? null,
    isRentable: input.isRentable,
    defaultRateCents: input.defaultRateCents ?? null,
    defaultRateUnit: input.defaultRateUnit ?? null,
    currentRentalId: null,
    coverMediaId: input.coverMediaId ?? null,
    specs: input.specs,
    notes: input.notes ?? null,
  };
  await scopedTx.db.assets.insertOne(doc);
  await writeActivity(scopedTx, { entityType: "ASSET", entityId: doc._id, action: "asset.created", actorId: ctx.userId, toStatus: doc.condition });
  return toAssetDto(doc);
}

export async function updateAsset(tx: Tx, ctx: Ctx, assetId: string, raw: AssetUpdateInput, ifMatch?: string | null): Promise<AssetDTO> {
  const input = parseInput(AssetUpdateInputSchema, raw);
  const scopedTx = dbTx(tx);
  const asset = await loadAsset(tx, assetId);
  assertVersion(asset, ifMatch);
  if (asset.condition === "RETIRED") {
    reject("INVALID_TRANSITION", { entityType: "ASSET", from: "RETIRED" });
  }
  if (input.code !== undefined && input.code !== null && input.code !== asset.code) {
    await assertUniqueCode(tx, input.code, assetId);
  }
  const { condition, ...fields } = input;
  const set: Record<string, unknown> = { ...fields, ...stampUpdate(scopedTx) };
  if (input.code === null) delete set.code;
  await scopedTx.db.assets.updateOne({ _id: assetId }, { $set: set });
  if (condition !== undefined && condition !== asset.condition) {
    if (condition === "OUT_OF_SERVICE") {
      const now = new Date();
      await scopedTx.db.assets.updateOne({ _id: assetId }, { $set: { condition, conditionChangedAt: now } });
      await writeActivity(scopedTx, { entityType: "ASSET", entityId: assetId, action: "asset.conditionChanged", actorId: ctx.userId, fromStatus: asset.condition, toStatus: condition });
    } else if (asset.condition === "OUT_OF_SERVICE") {
      const now = new Date();
      await scopedTx.db.assets.updateOne({ _id: assetId }, { $set: { condition: "OPERATIONAL", conditionChangedAt: now } });
      await writeActivity(scopedTx, { entityType: "ASSET", entityId: assetId, action: "asset.conditionChanged", actorId: ctx.userId, fromStatus: asset.condition, toStatus: "OPERATIONAL" });
      await recomputeCondition(tx, assetId, ctx.userId);
    }
  }
  return toAssetDto(await loadAsset(tx, assetId));
}

export async function retireAsset(tx: Tx, ctx: Ctx, assetId: string, raw: AssetRetireInput): Promise<AssetDTO> {
  const input = parseInput(AssetRetireInputSchema, raw);
  const scopedTx = dbTx(tx);
  const asset = await loadAsset(tx, assetId);
  if (asset.condition === "RETIRED") return toAssetDto(asset);
  if (asset.currentRentalId !== null && asset.currentRentalId !== undefined) {
    reject("RECORD_IN_USE", { entityType: "RENTAL", entityId: asset.currentRentalId });
  }
  const now = new Date();
  await scopedTx.db.assets.updateOne({ _id: assetId }, { $set: { condition: "RETIRED", conditionChangedAt: now, ...stampUpdate(scopedTx, now) } });
  await writeActivity(scopedTx, {
    entityType: "ASSET",
    entityId: assetId,
    action: "asset.conditionChanged",
    actorId: ctx.userId,
    fromStatus: asset.condition,
    toStatus: "RETIRED",
    meta: { reason: input.reason },
  });
  return toAssetDto(await loadAsset(tx, assetId));
}
