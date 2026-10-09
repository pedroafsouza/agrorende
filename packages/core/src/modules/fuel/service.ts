import type { FuelLogDTO } from "@agrorende/contracts/dto";
import type { FuelLogCreatePayload } from "@agrorende/contracts/mutations";
import { RealtimeServerEvents, opsRoom } from "@agrorende/contracts/realtime";
import type { Tx } from "@agrorende/contracts/seams";
import type { FuelLog } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { emit } from "../../events/index.js";
import type { SyncTx } from "../../sync/types.js";
import { clampLimit, dbTx, newId, pageOf, parseCursor, parseInput, readDb, stampCreate, toDto, writeActivity, type Page } from "../assets/kit.js";
import { applyReadings, getSummary } from "../assets/service.js";
import { registerMedia } from "../media/service.js";
import { currentSeasonId } from "../seasons/service.js";
import { FuelLogCreateInputSchema, type FuelConsumptionDTO, type FuelConsumptionPoint, type FuelLogCreateInput, type FuelLogListFilters, type FuelLogListItem } from "./dto.js";

export type { FuelConsumptionDTO, FuelLogCreateInput, FuelLogListFilters, FuelLogListItem } from "./dto.js";

const OFFICE_ROLES = new Set(["ADMIN", "MANAGER"]);

export function toFuelLogDto(doc: FuelLog): FuelLogDTO {
  return toDto<FuelLogDTO>(doc as unknown as FuelLog & Record<string, unknown>);
}

export interface FuelLogMeta {
  readonly occurredAt?: Date;
  readonly lat?: number;
  readonly lng?: number;
}

/**
 * `fuelLog.create` (ERP-07, OFF-01): stores the fill-up, fills the current season, pushes the
 * readings through the monotonic `assets.applyReadings` seam (a lower hour meter is kept on the
 * log but ignored for the asset) and registers the pump photo. Idempotent by log id.
 */
export async function createFuelLog(tx: Tx, ctx: Ctx, payload: FuelLogCreatePayload & { filledAt?: string }, meta: FuelLogMeta = {}): Promise<FuelLogDTO> {
  const t = dbTx(tx);
  const existing = await t.db.fuel_logs.findOne({ _id: payload.id });
  if (existing !== null) return toFuelLogDto(existing);
  const asset = await getSummary(tx, payload.assetId);
  const now = new Date();
  const filledAt = payload.filledAt !== undefined ? new Date(payload.filledAt) : (meta.occurredAt ?? now);
  const pricePerLiterCents = payload.pricePerLiterCents ?? null;
  const doc: FuelLog = {
    _id: payload.id,
    organizationId: ctx.orgId,
    ...stampCreate(t, now),
    deletedAt: null,
    assetId: payload.assetId,
    liters: payload.liters,
    pricePerLiterCents,
    totalCents: pricePerLiterCents === null ? null : Math.round(payload.liters * pricePerLiterCents),
    hourMeter: payload.hourMeter ?? null,
    odometerKm: payload.odometerKm ?? null,
    siteId: payload.siteId ?? asset.currentSiteId ?? null,
    plotId: payload.plotId ?? null,
    seasonId: await currentSeasonId(tx, ctx.orgId),
    operatorId: ctx.userId,
    filledAt,
    lat: meta.lat ?? null,
    lng: meta.lng ?? null,
    notes: payload.notes ?? null,
  };
  await t.db.fuel_logs.insertOne(doc);
  let ignored: string[] = [];
  if (payload.hourMeter !== undefined || payload.odometerKm !== undefined) {
    const readings: { hourMeter?: number; odometerKm?: number } = {};
    if (payload.hourMeter !== undefined) readings.hourMeter = payload.hourMeter;
    if (payload.odometerKm !== undefined) readings.odometerKm = payload.odometerKm;
    ({ ignored } = await applyReadings(tx, ctx, payload.assetId, { ...readings, source: { entityType: "FUEL_LOG", entityId: payload.id } }));
  }
  for (const item of payload.media) {
    await registerMedia(t as unknown as SyncTx, ctx, { ...item, parent: { type: "FUEL_LOG", id: payload.id } }, { parentChecked: true });
  }
  await writeActivity(t, {
    entityType: "FUEL_LOG",
    entityId: payload.id,
    action: "fuelLog.created",
    actorId: ctx.userId,
    meta: { assetId: payload.assetId, liters: payload.liters, totalCents: doc.totalCents ?? null, ...(ignored.length > 0 ? { ignoredReadings: ignored } : {}) },
    occurredAt: now,
  });
  await emit(t as unknown as SyncTx, {
    type: RealtimeServerEvents.entityChanged,
    rooms: [opsRoom(ctx.orgId)],
    data: { entityType: "FUEL_LOG", id: payload.id, version: String(t.syncVersion) },
  });
  return toFuelLogDto(doc);
}

/** Office `POST /fuel-logs`: same service as the mutation, with an optional client id. */
export async function createFuelLogOffice(tx: Tx, ctx: Ctx, raw: FuelLogCreateInput): Promise<FuelLogDTO> {
  const input = parseInput(FuelLogCreateInputSchema, raw);
  const { filledAt, ...rest } = input;
  return createFuelLog(tx, ctx, { ...rest, id: input.id ?? newId(), ...(filledAt === undefined ? {} : { filledAt }) });
}

function dateBound(value: string | null | undefined, path: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) reject("VALIDATION_FAILED", { fieldErrors: [{ path, code: "invalid_date" }] });
  return date;
}

function requireOffice(ctx: Pick<Ctx, "role">): void {
  if (!OFFICE_ROLES.has(ctx.role)) reject("FORBIDDEN", { roles: ["ADMIN", "MANAGER"] });
}

/** `GET /fuel-logs` (office), newest first. */
export async function listFuelLogs(ctx: Pick<Ctx, "orgId" | "role">, filters: FuelLogListFilters = {}): Promise<Page<FuelLogListItem>> {
  requireOffice(ctx);
  const db = await readDb(ctx);
  const query: Record<string, unknown> = { deletedAt: null };
  if (filters.assetId !== undefined && filters.assetId !== null && filters.assetId !== "") query.assetId = filters.assetId;
  if (filters.seasonId !== undefined && filters.seasonId !== null && filters.seasonId !== "") query.seasonId = filters.seasonId === "none" ? null : filters.seasonId;
  const from = dateBound(filters.from, "from");
  const to = dateBound(filters.to, "to");
  if (from !== null || to !== null) query.filledAt = { ...(from === null ? {} : { $gte: from }), ...(to === null ? {} : { $lt: to }) };
  const offset = parseCursor(filters.cursor);
  const limit = clampLimit(filters.limit);
  const rows = await db.fuel_logs
    .find(query as never)
    .sort({ filledAt: -1, _id: -1 })
    .skip(offset)
    .limit(limit + 1)
    .toArray();
  const assetIds = [...new Set(rows.map((row) => row.assetId))];
  const assets = assetIds.length === 0 ? [] : await db.assets.find({ _id: { $in: assetIds } }, { projection: { _id: 1, code: 1, name: 1 } }).toArray();
  const byId = new Map(assets.map((asset) => [asset._id, asset]));
  return pageOf(
    rows.map((row) => ({ ...toFuelLogDto(row), assetCode: byId.get(row.assetId)?.code ?? null, assetName: byId.get(row.assetId)?.name ?? null })),
    offset,
    limit,
  );
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Litres per engine hour (ERP-07). Logs are walked in fill order; a log whose hour meter is not
 * higher than the last accepted reading is skipped (the monotonic rule), so a typo never yields a
 * negative or infinite rate. Each interval charges the litres of the later fill-up.
 */
export function computeConsumption(
  assetId: string,
  logs: readonly Pick<FuelLogDTO, "id" | "liters" | "hourMeter" | "filledAt">[],
): FuelConsumptionDTO {
  const ordered = [...logs].sort((a, b) => a.filledAt.localeCompare(b.filledAt) || a.id.localeCompare(b.id));
  const points: FuelConsumptionPoint[] = [];
  let previous: (typeof ordered)[number] | null = null;
  for (const log of ordered) {
    const hourMeter = log.hourMeter ?? null;
    if (hourMeter === null) continue;
    if (previous !== null) {
      const hours = hourMeter - (previous.hourMeter ?? 0);
      if (hours <= 0) continue;
      points.push({ fromLogId: previous.id, toLogId: log.id, liters: log.liters, hours: round2(hours), litersPerHour: round2(log.liters / hours), at: log.filledAt });
    }
    previous = log;
  }
  const liters = points.reduce((sum, point) => sum + point.liters, 0);
  const hours = points.reduce((sum, point) => sum + point.hours, 0);
  return { assetId, averageLitersPerHour: hours > 0 ? round2(liters / hours) : null, points };
}

/** `GET /fuel-logs/consumption?assetId=` (office). */
export async function fuelConsumption(
  ctx: Pick<Ctx, "orgId" | "role">,
  filters: { assetId?: string | null; from?: string | null; to?: string | null },
): Promise<FuelConsumptionDTO> {
  requireOffice(ctx);
  const assetId = filters.assetId ?? "";
  if (assetId === "") reject("VALIDATION_FAILED", { fieldErrors: [{ path: "assetId", code: "required" }] });
  const db = await readDb(ctx);
  const asset = await db.assets.findOne({ _id: assetId }, { projection: { _id: 1 } });
  if (asset === null) reject("NOT_FOUND", { entityType: "ASSET", id: assetId });
  const query: Record<string, unknown> = { assetId, deletedAt: null };
  const from = dateBound(filters.from, "from");
  const to = dateBound(filters.to, "to");
  if (from !== null || to !== null) query.filledAt = { ...(from === null ? {} : { $gte: from }), ...(to === null ? {} : { $lt: to }) };
  const rows = await db.fuel_logs.find(query as never).sort({ filledAt: 1, _id: 1 }).toArray();
  return computeConsumption(assetId, rows.map(toFuelLogDto));
}
