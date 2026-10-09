import type { AppErrorCode } from "@agrorende/contracts/errors";

import { listMirrorRows, type MirrorRow } from "../../../db/mirror";
import type { SqlDb } from "../../../db/sql";
import { bumpLocalData } from "../../../lib/useLocalQuery";
import { acknowledgeConflict } from "../../../sync/conflicts";
import { moveLocalStock } from "../../../sync/mutators/jobs";
import { discardRejected } from "../../../sync/outbox";

/** One catalog part as the technician sees it in the picker, with the stock in their own van. */
export interface CatalogItem {
  readonly partId: string;
  readonly sku: string;
  readonly name: string;
  readonly unit: string;
  readonly unitCostCents: number | null;
  /** The technician's van, when they have one. */
  readonly vanLocationId: string | null;
  /** Quantity in that van; `0` when the van has no level row for the part. */
  readonly vanQuantity: number;
}

export interface PartCatalog {
  readonly items: readonly CatalogItem[];
  readonly vanLocationId: string | null;
  readonly vanName: string | null;
}

/** An `addPart` the server refused with `WO_PART_NOT_IN_VAN_STOCK` after sync (EC-WO-20). */
export interface PartStockRejection {
  readonly conflictId: string;
  readonly mutationId: string;
  readonly lineId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit: string;
  readonly partId: string | null;
  readonly stockLocationId: string | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Lower case without accents, so "oleo" finds "Óleo". */
export function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function isLive(row: MirrorRow): boolean {
  return row.deletedAt == null && row.archivedAt == null && row.isActive !== false;
}

/** Parts in the technician's van come first (most stock first), then the rest of the catalog by name (WO-09 P1). */
export function sortCatalog(items: readonly CatalogItem[]): CatalogItem[] {
  return [...items].sort((a, b) => {
    const inA = a.vanQuantity > 0 ? 1 : 0;
    const inB = b.vanQuantity > 0 ? 1 : 0;
    if (inA !== inB) return inB - inA;
    if (inA === 1 && a.vanQuantity !== b.vanQuantity) return b.vanQuantity - a.vanQuantity;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

/** Matches the name or the SKU, ignoring case and accents. */
export function searchCatalog(items: readonly CatalogItem[], query: string): CatalogItem[] {
  const q = fold(query);
  if (q.length === 0) return [...items];
  return items.filter((item) => fold(item.name).includes(q) || fold(item.sku).includes(q));
}

/** Device-side copy of the server rule: a technician takes catalog parts from their van only, never below zero. */
export function stockCheck(item: Pick<CatalogItem, "vanLocationId" | "vanQuantity">, quantity: number): AppErrorCode | undefined {
  if (item.vanLocationId === null) return "WO_PART_NOT_IN_VAN_STOCK";
  return item.vanQuantity >= quantity ? undefined : "WO_PART_NOT_IN_VAN_STOCK";
}

/** Reads the catalog, the technician's van and its levels from the local mirror (P1 pull data). */
export async function loadPartCatalog(db: SqlDb, userId: string | undefined): Promise<PartCatalog> {
  const parts = (await listMirrorRows(db, "parts")).filter(isLive);
  const van = userId === undefined ? undefined : (await listMirrorRows(db, "stockLocations", `"type" = 'VAN' AND "userId" = ? AND "deletedAt" IS NULL`, [userId]))[0];
  const vanLocationId = van === undefined ? null : text(van.id);
  const levels = vanLocationId === null ? [] : await listMirrorRows(db, "stockLevels", `"stockLocationId" = ? AND "deletedAt" IS NULL`, [vanLocationId]);
  const byPart = new Map(levels.map((level) => [text(level.partId), num(level.quantity) ?? 0]));
  const items = parts.map(
    (row): CatalogItem => ({
      partId: text(row.id),
      sku: text(row.sku),
      name: text(row.name),
      unit: text(row.unit).length > 0 ? text(row.unit) : "un",
      unitCostCents: num(row.unitCostCents),
      vanLocationId,
      vanQuantity: byPart.get(text(row.id)) ?? 0,
    }),
  );
  return { items: sortCatalog(items), vanLocationId, vanName: van === undefined ? null : text(van.name) };
}

/** Newest unacknowledged EC-WO-20 rejection of an `addPart` on this job, whose command is still kept. */
export async function findPartStockRejection(db: SqlDb, workOrderId: string): Promise<PartStockRejection | undefined> {
  const rows = await db.all<{ id: string; mutationId: string; entityId: string; queued: string }>(
    "SELECT c.id AS id, c.mutationId AS mutationId, c.entityId AS entityId, o.payload AS queued FROM conflicts c JOIN outbox o ON o.id = c.mutationId AND o.status = 'REJECTED' WHERE c.name = 'workOrder.addPart' AND c.code = 'WO_PART_NOT_IN_VAN_STOCK' AND c.acknowledgedAt IS NULL ORDER BY c.createdAt DESC",
  );
  for (const row of rows) {
    const payload = record(JSON.parse(row.queued) as unknown);
    if (payload.workOrderId !== workOrderId) continue;
    return {
      conflictId: row.id,
      mutationId: row.mutationId,
      lineId: row.entityId,
      name: text(payload.name),
      quantity: num(payload.quantity) ?? 1,
      unit: text(payload.unit).length > 0 ? text(payload.unit) : "un",
      partId: typeof payload.partId === "string" ? payload.partId : null,
      stockLocationId: typeof payload.stockLocationId === "string" ? payload.stockLocationId : null,
    };
  }
  return undefined;
}

/**
 * Closes an EC-WO-20 rejection once the technician chose a way out: the van level the phone
 * lowered is put back (the server never moved it), then the command and its conflict are dropped.
 * Call it after the replacement (free-text line or hold) is queued, so nothing typed is lost.
 */
export async function settlePartStockRejection(db: SqlDb, rejection: PartStockRejection, nowIso: string): Promise<void> {
  if (rejection.partId !== null && rejection.stockLocationId !== null) {
    await moveLocalStock(db, rejection.partId, rejection.stockLocationId, rejection.quantity, nowIso);
  }
  await discardRejected(db, rejection.mutationId);
  await acknowledgeConflict(db, rejection.conflictId, nowIso);
  bumpLocalData();
}
