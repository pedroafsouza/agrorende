import { summarizeRentalCharges, validateCheckIn, validateCheckOut, type ChargeSummary, type ChargesInput, type InspectionMedia, type RentalValidationAsset, type RentalValidationInspection } from "@agrorende/contracts/charges";
import { isChecklistComplete, type AccessoryDef, type AccessoryLine, type ChecklistItem, type ChecklistResponse } from "@agrorende/contracts/checklist";
import type {
  AssetCategory,
  DamageMatchStatus,
  DamageSeverity,
  DamageZone,
  FuelPolicy,
  MediaTag,
  RateUnit,
  RentalDirection,
  RentalStatus,
  Role,
  SignatureStatus,
  SignerRole,
} from "@agrorende/contracts/enums";
import type { RentalCheckinPayload, RentalCheckoutPayload } from "@agrorende/contracts/mutations";
import type { MediaMeta } from "@agrorende/contracts/sync";
import { maskTaxId } from "@agrorende/contracts";
import { formatDate } from "@agrorende/i18n";

import type { MediaDraft } from "../../components/MediaCapture/drafts";
import { getMirrorRow, listMirrorRows, type MirrorRow } from "../../db/mirror";
import type { SqlDb } from "../../db/sql";
import type { MessageKey } from "../../i18n/messages";

// ───────── constants ─────────

export const DEFAULT_GRACE_HOURS = 2;
export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
export const WALKAROUND_TAGS = ["WALKAROUND_FRONT", "WALKAROUND_REAR", "WALKAROUND_LEFT", "WALKAROUND_RIGHT", "WALKAROUND_CAB"] as const;
export const DAMAGE_ZONES: readonly DamageZone[] = ["FRONT", "REAR", "LEFT", "RIGHT", "TOP", "CAB", "ENGINE", "UNDERCARRIAGE", "TIRES_TRACKS", "IMPLEMENT", "OTHER"];
export const DAMAGE_SEVERITIES: readonly DamageSeverity[] = ["MINOR", "MODERATE", "SEVERE"];
export const HOUR_MS = 3_600_000;

export const STATUS_TONE: Readonly<Record<RentalStatus, "success" | "warning" | "info" | "danger" | "neutral">> = {
  DRAFT: "neutral",
  RESERVED: "info",
  ACTIVE: "success",
  RETURNED: "warning",
  CLOSED: "neutral",
  CANCELLED: "neutral",
};

export const CHECKOUT_STEPS = ["locale", "identity", "walkaround", "readings", "checklist", "damages", "accessories", "briefing", "terms", "signatures", "review"] as const;
export const CHECKIN_STEPS = ["identity", "walkaround", "readings", "checklist", "damages", "accessories", "signatures", "charges"] as const;
export type CheckoutStepId = (typeof CHECKOUT_STEPS)[number];
export type CheckinStepId = (typeof CHECKIN_STEPS)[number];
export type InspectionStepId = CheckoutStepId | CheckinStepId;
export type InspectionKind = "CHECK_OUT" | "CHECK_IN";

// ───────── row helpers ─────────

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const ACTIVE = "deletedAt IS NULL";

// ───────── organisation ─────────

export interface OrgRentalSettings {
  readonly timeZone: string;
  readonly graceHours: number;
  readonly currency: string;
  readonly termsVersion: number | null;
  readonly termsText: Readonly<Record<string, string>> | null;
}

export function orgRentalSettings(row: MirrorRow | undefined): OrgRentalSettings {
  const settings = obj(row?.settings);
  const terms = obj(settings?.rentalTerms);
  const text = obj(terms?.text);
  return {
    timeZone: str(row?.timezone) ?? DEFAULT_TIME_ZONE,
    graceHours: num(settings?.rentalGraceHours) ?? DEFAULT_GRACE_HOURS,
    currency: str(row?.currency) ?? "BRL",
    termsVersion: num(terms?.version),
    termsText: text === null ? null : (Object.fromEntries(Object.entries(text).filter((entry): entry is [string, string] => typeof entry[1] === "string")) as Record<string, string>),
  };
}

export async function loadOrgRentalSettings(db: SqlDb): Promise<OrgRentalSettings> {
  const rows = await listMirrorRows(db, "organization", "1 = 1 LIMIT 1");
  return orgRentalSettings(rows[0]);
}

// ───────── dates ─────────

/** `YYYY-MM-DD` of an instant in the organisation timezone (R13). */
export function dayKey(input: string | number | Date, timeZone: string): string {
  let text: string;
  try {
    text = formatDate(input, "pt-BR", { timeZone });
  } catch {
    text = formatDate(input, "pt-BR", { timeZone: "UTC" });
  }
  const [d, m, y] = text.split("/");
  return `${y ?? ""}-${m ?? ""}-${d ?? ""}`;
}

export function isOverdue(plannedEnd: string, nowMs: number, graceHours: number): boolean {
  return nowMs > Date.parse(plannedEnd) + graceHours * HOUR_MS;
}

// ───────── list ─────────

export interface RentalSummary {
  readonly id: string;
  readonly number: string | null;
  readonly status: RentalStatus;
  readonly direction: RentalDirection;
  readonly assetId: string;
  readonly assetName: string;
  readonly assetCode: string | null;
  readonly customerName: string;
  readonly plannedStart: string;
  readonly plannedEnd: string;
  readonly actualStart: string | null;
  readonly actualEnd: string | null;
  readonly pending: boolean;
}

function customerNameOf(rental: MirrorRow, customer: MirrorRow | undefined): string {
  const snapshot = obj(rental.customerSnapshot);
  return str(customer?.name) ?? str(snapshot?.name) ?? "";
}

function summaryOf(rental: MirrorRow, asset: MirrorRow | undefined, customer: MirrorRow | undefined): RentalSummary {
  return {
    id: String(rental.id),
    number: str(rental.number),
    status: (str(rental.status) ?? "DRAFT") as RentalStatus,
    direction: (str(rental.direction) ?? "OUTBOUND") as RentalDirection,
    assetId: String(rental.assetId ?? ""),
    assetName: str(asset?.name) ?? str(asset?.code) ?? "",
    assetCode: str(asset?.code),
    customerName: customerNameOf(rental, customer),
    plannedStart: String(rental.plannedStart ?? ""),
    plannedEnd: String(rental.plannedEnd ?? ""),
    actualStart: str(rental.actualStart),
    actualEnd: str(rental.actualEnd),
    pending: rental._dirty === 1 || rental._dirty === true,
  };
}

/** RESERVED and ACTIVE rentals with asset and customer names, soonest first. */
export async function listOpenRentals(db: SqlDb): Promise<RentalSummary[]> {
  const rentals = await listMirrorRows(db, "rentals", `${ACTIVE} AND status IN ('RESERVED', 'ACTIVE') ORDER BY plannedStart ASC`);
  const out: RentalSummary[] = [];
  for (const rental of rentals) {
    const asset = typeof rental.assetId === "string" ? await getMirrorRow(db, "assets", rental.assetId) : undefined;
    const customer = typeof rental.customerId === "string" ? await getMirrorRow(db, "customers", rental.customerId) : undefined;
    out.push(summaryOf(rental, asset, customer));
  }
  return out;
}

export interface RentalSections {
  readonly overdue: readonly RentalSummary[];
  readonly handOvers: readonly RentalSummary[];
  readonly returns: readonly RentalSummary[];
  readonly active: readonly RentalSummary[];
  readonly upcoming: readonly RentalSummary[];
}

/**
 * Tab sections: hand-overs are RESERVED rentals starting today (or already late to start),
 * returns are ACTIVE rentals ending today, overdue is ACTIVE past `plannedEnd + grace`.
 */
export function sectionRentals(rows: readonly RentalSummary[], nowMs: number, timeZone: string, graceHours: number): RentalSections {
  const today = dayKey(nowMs, timeZone);
  const overdue: RentalSummary[] = [];
  const handOvers: RentalSummary[] = [];
  const returns: RentalSummary[] = [];
  const active: RentalSummary[] = [];
  const upcoming: RentalSummary[] = [];
  for (const row of rows) {
    if (row.status === "RESERVED") {
      if (dayKey(row.plannedStart, timeZone) <= today) handOvers.push(row);
      else upcoming.push(row);
    } else if (row.status === "ACTIVE") {
      if (isOverdue(row.plannedEnd, nowMs, graceHours)) overdue.push(row);
      else if (dayKey(row.plannedEnd, timeZone) === today) returns.push(row);
      else active.push(row);
    }
  }
  return { overdue, handOvers, returns, active, upcoming };
}

export function sectionCounts(sections: RentalSections): { readonly handOvers: number; readonly returns: number; readonly overdue: number } {
  return { handOvers: sections.handOvers.length, returns: sections.returns.length, overdue: sections.overdue.length };
}

// ───────── detail ─────────

/** ADMIN and MANAGER run the office side (create, reserve, full CPF/CNPJ). */
export function isOfficeRole(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

/** CPF/CNPJ for display: FIELD users only see the masked value (T08.17). */
export function displayTaxId(role: Role | undefined, customer: MirrorRow | undefined, snapshot: Record<string, unknown> | null): string | null {
  const full = str(customer?.taxId) ?? str(snapshot?.taxId);
  const masked = str(customer?.taxIdMasked) ?? str(snapshot?.taxIdMasked) ?? (full === null ? null : maskTaxId(full));
  if (isOfficeRole(role)) return full ?? masked;
  return masked;
}

export interface OpenDamage {
  readonly id: string;
  readonly zone: DamageZone;
  readonly severity: DamageSeverity;
  readonly description: string | null;
}

export async function openDamagesForAsset(db: SqlDb, assetId: string): Promise<OpenDamage[]> {
  const rows = await listMirrorRows(db, "damages", `${ACTIVE} AND assetId = ? AND repairedAt IS NULL ORDER BY createdAt ASC`, [assetId]);
  return rows.map((row) => ({ id: String(row.id), zone: (str(row.zone) ?? "OTHER") as DamageZone, severity: (str(row.severity) ?? "MINOR") as DamageSeverity, description: str(row.description) }));
}

export interface RentalDetail {
  readonly rental: MirrorRow;
  readonly summary: RentalSummary;
  readonly asset: MirrorRow | undefined;
  readonly customer: MirrorRow | undefined;
  readonly snapshot: Record<string, unknown> | null;
  readonly settings: OrgRentalSettings;
}

export async function getRentalDetail(db: SqlDb, id: string): Promise<RentalDetail | undefined> {
  const rental = await getMirrorRow(db, "rentals", id);
  if (rental === undefined || rental.deletedAt != null) return undefined;
  const asset = typeof rental.assetId === "string" ? await getMirrorRow(db, "assets", rental.assetId) : undefined;
  const customer = typeof rental.customerId === "string" ? await getMirrorRow(db, "customers", rental.customerId) : undefined;
  return { rental, summary: summaryOf(rental, asset, customer), asset, customer, snapshot: obj(rental.customerSnapshot), settings: await loadOrgRentalSettings(db) };
}

export function canCheckOut(status: RentalStatus): boolean {
  return status === "RESERVED";
}

export function canCheckIn(status: RentalStatus): boolean {
  return status === "ACTIVE";
}

// ───────── wizard context ─────────

export interface TemplateInfo {
  readonly id: string;
  readonly version: number;
  readonly items: readonly ChecklistItem[];
  readonly accessories: readonly AccessoryDef[];
}

/** Active RENTAL template for the asset category (a category-less template is the fallback); newest version wins. */
export async function findTemplate(db: SqlDb, category: AssetCategory | null): Promise<TemplateInfo | undefined> {
  const rows = await listMirrorRows(db, "checklistTemplates", `${ACTIVE} AND (isActive IS NULL OR isActive = 1) AND archivedAt IS NULL ORDER BY templateVersion DESC`);
  const matches = rows.filter((row) => arr<string>(row.appliesTo).includes("RENTAL"));
  const best = matches.find((row) => category !== null && arr<string>(row.assetCategories).includes(category)) ?? matches.find((row) => arr<string>(row.assetCategories).length === 0);
  if (best === undefined) return undefined;
  return { id: String(best.id), version: num(best.templateVersion) ?? 0, items: arr<ChecklistItem>(best.items), accessories: arr<AccessoryDef>(best.accessories) };
}

export interface CheckOutEvidence {
  readonly hourMeter: number | null;
  readonly fuelPercent: number | null;
  readonly accessories: readonly AccessoryLine[];
  readonly responses: readonly ChecklistResponse[];
  readonly templateId: string | null;
  readonly templateVersion: number | null;
  readonly templateSnapshot: readonly ChecklistItem[];
  readonly media: readonly { readonly id: string; readonly tag: string; readonly localUri: string | null }[];
}

export async function loadCheckOutEvidence(db: SqlDb, inspectionId: string | null): Promise<CheckOutEvidence | null> {
  if (inspectionId === null) return null;
  const row = await getMirrorRow(db, "inspections", inspectionId);
  if (row === undefined) return null;
  const media = await listMirrorRows(db, "media", `${ACTIVE} AND json_extract(parent, '$.id') = ?`, [inspectionId]);
  const out: { id: string; tag: string; localUri: string | null }[] = [];
  for (const item of media) {
    const file = await db.get<{ localUri: string | null; thumbUri: string | null }>("SELECT localUri, thumbUri FROM media_files WHERE mediaId = ?", [String(item.id)]);
    out.push({ id: String(item.id), tag: String(item.tag ?? ""), localUri: file?.thumbUri ?? file?.localUri ?? null });
  }
  return {
    hourMeter: num(row.hourMeter),
    fuelPercent: num(row.fuelPercent),
    accessories: arr<AccessoryLine>(row.accessories),
    responses: arr<ChecklistResponse>(row.responses),
    templateId: str(row.templateId),
    templateVersion: num(row.templateVersion),
    templateSnapshot: arr<ChecklistItem>(row.templateSnapshot),
    media: out,
  };
}

/** Everything the wizard needs that does not change while it runs. */
export interface InspectionContext {
  readonly kind: InspectionKind;
  readonly rentalId: string;
  readonly rentalNumber: string | null;
  readonly status: RentalStatus;
  readonly direction: RentalDirection;
  readonly assetId: string;
  readonly assetCode: string | null;
  readonly assetName: string;
  readonly category: AssetCategory;
  readonly tankCapacityL: number | null;
  /** Asset reading at check-out, check-out reading at check-in (EC-RN-09). */
  readonly baselineHourMeter: number | null;
  readonly openDamages: readonly OpenDamage[];
  readonly template: TemplateInfo | undefined;
  readonly customerName: string;
  readonly documentLocale: "pt-BR" | "en";
  readonly settings: OrgRentalSettings;
  readonly checkOut: CheckOutEvidence | null;
  readonly charges: RentalChargeTerms;
}

export interface RentalChargeTerms {
  readonly rateCents: number;
  readonly rateUnit: RateUnit;
  readonly plannedStart: string;
  readonly plannedEnd: string;
  readonly actualStart: string | null;
  readonly lateFeePerDayCents: number | null;
  readonly includedHoursPerDay: number | null;
  readonly extraHourRateCents: number | null;
  readonly fuelPolicy: FuelPolicy;
  readonly fuelPriceCents: number | null;
  readonly depositCents: number;
}

export function chargeTermsOf(rental: MirrorRow): RentalChargeTerms {
  return {
    rateCents: num(rental.rateCents) ?? 0,
    rateUnit: (str(rental.rateUnit) ?? "DAY") as RateUnit,
    plannedStart: String(rental.plannedStart ?? ""),
    plannedEnd: String(rental.plannedEnd ?? ""),
    actualStart: str(rental.actualStart),
    lateFeePerDayCents: num(rental.lateFeePerDayCents),
    includedHoursPerDay: num(rental.includedHoursPerDay),
    extraHourRateCents: num(rental.extraHourRateCents),
    fuelPolicy: (str(rental.fuelPolicy) ?? "CHARGE_DIFFERENCE") as FuelPolicy,
    fuelPriceCents: num(rental.fuelPriceCents),
    depositCents: num(rental.depositCents) ?? 0,
  };
}

export async function loadInspectionContext(db: SqlDb, rentalId: string, kind: InspectionKind): Promise<InspectionContext | undefined> {
  const detail = await getRentalDetail(db, rentalId);
  if (detail === undefined) return undefined;
  const { rental, asset, summary } = detail;
  const category = (str(asset?.category) ?? "OTHER") as AssetCategory;
  const checkOut = kind === "CHECK_IN" ? await loadCheckOutEvidence(db, str(rental.checkOutInspectionId)) : null;
  const locale = str(rental.documentLocale);
  return {
    kind,
    rentalId,
    rentalNumber: summary.number,
    status: summary.status,
    direction: summary.direction,
    assetId: summary.assetId,
    assetCode: summary.assetCode,
    assetName: summary.assetName,
    category,
    tankCapacityL: num(asset?.tankCapacityL),
    baselineHourMeter: kind === "CHECK_IN" ? (checkOut?.hourMeter ?? num(asset?.hourMeter)) : num(asset?.hourMeter),
    openDamages: summary.assetId.length > 0 ? await openDamagesForAsset(db, summary.assetId) : [],
    template: await findTemplate(db, category),
    customerName: summary.customerName,
    documentLocale: locale === "en" ? "en" : "pt-BR",
    settings: detail.settings,
    checkOut,
    charges: chargeTermsOf(rental),
  };
}

// ───────── draft ─────────

export interface DamageDraft {
  readonly id: string;
  readonly zone: DamageZone;
  readonly severity: DamageSeverity;
  readonly description?: string;
  readonly isPreExisting: boolean;
  readonly matchStatus: DamageMatchStatus;
  readonly matchedDamageId?: string;
  readonly estimatedCostCents?: number;
  /** The agent cannot estimate the cost; the office prices it later. */
  readonly costUnknown?: boolean;
}

/** Wizard payload stored in `drafts` under `checkout-<rentalId>` / `checkin-<rentalId>` (EC-RN-25). */
export interface InspectionDraft {
  readonly kind: InspectionKind;
  readonly rentalId: string;
  readonly inspectionId: string;
  readonly assetId: string;
  readonly identityConfirmed: boolean;
  readonly documentLocale: "pt-BR" | "en";
  readonly templateId: string;
  readonly templateVersion: number;
  readonly templateSnapshot: readonly ChecklistItem[];
  readonly responses: readonly ChecklistResponse[];
  readonly media: readonly MediaDraft[];
  readonly hourMeter?: number;
  readonly fuelPercent?: number;
  readonly meterReplaced: boolean;
  readonly damages: readonly DamageDraft[];
  readonly accessories: readonly AccessoryLine[];
  readonly safetyBriefingGiven: boolean;
  readonly operatorName: string;
  readonly operatorDocument: string;
  readonly termsAccepted: boolean;
  readonly termsVersion?: number;
  readonly signerName?: string;
  readonly signerDocument?: string;
  readonly signerRole?: SignerRole;
  readonly signatureStatus: SignatureStatus;
  readonly signatureReason?: string;
  readonly customerSignature?: MediaDraft;
  readonly agentSignature?: MediaDraft;
}

export function draftIdFor(kind: InspectionKind, rentalId: string): string {
  return `${kind === "CHECK_OUT" ? "checkout" : "checkin"}-${rentalId}`;
}

/** Check-in reuses the check-out snapshot so both documents compare the same items. */
function templateFor(ctx: InspectionContext, fallbackId: string): Pick<InspectionDraft, "templateId" | "templateVersion" | "templateSnapshot"> {
  const co = ctx.checkOut;
  if (ctx.kind === "CHECK_IN" && co !== null && co.templateId !== null && co.templateSnapshot.length > 0) {
    return { templateId: co.templateId, templateVersion: co.templateVersion ?? 0, templateSnapshot: co.templateSnapshot };
  }
  const template = ctx.template;
  return { templateId: template?.id ?? fallbackId, templateVersion: template?.version ?? 0, templateSnapshot: template?.items ?? [] };
}

export function newInspectionDraft(ctx: InspectionContext, ids: { readonly inspectionId: string; readonly templateId: string }): InspectionDraft {
  const template = ctx.template;
  const accessories: AccessoryLine[] =
    ctx.kind === "CHECK_IN" && ctx.checkOut !== null && ctx.checkOut.accessories.length > 0
      ? ctx.checkOut.accessories.map((line) => ({ accessoryKey: line.accessoryKey, expected: line.present, present: line.present, ...(line.replacementCostCents === undefined ? {} : { replacementCostCents: line.replacementCostCents }) }))
      : (template?.accessories ?? []).map((def) => ({ accessoryKey: def.accessoryKey, expected: def.defaultQty, present: def.defaultQty, ...(def.replacementCostCents === undefined ? {} : { replacementCostCents: def.replacementCostCents }) }));
  return {
    kind: ctx.kind,
    rentalId: ctx.rentalId,
    inspectionId: ids.inspectionId,
    assetId: ctx.assetId,
    identityConfirmed: false,
    documentLocale: ctx.documentLocale,
    ...templateFor(ctx, ids.templateId),
    responses: [],
    media: [],
    meterReplaced: false,
    damages: [],
    accessories,
    safetyBriefingGiven: false,
    operatorName: "",
    operatorDocument: "",
    termsAccepted: false,
    ...(ctx.settings.termsVersion === null ? {} : { termsVersion: ctx.settings.termsVersion }),
    signatureStatus: "SIGNED",
  };
}

// ───────── per-step validation ─────────

function tagsOf(media: readonly { readonly tag: string }[]): Set<string> {
  return new Set(media.map((item) => item.tag));
}

export function mediaWithTag(draft: Pick<InspectionDraft, "media">, tag: string): MediaDraft | undefined {
  return draft.media.find((item) => item.tag === tag);
}

export function hasTank(ctx: Pick<InspectionContext, "tankCapacityL">): boolean {
  return ctx.tankCapacityL !== null;
}

export function validateIdentity(draft: InspectionDraft): true | MessageKey {
  return draft.identityConfirmed ? true : "rentals.wizard.identity.required";
}

export function validateWalkaround(draft: InspectionDraft): true | MessageKey {
  const tags = tagsOf(draft.media);
  return WALKAROUND_TAGS.every((tag) => tags.has(tag)) ? true : "rentals.wizard.walkaround.missing";
}

export function readingError(draft: InspectionDraft, ctx: InspectionContext, nowMs: number): MessageKey | undefined {
  if (draft.meterReplaced || draft.hourMeter === undefined || ctx.baselineHourMeter === null) return undefined;
  if (draft.hourMeter < ctx.baselineHourMeter) return "errors.METER_READING_LOWER.title";
  if (ctx.kind === "CHECK_IN") {
    const start = Date.parse(ctx.charges.actualStart ?? ctx.charges.plannedStart);
    const maxDelta = Math.max(0, (nowMs - start) / HOUR_MS) + 1;
    if (draft.hourMeter - ctx.baselineHourMeter > maxDelta) return "errors.METER_READING_JUMP.title";
  }
  return undefined;
}

export function validateReadings(draft: InspectionDraft, ctx: InspectionContext, nowMs: number): true | MessageKey {
  const tags = tagsOf(draft.media);
  if (ctx.category !== "IMPLEMENT" && draft.hourMeter === undefined) return "rentals.wizard.readings.hourMeterRequired";
  if (!tags.has("HOUR_METER")) return "rentals.wizard.readings.hourMeterPhoto";
  if (hasTank(ctx) && (draft.fuelPercent === undefined || !tags.has("FUEL_GAUGE"))) return "rentals.wizard.readings.fuelRequired";
  return readingError(draft, ctx, nowMs) ?? true;
}

export function validateChecklist(draft: InspectionDraft): true | MessageKey {
  return isChecklistComplete(draft.templateSnapshot, draft.responses, draft.media.map((item) => item.id)) ? true : "rentals.wizard.checklist.incomplete";
}

export function validateDamages(draft: InspectionDraft, ctx: InspectionContext): true | MessageKey {
  for (const open of ctx.openDamages) {
    if (!draft.damages.some((damage) => damage.matchedDamageId === open.id)) return "rentals.wizard.damages.confirmOpen";
  }
  for (const damage of draft.damages) {
    if (damage.matchedDamageId !== undefined) continue;
    if (!draft.media.some((item) => item.tag === "DAMAGE" && item.damageId === damage.id)) return "rentals.wizard.damages.photoRequired";
  }
  return true;
}

export function validateAccessories(draft: InspectionDraft): true | MessageKey {
  for (const line of draft.accessories) {
    if (line.present < 0) return "rentals.wizard.accessories.invalid";
    if (line.present < line.expected && (line.missingReason?.trim() ?? "").length === 0) return "rentals.wizard.accessories.noteRequired";
  }
  return true;
}

export function validateBriefing(draft: InspectionDraft, ctx: InspectionContext): true | MessageKey {
  if (ctx.direction !== "OUTBOUND") return true;
  return draft.safetyBriefingGiven && draft.operatorName.trim().length > 0 ? true : "rentals.wizard.briefing.required";
}

export function validateTerms(draft: InspectionDraft): true | MessageKey {
  return draft.termsAccepted ? true : "rentals.wizard.terms.required";
}

export function validateSignatures(draft: InspectionDraft): true | MessageKey {
  if (draft.agentSignature === undefined) return "rentals.wizard.signatures.agentRequired";
  if (draft.kind === "CHECK_OUT") {
    if (draft.signatureStatus !== "SIGNED") return "rentals.wizard.signatures.customerRequired";
  }
  if (draft.signatureStatus === "SIGNED") {
    if (draft.customerSignature === undefined || (draft.signerName?.trim() ?? "").length === 0) return "rentals.wizard.signatures.customerRequired";
  }
  if (draft.signatureStatus === "REFUSED" && (draft.signatureReason?.trim() ?? "").length === 0) return "rentals.wizard.signatures.reasonRequired";
  return true;
}

/** Every step that still blocks the hand-over or the return, in wizard order. */
export function missingSteps(draft: InspectionDraft, ctx: InspectionContext, nowMs: number): { readonly step: InspectionStepId; readonly reason: MessageKey }[] {
  const checks: [InspectionStepId, true | MessageKey][] = [
    ["identity", validateIdentity(draft)],
    ["walkaround", validateWalkaround(draft)],
    ["readings", validateReadings(draft, ctx, nowMs)],
    ["checklist", validateChecklist(draft)],
    ["damages", validateDamages(draft, ctx)],
    ["accessories", validateAccessories(draft)],
  ];
  if (ctx.kind === "CHECK_OUT") {
    checks.push(["briefing", validateBriefing(draft, ctx)], ["terms", validateTerms(draft)]);
  }
  checks.push(["signatures", validateSignatures(draft)]);
  const out: { step: InspectionStepId; reason: MessageKey }[] = [];
  for (const [step, result] of checks) if (result !== true) out.push({ step, reason: result });
  return out;
}

// ───────── payload ─────────

export function toMediaMeta(draft: MediaDraft): MediaMeta {
  const { localUri: _l, thumbUri: _t, ...meta } = draft;
  return meta;
}

function allMedia(draft: InspectionDraft): MediaDraft[] {
  const out = [...draft.media];
  if (draft.customerSignature !== undefined) out.push(draft.customerSignature);
  if (draft.agentSignature !== undefined) out.push(draft.agentSignature);
  return out;
}

function baseInspection(draft: InspectionDraft) {
  const media = allMedia(draft).map(toMediaMeta);
  const meterPhoto = draft.meterReplaced ? mediaWithTag(draft, "HOUR_METER") : undefined;
  const damages = draft.damages.map((damage) => ({
    id: damage.id,
    zone: damage.zone,
    severity: damage.severity,
    ...(damage.description === undefined || damage.description.trim().length === 0 ? {} : { description: damage.description.trim() }),
    isPreExisting: damage.isPreExisting,
    matchStatus: damage.matchStatus,
    ...(damage.matchedDamageId === undefined ? {} : { matchedDamageId: damage.matchedDamageId }),
    ...(damage.estimatedCostCents === undefined || damage.costUnknown === true ? {} : { estimatedCostCents: damage.estimatedCostCents }),
    mediaIds: draft.media.filter((item) => item.damageId === damage.id).map((item) => item.id),
  }));
  const accessories = draft.accessories.map((line) => ({
    accessoryKey: line.accessoryKey,
    expected: line.expected,
    present: line.present,
    ...(line.missingReason === undefined || line.missingReason.trim().length === 0 ? {} : { missingReason: line.missingReason.trim() }),
    ...(line.replacementCostCents === undefined ? {} : { replacementCostCents: line.replacementCostCents }),
  }));
  const signerName = draft.signerName?.trim() ?? "";
  const signerDocument = draft.signerDocument?.trim() ?? "";
  const reason = draft.signatureReason?.trim() ?? "";
  return {
    id: draft.inspectionId,
    assetId: draft.assetId,
    templateId: draft.templateId,
    templateVersion: draft.templateVersion,
    templateSnapshot: [...draft.templateSnapshot],
    responses: [...draft.responses],
    ...(draft.hourMeter === undefined ? {} : { hourMeter: draft.hourMeter }),
    ...(draft.meterReplaced ? { meterReplaced: true } : {}),
    ...(meterPhoto === undefined ? {} : { meterPhotoMediaId: meterPhoto.id }),
    ...(draft.fuelPercent === undefined ? {} : { fuelPercent: draft.fuelPercent }),
    accessories,
    documentLocale: draft.documentLocale,
    ...(signerName.length === 0 ? {} : { signerName }),
    ...(signerDocument.length === 0 ? {} : { signerDocument }),
    ...(draft.signerRole === undefined ? {} : { signerRole: draft.signerRole }),
    signatureStatus: draft.signatureStatus,
    ...(reason.length === 0 ? {} : { signatureReason: reason }),
    ...(draft.customerSignature === undefined || draft.signatureStatus !== "SIGNED" ? {} : { customerSignatureMediaId: draft.customerSignature.id }),
    agentSignatureMediaId: draft.agentSignature?.id ?? "",
    damages,
    media,
  };
}

export function buildCheckoutPayload(draft: InspectionDraft): RentalCheckoutPayload {
  const operatorName = draft.operatorName.trim();
  const operatorDocument = draft.operatorDocument.trim();
  return {
    rentalId: draft.rentalId,
    inspection: {
      ...baseInspection(draft),
      safetyBriefingGiven: draft.safetyBriefingGiven,
      ...(operatorName.length === 0 ? {} : { operatorName }),
      ...(operatorDocument.length === 0 ? {} : { operatorDocument }),
      termsAccepted: draft.termsAccepted,
      ...(draft.termsVersion === undefined ? {} : { termsVersion: draft.termsVersion }),
    },
  };
}

export function buildCheckinPayload(draft: InspectionDraft): RentalCheckinPayload {
  const damageCosts = draft.damages
    .filter((damage) => damage.matchStatus === "NEW" && damage.costUnknown !== true && damage.estimatedCostCents !== undefined)
    .map((damage) => ({ damageId: damage.id, estimatedCostCents: damage.estimatedCostCents ?? 0 }));
  return { rentalId: draft.rentalId, inspection: baseInspection(draft), damageCosts };
}

type InspectionPayloadLike = ReturnType<typeof baseInspection> & { safetyBriefingGiven?: boolean; operatorName?: string; termsAccepted?: boolean };

/** Same mapping as the server (`validationInspection`), so the device guard matches the server guard. */
export function validationArgs(
  kind: InspectionKind,
  inspection: InspectionPayloadLike,
  ctx: Pick<InspectionContext, "direction" | "status" | "category" | "tankCapacityL" | "openDamages">,
): [RentalValidationInspection, InspectionMedia[], { direction: RentalDirection; status: RentalStatus }, RentalValidationAsset] {
  const matched = inspection.damages.filter((damage) => damage.matchedDamageId !== undefined);
  return [
    {
      type: kind,
      templateSnapshot: inspection.templateSnapshot,
      responses: inspection.responses,
      hourMeter: inspection.hourMeter ?? null,
      fuelPercent: inspection.fuelPercent ?? null,
      safetyBriefingGiven: inspection.safetyBriefingGiven ?? false,
      operatorName: inspection.operatorName ?? null,
      termsAccepted: inspection.termsAccepted ?? false,
      signatureStatus: inspection.signatureStatus,
      signatureReason: inspection.signatureReason ?? null,
      customerSignatureMediaId: inspection.customerSignatureMediaId ?? null,
      agentSignatureMediaId: inspection.agentSignatureMediaId.length > 0 ? inspection.agentSignatureMediaId : null,
      confirmedOpenDamageIds: matched.filter((damage) => damage.matchStatus === "MATCHED").map((damage) => damage.matchedDamageId as string),
      damageAnswers: matched.map((damage) => ({ damageId: damage.matchedDamageId as string, matchedDamageId: damage.matchedDamageId ?? null, present: true })),
    },
    inspection.media.map((item) => ({ id: item.id, tag: item.tag as MediaTag })),
    { direction: ctx.direction, status: ctx.status },
    { category: ctx.category, tankCapacityL: ctx.tankCapacityL, openDamageIds: ctx.openDamages.map((damage) => damage.id) },
  ];
}

/** `validateCheckOut` / `validateCheckIn` from the contracts on the device payload (offline guard). */
export function guardDraft(draft: InspectionDraft, ctx: InspectionContext): boolean {
  if (draft.kind === "CHECK_OUT") {
    const payload = buildCheckoutPayload(draft);
    return validateCheckOut(...validationArgs("CHECK_OUT", payload.inspection, ctx)).ok;
  }
  const payload = buildCheckinPayload(draft);
  return validateCheckIn(...validationArgs("CHECK_IN", payload.inspection, ctx)).ok;
}

// ───────── charges preview ─────────

export function missingAccessoryLines(
  checkOut: readonly AccessoryLine[],
  checkIn: readonly AccessoryLine[],
  labels: ReadonlyMap<string, string>,
): ChargesInput["missingAccessories"] {
  const returned = new Map(checkIn.map((line) => [line.accessoryKey, line]));
  const out: { accessoryKey: string; label: string; missingQty: number; replacementCostCents: number }[] = [];
  for (const line of checkOut) {
    const back = returned.get(line.accessoryKey);
    const missingQty = Math.max(0, line.present - (back?.present ?? 0));
    if (missingQty === 0) continue;
    out.push({ accessoryKey: line.accessoryKey, label: labels.get(line.accessoryKey) ?? line.accessoryKey, missingQty, replacementCostCents: back?.replacementCostCents ?? line.replacementCostCents ?? 0 });
  }
  return out;
}

/** Same input the server builds in `chargesInputOf`, from the device data. */
export function chargesInputFor(ctx: InspectionContext, draft: InspectionDraft, nowMs: number): ChargesInput {
  const c = ctx.charges;
  const labels = new Map((ctx.template?.accessories ?? []).map((def) => [def.accessoryKey, def.label[ctx.documentLocale] ?? def.accessoryKey]));
  return {
    rateCents: c.rateCents,
    rateUnit: c.rateUnit,
    plannedStart: new Date(c.plannedStart),
    plannedEnd: new Date(c.plannedEnd),
    actualStart: new Date(c.actualStart ?? c.plannedStart),
    actualEnd: new Date(nowMs),
    graceHours: ctx.settings.graceHours,
    lateFeePerDayCents: c.lateFeePerDayCents,
    includedHoursPerDay: c.includedHoursPerDay,
    extraHourRateCents: c.extraHourRateCents,
    checkOutHourMeter: ctx.checkOut?.hourMeter ?? null,
    checkInHourMeter: draft.hourMeter ?? null,
    fuelPolicy: c.fuelPolicy,
    checkOutFuelPct: ctx.checkOut?.fuelPercent ?? null,
    checkInFuelPct: draft.fuelPercent ?? null,
    tankCapacityL: ctx.tankCapacityL,
    fuelPriceCents: c.fuelPriceCents,
    newDamages: draft.damages
      .filter((damage) => !damage.isPreExisting && damage.matchStatus === "NEW")
      .map((damage) => ({ damageId: damage.id, estimatedCostCents: damage.costUnknown === true ? null : (damage.estimatedCostCents ?? null) })),
    missingAccessories: ctx.checkOut === null ? [] : missingAccessoryLines(ctx.checkOut.accessories, draft.accessories, labels),
    depositCents: c.depositCents,
  };
}

export function chargesPreview(ctx: InspectionContext, draft: InspectionDraft, nowMs: number): ChargeSummary {
  return summarizeRentalCharges(chargesInputFor(ctx, draft, nowMs));
}

// ───────── new rental (online) ─────────

/** UTC offset (ms) of `timeZone` at the instant `utcMs`. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** `YYYY-MM-DD` + hour in the organisation timezone → ISO instant (R13). `undefined` when the date is malformed. */
export function zonedIso(date: string, hour: number, timeZone: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (match === null || !Number.isInteger(hour) || hour < 0 || hour > 23) return undefined;
  const naive = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, 0, 0);
  if (Number.isNaN(naive)) return undefined;
  let utc = naive - zoneOffsetMs(naive, timeZone);
  utc = naive - zoneOffsetMs(utc, timeZone);
  return new Date(utc).toISOString();
}

export interface PickOption {
  readonly id: string;
  readonly label: string;
  readonly detail: string | null;
}

export async function listRentableAssets(db: SqlDb): Promise<PickOption[]> {
  const rows = await listMirrorRows(db, "assets", `${ACTIVE} AND isRentable = 1 ORDER BY name ASC`);
  return rows.map((row) => ({ id: String(row.id), label: String(row.name ?? row.code ?? row.id), detail: str(row.code) }));
}

export async function listCustomers(db: SqlDb): Promise<PickOption[]> {
  const rows = await listMirrorRows(db, "customers", `${ACTIVE} AND archivedAt IS NULL ORDER BY name ASC`);
  return rows.map((row) => ({ id: String(row.id), label: String(row.name ?? row.id), detail: str(row.taxIdMasked) }));
}
