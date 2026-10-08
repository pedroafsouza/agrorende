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
  };
}

/** Body for `POST /rentals` (and `PATCH` of the same draft); empty optional fields fall back to asset defaults. */
export function newRentalBody(values: NewRentalValues): Record<string, unknown> {
  const address = values.deliveryAddress.trim();
  const notes = values.notes.trim();
  return {
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
export function rentalActions(status: string): { reserve: boolean; cancel: boolean; close: boolean; editCharges: boolean } {
  return {
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
