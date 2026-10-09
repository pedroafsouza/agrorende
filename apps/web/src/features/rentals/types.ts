import type { RentalErrorCode } from "@agrorende/contracts/charges";
import type { DeliveryMode, RateUnit } from "@agrorende/contracts/enums";
import { fromZonedTime } from "date-fns-tz";

import { isApiError } from "@/lib/api";
import { DEFAULT_TIME_ZONE } from "@/lib/format";

export type {
  ChargesView,
  DamageDTO,
  EligibilityResult,
  InspectionCompare,
  InspectionWithMedia,
  RentalChargeDTO,
  RentalDetail,
  RentalDTO,
  RentalListItem,
  RentalWarningCode,
} from "@agrorende/core/modules/rentals/dto";

/** List tabs (A§14.1): every tab but ALL maps to the `status` filter, OVERDUE included. */
export const RENTAL_TABS = ["ALL", "RESERVED", "ACTIVE", "OVERDUE", "RETURNED", "CLOSED"] as const;
export type RentalTab = (typeof RENTAL_TABS)[number];

export function tabStatus(tab: string): string | undefined {
  return (RENTAL_TABS as readonly string[]).includes(tab) && tab !== "ALL" ? tab : undefined;
}

export const RATE_UNITS: readonly RateUnit[] = ["HOUR", "DAY", "WEEK", "MONTH"];
export const DELIVERY_MODES: readonly DeliveryMode[] = ["PICKUP", "DELIVERY"];
export const DOCUMENT_LOCALES = ["pt-BR", "en"] as const;
/** Charge types the office may add by hand; BASE, EXTRA_TIME and EXTRA_HOURS are computed. */
export const MANUAL_CHARGE_TYPES = ["FUEL", "DAMAGE", "CLEANING", "DELIVERY", "DISCOUNT", "ACCESSORY", "OTHER"] as const;
export type ManualChargeType = (typeof MANUAL_CHARGE_TYPES)[number];

export interface NewRentalValues {
  /** OUTBOUND rents a machine out to a customer; INBOUND rents a partner machine in (RN-12). */
  readonly direction: RentalDirectionValue;
  readonly assetId: string | null;
  readonly customerId: string | null;
  readonly siteId: string | null;
  /** `datetime-local` values, read in the organisation timezone. */
  readonly plannedStart: string;
  readonly plannedEnd: string;
  readonly rateCents: number | null;
  readonly rateUnit: RateUnit | "";
  readonly depositCents: number | null;
  readonly deliveryMode: DeliveryMode;
  readonly deliveryAddress: string;
  readonly documentLocale: (typeof DOCUMENT_LOCALES)[number];
  readonly notes: string;
}

export const EMPTY_NEW_RENTAL: NewRentalValues = {
  direction: "OUTBOUND",
  assetId: null,
  customerId: null,
  siteId: null,
  plannedStart: "",
  plannedEnd: "",
  rateCents: null,
  rateUnit: "",
  depositCents: null,
  deliveryMode: "PICKUP",
  deliveryAddress: "",
  documentLocale: "pt-BR",
  notes: "",
};

/** `2026-11-01T08:00` in the organisation timezone → ISO instant; null when empty or unparseable. */
export function localToIso(local: string, timeZone = DEFAULT_TIME_ZONE): string | null {
  if (local.length === 0) return null;
  const date = fromZonedTime(local, timeZone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Query for `GET /rentals/eligibility`; null until the asset and both dates are filled. */
export function eligibilityQuery(values: NewRentalValues, excludeRentalId: string | null = null): Record<string, string> | null {
  const from = localToIso(values.plannedStart);
  const to = localToIso(values.plannedEnd);
  if (values.assetId === null || from === null || to === null) return null;
  return {
    assetId: values.assetId,
    from,
    to,
    ...(values.customerId === null ? {} : { customerId: values.customerId }),
    ...(values.siteId === null ? {} : { siteId: values.siteId }),
    ...(excludeRentalId === null ? {} : { excludeRentalId }),
    ...(values.direction === "INBOUND" ? { direction: "INBOUND" } : {}),
  };
}

/** Body for `POST /rentals` (and `PATCH` of the same draft); empty optional fields fall back to asset defaults. */
export function newRentalBody(values: NewRentalValues): Record<string, unknown> {
  const address = values.deliveryAddress.trim();
  const notes = values.notes.trim();
  return {
    direction: values.direction,
    assetId: values.assetId ?? undefined,
    customerId: values.customerId ?? undefined,
    siteId: values.siteId,
    plannedStart: localToIso(values.plannedStart) ?? undefined,
    plannedEnd: localToIso(values.plannedEnd) ?? undefined,
    rateCents: values.rateCents ?? undefined,
    rateUnit: values.rateUnit === "" ? undefined : values.rateUnit,
    depositCents: values.depositCents ?? 0,
    deliveryMode: values.deliveryMode,
    deliveryAddress: values.deliveryMode === "DELIVERY" && address.length > 0 ? address : null,
    documentLocale: values.documentLocale,
    notes: notes.length > 0 ? notes : null,
  };
}

export type EligibilityField = "assetId" | "customerId" | "dates";

/** Where each eligibility code is shown inline on the create form (EC-RN-01..04). */
export const ELIGIBILITY_FIELD: Readonly<Record<RentalErrorCode | "RENTAL_DATES_INVALID", EligibilityField | null>> = {
  ASSET_DOUBLE_BOOKED: "dates",
  ASSET_NOT_RENTABLE: "assetId",
  ASSET_NOT_OPERATIONAL: "assetId",
  ASSET_HAS_CRITICAL_REPORT: "assetId",
  CUSTOMER_INCOMPLETE: "customerId",
  RENTAL_DATES_INVALID: "dates",
  GUARD_CHECKOUT_INCOMPLETE: null,
  GUARD_CHECKIN_INCOMPLETE: null,
  INVALID_TRANSITION: null,
};

/** Codes per field from a live check and from the last reserve error, without duplicates. */
export function eligibilityByField(codes: readonly string[]): Partial<Record<EligibilityField, string[]>> {
  const out: Partial<Record<EligibilityField, string[]>> = {};
  for (const code of codes) {
    const field = (ELIGIBILITY_FIELD as Readonly<Record<string, EligibilityField | null>>)[code] ?? null;
    if (field === null) continue;
    const list = out[field] ?? [];
    if (!list.includes(code)) list.push(code);
    out[field] = list;
  }
  return out;
}

/** Codes carried by a reserve rejection: `details.codes` when present, otherwise the error code itself. */
export function reserveCodesOf(error: unknown): string[] {
  if (!isApiError(error)) return [];
  const codes = error.details.codes;
  if (Array.isArray(codes)) return codes.filter((c): c is string => typeof c === "string");
  return error.code in ELIGIBILITY_FIELD ? [error.code] : [];
}

/** Body for `POST /rentals/:id/close`: the payment note and the charges version the user reviewed. */
export function closeBody(paymentNote: string, chargesVersion: number): { paymentNote: string | null; chargesVersion: number } {
  const note = paymentNote.trim();
  return { paymentNote: note.length > 0 ? note : null, chargesVersion };
}

export interface UpdatedTotals {
  readonly chargesVersion: number;
  readonly totalCents: number;
  readonly balanceDueCents: number;
}

/** New totals carried by RENTAL_CHARGES_UPDATED, so the close dialog can ask for a second confirmation. */
export function chargesUpdatedOf(error: unknown): UpdatedTotals | null {
  if (!isApiError(error, "RENTAL_CHARGES_UPDATED")) return null;
  const { chargesVersion, totalCents, balanceDueCents } = error.details;
  if (typeof chargesVersion !== "number") return null;
  return { chargesVersion, totalCents: typeof totalCents === "number" ? totalCents : 0, balanceDueCents: typeof balanceDueCents === "number" ? balanceDueCents : 0 };
}

/** Damage ids that block close (`VALIDATION_FAILED` with `reason: "damageHeld"`). */
export function heldDamagesOf(error: unknown): string[] | null {
  if (!isApiError(error, "VALIDATION_FAILED") || error.details.reason !== "damageHeld") return null;
  const ids = error.details.damageIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/** Office actions available for each rental status (check-out and check-in stay on mobile). */
export function rentalActions(status: string): { reserve: boolean; cancel: boolean; close: boolean; editCharges: boolean; extend: boolean } {
  return {
    extend: canExtend(status),
    reserve: status === "DRAFT",
    cancel: status === "DRAFT" || status === "RESERVED",
    close: status === "RETURNED",
    editCharges: status === "RETURNED",
  };
}

/** Hours on the meter between check-out and check-in, or null when either reading is missing. */
export function meterDelta(checkOut: number | null | undefined, checkIn: number | null | undefined): number | null {
  if (checkOut === null || checkOut === undefined || checkIn === null || checkIn === undefined) return null;
  return Math.round((checkIn - checkOut) * 10) / 10;
}

/** One booking bar of `GET /rentals/calendar`. */
export interface CalendarItem {
  readonly rentalId: string;
  readonly number: string;
  readonly assetId: string;
  readonly assetCode: string | null;
  readonly direction: string;
  readonly customerName: string | null;
  readonly status: string;
  readonly start: string;
  readonly end: string;
  readonly isOverdue: boolean;
}

export const RENTAL_DIRECTIONS = ["OUTBOUND", "INBOUND"] as const;
export type RentalDirectionValue = (typeof RENTAL_DIRECTIONS)[number];

/** Field labels per direction (RN-12): a rent-in rental is received from and returned to a partner. */
export function directionLabels(direction: string): { checkout: "checkout" | "receive"; checkin: "checkin" | "return"; party: "customer" | "supplier" } {
  return direction === "INBOUND" ? { checkout: "receive", checkin: "return", party: "supplier" } : { checkout: "checkout", checkin: "checkin", party: "customer" };
}

/** Parts an INBOUND rental still misses (EC-RN-34), from `INBOUND_RENTAL_INCOMPLETE.details.missing`. */
export function inboundMissingOf(error: unknown): string[] | null {
  if (!isApiError(error, "INBOUND_RENTAL_INCOMPLETE")) return null;
  const missing = error.details.missing;
  return Array.isArray(missing) ? missing.filter((m): m is string => typeof m === "string") : [];
}

/** EC-RN-33: the close was rolled back because the billing document could not be created and issued. */
export function isBillingFailure(error: unknown): boolean {
  return isApiError(error, "RENTAL_BILLING_DOCUMENT_FAILED");
}

/** Extension is offered while the machine is reserved or out (RN-06). */
export function canExtend(status: string): boolean {
  return status === "RESERVED" || status === "ACTIVE";
}

/** Body for `POST /rentals/:id/extend`, or null when the new end is empty or not after the current end. */
export function extendBody(local: string, currentEndIso: string, timeZone = DEFAULT_TIME_ZONE): { newPlannedEnd: string } | null {
  const iso = localToIso(local, timeZone);
  if (iso === null) return null;
  return new Date(iso).getTime() > new Date(currentEndIso).getTime() ? { newPlannedEnd: iso } : null;
}

const DAY_MS = 86_400_000;

/** Calendar window starting at local midnight of `anchor` (a `YYYY-MM-DD` day) and spanning `days`. */
export function calendarWindow(anchor: string, days: number, timeZone = DEFAULT_TIME_ZONE): { from: string; to: string; days: string[] } {
  const start = fromZonedTime(`${anchor}T00:00:00`, timeZone);
  const end = fromZonedTime(`${shiftDay(anchor, days)}T00:00:00`, timeZone);
  return { from: start.toISOString(), to: end.toISOString(), days: Array.from({ length: days }, (_, i) => shiftDay(anchor, i)) };
}

/** `YYYY-MM-DD` plus `delta` calendar days. */
export function shiftDay(day: string, delta: number): string {
  const base = new Date(`${day}T12:00:00Z`).getTime() + delta * DAY_MS;
  return new Date(base).toISOString().slice(0, 10);
}

/** Horizontal placement of a booking bar inside the window, clamped to its edges, in percent. */
export function barPosition(item: { readonly start: string; readonly end: string }, window: { readonly from: string; readonly to: string }): { left: number; width: number } | null {
  const from = new Date(window.from).getTime();
  const to = new Date(window.to).getTime();
  const start = Math.max(new Date(item.start).getTime(), from);
  const end = Math.min(new Date(item.end).getTime(), to);
  if (end <= start || to <= from) return null;
  const span = to - from;
  return { left: Math.round(((start - from) / span) * 10_000) / 100, width: Math.max(Math.round(((end - start) / span) * 10_000) / 100, 1) };
}

/** Calendar rows: one per machine, ordered by machine code, bookings ordered by start. */
export function groupByAsset<T extends { readonly assetId: string; readonly assetCode: string | null; readonly start: string }>(items: readonly T[]): { assetId: string; assetCode: string | null; items: T[] }[] {
  const rows = new Map<string, { assetId: string; assetCode: string | null; items: T[] }>();
  for (const item of items) {
    const row = rows.get(item.assetId) ?? { assetId: item.assetId, assetCode: item.assetCode, items: [] };
    row.items.push(item);
    rows.set(item.assetId, row);
  }
  return [...rows.values()]
    .map((row) => ({ ...row, items: [...row.items].sort((a, b) => a.start.localeCompare(b.start)) }))
    .sort((a, b) => (a.assetCode ?? "").localeCompare(b.assetCode ?? ""));
}
