import type { ChecklistItem, ChecklistResponse } from "@agrorende/contracts/checklist";
import type { AppErrorCode } from "@agrorende/contracts/errors";
import type { HoldReason, Priority, Role, SignatureStatus, WorkOrderStatus } from "@agrorende/contracts/enums";
import { workOrderMachine } from "@agrorende/contracts/machines";

import { checklistProgress } from "../../components/ChecklistRunner/logic";
import { getMirrorRow, listMirrorRows, type MirrorRow } from "../../db/mirror";
import type { SqlDb } from "../../db/sql";
import type { MessageKey } from "../../i18n/messages";
import { LocalError } from "../../lib/errors";
import { navigationUrl, resolveDestination, type NavigationApp, type NavigationDestination, type NavigationPlatform } from "../../lib/navigation";

const { canTransition } = workOrderMachine;
type WorkOrderAction = workOrderMachine.WorkOrderAction;

export type StatusTone = "success" | "warning" | "info" | "danger" | "neutral";

export const ACTIVE_STATUSES: readonly WorkOrderStatus[] = ["ASSIGNED", "ACCEPTED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"];
export const DONE_STATUSES: readonly WorkOrderStatus[] = ["COMPLETED", "VERIFIED", "CANCELLED"];
/** States in which the technician is physically working the job. */
export const IN_FIELD_STATUSES: readonly WorkOrderStatus[] = ["EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"];
export const HOLD_REASONS: readonly HoldReason[] = ["WAITING_PARTS", "WAITING_CUSTOMER", "WEATHER", "NEEDS_SPECIALIST", "OTHER"];
/** Done tab shows the last seven days. */
export const DONE_WINDOW_MS = 7 * 24 * 3_600_000;

export const STATUS_TONE: Readonly<Record<WorkOrderStatus, StatusTone>> = {
  OPEN: "neutral",
  ASSIGNED: "info",
  ACCEPTED: "info",
  EN_ROUTE: "warning",
  ON_SITE: "warning",
  IN_PROGRESS: "warning",
  ON_HOLD: "danger",
  COMPLETED: "success",
  VERIFIED: "success",
  CANCELLED: "neutral",
};

export const PRIORITY_TONE: Readonly<Record<Priority, StatusTone>> = { LOW: "neutral", MEDIUM: "info", HIGH: "warning", CRITICAL: "danger" };
const PRIORITY_RANK: Readonly<Record<Priority, number>> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export interface JobListItem {
  readonly id: string;
  readonly number: string | null;
  readonly title: string;
  readonly status: WorkOrderStatus;
  readonly priority: Priority;
  readonly dueAt: string | null;
  readonly scheduledFor: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly updatedAt: string;
  readonly assetName: string | null;
  readonly siteName: string | null;
  readonly holdReason: HoldReason | null;
  readonly pending: boolean;
}

const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

/** The technician's jobs from the local mirror (assignee only; the server scopes sync the same way). */
export async function listMyJobs(db: SqlDb, userId: string): Promise<JobListItem[]> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT w."id", w."number", w."title", w."status", w."priority", w."dueAt", w."scheduledFor", w."completedAt", w."cancelledAt", w."updatedAt", w."holdReason", w."_dirty" AS "dirty",
            a."name" AS "assetName", s."name" AS "siteName"
       FROM "work_orders" w
       LEFT JOIN "assets" a ON a."id" = w."assetId"
       LEFT JOIN "sites" s ON s."id" = w."siteId"
      WHERE w."assigneeId" = ? AND w."deletedAt" IS NULL`,
    [userId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    number: str(row.number),
    title: String(row.title ?? ""),
    status: String(row.status ?? "ASSIGNED") as WorkOrderStatus,
    priority: String(row.priority ?? "MEDIUM") as Priority,
    dueAt: str(row.dueAt),
    scheduledFor: str(row.scheduledFor),
    completedAt: str(row.completedAt),
    cancelledAt: str(row.cancelledAt),
    updatedAt: String(row.updatedAt ?? ""),
    assetName: str(row.assetName),
    siteName: str(row.siteName),
    holdReason: (str(row.holdReason) as HoldReason | null) ?? null,
    pending: row.dirty === 1,
  }));
}

export type JobBucket = "today" | "upcoming" | "done";

function endOfDay(now: number): number {
  const date = new Date(now);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

/** WO-03: Today = in the field or due/scheduled by the end of today; Upcoming = later; Done = closed in the last seven days. */
export function bucketOf(job: JobListItem, now: number): JobBucket | undefined {
  if (DONE_STATUSES.includes(job.status)) {
    const closedAt = Date.parse(job.completedAt ?? job.cancelledAt ?? job.updatedAt);
    return Number.isNaN(closedAt) || now - closedAt <= DONE_WINDOW_MS ? "done" : undefined;
  }
  if (IN_FIELD_STATUSES.includes(job.status)) return "today";
  const when = Date.parse(job.scheduledFor ?? job.dueAt ?? "");
  if (Number.isNaN(when) || when <= endOfDay(now)) return "today";
  return "upcoming";
}

function sortKey(job: JobListItem): number {
  const when = Date.parse(job.scheduledFor ?? job.dueAt ?? "");
  return Number.isNaN(when) ? Number.MAX_SAFE_INTEGER : when;
}

export function bucketJobs(jobs: readonly JobListItem[], now: number): Readonly<Record<JobBucket, JobListItem[]>> {
  const out: Record<JobBucket, JobListItem[]> = { today: [], upcoming: [], done: [] };
  for (const job of jobs) {
    const bucket = bucketOf(job, now);
    if (bucket !== undefined) out[bucket].push(job);
  }
  const active = (a: JobListItem, b: JobListItem) => {
    const field = Number(IN_FIELD_STATUSES.includes(b.status)) - Number(IN_FIELD_STATUSES.includes(a.status));
    return field !== 0 ? field : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || sortKey(a) - sortKey(b);
  };
  out.today.sort(active);
  out.upcoming.sort((a, b) => sortKey(a) - sortKey(b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  out.done.sort((a, b) => Date.parse(b.completedAt ?? b.cancelledAt ?? b.updatedAt) - Date.parse(a.completedAt ?? a.cancelledAt ?? a.updatedAt));
  return out;
}

/** The next job for the home card: the first of Today, else the first of Upcoming. */
export function nextJob(jobs: readonly JobListItem[], now: number): JobListItem | undefined {
  const buckets = bucketJobs(jobs, now);
  return buckets.today[0] ?? buckets.upcoming[0];
}

export function isOverdue(job: Pick<JobListItem, "dueAt" | "status">, now: number): boolean {
  if (job.dueAt === null || DONE_STATUSES.includes(job.status)) return false;
  return Date.parse(job.dueAt) < now;
}

export type JobStep = WorkOrderAction | "complete";

export interface ActionPlan {
  readonly primary: JobStep | undefined;
  readonly secondary: readonly JobStep[];
  /** Why no primary action is offered (EC-WO-03, EC-WO-04, EC-WO-09). */
  readonly blocked?: "safetyHold" | "cancelled" | "reassigned" | "closed";
}

const PLAN: Readonly<Partial<Record<WorkOrderStatus, { readonly primary: JobStep; readonly secondary: readonly JobStep[] }>>> = {
  ASSIGNED: { primary: "accept", secondary: ["decline"] },
  ACCEPTED: { primary: "startRoute", secondary: ["arrive"] },
  EN_ROUTE: { primary: "arrive", secondary: ["abortRoute"] },
  ON_SITE: { primary: "startWork", secondary: [] },
  IN_PROGRESS: { primary: "complete", secondary: ["hold"] },
  ON_HOLD: { primary: "resume", secondary: ["startRoute"] },
};

export const ACTION_LABEL: Readonly<Record<JobStep, MessageKey>> = {
  assign: "jobs.actions.assign",
  reassign: "jobs.actions.reassign",
  accept: "jobs.actions.accept",
  decline: "jobs.actions.decline",
  startRoute: "jobs.actions.startRoute",
  arrive: "jobs.actions.arrive",
  abortRoute: "jobs.actions.abortRoute",
  startWork: "jobs.actions.startWork",
  hold: "jobs.actions.hold",
  resume: "jobs.actions.resume",
  complete: "jobs.actions.complete",
  verify: "jobs.actions.verify",
  reopen: "jobs.actions.reopen",
  cancel: "jobs.actions.cancel",
};

/**
 * WO-04: the one primary action (and the secondary ones) come from the shared state machine.
 * Guards that need input (decline reason, hold reason, completion) are checked later, so the
 * plan only asks whether the move is allowed for this user in this state.
 */
export function actionPlan(wo: { readonly status: WorkOrderStatus; readonly assigneeId: string | null; readonly holdReason: HoldReason | null }, userId: string | undefined, role: Role | undefined): ActionPlan {
  if (wo.status === "CANCELLED") return { primary: undefined, secondary: [], blocked: "cancelled" };
  if (DONE_STATUSES.includes(wo.status)) return { primary: undefined, secondary: [], blocked: "closed" };
  const isAssignee = userId !== undefined && wo.assigneeId === userId;
  if (!isAssignee) return { primary: undefined, secondary: [], blocked: "reassigned" };
  const plan = PLAN[wo.status];
  if (plan === undefined) return { primary: undefined, secondary: [] };
  const guard = { actorRole: role, isAssignee, currentHoldReason: wo.holdReason, reason: "x", holdReason: "OTHER" as const };
  const allowed = (step: JobStep): boolean => {
    if (step === "complete") return canTransition(wo.status, "complete", { ...guard, resolution: "x", afterPhotoCount: 1, checklistComplete: true }).ok;
    return canTransition(wo.status, step, guard).ok;
  };
  const primary = allowed(plan.primary) ? plan.primary : undefined;
  const secondary = plan.secondary.filter(allowed);
  if (primary === undefined && wo.status === "ON_HOLD" && wo.holdReason === "SAFETY") return { primary: undefined, secondary: [], blocked: "safetyHold" };
  return { primary, secondary };
}

/** WO-05 / A§13.5: destination = job pin, else site pin, else site address (EC-WO-07). */
export function jobDestination(wo: MirrorRow, site: MirrorRow | undefined): NavigationDestination {
  const label = String(wo.title ?? site?.name ?? "");
  if (typeof wo.destLat === "number" && typeof wo.destLng === "number") return { lat: wo.destLat, lng: wo.destLng, label };
  if (site !== undefined) {
    try {
      const address = [site.address, site.city, site.state].filter((part) => typeof part === "string" && part.length > 0).join(", ");
      return resolveDestination({ lat: site.lat as number | null, lng: site.lng as number | null, address, label: String(site.name ?? label) });
    } catch (_error) {
      throw new LocalError("WO_DESTINATION_MISSING");
    }
  }
  throw new LocalError("WO_DESTINATION_MISSING");
}

export function jobNavigationUrl(wo: MirrorRow, site: MirrorRow | undefined, app: NavigationApp, platform: NavigationPlatform): string {
  return navigationUrl(jobDestination(wo, site), app, platform);
}

export interface CompletionDraft {
  readonly resolution: string;
  readonly rootCause?: string;
  readonly hourMeterReading?: number;
  readonly meterReplaced?: boolean;
  readonly meterPhotoMediaId?: string;
  readonly jumpConfirmed?: boolean;
  readonly signatureStatus?: SignatureStatus;
  readonly customerSignerName?: string;
  readonly signatureReason?: string;
  readonly signatureWitnessName?: string;
  readonly signatureMediaId?: string;
}

export interface CompletionInput {
  readonly status: WorkOrderStatus;
  readonly isAssignee: boolean;
  readonly afterPhotoCount: number;
  readonly checklistItems: readonly ChecklistItem[];
  readonly checklistResponses: readonly ChecklistResponse[];
  readonly requireWoSignature: boolean;
  readonly assetHourMeter: number | null;
  /** Hours since the last accepted reading, for the jump check (EC-WO-14). */
  readonly hoursSinceReading: number;
}

export type CompletionField = "resolution" | "afterPhoto" | "checklist" | "signature" | "hourMeter";

export interface CompletionBlock {
  readonly code: AppErrorCode;
  readonly field: CompletionField;
}

const FIELD_OF: Readonly<Partial<Record<AppErrorCode, CompletionField>>> = {
  GUARD_RESOLUTION_REQUIRED: "resolution",
  GUARD_AFTER_PHOTO_REQUIRED: "afterPhoto",
  GUARD_CHECKLIST_INCOMPLETE: "checklist",
  GUARD_SIGNATURE_REQUIRED: "signature",
  WO_SAFETY_STOP_REQUIRED: "checklist",
};

/** EC-WO-14: lower readings need a photographed meter replacement; absurd jumps need a confirmation. */
export function meterCheck(draft: CompletionDraft, input: Pick<CompletionInput, "assetHourMeter" | "hoursSinceReading">): AppErrorCode | undefined {
  const reading = draft.hourMeterReading;
  if (reading === undefined || input.assetHourMeter === null) return undefined;
  if (draft.meterReplaced === true) return draft.meterPhotoMediaId === undefined ? "METER_READING_LOWER" : undefined;
  if (reading < input.assetHourMeter) return "METER_READING_LOWER";
  if (reading - input.assetHourMeter > Math.max(1, input.hoursSinceReading) * 24 && draft.jumpConfirmed !== true) return "METER_READING_JUMP";
  return undefined;
}

/** WO-10 completion guards, in the order the screen focuses them (EC-WO-10, EC-WO-11, EC-WO-12). */
export function completionBlock(draft: CompletionDraft, input: CompletionInput): CompletionBlock | undefined {
  const progress = checklistProgress(input.checklistItems, input.checklistResponses);
  if (progress.safetyFailures.length > 0) return { code: "WO_SAFETY_STOP_REQUIRED", field: "checklist" };
  const result = canTransition(input.status, "complete", {
    isAssignee: input.isAssignee,
    resolution: draft.resolution,
    afterPhotoCount: input.afterPhotoCount,
    checklistComplete: progress.complete,
    requireWoSignature: input.requireWoSignature,
    signatureStatus: draft.signatureStatus ?? null,
    signatureReason: draft.signatureReason ?? null,
  });
  if (!result.ok) {
    if (input.requireWoSignature && draft.signatureStatus === "SIGNED" && draft.signatureMediaId === undefined && result.code === "GUARD_SIGNATURE_REQUIRED") return { code: "GUARD_SIGNATURE_REQUIRED", field: "signature" };
    return { code: result.code, field: FIELD_OF[result.code] ?? "resolution" };
  }
  if (input.requireWoSignature && draft.signatureStatus === "SIGNED" && draft.signatureMediaId === undefined) return { code: "GUARD_SIGNATURE_REQUIRED", field: "signature" };
  const meter = meterCheck(draft, input);
  if (meter !== undefined) return { code: meter, field: "hourMeter" };
  return undefined;
}

export interface JobDetail {
  readonly workOrder: MirrorRow;
  readonly asset: MirrorRow | undefined;
  readonly site: MirrorRow | undefined;
  readonly customer: MirrorRow | undefined;
  readonly parts: readonly MirrorRow[];
  readonly media: readonly MirrorRow[];
  readonly requireWoSignature: boolean;
}

export async function getJobDetail(db: SqlDb, id: string): Promise<JobDetail | undefined> {
  const workOrder = await getMirrorRow(db, "workOrders", id);
  if (workOrder === undefined || (workOrder.deletedAt !== null && workOrder.deletedAt !== undefined)) return undefined;
  const asset = typeof workOrder.assetId === "string" ? await getMirrorRow(db, "assets", workOrder.assetId) : undefined;
  const site = typeof workOrder.siteId === "string" ? await getMirrorRow(db, "sites", workOrder.siteId) : undefined;
  const customer = typeof workOrder.customerId === "string" ? await getMirrorRow(db, "customers", workOrder.customerId) : undefined;
  const parts = await listMirrorRows(db, "workOrderParts", `"workOrderId" = ? AND "deletedAt" IS NULL ORDER BY "createdAt" ASC`, [id]);
  const media = await listMirrorRows(db, "media", `json_extract("parent", '$.id') = ? AND "deletedAt" IS NULL ORDER BY "capturedAt" ASC`, [id]);
  const orgs = await listMirrorRows(db, "organization");
  const settings = orgs[0]?.settings;
  const requireWoSignature = !(typeof settings === "object" && settings !== null && (settings as { requireWoSignature?: unknown }).requireWoSignature === false);
  return { workOrder, asset, site, customer, parts, media, requireWoSignature };
}

export function checklistOf(wo: MirrorRow): { readonly items: ChecklistItem[]; readonly responses: ChecklistResponse[]; readonly version: number } {
  return {
    items: Array.isArray(wo.checklistSnapshot) ? (wo.checklistSnapshot as ChecklistItem[]) : [],
    responses: Array.isArray(wo.checklistResponses) ? (wo.checklistResponses as ChecklistResponse[]) : [],
    version: typeof wo.checklistTemplateVersion === "number" ? wo.checklistTemplateVersion : 0,
  };
}

export function afterPhotoCount(media: readonly MirrorRow[]): number {
  return media.filter((row) => row.tag === "AFTER" && (row.kind === "PHOTO" || row.kind === undefined)).length;
}

/** Banner shown on the job when the office changed it under the technician (EC-WO-01, EC-WO-03, EC-WO-04, EC-WO-16, EC-WO-18). */
export function jobNotice(wo: MirrorRow, asset: MirrorRow | undefined, userId: string | undefined): AppErrorCode | undefined {
  const status = String(wo.status ?? "");
  const previous = Array.isArray(wo.previousAssigneeIds) ? (wo.previousAssigneeIds as unknown[]) : [];
  if (status === "CANCELLED") return "WO_CANCELLED";
  if (userId !== undefined && wo.assigneeId !== userId && previous.includes(userId)) return "WO_REASSIGNED";
  if (status === "VERIFIED") return "WO_ALREADY_VERIFIED";
  if (asset?.condition === "RETIRED" && !DONE_STATUSES.includes(status as WorkOrderStatus)) return "WO_ASSET_RETIRED";
  if (status === "ON_HOLD" && wo.holdReason === "SAFETY") return "WO_SAFETY_STOP_REQUIRED";
  if (status === "ON_HOLD" && wo.holdReason === "WAITING_PARTS") return "WO_WAITING_PARTS_HOLD";
  return undefined;
}

export function partsTotalCents(parts: readonly MirrorRow[]): number {
  return parts.reduce((sum, part) => sum + Math.round(Number(part.quantity ?? 0) * Number(part.unitCostCents ?? 0)), 0);
}

/** Free-text part entry (WO-09); cost is optional and typed in reais. */
export interface PartDraft {
  readonly name: string;
  readonly quantity: number | undefined;
  readonly unit: string;
  readonly unitCost: string;
}

export function parseCents(value: string): number | undefined {
  const cleaned = value.trim().replace(/\s/g, "").replace(/^R\$/, "");
  if (cleaned.length === 0) return undefined;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : Number.NaN;
}

export function validatePart(draft: PartDraft): "name" | "quantity" | "unit" | "unitCost" | true {
  if (draft.name.trim().length === 0) return "name";
  if (draft.quantity === undefined || !(draft.quantity > 0)) return "quantity";
  if (draft.unit.trim().length === 0) return "unit";
  const cents = parseCents(draft.unitCost);
  if (cents !== undefined && Number.isNaN(cents)) return "unitCost";
  return true;
}
