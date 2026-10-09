import type { FuelLogCreatePayload } from "@agrorende/contracts/mutations";

import type { MediaDraft } from "../../components/MediaCapture/drafts";
import type { SqlDb } from "../../db/sql";
import type { MessageKey } from "../../i18n/messages";

/** Pump photo tags offered on the fuel form; the pump display is the useful evidence. */
export const FUEL_MEDIA_TAGS = ["FUEL_PUMP", "HOUR_METER"] as const;

/** Litre stepper size: one tap adds ten litres, typing gives any value. */
export const LITERS_STEP = 10;

export interface FuelDraft {
  readonly id: string;
  readonly assetId?: string;
  readonly liters?: number;
  /** Price per litre in reais as typed; converted to cents on save. */
  readonly pricePerLiter?: number;
  readonly hourMeter?: number;
  readonly odometerKm?: number;
  readonly notes: string;
  readonly media: readonly MediaDraft[];
}

export function newFuelDraft(id: string, assetId?: string): FuelDraft {
  return { id, ...(assetId === undefined ? {} : { assetId }), notes: "", media: [] };
}

export type FuelFieldErrors = Partial<Record<"assetId" | "liters" | "pricePerLiter" | "hourMeter" | "odometerKm", MessageKey>>;

/** Same rules as `FuelLogCreatePayloadSchema`: machine required, litres above zero, readings and price not negative. */
export function validateFuelDraft(draft: FuelDraft): FuelFieldErrors {
  const errors: FuelFieldErrors = {};
  if (draft.assetId === undefined) errors.assetId = "fuel.errors.assetRequired";
  if (draft.liters === undefined) errors.liters = "fuel.errors.litersRequired";
  else if (!(draft.liters > 0)) errors.liters = "fuel.errors.litersPositive";
  if (draft.pricePerLiter !== undefined && draft.pricePerLiter < 0) errors.pricePerLiter = "fuel.errors.notNegative";
  if (draft.hourMeter !== undefined && draft.hourMeter < 0) errors.hourMeter = "fuel.errors.notNegative";
  if (draft.odometerKm !== undefined && draft.odometerKm < 0) errors.odometerKm = "fuel.errors.notNegative";
  return errors;
}

export function priceToCents(pricePerLiter: number | undefined): number | undefined {
  return pricePerLiter === undefined ? undefined : Math.round(pricePerLiter * 100);
}

/** Total shown while typing, in cents, or undefined until both litres and price are known. */
export function fuelTotalCents(draft: Pick<FuelDraft, "liters" | "pricePerLiter">): number | undefined {
  const cents = priceToCents(draft.pricePerLiter);
  return draft.liters === undefined || cents === undefined ? undefined : Math.round(draft.liters * cents);
}

/** The `fuelLog.create` payload. Callers validate first; `assetId` and `liters` are required there. */
export function buildFuelPayload(draft: FuelDraft): FuelLogCreatePayload {
  const price = priceToCents(draft.pricePerLiter);
  const notes = draft.notes.trim();
  return {
    id: draft.id,
    assetId: draft.assetId ?? "",
    liters: draft.liters ?? 0,
    ...(price === undefined ? {} : { pricePerLiterCents: price }),
    ...(draft.hourMeter === undefined ? {} : { hourMeter: draft.hourMeter }),
    ...(draft.odometerKm === undefined ? {} : { odometerKm: draft.odometerKm }),
    ...(notes.length > 0 ? { notes } : {}),
    media: draft.media.map(({ localUri: _localUri, thumbUri: _thumbUri, ...meta }) => ({ ...meta, parent: { type: "FUEL_LOG", id: draft.id } })),
  };
}

export interface FuelLogRow {
  readonly id: string;
  readonly liters: number;
  readonly totalCents: number | null;
  readonly hourMeter: number | null;
  readonly filledAt: string;
  readonly dirty: boolean;
}

/** Fuel logs of one machine from the local mirror, newest first (PLT-06). */
export async function listAssetFuelLogs(db: SqlDb, assetId: string, limit = 20): Promise<FuelLogRow[]> {
  const rows = await db.all<{ id: string; liters: number; totalCents: number | null; hourMeter: number | null; filledAt: string | null; createdAt: string; _dirty: number | null }>(
    "SELECT id, liters, totalCents, hourMeter, filledAt, createdAt, _dirty FROM fuel_logs WHERE assetId = ? AND deletedAt IS NULL ORDER BY COALESCE(filledAt, createdAt) DESC LIMIT ?",
    [assetId, limit],
  );
  return rows.map((row) => ({ id: row.id, liters: row.liters, totalCents: row.totalCents, hourMeter: row.hourMeter, filledAt: row.filledAt ?? row.createdAt, dirty: row._dirty === 1 }));
}

/**
 * Litres per engine hour, the same rule as the server (`computeConsumption` behind
 * `GET /fuel-logs/consumption`): walk the logs in fill order, skip a reading that is not above the
 * last accepted one, and charge each interval with the litres of the later fill-up. Undefined until
 * two increasing readings exist.
 */
export function consumptionPerHour(logs: readonly Pick<FuelLogRow, "id" | "liters" | "hourMeter" | "filledAt">[]): { litersPerHour: number; hours: number; liters: number } | undefined {
  const ordered = [...logs].sort((a, b) => a.filledAt.localeCompare(b.filledAt) || a.id.localeCompare(b.id));
  let previous: number | null = null;
  let liters = 0;
  let hours = 0;
  for (const log of ordered) {
    if (log.hourMeter === null) continue;
    if (previous !== null) {
      const delta = log.hourMeter - previous;
      if (delta <= 0) continue;
      liters += log.liters;
      hours += delta;
    }
    previous = log.hourMeter;
  }
  if (hours <= 0) return undefined;
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  return { litersPerHour: round2(liters / hours), hours: round2(hours), liters: round2(liters) };
}
