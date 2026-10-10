import { AppError } from "@agrorende/contracts/errors";
import type { EntityType, FieldReportStatus, Priority, Role } from "@agrorende/contracts/enums";
import { fieldReportMachine } from "@agrorende/contracts/machines";
import type { FieldReportCreatePayload, FieldReportUpdatePayload, FieldReportWithdrawPayload } from "@agrorende/contracts/mutations";
import { opsRoom, RealtimeServerEvents, userRoom } from "@agrorende/contracts/realtime";
import type { MediaMeta } from "@agrorende/contracts/sync";
import type { Tx } from "@agrorende/contracts/seams";
import type { FieldReport, WorkOrder } from "@agrorende/db";

import { recordActivity } from "../../activity/index";
import type { Ctx } from "../../context";
import { reject } from "../../errors";
import { emit } from "../../events/index";
import { createNotification, officeRecipients } from "../../notify/index";
import { next as nextNumber } from "../../numbering/index";
import { rentalSeams, seasonSeams, workOrderSeams } from "../../seams";
import type { SyncTx } from "../../sync/types";
import { dbTx, newId, parseInput, stampCreate, stampUpdate, toDto } from "../assets/kit";
import { OPEN_STATUSES, recomputeCondition, REPAIR_STATUSES } from "../assets/service";
import { registerMedia } from "../media/service";
import {
  DismissInputSchema,
  LinkAssetInputSchema,
  MarkForRepairInputSchema,
  MonitorInputSchema,
  type DismissInput,
  type FieldReportDTO,
  type LinkAssetInput,
  type MarkForRepairInput,
  type MarkForRepairResult,
  type MonitorInput,
  type OpenWorkOrderSummary,
} from "./dto";

export const OFFICE: readonly Role[] = ["ADMIN", "MANAGER"];
/** Work-order statuses that count as "a repair job is already open" for an asset (EC-FR-15, BR-F1-3). */
export const ACTIVE_WORK_ORDER_STATUSES = [...OPEN_STATUSES, ...REPAIR_STATUSES];
/** Report states after which only history can change (EC-FR-18). */
export const LOCKED_STATUSES: readonly FieldReportStatus[] = ["MARKED_FOR_REPAIR", "DISMISSED"];

export interface CreateReportMeta {
  readonly occurredAt?: Date;
  readonly receivedAt?: Date;
  readonly clockSkewed?: boolean;
  readonly lat?: number;
  readonly lng?: number;
  readonly mutationId?: string;
  readonly deviceId?: string | null;
}

export interface CreateReportResult {
  readonly id: string;
  readonly number: string;
  readonly created: boolean;
}

export function formatReportNumber(value: number): string {
  return `FR-${String(value).padStart(6, "0")}`;
}

export function toFieldReportDto(doc: FieldReport): FieldReportDTO {
  return toDto<FieldReportDTO>({ ...doc, flags: doc.flags ?? {} } as unknown as { _id: string; syncVersion: number } & Record<string, unknown>);
}

export function isCriticalReport(report: Pick<FieldReport, "priority" | "machineOperable">): boolean {
  return report.priority === "CRITICAL" || report.machineOperable === false;
}

function flagsOf(doc: Pick<FieldReport, "flags">): Record<string, unknown> {
  return { ...((doc.flags ?? {}) as Record<string, unknown>) };
}

function syncTx(tx: Tx): SyncTx {
  return dbTx(tx) as unknown as SyncTx;
}

interface ActivityRow {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly action: string;
  readonly actorId: string;
  readonly fromStatus?: string | null;
  readonly toStatus?: string | null;
  readonly meta?: Record<string, unknown>;
  readonly occurredAt?: Date;
  readonly receivedAt?: Date;
  readonly mutationId?: string;
  readonly deviceId?: string | null;
  readonly lat?: number | null;
  readonly lng?: number | null;
}

/** Every report state change writes one ActivityEvent and publishes `activity:new` to ops (PLT-13). */
async function activity(tx: Tx, row: ActivityRow): Promise<void> {
  await recordActivity(
    syncTx(tx),
    {
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      actorId: row.actorId,
      fromStatus: row.fromStatus ?? null,
      toStatus: row.toStatus ?? null,
      meta: row.meta ?? {},
      ...(row.occurredAt === undefined ? {} : { occurredAt: row.occurredAt }),
      ...(row.receivedAt === undefined ? {} : { receivedAt: row.receivedAt }),
      ...(row.mutationId === undefined ? {} : { mutationId: row.mutationId }),
      ...(row.deviceId === undefined ? {} : { deviceId: row.deviceId }),
      ...(row.lat === undefined || row.lat === null ? {} : { lat: row.lat }),
      ...(row.lng === undefined || row.lng === null ? {} : { lng: row.lng }),
    },
    { publish: true },
  );
}

async function loadReport(tx: Tx, id: string): Promise<FieldReport> {
  const doc = await dbTx(tx).db.field_reports.findOne({ _id: id, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "FIELD_REPORT", id });
  return doc;
}

export async function findActiveWorkOrder(tx: Tx, assetId: string): Promise<WorkOrder | null> {
  return dbTx(tx).db.work_orders.findOne(
    { assetId, deletedAt: null, status: { $in: [...ACTIVE_WORK_ORDER_STATUSES] } },
    { sort: { createdAt: -1 } },
  );
}

export async function openWorkOrderSummary(tx: Tx, wo: WorkOrder): Promise<OpenWorkOrderSummary> {
  const assignee =
    wo.assigneeId === null || wo.assigneeId === undefined
      ? null
      : await dbTx(tx).db.users.findOne({ _id: wo.assigneeId }, { projection: { _id: 1, name: 1 } });
  return {
    id: wo._id,
    number: wo.number,
    title: wo.title,
    status: wo.status,
    priority: wo.priority,
    assigneeId: wo.assigneeId ?? null,
    assigneeName: assignee?.name ?? null,
    updatedAt: wo.updatedAt.toISOString(),
  };
}

export function isNotImplemented(error: unknown): boolean {
  return error instanceof AppError && error.code === "INTERNAL" && error.message === "NOT_IMPLEMENTED";
}

/** Rental holding the asset (T08 seam), falling back to T04's custody pointer while the seam is unwired. */
async function activeRental(tx: Tx, assetId: string, currentRentalId: string | null | undefined): Promise<string | null> {
  try {
    const rental = await rentalSeams.activeRentalForAsset(tx, assetId);
    return rental?.id ?? null;
  } catch (error) {
    if (isNotImplemented(error)) return currentRentalId ?? null;
    throw error;
  }
}

async function emitChanged(tx: Tx, report: Pick<FieldReport, "_id" | "status">): Promise<void> {
  const scoped = dbTx(tx);
  await emit(syncTx(tx), {
    type: RealtimeServerEvents.entityChanged,
    rooms: [opsRoom(scoped.orgId)],
    data: { entityType: "FIELD_REPORT", id: report._id, status: report.status, version: String(scoped.syncVersion) },
  });
}

async function pokeReporter(tx: Tx, report: Pick<FieldReport, "reporterId">, reason: string): Promise<void> {
  await emit(syncTx(tx), { type: RealtimeServerEvents.syncPoke, rooms: [userRoom(report.reporterId)], data: { reason } });
}

function reportLabel(report: Pick<FieldReport, "number" | "title">): string {
  return report.number === null || report.number === undefined ? report.title : `${report.number} · ${report.title}`;
}

async function notifyCritical(tx: Tx, report: FieldReport, machine: string): Promise<void> {
  const scoped = dbTx(tx);
  const recipients = await officeRecipients(syncTx(tx), scoped.orgId, OFFICE);
  const label = reportLabel(report);
  await createNotification(syncTx(tx), {
    type: "REPORT_CRITICAL",
    userIds: recipients,
    entity: { entityType: "FIELD_REPORT", entityId: report._id },
    params: { title: machine.length > 0 ? `${label} (${machine})` : label },
  });
}

async function registerReportMedia(tx: Tx, ctx: Ctx, reportId: string, media: readonly MediaMeta[]): Promise<void> {
  for (const item of media) {
    await registerMedia(syncTx(tx), ctx, { ...item, parent: { type: "FIELD_REPORT", id: reportId } }, { parentChecked: true });
  }
}

/**
 * `fieldReport.create` (ARCHITECTURE §7.3, FR-01…FR-09, BR-F1-1…3). Idempotent by id. Asset state never
 * rejects a report: an unknown or other-org asset becomes unregistered with `flags.unknownAssetId`
 * (EC-FR-04); retired, rented-out and in-repair assets are flagged (EC-FR-05, EC-FR-06). Media rows are
 * created PENDING, the report is linked to the active rental and any open work order, the asset condition is
 * recomputed and critical or not-operable reports notify the office (FR-08).
 */
export async function createReport(tx: Tx, ctx: Ctx, payload: FieldReportCreatePayload, meta: CreateReportMeta = {}): Promise<CreateReportResult> {
  const scoped = dbTx(tx);
  const db = scoped.db;
  const existing = await db.field_reports.findOne({ _id: payload.id });
  if (existing !== null) return { id: existing._id, number: existing.number ?? "", created: false };

  const flags: Record<string, unknown> = {};
  if (meta.clockSkewed === true) flags.clockSkewed = true;
  if (payload.locationAdjusted === true) flags.locationAdjusted = true;

  const asset = payload.assetId === undefined ? null : await db.assets.findOne({ _id: payload.assetId, deletedAt: null });
  if (payload.assetId !== undefined && asset === null) flags.unknownAssetId = payload.assetId;

  let rentalId: string | null = null;
  let openWo: WorkOrder | null = null;
  if (asset !== null) {
    if (asset.condition === "RETIRED") flags.assetRetired = true;
    if (asset.condition === "IN_REPAIR") flags.assetInRepair = true;
    rentalId = await activeRental(tx, asset._id, asset.currentRentalId);
    if (rentalId !== null) flags.assetRentedOut = true;
    openWo = await findActiveWorkOrder(tx, asset._id);
    if (openWo !== null) flags.openWorkOrderId = openWo._id;
  }

  let siteId: string | null = payload.siteId ?? null;
  if (siteId !== null && (await db.sites.findOne({ _id: siteId, deletedAt: null }, { projection: { _id: 1 } })) === null) siteId = null;
  if (siteId === null && asset !== null) siteId = asset.currentSiteId ?? asset.homeSiteId ?? null;
  let plotId: string | null = payload.plotId ?? null;
  if (plotId !== null && (await db.plots.findOne({ _id: plotId, deletedAt: null }, { projection: { _id: 1 } })) === null) plotId = null;

  const critical = isCriticalReport(payload);
  if (critical && (rentalId !== null || asset?.condition === "IN_REPAIR" || openWo !== null)) flags.busyAsset = true;

  const seasonId = await seasonSeams.currentSeasonId(tx, scoped.orgId);
  const number = formatReportNumber(await nextNumber({ orgId: scoped.orgId }, { key: "FR" }));
  const now = new Date();
  const receivedAt = meta.receivedAt ?? now;
  const occurredAt = meta.occurredAt ?? receivedAt;
  const lat = payload.lat ?? meta.lat ?? null;
  const lng = payload.lng ?? meta.lng ?? null;

  const doc: FieldReport = {
    _id: payload.id,
    organizationId: scoped.orgId,
    ...stampCreate(scoped, now),
    deletedAt: null,
    number,
    reporterId: ctx.userId,
    assetId: asset?._id ?? null,
    unregisteredAssetDesc: asset === null ? (payload.unregisteredAssetDesc ?? null) : null,
    siteId,
    plotId,
    seasonId,
    rentalId,
    damageId: null,
    category: payload.category,
    priority: payload.priority,
    machineOperable: payload.machineOperable,
    suggestedAction: payload.suggestedAction,
    title: payload.title,
    description: payload.description ?? null,
    status: "SUBMITTED",
    statusReason: null,
    lat,
    lng,
    accuracyM: payload.accuracyM ?? null,
    occurredAt,
    receivedAt,
    reviewedById: null,
    reviewedAt: null,
    workOrderId: null,
    flags,
  };
  await db.field_reports.insertOne(doc);
  await registerReportMedia(tx, ctx, payload.id, payload.media);

  await activity(tx, {
    entityType: "FIELD_REPORT",
    entityId: payload.id,
    action: "fieldReport.created",
    actorId: ctx.userId,
    toStatus: "SUBMITTED",
    meta: { number, assetId: doc.assetId ?? null, priority: payload.priority, category: payload.category, mediaCount: payload.media.length },
    occurredAt,
    receivedAt,
    lat,
    lng,
    ...(meta.mutationId === undefined ? {} : { mutationId: meta.mutationId }),
    ...(meta.deviceId === undefined ? {} : { deviceId: meta.deviceId }),
  });
  if (openWo !== null) {
    await activity(tx, {
      entityType: "WORK_ORDER",
      entityId: openWo._id,
      action: "workOrder.reportAttached",
      actorId: ctx.userId,
      meta: { fieldReportId: payload.id, number },
    });
  }
  if (asset !== null) await recomputeCondition(tx, asset._id, ctx.userId);
  if (critical) await notifyCritical(tx, doc, asset === null ? (doc.unregisteredAssetDesc ?? "") : `${asset.code} ${asset.name}`);
  await emitChanged(tx, doc);
  return { id: payload.id, number, created: true };
}

const DAMAGE_PRIORITY: Readonly<Record<string, Priority>> = { MINOR: "LOW", MODERATE: "MEDIUM", SEVERE: "HIGH" };

/**
 * Seam `fieldReports.createFromDamage` (RN-09, DELIVERY-PLAN §4): a new damage recorded at rental check-in
 * becomes a field report linked to the rental and to the damage. Idempotent per damage.
 */
export async function createFromDamage(tx: Tx, ctx: Ctx, d: { damageId: string; rentalId: string; assetId: string }): Promise<{ id: string; number: string }> {
  const scoped = dbTx(tx);
  const db = scoped.db;
  const existing = await db.field_reports.findOne({ damageId: d.damageId, deletedAt: null });
  if (existing !== null) return { id: existing._id, number: existing.number ?? "" };
  const damage = await db.damages.findOne({ _id: d.damageId, deletedAt: null });
  if (damage === null) return reject("NOT_FOUND", { entityType: "DAMAGE", id: d.damageId });
  const asset = await db.assets.findOne({ _id: d.assetId, deletedAt: null });
  const rental = await db.rentals.findOne({ _id: d.rentalId }, { projection: { _id: 1, number: 1 } });
  const severe = damage.severity === "SEVERE";
  const number = formatReportNumber(await nextNumber({ orgId: scoped.orgId }, { key: "FR" }));
  const now = new Date();
  const id = newId(now.getTime());
  const doc: FieldReport = {
    _id: id,
    organizationId: scoped.orgId,
    ...stampCreate(scoped, now),
    deletedAt: null,
    number,
    reporterId: damage.reportedById ?? ctx.userId,
    assetId: asset?._id ?? null,
    unregisteredAssetDesc: asset === null ? damage.zone : null,
    siteId: asset?.currentSiteId ?? asset?.homeSiteId ?? null,
    plotId: null,
    seasonId: await seasonSeams.currentSeasonId(tx, scoped.orgId),
    rentalId: d.rentalId,
    damageId: d.damageId,
    category: "STRUCTURE",
    priority: DAMAGE_PRIORITY[damage.severity] ?? "MEDIUM",
    machineOperable: !severe,
    suggestedAction: severe ? "REPAIR_NOW" : "REPAIR_SOON",
    title: rental === null ? damage.zone : `${rental.number} · ${damage.zone}`,
    description: damage.description ?? null,
    status: "SUBMITTED",
    statusReason: null,
    lat: null,
    lng: null,
    accuracyM: null,
    occurredAt: damage.createdAt,
    receivedAt: now,
    reviewedById: null,
    reviewedAt: null,
    workOrderId: null,
    flags: { fromDamage: true },
  };
  await db.field_reports.insertOne(doc);
  await activity(tx, {
    entityType: "FIELD_REPORT",
    entityId: id,
    action: "fieldReport.createdFromDamage",
    actorId: ctx.userId,
    toStatus: "SUBMITTED",
    meta: { number, damageId: d.damageId, rentalId: d.rentalId },
  });
  if (asset !== null) await recomputeCondition(tx, asset._id, ctx.userId);
  await emitChanged(tx, doc);
  return { id, number };
}

function guard(report: FieldReport, action: fieldReportMachine.FieldReportAction, ctx: Ctx, extra: { note?: string; reason?: string } = {}): FieldReportStatus {
  const result = fieldReportMachine.canTransition(report.status, action, { actorRole: ctx.role, isReporter: report.reporterId === ctx.userId, ...extra });
  if (result.ok) return result.to;
  if (result.code === "INVALID_TRANSITION" && LOCKED_STATUSES.includes(report.status)) {
    return reject("REPORT_LOCKED", { entityType: "FIELD_REPORT", id: report._id, status: report.status });
  }
  return reject(result.code, { entityType: "FIELD_REPORT", id: report._id, status: report.status, action });
}

async function transition(
  tx: Tx,
  ctx: Ctx,
  report: FieldReport,
  to: FieldReportStatus,
  action: string,
  set: Partial<FieldReport>,
  meta: Record<string, unknown> = {},
): Promise<FieldReport> {
  const scoped = dbTx(tx);
  const now = new Date();
  const patch = { ...set, status: to, ...stampUpdate(scoped, now) };
  await scoped.db.field_reports.updateOne({ _id: report._id }, { $set: patch });
  const updated = { ...report, ...patch } as FieldReport;
  await activity(tx, { entityType: "FIELD_REPORT", entityId: report._id, action, actorId: ctx.userId, fromStatus: report.status, toStatus: to, meta, occurredAt: now });
  await emitChanged(tx, updated);
  return updated;
}

/** `POST /field-reports/:id/start-review` — SUBMITTED → IN_REVIEW (office). */
export async function startReview(tx: Tx, ctx: Ctx, id: string): Promise<FieldReportDTO> {
  const report = await loadReport(tx, id);
  const to = guard(report, "startReview", ctx);
  const updated = await transition(tx, ctx, report, to, "fieldReport.reviewStarted", { reviewedById: ctx.userId, reviewedAt: new Date() });
  return toFieldReportDto(updated);
}

/**
 * `POST /field-reports/:id/mark-for-repair` (FR-10, FR-13, FR-21, BR-F1-3). Creates the WO through the T07
 * seam. When the asset already has an open job it rejects with `ASSET_REPAIR_ALREADY_OPEN` (details carry
 * the open WO) unless the body says `existing: "attach"` or `existing: "createAnyway"` with a reason (EC-FR-15).
 */
export async function markForRepair(tx: Tx, ctx: Ctx, id: string, raw: MarkForRepairInput = {}): Promise<MarkForRepairResult> {
  const input = parseInput(MarkForRepairInputSchema, raw);
  const report = await loadReport(tx, id);
  const to = guard(report, "markForRepair", ctx);
  const open = report.assetId === null || report.assetId === undefined ? null : await findActiveWorkOrder(tx, report.assetId);
  if (open !== null && input.existing === undefined) {
    return reject("ASSET_REPAIR_ALREADY_OPEN", { workOrder: await openWorkOrderSummary(tx, open), fieldReportId: id });
  }

  let workOrderId: string;
  let workOrderNumber: string;
  const attached = open !== null && input.existing === "attach";
  if (open !== null && attached) {
    workOrderId = open._id;
    workOrderNumber = open.number;
    await activity(tx, {
      entityType: "WORK_ORDER",
      entityId: open._id,
      action: "workOrder.reportAttached",
      actorId: ctx.userId,
      meta: { fieldReportId: id, number: report.number ?? null },
    });
  } else {
    const description = input.description ?? report.description ?? undefined;
    const created = await workOrderSeams.createFromSource(tx, ctx, {
      source: "FIELD_REPORT",
      type: "CORRECTIVE",
      fieldReportId: id,
      damageIds: report.damageId === null || report.damageId === undefined ? [] : [report.damageId],
      priority: input.priority ?? report.priority,
      title: input.title ?? report.title,
      ...(description === undefined ? {} : { description }),
      ...(report.assetId === null || report.assetId === undefined ? {} : { assetId: report.assetId }),
      ...(report.siteId === null || report.siteId === undefined ? {} : { siteId: report.siteId }),
      ...(report.plotId === null || report.plotId === undefined ? {} : { plotId: report.plotId }),
      ...(input.assigneeId === undefined ? {} : { assigneeId: input.assigneeId }),
      ...(input.scheduledFor === undefined ? {} : { scheduledFor: input.scheduledFor }),
      ...(input.dueAt === undefined ? {} : { dueAt: new Date(input.dueAt).toISOString() }),
      ...(input.checklistTemplateId === undefined ? {} : { checklistTemplateId: input.checklistTemplateId }),
      ...(report.lat === null || report.lat === undefined || report.lng === null || report.lng === undefined
        ? {}
        : { destination: { lat: report.lat, lng: report.lng } }),
    });
    workOrderId = created.id;
    workOrderNumber = created.number;
  }

  const flags = flagsOf(report);
  if (attached) flags.attachedToExistingWorkOrder = true;
  if (open !== null && input.existing === "createAnyway") flags.createAnywayReason = input.reason;
  const updated = await transition(
    tx,
    ctx,
    report,
    to,
    "fieldReport.markedForRepair",
    { workOrderId, reviewedById: ctx.userId, reviewedAt: new Date(), flags, statusReason: open !== null && input.existing === "createAnyway" ? (input.reason ?? null) : null },
    { workOrderId, workOrderNumber, attached },
  );
  await createNotification(syncTx(tx), {
    type: "REPORT_MARKED_FOR_REPAIR",
    userIds: [report.reporterId],
    entity: { entityType: "FIELD_REPORT", entityId: id },
    params: { title: reportLabel(updated) },
  });
  await pokeReporter(tx, report, "fieldReport.markedForRepair");
  if (report.assetId !== null && report.assetId !== undefined) await recomputeCondition(tx, report.assetId, ctx.userId);
  return { workOrderId, workOrderNumber, attached };
}

/** `POST /field-reports/:id/monitor` — note required (§6.1). */
export async function monitor(tx: Tx, ctx: Ctx, id: string, raw: MonitorInput): Promise<FieldReportDTO> {
  const input = parseInput(MonitorInputSchema, raw);
  const report = await loadReport(tx, id);
  const to = guard(report, "monitor", ctx, { note: input.note });
  const updated = await transition(tx, ctx, report, to, "fieldReport.monitoring", { statusReason: input.note, reviewedById: ctx.userId, reviewedAt: new Date() }, { note: input.note });
  if (report.assetId !== null && report.assetId !== undefined) await recomputeCondition(tx, report.assetId, ctx.userId);
  await pokeReporter(tx, report, "fieldReport.monitoring");
  return toFieldReportDto(updated);
}

/** `POST /field-reports/:id/dismiss` — reason required; optional `duplicateOf` (EC-FR-17, P1). */
export async function dismiss(tx: Tx, ctx: Ctx, id: string, raw: DismissInput): Promise<FieldReportDTO> {
  const input = parseInput(DismissInputSchema, raw);
  const report = await loadReport(tx, id);
  const to = guard(report, "dismiss", ctx, { reason: input.reason });
  const flags = flagsOf(report);
  if (input.duplicateOf !== undefined) {
    const db = dbTx(tx).db;
    const target =
      input.duplicateOf.entityType === "FIELD_REPORT"
        ? await db.field_reports.findOne({ _id: input.duplicateOf.entityId, deletedAt: null }, { projection: { _id: 1 } })
        : await db.work_orders.findOne({ _id: input.duplicateOf.entityId, deletedAt: null }, { projection: { _id: 1 } });
    if (target === null || target._id === id) {
      return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "duplicateOf.entityId", code: "NOT_FOUND" }] });
    }
    flags.duplicateOf = input.duplicateOf;
  }
  const updated = await transition(
    tx,
    ctx,
    report,
    to,
    input.duplicateOf === undefined ? "fieldReport.dismissed" : "fieldReport.mergedAsDuplicate",
    { statusReason: input.reason, reviewedById: ctx.userId, reviewedAt: new Date(), flags },
    { reason: input.reason, ...(input.duplicateOf === undefined ? {} : { duplicateOf: input.duplicateOf }) },
  );
  if (input.duplicateOf !== undefined) {
    await activity(tx, {
      entityType: input.duplicateOf.entityType,
      entityId: input.duplicateOf.entityId,
      action: "fieldReport.duplicateMerged",
      actorId: ctx.userId,
      meta: { fieldReportId: id, number: report.number ?? null },
    });
  }
  if (report.assetId !== null && report.assetId !== undefined) await recomputeCondition(tx, report.assetId, ctx.userId);
  await pokeReporter(tx, report, "fieldReport.dismissed");
  return toFieldReportDto(updated);
}

/** `fieldReport.withdraw` — reporter only, SUBMITTED only, → DISMISSED with `WITHDRAWN: <reason>`. */
export async function withdraw(tx: Tx, ctx: Ctx, payload: FieldReportWithdrawPayload): Promise<FieldReportDTO> {
  const report = await loadReport(tx, payload.id);
  if (report.reporterId !== ctx.userId) return reject("FORBIDDEN", { entityType: "FIELD_REPORT", id: payload.id });
  const statusReason = `WITHDRAWN: ${payload.reason}`;
  if (report.status === "DISMISSED" && report.statusReason === statusReason) return toFieldReportDto(report);
  if (report.status !== "SUBMITTED") return reject("REPORT_LOCKED", { entityType: "FIELD_REPORT", id: payload.id, status: report.status });
  const to = guard(report, "withdraw", ctx, { reason: payload.reason });
  const updated = await transition(tx, ctx, report, to, "fieldReport.withdrawn", { statusReason, flags: { ...flagsOf(report), withdrawn: true } }, { reason: payload.reason });
  if (report.assetId !== null && report.assetId !== undefined) await recomputeCondition(tx, report.assetId, ctx.userId);
  return toFieldReportDto(updated);
}

/** `fieldReport.update` (P1, FR-11) — reporter only while SUBMITTED; otherwise `REPORT_LOCKED` (EC-FR-18). */
export async function updateReport(tx: Tx, ctx: Ctx, payload: FieldReportUpdatePayload): Promise<FieldReportDTO> {
  const report = await loadReport(tx, payload.id);
  if (report.reporterId !== ctx.userId) return reject("FORBIDDEN", { entityType: "FIELD_REPORT", id: payload.id });
  if (report.status !== "SUBMITTED") return reject("REPORT_LOCKED", { entityType: "FIELD_REPORT", id: payload.id, status: report.status });
  const scoped = dbTx(tx);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload.patch)) if (value !== undefined) patch[key] = value;
  if (Object.keys(patch).length === 0) return toFieldReportDto(report);
  const now = new Date();
  const stamp = stampUpdate(scoped, now);
  await scoped.db.field_reports.updateOne({ _id: report._id }, { $set: { ...patch, ...stamp } });
  const updated = { ...report, ...patch, ...stamp } as FieldReport;
  await activity(tx, { entityType: "FIELD_REPORT", entityId: report._id, action: "fieldReport.updated", actorId: ctx.userId, meta: { fields: Object.keys(patch) }, occurredAt: now });
  if (report.assetId !== null && report.assetId !== undefined) await recomputeCondition(tx, report.assetId, ctx.userId);
  if (!isCriticalReport(report) && isCriticalReport(updated)) await notifyCritical(tx, updated, "");
  await emitChanged(tx, updated);
  return toFieldReportDto(updated);
}

/**
 * `POST /field-reports/:id/link-asset` (P1, FR-22) — office only. Links a report about an unregistered
 * machine to an existing asset (the web creates the asset first when "create from report" is chosen),
 * keeps the original description in the activity row and recomputes the asset's condition.
 */
export async function linkAsset(tx: Tx, ctx: Ctx, id: string, raw: LinkAssetInput): Promise<FieldReportDTO> {
  if (!OFFICE.includes(ctx.role)) return reject("OFFICE_ROLE_REQUIRED");
  const input = parseInput(LinkAssetInputSchema, raw);
  const report = await loadReport(tx, id);
  if (report.assetId === input.assetId) return toFieldReportDto(report);
  if (report.assetId !== null && report.assetId !== undefined) {
    return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "assetId", code: "REPORT_ALREADY_LINKED" }] });
  }
  const scoped = dbTx(tx);
  const asset = await scoped.db.assets.findOne({ _id: input.assetId, deletedAt: null }, { projection: { _id: 1, siteId: 1 } });
  if (asset === null) return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "assetId", code: "NOT_FOUND" }] });
  const now = new Date();
  const stamp = stampUpdate(scoped, now);
  const set = { assetId: asset._id, unregisteredAssetDesc: null, ...stamp };
  await scoped.db.field_reports.updateOne({ _id: report._id }, { $set: set });
  const updated = { ...report, ...set } as FieldReport;
  await activity(tx, {
    entityType: "FIELD_REPORT",
    entityId: report._id,
    action: "fieldReport.assetLinked",
    actorId: ctx.userId,
    meta: { assetId: asset._id, unregisteredAssetDesc: report.unregisteredAssetDesc ?? null },
    occurredAt: now,
  });
  await activity(tx, { entityType: "ASSET", entityId: asset._id, action: "fieldReport.assetLinked", actorId: ctx.userId, meta: { fieldReportId: report._id, number: report.number ?? null }, occurredAt: now });
  await recomputeCondition(tx, asset._id, ctx.userId);
  await emitChanged(tx, updated);
  await pokeReporter(tx, report, "fieldReport.assetLinked");
  return toFieldReportDto(updated);
}
