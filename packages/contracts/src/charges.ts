import type {
  AssetCategory,
  AssetCondition,
  ChargeType,
  FuelPolicy,
  InspectionType,
  MediaTag,
  RateUnit,
  RentalDirection,
  RentalStatus,
  SignatureStatus,
} from "./enums";
import { isChecklistComplete, type ChecklistItem, type ChecklistResponse } from "./checklist";

export type RentalErrorCode =
  | "ASSET_NOT_RENTABLE"
  | "ASSET_NOT_OPERATIONAL"
  | "ASSET_HAS_CRITICAL_REPORT"
  | "ASSET_DOUBLE_BOOKED"
  | "CUSTOMER_INCOMPLETE"
  | "GUARD_CHECKOUT_INCOMPLETE"
  | "GUARD_CHECKIN_INCOMPLETE"
  | "INVALID_TRANSITION";

export interface ChargeLine {
  type: ChargeType;
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
  isAuto: boolean;
  damageId?: string;
  accessoryKey?: string;
}

export interface ManualChargeLine extends ChargeLine {
  isAuto: false;
}

export interface ChargesInput {
  rateCents: number;
  rateUnit: RateUnit;
  plannedStart: Date;
  plannedEnd: Date;
  actualStart: Date;
  actualEnd: Date;
  graceHours: number;
  lateFeePerDayCents?: number | null;
  includedHoursPerDay?: number | null;
  extraHourRateCents?: number | null;
  checkOutHourMeter?: number | null;
  checkInHourMeter?: number | null;
  fuelPolicy: FuelPolicy;
  checkOutFuelPct?: number | null;
  checkInFuelPct?: number | null;
  tankCapacityL?: number | null;
  fuelPriceCents?: number | null;
  newDamages: readonly { damageId: string; estimatedCostCents: number | null }[];
  missingAccessories: readonly {
    accessoryKey: string;
    label: string;
    missingQty: number;
    replacementCostCents: number;
  }[];
  depositCents: number;
  manualLines?: readonly ManualChargeLine[];
}

export interface ChargeSummary {
  lines: ChargeLine[];
  totalCents: number;
  balanceDueCents: number;
}

const UNIT_MS: Record<RateUnit, number> = {
  HOUR: 3_600_000,
  DAY: 86_400_000,
  WEEK: 7 * 86_400_000,
  MONTH: 30 * 86_400_000,
};

const DAY_MS = UNIT_MS.DAY;

function units(ms: number, unit: RateUnit): number {
  return Math.max(1, Math.ceil(ms / UNIT_MS[unit]));
}

function autoLine(
  type: ChargeType,
  description: string,
  quantity: number,
  unitAmountCents: number,
  amountCents: number,
  extra?: Pick<ChargeLine, "damageId" | "accessoryKey">,
): ChargeLine {
  return {
    type,
    description,
    quantity,
    unitAmountCents,
    amountCents,
    isAuto: true,
    ...extra,
  };
}

export function computeRentalCharges(input: ChargesInput): ChargeLine[] {
  const plannedMs = input.plannedEnd.getTime() - input.plannedStart.getTime();
  const plannedUnits = units(plannedMs, input.rateUnit);
  const baseAmountCents = plannedUnits * input.rateCents;
  const lines: ChargeLine[] = [autoLine("BASE", "Base rental", plannedUnits, input.rateCents, baseAmountCents)];

  const graceMs = input.graceHours * UNIT_MS.HOUR;
  const lateMs = Math.max(0, input.actualEnd.getTime() - input.plannedEnd.getTime());
  const isLate = input.actualEnd.getTime() > input.plannedEnd.getTime() + graceMs;
  const extraTimeCents = !isLate
    ? 0
    : input.lateFeePerDayCents != null
      ? Math.ceil(lateMs / DAY_MS) * input.lateFeePerDayCents
      : Math.ceil(lateMs / UNIT_MS[input.rateUnit]) * input.rateCents;
  if (extraTimeCents !== 0) {
    const quantity = input.lateFeePerDayCents != null ? Math.ceil(lateMs / DAY_MS) : Math.ceil(lateMs / UNIT_MS[input.rateUnit]);
    const unitAmountCents = input.lateFeePerDayCents ?? input.rateCents;
    lines.push(autoLine("EXTRA_TIME", "Extra time", quantity, unitAmountCents, extraTimeCents));
  }

  const rentalDays = units(plannedMs, "DAY") + (isLate ? Math.ceil(lateMs / DAY_MS) : 0);
  const checkOutHourMeter = input.checkOutHourMeter;
  const checkInHourMeter = input.checkInHourMeter;
  const hasHourMeters = checkOutHourMeter != null && checkInHourMeter != null;
  const usedHours = hasHourMeters ? Math.max(0, checkInHourMeter - checkOutHourMeter) : 0;
  const extraHoursCents = input.includedHoursPerDay != null && input.extraHourRateCents != null
    ? Math.round(Math.max(0, usedHours - input.includedHoursPerDay * rentalDays) * input.extraHourRateCents)
    : 0;
  if (extraHoursCents !== 0) {
    const extraHours = Math.max(0, usedHours - (input.includedHoursPerDay ?? 0) * rentalDays);
    lines.push(autoLine("EXTRA_HOURS", "Extra hours", extraHours, input.extraHourRateCents ?? 0, extraHoursCents));
  }

  const checkOutFuelPct = input.checkOutFuelPct;
  const checkInFuelPct = input.checkInFuelPct;
  const tankCapacityL = input.tankCapacityL;
  const fuelPriceCents = input.fuelPriceCents;
  const fuelInputsPresent = checkOutFuelPct != null && checkInFuelPct != null && tankCapacityL != null && fuelPriceCents != null;
  const fuelCents = input.fuelPolicy === "INCLUDED" || !fuelInputsPresent
    ? 0
    : Math.round((Math.max(0, checkOutFuelPct - checkInFuelPct) / 100) * tankCapacityL * fuelPriceCents);
  if (fuelCents !== 0) {
    lines.push(autoLine("FUEL", "Fuel difference", 1, fuelCents, fuelCents));
  }

  for (const damage of input.newDamages) {
    const amountCents = damage.estimatedCostCents ?? 0;
    if (amountCents !== 0) {
      lines.push(autoLine("DAMAGE", "Damage", 1, amountCents, amountCents, { damageId: damage.damageId }));
    }
  }

  for (const accessory of input.missingAccessories) {
    const amountCents = accessory.missingQty * accessory.replacementCostCents;
    if (amountCents !== 0) {
      lines.push(
        autoLine("ACCESSORY", accessory.label, accessory.missingQty, accessory.replacementCostCents, amountCents, {
          accessoryKey: accessory.accessoryKey,
        }),
      );
    }
  }

  lines.push(...(input.manualLines ?? []));
  return lines;
}

export function summarizeRentalCharges(input: ChargesInput): ChargeSummary {
  const lines = computeRentalCharges(input);
  const totalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  return { lines, totalCents, balanceDueCents: totalCents - input.depositCents };
}

export interface RentalEligibilityInput {
  direction: RentalDirection;
  assetRentable: boolean;
  assetCondition: AssetCondition;
  hasCriticalOpenReport: boolean;
  hasOverlappingReservedOrActiveRental: boolean;
  customerHasDocument: boolean;
  customerHasPhone: boolean;
}

export interface RentalEligibilityResult {
  eligible: boolean;
  codes: RentalErrorCode[];
}

export function checkRentalEligibility(input: RentalEligibilityInput): RentalEligibilityResult {
  const codes: RentalErrorCode[] = [];
  if (input.direction === "OUTBOUND" && !input.assetRentable) codes.push("ASSET_NOT_RENTABLE");
  if (input.assetCondition !== "OPERATIONAL") codes.push("ASSET_NOT_OPERATIONAL");
  if (input.hasCriticalOpenReport) codes.push("ASSET_HAS_CRITICAL_REPORT");
  if (input.hasOverlappingReservedOrActiveRental) codes.push("ASSET_DOUBLE_BOOKED");
  if (!input.customerHasDocument || !input.customerHasPhone) codes.push("CUSTOMER_INCOMPLETE");
  return { eligible: codes.length === 0, codes };
}

export interface InspectionMedia {
  id: string;
  tag: MediaTag;
}

export interface RentalValidationInspection {
  type: InspectionType;
  templateSnapshot: readonly ChecklistItem[];
  responses: readonly ChecklistResponse[];
  hourMeter?: number | null;
  fuelPercent?: number | null;
  safetyBriefingGiven?: boolean;
  operatorName?: string | null;
  termsAccepted?: boolean;
  signatureStatus: SignatureStatus;
  signatureReason?: string | null;
  customerSignatureMediaId?: string | null;
  agentSignatureMediaId?: string | null;
  confirmedOpenDamageIds?: readonly string[];
  damageAnswers?: readonly { damageId: string; matchedDamageId?: string | null; present: boolean }[];
}

export interface RentalValidationRental {
  direction: RentalDirection;
  status: RentalStatus;
}

export interface RentalValidationAsset {
  category: AssetCategory;
  tankCapacityL?: number | null;
  openDamageIds: readonly string[];
}

function mediaTagSet(media: readonly InspectionMedia[]): ReadonlySet<MediaTag> {
  return new Set(media.map((item) => item.tag));
}

function mediaIdSet(media: readonly InspectionMedia[]): ReadonlySet<string> {
  return new Set(media.map((item) => item.id));
}

function hasRequiredTags(tags: ReadonlySet<MediaTag>, hasTank: boolean): boolean {
  const required: MediaTag[] = [
    "WALKAROUND_FRONT",
    "WALKAROUND_REAR",
    "WALKAROUND_LEFT",
    "WALKAROUND_RIGHT",
    "WALKAROUND_CAB",
    "HOUR_METER",
  ];
  if (hasTank) required.push("FUEL_GAUGE");
  return required.every((tag) => tags.has(tag));
}

function hasConfirmedOpenDamages(inspection: RentalValidationInspection, openDamageIds: readonly string[]): boolean {
  if (openDamageIds.length === 0) return true;
  const confirmedIds = new Set(inspection.confirmedOpenDamageIds ?? []);
  if (openDamageIds.every((damageId) => confirmedIds.has(damageId))) return true;

  const answeredIds = new Set(
    (inspection.damageAnswers ?? [])
      .filter((answer) => answer.present || answer.matchedDamageId != null)
      .map((answer) => answer.damageId),
  );
  return openDamageIds.every((damageId) => answeredIds.has(damageId));
}

function hasAnsweredCheckInDamages(inspection: RentalValidationInspection, openDamageIds: readonly string[]): boolean {
  if (openDamageIds.length === 0) return true;
  const answers = inspection.damageAnswers ?? [];
  return openDamageIds.every((damageId) =>
    answers.some((answer) => answer.damageId === damageId && (answer.matchedDamageId != null || !answer.present)),
  );
}

export function validateCheckOut(
  inspection: RentalValidationInspection,
  media: readonly InspectionMedia[],
  rental: RentalValidationRental,
  asset: RentalValidationAsset,
): { ok: true } | { ok: false; code: "GUARD_CHECKOUT_INCOMPLETE" } {
  const hasTank = asset.tankCapacityL != null;
  const tags = mediaTagSet(media);
  const validMediaIds = mediaIdSet(media);
  const operatorName = inspection.operatorName?.trim() ?? "";
  const signatureSigned = inspection.signatureStatus === "SIGNED" && inspection.customerSignatureMediaId != null && inspection.agentSignatureMediaId != null;
  const complete =
    rental.status === "RESERVED" &&
    hasRequiredTags(tags, hasTank) &&
    (asset.category === "IMPLEMENT" || inspection.hourMeter != null) &&
    (!hasTank || inspection.fuelPercent != null) &&
    isChecklistComplete(inspection.templateSnapshot, inspection.responses, validMediaIds) &&
    hasConfirmedOpenDamages(inspection, asset.openDamageIds) &&
    (rental.direction !== "OUTBOUND" || (inspection.safetyBriefingGiven === true && operatorName.length > 0)) &&
    inspection.termsAccepted === true &&
    signatureSigned;

  return complete ? { ok: true } : { ok: false, code: "GUARD_CHECKOUT_INCOMPLETE" };
}

export function validateCheckIn(
  inspection: RentalValidationInspection,
  media: readonly InspectionMedia[],
  rental: RentalValidationRental,
  asset: RentalValidationAsset,
): { ok: true } | { ok: false; code: "GUARD_CHECKIN_INCOMPLETE" } {
  const hasTank = asset.tankCapacityL != null;
  const tags = mediaTagSet(media);
  const validMediaIds = mediaIdSet(media);
  const signatureAccepted =
    inspection.signatureStatus === "SIGNED" ||
    inspection.signatureStatus === "ABSENT" ||
    inspection.signatureStatus === "REFUSED";
  const complete =
    rental.status === "ACTIVE" &&
    hasRequiredTags(tags, hasTank) &&
    (asset.category === "IMPLEMENT" || inspection.hourMeter != null) &&
    (!hasTank || inspection.fuelPercent != null) &&
    isChecklistComplete(inspection.templateSnapshot, inspection.responses, validMediaIds) &&
    hasAnsweredCheckInDamages(inspection, asset.openDamageIds) &&
    signatureAccepted;

  return complete ? { ok: true } : { ok: false, code: "GUARD_CHECKIN_INCOMPLETE" };
}
