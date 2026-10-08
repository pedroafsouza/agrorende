import { IssueCategoryEnum, PriorityEnum, SuggestedActionEnum, type FieldReportStatus, type IssueCategory, type Priority, type SuggestedAction } from "@agrorende/contracts/enums";
import type { FieldReportCreatePayload } from "@agrorende/contracts/mutations";

import type { MediaDraft } from "../../components/MediaCapture/drafts";
import { getMirrorRow, listMirrorRows, type MirrorRow } from "../../db/mirror";
import type { SqlDb } from "../../db/sql";
import type { MessageKey } from "../../i18n/messages";

export const ISSUE_CATEGORIES: readonly IssueCategory[] = IssueCategoryEnum.options;
export const PRIORITIES: readonly Priority[] = PriorityEnum.options;
export const SUGGESTED_ACTIONS: readonly SuggestedAction[] = SuggestedActionEnum.options;

/** Videos allowed on one field report (EC-FR-06). */
export const REPORT_VIDEO_LIMIT = 5;
/** Media tags offered by the Evidence step. */
export const REPORT_MEDIA_TAGS = ["DAMAGE", "GENERAL", "PLATE", "HOUR_METER"] as const;
/** Fix accuracy above this many meters shows the weak-location banner (EC-FR-10). */
export const REPORT_WEAK_ACCURACY_M = 100;

export const STATUS_TONE: Readonly<Record<FieldReportStatus, "success" | "warning" | "info" | "danger" | "neutral">> = {
  SUBMITTED: "info",
  IN_REVIEW: "warning",
  MARKED_FOR_REPAIR: "success",
  MONITORING: "neutral",
  DISMISSED: "neutral",
};

export const PRIORITY_TONE: Readonly<Record<Priority, "success" | "warning" | "info" | "danger" | "neutral">> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

/** Wizard payload stored in the `drafts` table; `id` is the future report id. */
export interface ReportDraft {
  readonly id: string;
  readonly assetId?: string;
  readonly unregisteredAssetDesc?: string;
  readonly media: readonly MediaDraft[];
  readonly category?: IssueCategory;
  readonly priority: Priority;
  readonly machineOperable: boolean;
  readonly suggestedAction: SuggestedAction;
  readonly title?: string;
  readonly description?: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly accuracyM?: number;
}

export function newReportDraft(id: string, assetId?: string): ReportDraft {
  return { id, ...(assetId === undefined || assetId.length === 0 ? {} : { assetId }), media: [], priority: "MEDIUM", machineOperable: true, suggestedAction: "REPAIR_SOON" };
}

export type ReportValidation = true | MessageKey;

const has = (value: string | undefined): value is string => value !== undefined && value.trim().length > 0;

/** Machine step (EC-FR-02): a registered asset, or free text that identifies the machine. */
export function validateMachine(draft: Pick<ReportDraft, "assetId" | "unregisteredAssetDesc">): ReportValidation {
  if (has(draft.assetId) || has(draft.unregisteredAssetDesc)) return true;
  return "errors.REPORT_UNREGISTERED_MACHINE_INCOMPLETE.title";
}

export function countVideos(media: readonly Pick<MediaDraft, "kind">[]): number {
  return media.filter((m) => m.kind === "VIDEO").length;
}

/** Evidence step (EC-FR-05, EC-FR-06): at least one photo or video and at most five videos. */
export function validateEvidence(draft: Pick<ReportDraft, "media">): ReportValidation {
  if (!draft.media.some((m) => m.kind === "PHOTO" || m.kind === "VIDEO")) return "errors.REPORT_EVIDENCE_REQUIRED.title";
  if (countVideos(draft.media) > REPORT_VIDEO_LIMIT) return "errors.REPORT_VIDEO_LIMIT_EXCEEDED.title";
  return true;
}

/** Details step (EC-FR-09): category is the only field without a default; the title falls back to it. */
export function validateDetails(draft: Pick<ReportDraft, "category" | "priority" | "machineOperable" | "suggestedAction">): ReportValidation {
  if (draft.category === undefined || !ISSUE_CATEGORIES.includes(draft.category)) return "errors.REPORT_DETAILS_INCOMPLETE.title";
  if (!PRIORITIES.includes(draft.priority) || !SUGGESTED_ACTIONS.includes(draft.suggestedAction) || typeof draft.machineOperable !== "boolean") {
    return "errors.REPORT_DETAILS_INCOMPLETE.title";
  }
  return true;
}

export function validateReview(draft: ReportDraft): ReportValidation {
  for (const result of [validateMachine(draft), validateEvidence(draft), validateDetails(draft)]) if (result !== true) return result;
  return true;
}

export interface MediaChange {
  readonly media: readonly MediaDraft[];
  /** Captures refused by a limit; the caller discards their local files. */
  readonly rejected: readonly MediaDraft[];
  readonly error?: "REPORT_VIDEO_LIMIT_EXCEEDED";
}

/** Applies a MediaCapture change and blocks the sixth video (EC-FR-06) while keeping everything else. */
export function acceptMediaChange(previous: readonly MediaDraft[], next: readonly MediaDraft[]): MediaChange {
  if (countVideos(next) <= REPORT_VIDEO_LIMIT || countVideos(next) <= countVideos(previous)) return { media: next, rejected: [] };
  const known = new Set(previous.map((m) => m.id));
  const added = next.filter((m) => !known.has(m.id));
  const rejected = added.filter((m) => m.kind === "VIDEO");
  const rejectedIds = new Set(rejected.map((m) => m.id));
  return { media: next.filter((m) => !rejectedIds.has(m.id)), rejected, error: "REPORT_VIDEO_LIMIT_EXCEEDED" };
}

/** Builds the `fieldReport.create` payload; `fallbackTitle` is the localized category label. */
export function buildCreatePayload(draft: ReportDraft, fallbackTitle: string): FieldReportCreatePayload {
  const category = draft.category ?? "OTHER";
  const title = has(draft.title) ? draft.title.trim() : fallbackTitle;
  return {
    id: draft.id,
    ...(has(draft.assetId) ? { assetId: draft.assetId } : { unregisteredAssetDesc: (draft.unregisteredAssetDesc ?? "").trim() }),
    category,
    priority: draft.priority,
    machineOperable: draft.machineOperable,
    suggestedAction: draft.suggestedAction,
    title,
    ...(has(draft.description) ? { description: draft.description.trim() } : {}),
    ...(draft.lat === undefined || draft.lng === undefined ? {} : { lat: draft.lat, lng: draft.lng }),
    ...(draft.accuracyM === undefined ? {} : { accuracyM: draft.accuracyM }),
    media: draft.media.map(({ localUri: _localUri, thumbUri: _thumbUri, ...meta }) => ({ ...meta, parent: { type: "FIELD_REPORT", id: draft.id } })),
  };
}

/** EC-FR-10: no fix, or a fix worse than the threshold. */
export function isLocationWeak(draft: Pick<ReportDraft, "lat" | "lng" | "accuracyM">): boolean {
  return draft.lat === undefined || draft.lng === undefined || (draft.accuracyM !== undefined && draft.accuracyM > REPORT_WEAK_ACCURACY_M);
}

export type AssetAttention = "RETIRED" | "IN_REPAIR" | "OUT_OF_SERVICE" | "RENTED_OUT";

/** EC-FR-04: reasons the office will look at the asset; the report is still accepted. */
export function assetAttention(asset: MirrorRow | undefined): readonly AssetAttention[] {
  if (asset === undefined) return [];
  const reasons: AssetAttention[] = [];
  if (asset.condition === "RETIRED") reasons.push("RETIRED");
  if (asset.condition === "IN_REPAIR") reasons.push("IN_REPAIR");
  if (asset.condition === "OUT_OF_SERVICE") reasons.push("OUT_OF_SERVICE");
  if (typeof asset.currentRentalId === "string" && asset.currentRentalId.length > 0) reasons.push("RENTED_OUT");
  return reasons;
}

const OPEN_REPORT_STATUSES: readonly FieldReportStatus[] = ["SUBMITTED", "IN_REVIEW", "MONITORING"];
const CLOSED_WORK_ORDER_STATUSES = ["COMPLETED", "VERIFIED", "CANCELLED"] as const;

export interface OpenCase {
  readonly kind: "report" | "workOrder";
  readonly id: string;
  readonly number: string | null;
  readonly title: string | null;
  readonly status: string;
}

/** EC-FR-16: open reports and work orders for the same asset, for the duplicate hint. */
export async function openCasesForAsset(db: SqlDb, assetId: string, excludeReportId?: string): Promise<OpenCase[]> {
  const reports = await listMirrorRows(
    db,
    "fieldReports",
    `"assetId" = ? AND "deletedAt" IS NULL AND "status" IN (${OPEN_REPORT_STATUSES.map(() => "?").join(", ")}) AND "id" <> ? ORDER BY "createdAt" DESC`,
    [assetId, ...OPEN_REPORT_STATUSES, excludeReportId ?? ""],
  );
  const workOrders = await listMirrorRows(
    db,
    "workOrders",
    `"assetId" = ? AND "deletedAt" IS NULL AND "status" NOT IN (${CLOSED_WORK_ORDER_STATUSES.map(() => "?").join(", ")}) ORDER BY "createdAt" DESC`,
    [assetId, ...CLOSED_WORK_ORDER_STATUSES],
  );
  const toCase = (kind: OpenCase["kind"]) => (row: MirrorRow): OpenCase => ({
    kind,
    id: String(row.id),
    number: typeof row.number === "string" ? row.number : null,
    title: typeof row.title === "string" ? row.title : null,
    status: String(row.status ?? ""),
  });
  return [...workOrders.map(toCase("workOrder")), ...reports.map(toCase("report"))];
}

export interface ReportListItem {
  readonly id: string;
  readonly number: string | null;
  readonly title: string;
  readonly status: FieldReportStatus;
  readonly priority: Priority;
  readonly machineOperable: boolean;
  readonly assetName: string | null;
  readonly createdAt: string;
  readonly pending: boolean;
}

/** My reports (FR-08): the signed-in user's reports from the local mirror, newest first. */
export async function listMyReports(db: SqlDb, userId: string): Promise<ReportListItem[]> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT r."id", r."number", r."title", r."status", r."priority", r."machineOperable", r."createdAt", r."_dirty" AS "dirty", COALESCE(a."name", r."unregisteredAssetDesc") AS "assetName"
       FROM "field_reports" r LEFT JOIN "assets" a ON a."id" = r."assetId"
      WHERE r."reporterId" = ? AND r."deletedAt" IS NULL
      ORDER BY r."createdAt" DESC`,
    [userId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    number: typeof row.number === "string" ? row.number : null,
    title: String(row.title ?? ""),
    status: String(row.status ?? "SUBMITTED") as FieldReportStatus,
    priority: String(row.priority ?? "MEDIUM") as Priority,
    machineOperable: row.machineOperable === 1 || row.machineOperable === true,
    assetName: typeof row.assetName === "string" ? row.assetName : null,
    createdAt: String(row.createdAt ?? ""),
    pending: row.dirty === 1,
  }));
}

export interface ReportDetail {
  readonly report: MirrorRow;
  readonly asset: MirrorRow | undefined;
  readonly media: readonly MirrorRow[];
  readonly workOrder: MirrorRow | undefined;
}

/** Report detail with its asset, evidence and linked work order (EC-FR-14). */
export async function getReportDetail(db: SqlDb, id: string): Promise<ReportDetail | undefined> {
  const report = await getMirrorRow(db, "fieldReports", id);
  if (report === undefined || (report.deletedAt !== null && report.deletedAt !== undefined)) return undefined;
  const asset = typeof report.assetId === "string" ? await getMirrorRow(db, "assets", report.assetId) : undefined;
  const media = await listMirrorRows(db, "media", `json_extract("parent", '$.id') = ? AND "deletedAt" IS NULL ORDER BY "capturedAt" ASC`, [id]);
  const workOrder = typeof report.workOrderId === "string" ? await getMirrorRow(db, "workOrders", report.workOrderId) : undefined;
  return { report, asset, media, workOrder };
}

/** Only the reporter can withdraw, and only before the office picks the report up. */
export function canWithdraw(report: MirrorRow, userId: string | undefined): boolean {
  return userId !== undefined && report.reporterId === userId && report.status === "SUBMITTED";
}

export function reportFlags(report: MirrorRow): Readonly<Record<string, unknown>> {
  return typeof report.flags === "object" && report.flags !== null ? (report.flags as Record<string, unknown>) : {};
}
