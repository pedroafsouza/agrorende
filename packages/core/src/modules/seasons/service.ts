import { AppError } from "@agrorende/contracts/errors";
import type { AssetCategory } from "@agrorende/contracts/enums";
import type { Tx } from "@agrorende/contracts/seams";
import type { Season } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { OPEN_STATUSES, REPAIR_STATUSES } from "../assets/service.js";
import { assertVersion, dbTx, newId, stampCreate, stampUpdate, toDto, writeActivity, parseInput } from "../assets/kit.js";
import {
  SeasonCloseInputSchema,
  SeasonCreateInputSchema,
  SeasonUpdateInputSchema,
  type CriticalWindow,
  type SeasonCloseInput,
  type SeasonCloseResult,
  type SeasonCreateInput,
  type SeasonDTO,
  type SeasonOpenWork,
  type SeasonUpdateInput,
} from "./dto.js";

export function toSeasonDto(doc: Season): SeasonDTO {
  return toDto<SeasonDTO>(doc);
}

function orgGuard(tx: Tx, orgId: string) {
  const scopedTx = dbTx(tx);
  if (scopedTx.orgId !== orgId) reject("FORBIDDEN", { orgId });
  return scopedTx;
}

/** Seam `seasons.currentSeasonId` (DELIVERY-PLAN §4, ARCHITECTURE §6.4 Current season). */
export async function currentSeasonId(tx: Tx, orgId: string): Promise<string | null> {
  const doc = await orgGuard(tx, orgId).db.seasons.findOne({ isCurrent: true, deletedAt: null }, { projection: { _id: 1 } });
  return doc?._id ?? null;
}

function isoDate(at: Date, timeZone: string | undefined): string {
  if (timeZone === undefined) return at.toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  return parts;
}

/** Pure lookup used by the seam and by tests. Dates are inclusive org-local calendar days. */
export function findCriticalWindow(windows: readonly CriticalWindow[], category: AssetCategory, day: string): CriticalWindow | null {
  return (
    windows.find(
      (window) => window.startsOn <= day && day <= window.endsOn && (window.assetCategories.length === 0 || window.assetCategories.includes(category)),
    ) ?? null
  );
}

/** Seam `seasons.criticalWindowFor` (DELIVERY-PLAN §4): the current season's window covering `at`. */
export async function criticalWindowFor(
  tx: Tx,
  orgId: string,
  category: AssetCategory,
  at: Date,
  timeZone?: string,
): Promise<CriticalWindow | null> {
  const season = await orgGuard(tx, orgId).db.seasons.findOne({ isCurrent: true, deletedAt: null });
  if (season === null) return null;
  return findCriticalWindow(season.criticalWindows, category, isoDate(at, timeZone));
}

/** EC-ERP-01: overlap is rejected for the same crop; a null crop covers the whole farm. */
async function assertNoOverlap(tx: Tx, candidate: { crop: string | null; startsOn: string; endsOn: string }, exceptId?: string): Promise<void> {
  const filter: Record<string, unknown> = { deletedAt: null, startsOn: { $lte: candidate.endsOn }, endsOn: { $gte: candidate.startsOn } };
  if (exceptId !== undefined) filter._id = { $ne: exceptId };
  const overlapping = await dbTx(tx).db.seasons.find(filter).toArray();
  const normalize = (crop: string | null | undefined) => (crop ?? "").trim().toLocaleLowerCase("pt-BR");
  const clash = overlapping.find((other) => {
    const a = normalize(candidate.crop);
    const b = normalize(other.crop);
    return a === "" || b === "" || a === b;
  });
  if (clash !== undefined) {
    throw new AppError("SEASON_OVERLAP", {
      details: { seasonId: clash._id, name: clash.name, startsOn: clash.startsOn, endsOn: clash.endsOn },
      fieldErrors: [{ path: "startsOn", code: "overlap" }],
    });
  }
}

async function clearCurrent(tx: Tx, exceptId: string): Promise<void> {
  const scopedTx = dbTx(tx);
  await scopedTx.db.seasons.updateMany({ isCurrent: true, _id: { $ne: exceptId } }, { $set: { isCurrent: false, ...stampUpdate(scopedTx) } });
}

export async function createSeason(tx: Tx, ctx: Ctx, raw: SeasonCreateInput): Promise<SeasonDTO> {
  const input = parseInput(SeasonCreateInputSchema, raw);
  const scopedTx = dbTx(tx);
  await assertNoOverlap(tx, { crop: input.crop ?? null, startsOn: input.startsOn, endsOn: input.endsOn });
  const now = new Date();
  const doc: Season = {
    _id: newId(now.getTime()),
    organizationId: scopedTx.orgId,
    ...stampCreate(scopedTx, now),
    deletedAt: null,
    name: input.name,
    crop: input.crop ?? null,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    isCurrent: input.isCurrent,
    criticalWindows: input.criticalWindows,
  };
  if (doc.isCurrent) await clearCurrent(tx, doc._id);
  await scopedTx.db.seasons.insertOne(doc);
  await writeActivity(scopedTx, { entityType: "SEASON", entityId: doc._id, action: "season.created", actorId: ctx.userId });
  return toSeasonDto(doc);
}

async function loadSeason(tx: Tx, seasonId: string): Promise<Season> {
  const doc = await dbTx(tx).db.seasons.findOne({ _id: seasonId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "SEASON", entityId: seasonId });
  return doc;
}

export async function updateSeason(tx: Tx, ctx: Ctx, seasonId: string, raw: SeasonUpdateInput, ifMatch?: string | null): Promise<SeasonDTO> {
  const input = parseInput(SeasonUpdateInputSchema, raw);
  const scopedTx = dbTx(tx);
  const season = await loadSeason(tx, seasonId);
  assertVersion(season, ifMatch);
  const merged = {
    crop: input.crop !== undefined ? input.crop : (season.crop ?? null),
    startsOn: input.startsOn ?? season.startsOn,
    endsOn: input.endsOn ?? season.endsOn,
  };
  if (merged.startsOn > merged.endsOn) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "endsOn", code: "range" }] });
  }
  if (input.crop !== undefined || input.startsOn !== undefined || input.endsOn !== undefined) {
    await assertNoOverlap(tx, merged, seasonId);
  }
  if (input.isCurrent === true) await clearCurrent(tx, seasonId);
  await scopedTx.db.seasons.updateOne({ _id: seasonId }, { $set: { ...input, ...stampUpdate(scopedTx) } });
  await writeActivity(scopedTx, { entityType: "SEASON", entityId: seasonId, action: "season.updated", actorId: ctx.userId });
  return toSeasonDto(await loadSeason(tx, seasonId));
}

export async function openWorkForSeason(tx: Tx, seasonId: string): Promise<SeasonOpenWork> {
  const db = dbTx(tx).db;
  const [workOrders, rentals] = await Promise.all([
    db.work_orders.find({ seasonId, deletedAt: null, status: { $in: [...OPEN_STATUSES, ...REPAIR_STATUSES] } }, { projection: { _id: 1 } }).toArray(),
    db.rentals.find({ seasonId, deletedAt: null, status: { $in: ["RESERVED", "ACTIVE", "RETURNED"] } }, { projection: { _id: 1 } }).toArray(),
  ]);
  return { openWorkOrders: workOrders.length, activeRentals: rentals.length };
}

/**
 * EC-ERP-06: closing a season with open work returns warning data first; the admin may
 * confirm with a note to close anyway. Closing clears `isCurrent`.
 */
export async function closeSeason(tx: Tx, ctx: Ctx, seasonId: string, raw: SeasonCloseInput): Promise<SeasonCloseResult> {
  const input = parseInput(SeasonCloseInputSchema, raw);
  const scopedTx = dbTx(tx);
  await loadSeason(tx, seasonId);
  const openWork = await openWorkForSeason(tx, seasonId);
  const hasOpen = openWork.openWorkOrders + openWork.activeRentals > 0;
  if (hasOpen && !input.confirmOpenWork) {
    return { closed: false, warning: "SEASON_OPEN_WORK_WARNING", openWork };
  }
  await scopedTx.db.seasons.updateOne({ _id: seasonId }, { $set: { isCurrent: false, ...stampUpdate(scopedTx) } });
  await writeActivity(scopedTx, {
    entityType: "SEASON",
    entityId: seasonId,
    action: "season.closed",
    actorId: ctx.userId,
    meta: { ...openWork, note: input.note ?? null, closedWithOpenWork: hasOpen },
  });
  return { closed: true, season: toSeasonDto(await loadSeason(tx, seasonId)) };
}
