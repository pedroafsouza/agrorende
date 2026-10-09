import type { AssetCategory, StockLocationType } from "@agrorende/contracts/enums";

export type { PartDTO, StockLevelRow, StockLocationRow, StockMovementDTO } from "@agrorende/core/modules/parts/dto";

export type ManualMovementType = "IN" | "TRANSFER" | "ADJUSTMENT";
export const MANUAL_MOVEMENT_TYPES: readonly ManualMovementType[] = ["IN", "TRANSFER", "ADJUSTMENT"];

export interface PartFormValues {
  sku: string;
  name: string;
  unit: string;
  unitCostCents: number | null;
  minStock: string;
  compatibleCategories: AssetCategory[];
}

export const EMPTY_PART_FORM: PartFormValues = { sku: "", name: "", unit: "un", unitCostCents: null, minStock: "", compatibleCategories: [] };

function numberOrNull(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed.length === 0) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Body for `POST /parts` and `PATCH /parts/:id`. */
export function partBody(values: PartFormValues): Record<string, unknown> {
  return {
    sku: values.sku.trim(),
    name: values.name.trim(),
    unit: values.unit.trim().length === 0 ? "un" : values.unit.trim(),
    unitCostCents: values.unitCostCents,
    minStock: numberOrNull(values.minStock),
    compatibleCategories: values.compatibleCategories,
  };
}

export interface MovementFormValues {
  type: ManualMovementType;
  partId: string;
  quantity: string;
  fromLocationId: string;
  toLocationId: string;
  unitCostCents: number | null;
  note: string;
}

export const EMPTY_MOVEMENT_FORM: MovementFormValues = { type: "IN", partId: "", quantity: "", fromLocationId: "", toLocationId: "", unitCostCents: null, note: "" };

/** Body for `POST /stock-movements`: only the locations the movement type uses are sent. */
export function movementBody(values: MovementFormValues): Record<string, unknown> {
  const note = values.note.trim();
  return {
    type: values.type,
    partId: values.partId,
    quantity: numberOrNull(values.quantity),
    ...(values.type === "TRANSFER" ? { fromLocationId: values.fromLocationId || null } : {}),
    toLocationId: values.toLocationId || null,
    ...(values.type === "IN" && values.unitCostCents !== null ? { unitCostCents: values.unitCostCents } : {}),
    ...(note.length > 0 ? { note } : {}),
  };
}

export interface LocationFormValues {
  name: string;
  type: StockLocationType;
  userId: string | null;
}

export const EMPTY_LOCATION_FORM: LocationFormValues = { name: "", type: "WAREHOUSE", userId: null };

export function locationBody(values: LocationFormValues): Record<string, unknown> {
  return { name: values.name.trim(), type: values.type, userId: values.type === "VAN" ? values.userId : null };
}

export type LevelTone = "danger" | "warning" | "success";

/** Below zero is shown as danger, at or under minimum as warning (A§3.7: tone together with words). */
export function levelTone(level: { quantity: number; isLow: boolean }): LevelTone {
  if (level.quantity < 0) return "danger";
  return level.isLow ? "warning" : "success";
}
