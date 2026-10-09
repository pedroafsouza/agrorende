import { z } from "zod";
import { AssetCategoryEnum, StockLocationTypeEnum, type StockLocationType, type StockMovementType } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";
import type { Tx } from "@agrorende/contracts/seams";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { assertVersion, dbTx, escapeRegex, newId, parseInput, readDb, stampCreate, stampUpdate, toDto, writeActivity } from "../assets/kit.js";
import type { PartDTO, StockLevelDTO, StockLevelRow, StockLocationDTO, StockLocationRow, StockMovementDTO } from "./dto.js";

/**
 * Parts catalog, stock locations, stock levels and stock movements (ERP-05, ARCHITECTURE §8
 * "Parts and stock"). Every movement writes the movement row and the level change in the same
 * transaction, so for every part and location `StockLevel.quantity` equals the sum of the
 * movement deltas (see `movementDelta`). Office-made levels may go negative; a technician's van
 * never goes below zero through a work order (EC-WO-20).
 */

const OFFICE_ROLES: readonly string[] = ["ADMIN", "MANAGER"];

function isOfficeRole(role: Ctx["role"]): boolean {
  return OFFICE_ROLES.includes(role);
}

/** Stock is managed by the office; every other stock write by a FIELD user is `FORBIDDEN` (T14.2). */
function requireStockManager(ctx: Pick<Ctx, "role">): void {
  if (!isOfficeRole(ctx.role)) reject("FORBIDDEN", { role: ctx.role, resource: "stock" });
}

function sameOrg(tx: Tx, ctx: Pick<Ctx, "orgId">): ReturnType<typeof dbTx> {
  const scoped = dbTx(tx);
  if (scoped.orgId !== ctx.orgId) reject("FORBIDDEN", { orgId: ctx.orgId });
  return scoped;
}

type Row = { _id: string; syncVersion: number } & Record<string, unknown>;

// ───────── Catalog ─────────

const QuantitySchema = z.number().finite();

export const PartCreateInputSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(16).default("un"),
  unitCostCents: z.number().int().nonnegative().nullable().optional(),
  compatibleCategories: z.array(AssetCategoryEnum).default([]),
  minStock: QuantitySchema.nonnegative().nullable().optional(),
  isActive: z.boolean().default(true),
});
export type PartCreateInput = z.input<typeof PartCreateInputSchema>;

export const PartPatchInputSchema = z.object({
  sku: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  unit: z.string().trim().min(1).max(16).optional(),
  unitCostCents: z.number().int().nonnegative().nullable().optional(),
  compatibleCategories: z.array(AssetCategoryEnum).optional(),
  minStock: QuantitySchema.nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type PartPatchInput = z.input<typeof PartPatchInputSchema>;

interface PartDoc {
  readonly _id: string;
  readonly syncVersion: number;
  readonly sku: string;
  readonly name: string;
  readonly unit: string;
  readonly unitCostCents?: number | null;
  readonly minStock?: number | null;
  readonly isActive?: boolean;
  readonly archivedAt?: Date | null;
}

function partDto(doc: unknown): PartDTO {
  return toDto<PartDTO>(doc as Row);
}

async function assertSkuFree(tx: Tx, sku: string, exceptId?: string): Promise<void> {
  const filter: Record<string, unknown> = { sku, deletedAt: null };
  if (exceptId !== undefined) filter._id = { $ne: exceptId };
  const clash = await dbTx(tx).db.parts.findOne(filter);
  if (clash !== null) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "sku", code: "duplicate" }], details: { partId: clash._id } });
  }
}

export async function createPart(tx: Tx, ctx: Ctx, raw: unknown): Promise<PartDTO> {
  const scoped = sameOrg(tx, ctx);
  requireStockManager(ctx);
  const input = parseInput(PartCreateInputSchema, raw);
  await assertSkuFree(tx, input.sku);
  const doc = {
    _id: newId(),
    organizationId: scoped.orgId,
    ...stampCreate(scoped),
    deletedAt: null,
    sku: input.sku,
    name: input.name,
    unit: input.unit,
    unitCostCents: input.unitCostCents ?? null,
    compatibleCategories: input.compatibleCategories,
    minStock: input.minStock ?? null,
    isActive: input.isActive,
    archivedAt: null,
  };
  await scoped.db.parts.insertOne(doc);
  await writeActivity(scoped, { entityType: "PART", entityId: doc._id, action: "part.create", actorId: ctx.userId, meta: { sku: doc.sku } });
  return partDto(doc);
}

export async function updatePart(tx: Tx, ctx: Ctx, id: string, raw: unknown, ifMatch?: string | null): Promise<PartDTO> {
  const scoped = sameOrg(tx, ctx);
  requireStockManager(ctx);
  const input = parseInput(PartPatchInputSchema, raw);
  const current = await scoped.db.parts.findOne({ _id: id, deletedAt: null });
  if (current === null) return reject("NOT_FOUND", { entityType: "PART", id });
  assertVersion(current, ifMatch);
  if (input.sku !== undefined && input.sku !== current.sku) await assertSkuFree(tx, input.sku, id);
  const now = new Date();
  const set: Record<string, unknown> = { ...stampUpdate(scoped, now) };
  for (const key of ["sku", "name", "unit", "unitCostCents", "compatibleCategories", "minStock", "isActive"] as const) {
    if (input[key] !== undefined) set[key] = input[key];
  }
  if (input.archived !== undefined) {
    set.archivedAt = input.archived ? (current.archivedAt ?? now) : null;
    if (input.archived) set.isActive = false;
  }
  await scoped.db.parts.updateOne({ _id: id }, { $set: set });
  await writeActivity(scoped, { entityType: "PART", entityId: id, action: "part.update", actorId: ctx.userId, meta: { fields: Object.keys(input) } });
  return partDto(await scoped.db.parts.findOne({ _id: id }));
}

export interface PartListFilter {
  readonly q?: string | null;
  readonly category?: string | null;
  readonly includeArchived?: boolean | string | null;
}

export async function listParts(ctx: Ctx, filter: PartListFilter = {}): Promise<{ items: PartDTO[] }> {
  const db = await readDb(ctx);
  const query: Record<string, unknown> = { deletedAt: null };
  const includeArchived = filter.includeArchived === true || filter.includeArchived === "true";
  if (!includeArchived) query.archivedAt = null;
  const q = filter.q?.trim();
  if (q !== undefined && q.length > 0) {
    const pattern = new RegExp(escapeRegex(q), "iu");
    query.$or = [{ sku: pattern }, { name: pattern }];
  }
  const category = AssetCategoryEnum.safeParse(filter.category);
  if (category.success) query.compatibleCategories = category.data;
  const rows = await db.parts.find(query, { sort: { name: 1 }, limit: 1000 }).toArray();
  return { items: rows.map((row) => partDto(row)) };
}

// ───────── Locations ─────────

export const StockLocationCreateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: StockLocationTypeEnum,
    userId: z.string().uuid().nullable().optional(),
    siteId: z.string().uuid().nullable().optional(),
  })
  .superRefine((value, issue) => {
    if (value.type === "VAN" && (value.userId ?? null) === null) issue.addIssue({ code: "custom", path: ["userId"], message: "required" });
    if (value.type === "WAREHOUSE" && (value.userId ?? null) !== null) issue.addIssue({ code: "custom", path: ["userId"], message: "not_allowed" });
  });
export type StockLocationCreateInput = z.input<typeof StockLocationCreateInputSchema>;

interface LocationDoc {
  readonly _id: string;
  readonly syncVersion: number;
  readonly name: string;
  readonly type: StockLocationType;
  readonly userId?: string | null;
  readonly siteId?: string | null;
}

function locationDto(doc: unknown): StockLocationDTO {
  return toDto<StockLocationDTO>(doc as Row);
}

/** Office only. One VAN per technician; creating a van links it on the user (`vanStockLocationId`). */
export async function createLocation(tx: Tx, ctx: Ctx, raw: unknown): Promise<StockLocationDTO> {
  const scoped = sameOrg(tx, ctx);
  requireStockManager(ctx);
  const input = parseInput(StockLocationCreateInputSchema, raw);
  const userId = input.userId ?? null;
  const siteId = input.siteId ?? null;
  if (userId !== null) {
    const user = await scoped.db.users.findOne({ _id: userId, deletedAt: null }, { projection: { _id: 1 } });
    if (user === null) return reject("NOT_FOUND", { entityType: "USER", id: userId });
    const van = await scoped.db.stock_locations.findOne({ type: "VAN", userId, deletedAt: null });
    if (van !== null) throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "userId", code: "duplicate" }], details: { stockLocationId: van._id } });
  }
  if (siteId !== null) {
    const site = await scoped.db.sites.findOne({ _id: siteId, deletedAt: null }, { projection: { _id: 1 } });
    if (site === null) return reject("NOT_FOUND", { entityType: "SITE", id: siteId });
  }
  const now = new Date();
  const doc = { _id: newId(), organizationId: scoped.orgId, ...stampCreate(scoped, now), deletedAt: null, name: input.name, type: input.type, userId, siteId };
  await scoped.db.stock_locations.insertOne(doc);
  if (input.type === "VAN" && userId !== null) {
    await scoped.db.users.updateOne({ _id: userId }, { $set: { vanStockLocationId: doc._id, ...stampUpdate(scoped, now) } });
  }
  return locationDto(doc);
}

/** Locations a user may read: the office sees all; FIELD sees warehouses and their own van (A§7.5). */
function locationScopeFilter(ctx: Pick<Ctx, "role" | "userId">): Record<string, unknown> {
  if (isOfficeRole(ctx.role)) return { deletedAt: null };
  return { deletedAt: null, $or: [{ type: "WAREHOUSE" }, { type: "VAN", userId: ctx.userId }] };
}

export async function listLocations(ctx: Ctx): Promise<{ items: StockLocationRow[] }> {
  const db = await readDb(ctx);
  const rows = (await db.stock_locations.find(locationScopeFilter(ctx), { sort: { type: -1, name: 1 } }).toArray()) as unknown as LocationDoc[];
  const userIds = [...new Set(rows.map((row) => row.userId ?? null).filter((id): id is string => id !== null))];
  const users = userIds.length === 0 ? [] : await db.users.find({ _id: { $in: userIds } }, { projection: { _id: 1, name: 1 } }).toArray();
  const names = new Map(users.map((user) => [user._id, user.name]));
  return { items: rows.map((row) => ({ ...locationDto(row), userName: (row.userId ?? null) === null ? null : (names.get(row.userId ?? "") ?? null) })) };
}

// ───────── Levels ─────────

export interface LevelListFilter {
  readonly locationId?: string | null;
  readonly partId?: string | null;
  readonly low?: boolean | string | null;
}

export async function listLevels(ctx: Ctx, filter: LevelListFilter = {}): Promise<{ items: StockLevelRow[] }> {
  const db = await readDb(ctx);
  const locations = (await db.stock_locations.find(locationScopeFilter(ctx)).toArray()) as unknown as LocationDoc[];
  const locationById = new Map(locations.map((row) => [row._id, row]));
  const wanted = filter.locationId ?? null;
  const locationIds = wanted !== null && wanted.length > 0 ? (locationById.has(wanted) ? [wanted] : []) : [...locationById.keys()];
  if (locationIds.length === 0) return { items: [] };
  const query: Record<string, unknown> = { deletedAt: null, stockLocationId: { $in: locationIds } };
  if (filter.partId !== undefined && filter.partId !== null && filter.partId.length > 0) query.partId = filter.partId;
  const levels = await db.stock_levels.find(query).toArray();
  const partIds = [...new Set(levels.map((level) => level.partId))];
  const parts = partIds.length === 0 ? [] : await db.parts.find({ _id: { $in: partIds }, deletedAt: null }).toArray();
  const partById = new Map(parts.map((part) => [part._id, part]));
  const onlyLow = filter.low === true || filter.low === "true";
  const items: StockLevelRow[] = [];
  for (const level of levels) {
    const part = partById.get(level.partId);
    const location = locationById.get(level.stockLocationId);
    if (part === undefined || location === undefined) continue;
    const minStock = part.minStock ?? null;
    const isLow = minStock !== null && level.quantity <= minStock;
    if (onlyLow && !isLow) continue;
    items.push({
      ...toDto<StockLevelDTO>(level as unknown as Row),
      partSku: part.sku,
      partName: part.name,
      unit: part.unit,
      unitCostCents: part.unitCostCents ?? null,
      minStock,
      locationName: location.name,
      locationType: location.type,
      locationUserId: location.userId ?? null,
      isLow,
    });
  }
  items.sort((a, b) => a.partName.localeCompare(b.partName, "pt-BR") || a.locationName.localeCompare(b.locationName, "pt-BR"));
  return { items };
}

// ───────── Movements ─────────

export interface MovementLike {
  readonly partId: string;
  readonly type: StockMovementType;
  readonly quantity: number;
  readonly fromLocationId?: string | null;
  readonly toLocationId?: string | null;
}

/**
 * Change that a movement makes at one location. IN adds at `to`; TRANSFER moves from `from` to
 * `to`; ADJUSTMENT is a signed delta at `to`; OUT_TO_WORK_ORDER takes from `from` (a reversal is
 * stored with a negative quantity, which gives the stock back).
 */
export function movementDelta(movement: MovementLike, locationId: string): number {
  const from = movement.fromLocationId ?? null;
  const to = movement.toLocationId ?? null;
  switch (movement.type) {
    case "IN":
    case "ADJUSTMENT":
      return to === locationId ? movement.quantity : 0;
    case "TRANSFER":
      return (to === locationId ? movement.quantity : 0) - (from === locationId ? movement.quantity : 0);
    case "OUT_TO_WORK_ORDER":
      return from === locationId ? -movement.quantity : 0;
  }
}

/** Σ deltas of the movements of one part at one location: the expected `StockLevel.quantity`. */
export function ledgerQuantity(movements: readonly MovementLike[], partId: string, locationId: string): number {
  return movements.filter((movement) => movement.partId === partId).reduce((sum, movement) => sum + movementDelta(movement, locationId), 0);
}

export const StockMovementCreateInputSchema = z
  .object({
    type: z.enum(["IN", "TRANSFER", "ADJUSTMENT"]),
    partId: z.string().uuid(),
    quantity: QuantitySchema,
    fromLocationId: z.string().uuid().nullable().optional(),
    toLocationId: z.string().uuid().nullable().optional(),
    unitCostCents: z.number().int().nonnegative().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, issue) => {
    const from = value.fromLocationId ?? null;
    const to = value.toLocationId ?? null;
    if (value.type === "ADJUSTMENT") {
      if (value.quantity === 0) issue.addIssue({ code: "custom", path: ["quantity"], message: "not_zero" });
      if (to === null && from === null) issue.addIssue({ code: "custom", path: ["toLocationId"], message: "required" });
      return;
    }
    if (value.quantity <= 0) issue.addIssue({ code: "custom", path: ["quantity"], message: "positive" });
    if (to === null) issue.addIssue({ code: "custom", path: ["toLocationId"], message: "required" });
    if (value.type === "TRANSFER") {
      if (from === null) issue.addIssue({ code: "custom", path: ["fromLocationId"], message: "required" });
      else if (from === to) issue.addIssue({ code: "custom", path: ["toLocationId"], message: "same_location" });
    }
  });
export type StockMovementCreateInput = z.input<typeof StockMovementCreateInputSchema>;

interface MovementRow {
  readonly partId: string;
  readonly type: StockMovementType;
  readonly quantity: number;
  readonly fromLocationId: string | null;
  readonly toLocationId: string | null;
  readonly unitCostCents: number | null;
  readonly workOrderId: string | null;
  readonly workOrderPartId: string | null;
  readonly note: string | null;
}

export async function loadPart(tx: Tx, partId: string): Promise<PartDoc> {
  const part = await dbTx(tx).db.parts.findOne({ _id: partId, deletedAt: null });
  if (part === null) return reject("NOT_FOUND", { entityType: "PART", id: partId });
  return part as unknown as PartDoc;
}

export async function loadLocation(tx: Tx, locationId: string): Promise<LocationDoc> {
  const location = await dbTx(tx).db.stock_locations.findOne({ _id: locationId, deletedAt: null });
  if (location === null) return reject("NOT_FOUND", { entityType: "STOCK_LOCATION", id: locationId });
  return location as unknown as LocationDoc;
}

/** Current quantity of a part at a location (zero when no level row exists yet). */
export async function levelQuantity(tx: Tx, partId: string, stockLocationId: string): Promise<number> {
  const level = await dbTx(tx).db.stock_levels.findOne({ partId, stockLocationId, deletedAt: null });
  return level?.quantity ?? 0;
}

async function bumpLevel(tx: Tx, partId: string, stockLocationId: string, delta: number, now: Date): Promise<void> {
  if (delta === 0) return;
  const scoped = dbTx(tx);
  await scoped.db.stock_levels.updateOne(
    { partId, stockLocationId },
    {
      $inc: { quantity: delta },
      $set: { ...stampUpdate(scoped, now), deletedAt: null },
      $setOnInsert: { _id: newId(now.getTime()), createdAt: now },
    },
    { upsert: true },
  );
}

function movementDto(doc: unknown): StockMovementDTO {
  const dto = toDto<StockMovementDTO>(doc as Row);
  return {
    ...dto,
    fromLocationId: dto.fromLocationId ?? null,
    toLocationId: dto.toLocationId ?? null,
    unitCostCents: dto.unitCostCents ?? null,
    workOrderId: dto.workOrderId ?? null,
    workOrderPartId: dto.workOrderPartId ?? null,
    note: dto.note ?? null,
  };
}

/** Writes the movement row and every level change it implies, inside the caller's transaction. */
async function writeMovement(tx: Tx, ctx: Pick<Ctx, "userId">, row: MovementRow, now: Date): Promise<StockMovementDTO> {
  const scoped = dbTx(tx);
  const doc = { _id: newId(now.getTime()), organizationId: scoped.orgId, ...stampCreate(scoped, now), deletedAt: null, ...row, createdById: ctx.userId };
  await scoped.db.stock_movements.insertOne(doc);
  const touched = new Set([row.fromLocationId, row.toLocationId].filter((id): id is string => id !== null));
  for (const locationId of touched) await bumpLevel(tx, row.partId, locationId, movementDelta(row, locationId), now);
  return movementDto(doc);
}

/** `POST /stock-movements`: IN, TRANSFER and ADJUSTMENT. Office only (FIELD → `FORBIDDEN`, T14.2). */
export async function createMovement(tx: Tx, ctx: Ctx, raw: unknown): Promise<StockMovementDTO> {
  sameOrg(tx, ctx);
  requireStockManager(ctx);
  const input = parseInput(StockMovementCreateInputSchema, raw);
  const part = await loadPart(tx, input.partId);
  const from = input.type === "TRANSFER" ? (input.fromLocationId ?? null) : null;
  const to = input.type === "ADJUSTMENT" ? (input.toLocationId ?? input.fromLocationId ?? null) : (input.toLocationId ?? null);
  for (const locationId of [from, to]) if (locationId !== null) await loadLocation(tx, locationId);
  const movement = await writeMovement(
    tx,
    ctx,
    {
      partId: part._id,
      type: input.type,
      quantity: input.quantity,
      fromLocationId: from,
      toLocationId: to,
      unitCostCents: input.unitCostCents ?? (input.type === "IN" ? (part.unitCostCents ?? null) : null),
      workOrderId: null,
      workOrderPartId: null,
      note: input.note ?? null,
    },
    new Date(),
  );
  await writeActivity(dbTx(tx), {
    entityType: "STOCK_MOVEMENT",
    entityId: movement.id,
    action: `stock.${input.type.toLowerCase()}`,
    actorId: ctx.userId,
    meta: { partId: part._id, quantity: input.quantity, fromLocationId: from, toLocationId: to },
  });
  return movement;
}

export interface MovementListFilter {
  readonly partId?: string | null;
  readonly locationId?: string | null;
  readonly workOrderId?: string | null;
  readonly limit?: number | string | null;
}

export async function listMovements(ctx: Ctx, filter: MovementListFilter = {}): Promise<{ items: StockMovementDTO[] }> {
  const db = await readDb(ctx);
  const query: Record<string, unknown> = { deletedAt: null };
  if (filter.partId !== undefined && filter.partId !== null && filter.partId.length > 0) query.partId = filter.partId;
  if (filter.workOrderId !== undefined && filter.workOrderId !== null && filter.workOrderId.length > 0) query.workOrderId = filter.workOrderId;
  let locationIds: string[] | null = null;
  if (!isOfficeRole(ctx.role)) {
    const visible = await db.stock_locations.find(locationScopeFilter(ctx), { projection: { _id: 1 } }).toArray();
    locationIds = visible.map((row) => row._id);
  }
  const wanted = filter.locationId ?? null;
  if (wanted !== null && wanted.length > 0) locationIds = locationIds === null || locationIds.includes(wanted) ? [wanted] : [];
  if (locationIds !== null) query.$or = [{ fromLocationId: { $in: locationIds } }, { toLocationId: { $in: locationIds } }];
  const limitRaw = typeof filter.limit === "string" ? Number.parseInt(filter.limit, 10) : (filter.limit ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 200;
  const rows = await db.stock_movements.find(query, { sort: { createdAt: -1, _id: -1 }, limit }).toArray();
  return { items: rows.map((row) => movementDto(row)) };
}

// ───────── Work order parts (called by workOrders/parts.ts) ─────────

export interface WorkOrderOutInput {
  readonly partId: string;
  readonly stockLocationId: string;
  readonly quantity: number;
  readonly workOrderId: string;
  readonly workOrderPartId: string;
  readonly unitCostCents: number | null;
}

/**
 * Checks a catalog part line before it is written (WO-09 P1, EC-WO-20). FIELD users may only take
 * stock from their own van; a van never goes below zero (`WO_PART_NOT_IN_VAN_STOCK`, nothing is
 * written). The office may take from any location, and warehouse levels may go negative.
 */
export async function assertWorkOrderOut(
  tx: Tx,
  ctx: Pick<Ctx, "role" | "userId">,
  input: Pick<WorkOrderOutInput, "partId" | "stockLocationId" | "quantity">,
): Promise<PartDoc> {
  const part = await loadPart(tx, input.partId);
  const location = await loadLocation(tx, input.stockLocationId);
  if (!isOfficeRole(ctx.role) && (location.type !== "VAN" || location.userId !== ctx.userId)) {
    reject("FORBIDDEN", { entityType: "STOCK_LOCATION", id: location._id });
  }
  if (location.type === "VAN") {
    const available = await levelQuantity(tx, input.partId, input.stockLocationId);
    if (available < input.quantity) {
      reject("WO_PART_NOT_IN_VAN_STOCK", { partId: input.partId, stockLocationId: input.stockLocationId, available, requested: input.quantity });
    }
  }
  return part;
}

/** `OUT_TO_WORK_ORDER`: one movement and the level decrement, in the caller's transaction. */
export async function recordWorkOrderOut(tx: Tx, ctx: Pick<Ctx, "userId">, input: WorkOrderOutInput, now: Date = new Date()): Promise<StockMovementDTO> {
  return writeMovement(
    tx,
    ctx,
    {
      partId: input.partId,
      type: "OUT_TO_WORK_ORDER",
      quantity: input.quantity,
      fromLocationId: input.stockLocationId,
      toLocationId: null,
      unitCostCents: input.unitCostCents,
      workOrderId: input.workOrderId,
      workOrderPartId: input.workOrderPartId,
      note: null,
    },
    now,
  );
}

/**
 * Gives back the stock of a removed work order part: a negative `OUT_TO_WORK_ORDER` for whatever
 * is still out (so a second call is a no-op). Returns the quantity restored.
 */
export async function reverseWorkOrderOut(tx: Tx, ctx: Pick<Ctx, "userId">, workOrderPartId: string, now: Date = new Date()): Promise<number> {
  const movements = await dbTx(tx).db.stock_movements.find({ workOrderPartId, type: "OUT_TO_WORK_ORDER", deletedAt: null }).toArray();
  const first = movements[0];
  if (first === undefined) return 0;
  const outstanding = movements.reduce((sum, movement) => sum + movement.quantity, 0);
  const from = first.fromLocationId ?? null;
  if (outstanding <= 0 || from === null) return 0;
  await writeMovement(
    tx,
    ctx,
    {
      partId: first.partId,
      type: "OUT_TO_WORK_ORDER",
      quantity: -outstanding,
      fromLocationId: from,
      toLocationId: null,
      unitCostCents: first.unitCostCents ?? null,
      workOrderId: first.workOrderId ?? null,
      workOrderPartId,
      note: "reversal",
    },
    now,
  );
  return outstanding;
}

export { lowStockEntries, type LowStockEntry } from "./low.js";
