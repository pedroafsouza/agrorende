import { TABLE_ORDER, type TableName } from "@agrorende/contracts/sync";

import { MIRROR_TABLES } from "./mirror.generated";
import { placeholders, quoteIdent, type SqlDb, type SqlRow, type SqlValue } from "./sql";

export type ColumnKind = "text" | "integer" | "real" | "boolean" | "json";
export type MirrorRow = Record<string, unknown>;

export const MIRROR_TABLE_NAMES: readonly TableName[] = TABLE_ORDER;

/** Maps a camelCase sync table name or an outbox `entityType` to the mirror table. */
const ENTITY_TYPE_TABLE: Record<string, TableName> = {
  ORGANIZATION: "organization",
  USER: "users",
  SITE: "sites",
  PLOT: "plots",
  SEASON: "seasons",
  CUSTOMER: "customers",
  ASSET: "assets",
  CHECKLIST_TEMPLATE: "checklistTemplates",
  DAMAGE: "damages",
  FIELD_REPORT: "fieldReports",
  WORK_ORDER: "workOrders",
  WORK_ORDER_PART: "workOrderParts",
  RENTAL: "rentals",
  RENTAL_CHARGE: "rentalCharges",
  INSPECTION: "inspections",
  MEDIA: "media",
  ACTIVITY_EVENT: "activityEvents",
  NOTIFICATION: "notifications",
  COMMENT: "comments",
  PART: "parts",
  STOCK_LOCATION: "stockLocations",
  STOCK_LEVEL: "stockLevels",
  MAINTENANCE_PLAN: "maintenancePlans",
  FUEL_LOG: "fuelLogs",
};

export function isTableName(value: string): value is TableName {
  return (TABLE_ORDER as readonly string[]).includes(value);
}

export function tableForEntityType(entityType: string): TableName | undefined {
  return ENTITY_TYPE_TABLE[entityType] ?? (isTableName(entityType) ? entityType : undefined);
}

export function entityTypeForTable(table: TableName): string {
  return Object.entries(ENTITY_TYPE_TABLE).find(([, value]) => value === table)?.[0] ?? table;
}

export function sqlTableName(table: TableName): string {
  return MIRROR_TABLES[table].sqlName;
}

function columnsOf(table: TableName): Readonly<Record<string, ColumnKind>> {
  return MIRROR_TABLES[table].columns;
}

function encodeValue(kind: ColumnKind, value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  switch (kind) {
    case "boolean":
      return value === true ? 1 : 0;
    case "integer":
    case "real":
      return typeof value === "number" ? value : Number(value);
    case "json":
      return JSON.stringify(value);
    default:
      return typeof value === "string" ? value : JSON.stringify(value);
  }
}

function decodeValue(kind: ColumnKind, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case "boolean":
      return value === 1 || value === true;
    case "json":
      return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
    default:
      return value;
  }
}

/** Converts an SQLite row back to its DTO-like shape (JSON parsed, booleans restored). */
export function decodeMirrorRow(table: TableName, row: SqlRow): MirrorRow {
  const columns = columnsOf(table);
  const out: MirrorRow = {};
  for (const [key, value] of Object.entries(row)) {
    const kind = columns[key];
    out[key] = kind === undefined ? value : decodeValue(kind, value);
  }
  return out;
}

/**
 * Inserts or replaces a full DTO row. Unknown fields are ignored so that a newer
 * server never breaks an older app. `dirty` sets the local `_dirty` flag.
 */
export async function upsertMirrorRow(db: SqlDb, table: TableName, row: MirrorRow, dirty: 0 | 1): Promise<void> {
  const columns = columnsOf(table);
  const names = Object.keys(row).filter((key) => key in columns);
  if (!names.includes("id")) throw new Error(`mirror row for ${table} has no id`);
  const values = names.map((name) => encodeValue(columns[name] ?? "text", row[name]));
  const all = [...names, "_dirty"];
  await db.run(
    `INSERT OR REPLACE INTO ${quoteIdent(sqlTableName(table))} (${all.map(quoteIdent).join(", ")}) VALUES (${placeholders(all.length)})`,
    [...values, dirty],
  );
}

/** Patches selected fields of an existing row (optimistic local writes). */
export async function patchMirrorRow(db: SqlDb, table: TableName, id: string, patch: MirrorRow, dirty: 0 | 1 = 1): Promise<number> {
  const columns = columnsOf(table);
  const names = Object.keys(patch).filter((key) => key in columns && key !== "id");
  const sets = [...names.map((name) => `${quoteIdent(name)} = ?`), `"_dirty" = ?`];
  const values = [...names.map((name) => encodeValue(columns[name] ?? "text", patch[name])), dirty, id];
  const result = await db.run(`UPDATE ${quoteIdent(sqlTableName(table))} SET ${sets.join(", ")} WHERE "id" = ?`, values);
  return result.changes;
}

export async function getMirrorRow(db: SqlDb, table: TableName, id: string): Promise<MirrorRow | undefined> {
  const row = await db.get(`SELECT * FROM ${quoteIdent(sqlTableName(table))} WHERE "id" = ?`, [id]);
  return row === undefined ? undefined : decodeMirrorRow(table, row);
}

export async function listMirrorRows(db: SqlDb, table: TableName, where = "1 = 1", params: readonly SqlValue[] = []): Promise<MirrorRow[]> {
  const rows = await db.all(`SELECT * FROM ${quoteIdent(sqlTableName(table))} WHERE ${where}`, params);
  return rows.map((row) => decodeMirrorRow(table, row));
}

export async function deleteMirrorRow(db: SqlDb, table: TableName, id: string): Promise<void> {
  await db.run(`DELETE FROM ${quoteIdent(sqlTableName(table))} WHERE "id" = ?`, [id]);
}
