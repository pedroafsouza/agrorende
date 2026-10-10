import { z } from "zod";
import { resolveDestination } from "@agrorende/contracts/geo";
import { CreateWorkOrderInputSchema, type WorkOrderBillingPart, type WorkOrderDTO } from "@agrorende/contracts/dto";
import type { WorkOrderStatus } from "@agrorende/contracts/enums";
import { workOrderMachine } from "@agrorende/contracts/machines";
import type { Ctx as SeamCtx, Tx } from "@agrorende/contracts/seams";
import { RealtimeServerEvents, userRoom } from "@agrorende/contracts/realtime";
import type { Asset, User } from "@agrorende/db";

import { normalizeCtx, type Ctx } from "../../context";
import { reject } from "../../errors";
import { emit } from "../../events/index";
import { createNotification } from "../../notify/index";
import { next as nextNumber } from "../../numbering/index";
import { touchDependents } from "../../sync/touch";
import { assertVersion, dbTx, newId, parseInput, stampCreate, stampUpdate } from "../assets/kit";
import { recomputeCondition } from "../assets/service";
import { defaultTemplateId, snapshotPublished } from "../checklists/service";
import { currentSeasonId } from "../seasons/service";
import {
  ACTIVE_STATUSES,
  asSyncTx,
  assigneeProblem,
  emitWorkOrderChanged,
  formatWoNumber,
  isUuid,
  loadWorkOrder,
  recordWoActivity,
  redactForRole,
  requireOffice,
  sameTenant,
  toWorkOrderDto,
  workOrderSettings,
  type WorkOrderDoc,
} from "./common";
import { dueAtFor } from "./sla";

export { toWorkOrderDto };
export { ExternalCostInputSchema, setExternalCost, type ExternalCostInput } from "./external";

// ───────── Inputs of the office REST actions ─────────

export const AssignInputSchema = z.object({
  assigneeId: z.string().uuid(),
  /** EC-WO-19: the office confirmed the assignment to an off-duty person. */
  confirmOffDuty: z.boolean().optional(),
});
export type AssignInput = z.infer<typeof AssignInputSchema>;

export const ReassignInputSchema = AssignInputSchema.extend({ reason: z.string().trim().min(1) });
export type ReassignInput = z.infer<typeof ReassignInputSchema>;

export const VerifyInputSchema = z.object({ note: z.string().optional() });
export const ReasonInputSchema = z.object({ reason: z.string().trim().min(1) });

export const WorkOrderPatchSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    scheduledFor: z.string().date().nullable().optional(),
    destination: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), note: z.string().optional() }).nullable().optional(),
    checklistTemplateId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type WorkOrderPatch = z.infer<typeof WorkOrderPatchSchema>;

export interface CreateOptions {
  /**
   * EC-FR-15 is decided by the caller (T06 `markForRepair` checks for an open job and asks the office first), so the
   * seam only rejects a second open repair job when `rejectDuplicate` is set. `duplicateReason` is recorded on the
   * activity event when the office chose "create anyway".
   */
  readonly rejectDuplicate?: boolean;
  readonly duplicateReason?: string;
  /** EC-WO-19: enforce the off-duty dialog for an assignee chosen at creation. */
  readonly enforceDuty?: boolean;
  readonly confirmOffDuty?: boolean;
}

// ───────── Helpers ─────────

async function loadAsset(tx: Tx, assetId: string): Promise<Asset> {
  const asset = await dbTx(tx).db.assets.findOne({ _id: assetId, deletedAt: null });
  if (asset === null) return reject("NOT_FOUND", { entityType: "ASSET", id: assetId });
  return asset as Asset;
}

async function loadUser(tx: Tx, userId: string): Promise<User | null> {
  return (await dbTx(tx).db.users.findOne({ _id: userId })) as User | null;
}

interface AssigneeCheck {
  readonly user: User;
  readonly offDutyOverride: boolean;
}

/** EC-OPS-22 and EC-WO-19: any active joined user may be assigned; off-duty needs an explicit confirmation. */
async function checkAssignee(tx: Tx, assigneeId: string, options: { enforceDuty: boolean; confirmOffDuty: boolean }): Promise<AssigneeCheck> {
  const user = await loadUser(tx, assigneeId);
  const problem = assigneeProblem(user);
  if (user === null || problem === "NOT_FOUND" || problem === "UNAVAILABLE") {
    return reject("ASSIGNEE_UNAVAILABLE", { assigneeId, reason: problem === "NOT_FOUND" ? "notFound" : "inactiveOrNotJoined" });
  }
  if (problem === "OFF_DUTY" && options.enforceDuty && !options.confirmOffDuty) {
    return reject("WO_ASSIGNEE_OFF_DUTY", { assigneeId, name: user.name });
  }
  return { user, offDutyOverride: problem === "OFF_DUTY" };
}

/** EC-WO-16: no new dispatch on a retired asset; the existing job data is kept untouched. */
export async function assertAssetNotRetired(tx: Tx, assetId: string | null | undefined): Promise<Asset | null> {
  if (assetId === null || assetId === undefined) return null;
  const asset = await loadAsset(tx, assetId);
  if (asset.condition === "RETIRED") reject("WO_ASSET_RETIRED", { assetId, code: asset.code });
  return asset;
}

export function notifyTitle(wo: Pick<WorkOrderDoc, "number" | "title">): string {
  return `${wo.number} · ${wo.title}`;
}

export async function pokeUser(tx: Tx, userId: string, reason: string): Promise<void> {
  await emit(asSyncTx(tx), { type: RealtimeServerEvents.syncPoke, rooms: [userRoom(userId)], data: { reason } });
}

/** Open repair work order of an asset, used by the FR-13 duplicate guard (EC-FR-15). */
export async function findOpenForAsset(tx: Tx, assetId: string): Promise<WorkOrderDoc | null> {
  return (await dbTx(tx).db.work_orders.findOne(
    { assetId, deletedAt: null, status: { $in: [...ACTIVE_STATUSES] }, type: { $ne: "PREVENTIVE" } },
    { sort: { createdAt: 1 } },
  )) as WorkOrderDoc | null;
}

function assertMachine(from: WorkOrderStatus, action: workOrderMachine.WorkOrderAction, guard: workOrderMachine.WorkOrderGuardInput): WorkOrderStatus {
  const result = workOrderMachine.canTransition(from, action, guard);
  if (!result.ok) return reject(result.code, { from, action });
  return result.to;
}

// ───────── Seams (DELIVERY-PLAN §4) ─────────

/**
 * Seam `workOrders.createFromSource`. Creates an OPEN work order (ASSIGNED when `assigneeId`
 * is given) from a field report, rental damages, a maintenance plan or a manual office entry.
 * MAINTENANCE may be created by the system (`createdById: null`); every other source needs an office role.
 */
export async function createFromSource(tx: Tx, seamCtx: SeamCtx, raw: z.input<typeof CreateWorkOrderInputSchema>, options: CreateOptions = {}): Promise<{ id: string; number: string }> {
  const ctx = normalizeCtx(seamCtx);
  const scoped = dbTx(tx);
  sameTenant(scoped, ctx);
  const input = parseInput(CreateWorkOrderInputSchema, raw);
  const actor = isUuid(ctx.userId) ? await loadUser(tx, ctx.userId) : null;
  if (input.source !== "MAINTENANCE") requireOffice(ctx);

  let assetId = input.assetId ?? null;
  let siteId = input.siteId ?? null;
  let plotId = input.plotId ?? null;
  let customerId = input.customerId ?? null;
  let rentalId: string | null = null;
  let fieldReportId: string | null = null;
  let maintenancePlanId: string | null = null;
  let report: { lat: number | null; lng: number | null } | null = null;

  if (input.source === "FIELD_REPORT") {
    const source = await scoped.db.field_reports.findOne({ _id: input.fieldReportId, deletedAt: null });
    if (source === null) return reject("NOT_FOUND", { entityType: "FIELD_REPORT", id: input.fieldReportId });
    fieldReportId = source._id;
    assetId ??= source.assetId ?? null;
    siteId ??= source.siteId ?? null;
    plotId ??= source.plotId ?? null;
    rentalId = source.rentalId ?? null;
    report = { lat: source.lat ?? null, lng: source.lng ?? null };
  } else if (input.source === "DAMAGE") {
    const rental = await scoped.db.rentals.findOne({ _id: input.rentalId, deletedAt: null });
    if (rental === null) return reject("NOT_FOUND", { entityType: "RENTAL", id: input.rentalId });
    rentalId = rental._id;
    assetId ??= rental.assetId;
    customerId ??= rental.customerId ?? null;
    const damages = await scoped.db.damages.find({ _id: { $in: input.damageIds }, deletedAt: null }, { projection: { _id: 1 } }).toArray();
    if (damages.length !== new Set(input.damageIds).size) return reject("NOT_FOUND", { entityType: "DAMAGE", ids: input.damageIds });
  } else if (input.source === "MAINTENANCE") {
    const plan = await scoped.db.maintenance_plans.findOne({ _id: input.maintenancePlanId, deletedAt: null });
    if (plan === null) return reject("NOT_FOUND", { entityType: "MAINTENANCE_PLAN", id: input.maintenancePlanId });
    maintenancePlanId = plan._id;
  }

  const asset = await assertAssetNotRetired(tx, assetId);
  if (asset !== null) siteId ??= asset.currentSiteId ?? asset.homeSiteId ?? null;

  if (input.source !== "MAINTENANCE" && assetId !== null && options.rejectDuplicate === true) {
    const open = await findOpenForAsset(tx, assetId);
    if (open !== null) {
      const assignee = open.assigneeId === null || open.assigneeId === undefined ? null : await scoped.db.users.findOne({ _id: open.assigneeId }, { projection: { name: 1 } });
      reject("ASSET_REPAIR_ALREADY_OPEN", {
        workOrder: {
          id: open._id,
          number: open.number,
          title: open.title,
          status: open.status,
          priority: open.priority,
          assigneeId: open.assigneeId ?? null,
          assigneeName: assignee?.name ?? null,
          updatedAt: open.updatedAt.toISOString(),
        },
      });
    }
  }

  const site = siteId === null ? null : await scoped.db.sites.findOne({ _id: siteId, deletedAt: null });
  if (siteId !== null && site === null) return reject("NOT_FOUND", { entityType: "SITE", id: siteId });

  const assigneeCheck =
    input.assigneeId === undefined
      ? null
      : await checkAssignee(tx, input.assigneeId, { enforceDuty: options.enforceDuty === true, confirmOffDuty: options.confirmOffDuty === true });

  const settings = await workOrderSettings(ctx.orgId);
  const now = new Date();
  const dueAt =
    input.dueAt === undefined
      ? await dueAtFor(tx, ctx.orgId, asset?.category ?? null, now, input.priority, settings.sla, settings.timeZone)
      : new Date(input.dueAt);

  let checklistTemplateId = input.checklistTemplateId ?? null;
  if (checklistTemplateId === null && asset !== null) {
    checklistTemplateId = await defaultTemplateId(tx, ctx.orgId, "WORK_ORDER", asset.category);
  }
  const snapshot = checklistTemplateId === null ? null : await snapshotPublished(tx, checklistTemplateId);

  const destination = input.destination ?? null;
  const resolved =
    destination === null
      ? resolveDestination({ asset: asset === null ? null : { lat: asset.lastLat ?? null, lng: asset.lastLng ?? null }, site, fieldReport: report })
      : null;
  const destLat = destination?.lat ?? (resolved?.kind === "point" ? resolved.lat : null);
  const destLng = destination?.lng ?? (resolved?.kind === "point" ? resolved.lng : null);
  const locationNote = destination?.note ?? (resolved?.kind === "query" ? resolved.query : null);

  const id = newId();
  const number = formatWoNumber(await nextNumber(ctx, { key: "WO" }));
  const seasonId = await currentSeasonId(tx, ctx.orgId);
  const status: WorkOrderStatus = assigneeCheck === null ? "OPEN" : "ASSIGNED";
  const createdById = actor === null ? null : actor._id;

  const doc: WorkOrderDoc = {
    _id: id,
    organizationId: ctx.orgId,
    ...stampCreate(scoped, now),
    deletedAt: null,
    number,
    type: input.type,
    status,
    priority: input.priority,
    title: input.title,
    description: input.description ?? null,
    scheduledFor: input.scheduledFor ?? null,
    assetId,
    siteId,
    plotId,
    customerId,
    seasonId,
    fieldReportId,
    rentalId,
    maintenancePlanId,
    damageIds: [...new Set(input.damageIds)],
    assigneeId: assigneeCheck?.user._id ?? null,
    previousAssigneeIds: [],
    createdById,
    dueAt,
    slaAtRiskNotifiedAt: null,
    slaBreachedAt: null,
    destLat,
    destLng,
    locationNote,
    holdReason: null,
    holdNote: null,
    checklistTemplateId,
    checklistTemplateVersion: snapshot?.templateVersion ?? null,
    checklistSnapshot: snapshot === null ? null : [...snapshot.items],
    checklistResponses: [],
    resolution: null,
    documentLocale: "pt-BR",
    rootCause: null,
    hourMeterReading: null,
    customerSignerName: null,
    signatureStatus: null,
    signatureReason: null,
    signatureWitnessName: null,
    signatureMediaId: null,
    clockOffsetMs: null,
    assignedAt: assigneeCheck === null ? null : now,
    acceptedAt: null,
    enRouteAt: null,
    arrivedAt: null,
    startedAt: null,
    completedAt: null,
    verifiedAt: null,
    verifiedById: null,
    cancelledAt: null,
    cancelReason: null,
    travelMinutes: null,
    workMinutes: null,
    laborCostCents: null,
    partsCostCents: null,
    externalCostCents: null,
    externalCostNote: null,
    hasLateEvidence: false,
  };
  await scoped.db.work_orders.insertOne(doc);

  await recordWoActivity(tx, {
    workOrderId: id,
    action: "workOrder.create",
    actorId: createdById,
    fromStatus: null,
    toStatus: "OPEN",
    occurredAt: now,
    meta: {
      source: input.source,
      number,
      ...(fieldReportId === null ? {} : { fieldReportId }),
      ...(options.duplicateReason === undefined ? {} : { duplicateReason: options.duplicateReason }),
      ...(destLat === null && locationNote === null ? { destinationMissing: true } : {}),
    },
  });

  if (fieldReportId !== null) {
    // Links the report to its job when the caller has not done it yet; T06 owns the report status.
    await scoped.db.field_reports.updateOne({ _id: fieldReportId, workOrderId: null }, { $set: { workOrderId: id, ...stampUpdate(scoped, now) } });
  }

  if (assigneeCheck !== null) await afterAssign(tx, doc, assigneeCheck, createdById, now, "OPEN", null);
  if (assetId !== null) await recomputeCondition(tx, assetId, createdById);
  await emitWorkOrderChanged(tx, id, status);
  return { id, number };
}

async function afterAssign(
  tx: Tx,
  wo: WorkOrderDoc,
  check: AssigneeCheck,
  actorId: string | null,
  now: Date,
  fromStatus: WorkOrderStatus,
  previousAssigneeId: string | null,
): Promise<void> {
  await recordWoActivity(tx, {
    workOrderId: wo._id,
    action: previousAssigneeId === null ? "workOrder.assign" : "workOrder.reassign",
    actorId,
    fromStatus,
    toStatus: "ASSIGNED",
    occurredAt: now,
    meta: {
      assigneeId: check.user._id,
      ...(previousAssigneeId === null ? {} : { previousAssigneeId }),
      ...(check.offDutyOverride ? { offDutyOverride: true } : {}),
    },
  });
  await touchDependents(asSyncTx(tx), { entityType: "WORK_ORDER", entityId: wo._id });
  await createNotification(asSyncTx(tx), {
    type: "WO_ASSIGNED",
    userIds: [check.user._id],
    entity: { entityType: "WORK_ORDER", entityId: wo._id },
    params: { title: notifyTitle(wo) },
  });
  await pokeUser(tx, check.user._id, "workOrder.assigned");
  if (previousAssigneeId !== null && previousAssigneeId !== check.user._id) {
    await createNotification(asSyncTx(tx), {
      type: "WO_REASSIGNED_AWAY",
      userIds: [previousAssigneeId],
      entity: { entityType: "WORK_ORDER", entityId: wo._id },
      params: { title: notifyTitle(wo) },
    });
    await pokeUser(tx, previousAssigneeId, "workOrder.reassignedAway");
  }
}

/** Seam `workOrders.openCountByAssignee`: work orders not yet completed or cancelled, per assignee. */
export async function openCountByAssignee(tx: Tx, orgId: string): Promise<Map<string, number>> {
  const scoped = dbTx(tx);
  if (scoped.orgId !== orgId) reject("FORBIDDEN", { orgId });
  const rows = await scoped.db.work_orders
    .find({ deletedAt: null, status: { $in: [...ACTIVE_STATUSES] }, assigneeId: { $ne: null } }, { projection: { assigneeId: 1 } })
    .toArray();
  const counts = new Map<string, number>();
  for (const row of rows) {
    const assigneeId = row.assigneeId ?? null;
    if (assigneeId !== null) counts.set(assigneeId, (counts.get(assigneeId) ?? 0) + 1);
  }
  return counts;
}

export interface MaintenanceStatusEntry {
  hasOpen: boolean;
  lastCompleted: { at: Date; hourMeter: number | null } | null;
}

/** Seam `workOrders.maintenanceStatus`: open preventive job and last completion per asset of a plan. */
export async function maintenanceStatus(tx: Tx, planId: string, assetIds: string[]): Promise<Map<string, MaintenanceStatusEntry>> {
  const scoped = dbTx(tx);
  const result = new Map<string, MaintenanceStatusEntry>();
  for (const assetId of assetIds) result.set(assetId, { hasOpen: false, lastCompleted: null });
  if (assetIds.length === 0) return result;
  const rows = await scoped.db.work_orders
    .find(
      { deletedAt: null, maintenancePlanId: planId, assetId: { $in: assetIds }, status: { $ne: "CANCELLED" } },
      { projection: { assetId: 1, status: 1, completedAt: 1, hourMeterReading: 1 } },
    )
    .toArray();
  for (const row of rows) {
    const assetId = row.assetId ?? null;
    const entry = assetId === null ? undefined : result.get(assetId);
    if (assetId === null || entry === undefined) continue;
    if (ACTIVE_STATUSES.includes(row.status)) {
      entry.hasOpen = true;
      continue;
    }
    const at = row.completedAt ?? null;
    if (at !== null && (entry.lastCompleted === null || at.getTime() > entry.lastCompleted.at.getTime())) {
      entry.lastCompleted = { at, hourMeter: row.hourMeterReading ?? null };
    }
  }
  return result;
}

export interface BillingSnapshot {
  id: string;
  number: string;
  status: WorkOrderStatus;
  customerId: string | null;
  workMinutes: number | null;
  laborCostCents: number | null;
  parts: WorkOrderBillingPart[];
  externalCostCents: number | null;
  externalCostNote: string | null;
}

/** Seam `workOrders.billingSnapshot` (ERP-03): the billable facts of a job. */
export async function billingSnapshot(tx: Tx, workOrderId: string): Promise<BillingSnapshot> {
  const wo = await loadWorkOrder(tx, workOrderId);
  const parts = await dbTx(tx).db.work_order_parts.find({ workOrderId, deletedAt: null }, { sort: { createdAt: 1, _id: 1 } }).toArray();
  return {
    id: wo._id,
    number: wo.number,
    status: wo.status,
    customerId: wo.customerId ?? null,
    workMinutes: wo.workMinutes ?? null,
    laborCostCents: wo.laborCostCents ?? null,
    parts: parts.map((part) => ({ name: part.name, quantity: part.quantity, unit: part.unit, unitCostCents: part.unitCostCents ?? null })),
    externalCostCents: wo.externalCostCents ?? null,
    externalCostNote: wo.externalCostNote ?? null,
  };
}

// ───────── Office actions (REST, ADMIN/MANAGER) ─────────

export async function getForRole(tx: Tx, ctx: Ctx, id: string): Promise<WorkOrderDTO> {
  const wo = await loadWorkOrder(tx, id);
  const settings = await workOrderSettings(ctx.orgId);
  return redactForRole(toWorkOrderDto(wo), ctx.role, settings);
}

/** `POST /work-orders`: creation by the office. Legacy `instructions` maps to `description`; `source` defaults to MANUAL. */
export async function createManual(tx: Tx, ctx: Ctx, raw: unknown, options: CreateOptions = {}): Promise<WorkOrderDTO> {
  requireOffice(ctx);
  const body: Record<string, unknown> = typeof raw === "object" && raw !== null ? { ...(raw as Record<string, unknown>) } : {};
  if (body.description === undefined && typeof body.instructions === "string") body.description = body.instructions;
  delete body.instructions;
  const confirmOffDuty = body.confirmOffDuty === true;
  delete body.confirmOffDuty;
  body.source ??= "MANUAL";
  const input = parseInput(CreateWorkOrderInputSchema, body);
  const created = await createFromSource(tx, ctx, input, { enforceDuty: true, confirmOffDuty, ...options });
  return getForRole(tx, ctx, created.id);
}

export async function assign(tx: Tx, ctx: Ctx, id: string, raw: unknown): Promise<WorkOrderDTO> {
  const scoped = dbTx(tx);
  sameTenant(scoped, ctx);
  requireOffice(ctx);
  const input = parseInput(AssignInputSchema, raw);
  const wo = await loadWorkOrder(tx, id);
  if (wo.status === "CANCELLED") reject("WO_CANCELLED", { id });
  const check = await checkAssignee(tx, input.assigneeId, { enforceDuty: true, confirmOffDuty: input.confirmOffDuty === true });
  assertMachine(wo.status, "assign", { actorRole: ctx.role, assigneeActiveAndJoined: true });
  await assertAssetNotRetired(tx, wo.assetId);
  const now = new Date();
  const set: Record<string, unknown> = { status: "ASSIGNED", assigneeId: check.user._id, assignedAt: now, ...stampUpdate(scoped, now) };
  const templateId = wo.checklistTemplateId ?? null;
  if ((wo.checklistSnapshot ?? null) === null && templateId !== null) {
    const snapshot = await snapshotPublished(tx, templateId);
    set.checklistSnapshot = [...snapshot.items];
    set.checklistTemplateVersion = snapshot.templateVersion;
  }
  await scoped.db.work_orders.updateOne({ _id: id }, { $set: set });
  await afterAssign(tx, wo, check, ctx.userId, now, wo.status, null);
  await emitWorkOrderChanged(tx, id, "ASSIGNED");
  return getForRole(tx, ctx, id);
}

export async function reassign(tx: Tx, ctx: Ctx, id: string, raw: unknown): Promise<WorkOrderDTO> {
  const scoped = dbTx(tx);
  sameTenant(scoped, ctx);
  requireOffice(ctx);
  const input = parseInput(ReassignInputSchema, raw);
  const wo = await loadWorkOrder(tx, id);
  if (wo.status === "CANCELLED") reject("WO_CANCELLED", { id });
  const check = await checkAssignee(tx, input.assigneeId, { enforceDuty: true, confirmOffDuty: input.confirmOffDuty === true });
  assertMachine(wo.status, "reassign", { actorRole: ctx.role, assigneeActiveAndJoined: true });
  await assertAssetNotRetired(tx, wo.assetId);
  const previous = wo.assigneeId ?? null;
  const now = new Date();
  const previousAssigneeIds = [...new Set([...(wo.previousAssigneeIds ?? []), ...(previous === null ? [] : [previous])])].filter((userId) => userId !== check.user._id);
  await scoped.db.work_orders.updateOne(
    { _id: id },
    {
      $set: {
        status: "ASSIGNED",
        assigneeId: check.user._id,
        previousAssigneeIds,
        assignedAt: now,
        acceptedAt: null,
        holdReason: null,
        holdNote: null,
        ...stampUpdate(scoped, now),
      },
    },
  );
  await afterAssign(tx, { ...wo }, check, ctx.userId, now, wo.status, previous);
  await recordWoActivity(tx, { workOrderId: id, action: "workOrder.reassignReason", actorId: ctx.userId, fromStatus: null, toStatus: null, occurredAt: now, meta: { reason: input.reason } });
  if (wo.assetId !== null && wo.assetId !== undefined) await recomputeCondition(tx, wo.assetId, ctx.userId);
  await emitWorkOrderChanged(tx, id, "ASSIGNED");
  return getForRole(tx, ctx, id);
}

export async function verify(tx: Tx, ctx: Ctx, id: string, raw: unknown = {}): Promise<WorkOrderDTO> {
  const scoped = dbTx(tx);
  sameTenant(scoped, ctx);
  requireOffice(ctx);
  const input = parseInput(VerifyInputSchema, raw);
  const wo = await loadWorkOrder(tx, id);
  if (wo.status === "VERIFIED") reject("WO_ALREADY_VERIFIED", { id });
  assertMachine(wo.status, "verify", { actorRole: ctx.role });
  const now = new Date();
  await scoped.db.work_orders.updateOne({ _id: id }, { $set: { status: "VERIFIED", verifiedAt: now, verifiedById: ctx.userId, ...stampUpdate(scoped, now) } });
  await recordWoActivity(tx, {
    workOrderId: id,
    action: "workOrder.verify",
    actorId: ctx.userId,
    fromStatus: wo.status,
    toStatus: "VERIFIED",
    occurredAt: now,
    meta: input.note === undefined ? {} : { note: input.note },
  });
  await emitWorkOrderChanged(tx, id, "VERIFIED");
  return getForRole(tx, ctx, id);
}

/** EC-WO-18: reopen keeps every completion artefact in the timeline and notifies the assignee. */
export async function reopen(tx: Tx, ctx: Ctx, id: string, raw: unknown): Promise<WorkOrderDTO> {
  const scoped = dbTx(tx);
  sameTenant(scoped, ctx);
  requireOffice(ctx);
  const input = parseInput(ReasonInputSchema, raw);
  const wo = await loadWorkOrder(tx, id);
  assertMachine(wo.status, "reopen", { actorRole: ctx.role, reason: input.reason });
  const now = new Date();
  await scoped.db.work_orders.updateOne({ _id: id }, { $set: { status: "IN_PROGRESS", completedAt: null, ...stampUpdate(scoped, now) } });
  await recordWoActivity(tx, {
    workOrderId: id,
    action: "workOrder.reopen",
    actorId: ctx.userId,
    fromStatus: wo.status,
    toStatus: "IN_PROGRESS",
    occurredAt: now,
    meta: {
      reason: input.reason,
      previousCompletion: {
        completedAt: wo.completedAt?.toISOString() ?? null,
        resolution: wo.resolution ?? null,
        signatureStatus: wo.signatureStatus ?? null,
        workMinutes: wo.workMinutes ?? null,
      },
    },
  });
  const assigneeId = wo.assigneeId ?? null;
  if (assigneeId !== null) {
    await createNotification(asSyncTx(tx), { type: "WO_UPDATED", userIds: [assigneeId], entity: { entityType: "WORK_ORDER", entityId: id }, params: { title: notifyTitle(wo) } });
    await pokeUser(tx, assigneeId, "workOrder.reopened");
  }
  if (wo.assetId !== null && wo.assetId !== undefined) await recomputeCondition(tx, wo.assetId, ctx.userId);
  await emitWorkOrderChanged(tx, id, "IN_PROGRESS");
  return getForRole(tx, ctx, id);
}

export async function cancel(tx: Tx, ctx: Ctx, id: string, raw: unknown): Promise<WorkOrderDTO> {
  const scoped = dbTx(tx);
  sameTenant(scoped, ctx);
  requireOffice(ctx);
  const input = parseInput(ReasonInputSchema, raw);
  const wo = await loadWorkOrder(tx, id);
  assertMachine(wo.status, "cancel", { actorRole: ctx.role, reason: input.reason });
  const now = new Date();
  await scoped.db.work_orders.updateOne({ _id: id }, { $set: { status: "CANCELLED", cancelledAt: now, cancelReason: input.reason, ...stampUpdate(scoped, now) } });
  await recordWoActivity(tx, { workOrderId: id, action: "workOrder.cancel", actorId: ctx.userId, fromStatus: wo.status, toStatus: "CANCELLED", occurredAt: now, meta: { reason: input.reason } });
  const assigneeId = wo.assigneeId ?? null;
  if (assigneeId !== null) {
    await createNotification(asSyncTx(tx), { type: "WO_CANCELLED", userIds: [assigneeId], entity: { entityType: "WORK_ORDER", entityId: id }, params: { title: notifyTitle(wo) } });
    await pokeUser(tx, assigneeId, "workOrder.cancelled");
  }
  if (wo.assetId !== null && wo.assetId !== undefined) await recomputeCondition(tx, wo.assetId, ctx.userId);
  await emitWorkOrderChanged(tx, id, "CANCELLED");
  return getForRole(tx, ctx, id);
}

/** `PATCH /work-orders/:id` with `If-Match`: office edits of planning fields while the job is not closed. */
export async function patch(tx: Tx, ctx: Ctx, id: string, raw: unknown, ifMatch?: string | null): Promise<WorkOrderDTO> {
  const scoped = dbTx(tx);
  sameTenant(scoped, ctx);
  requireOffice(ctx);
  const body: Record<string, unknown> = typeof raw === "object" && raw !== null ? { ...(raw as Record<string, unknown>) } : {};
  if (body.description === undefined && typeof body.instructions === "string") body.description = body.instructions;
  delete body.instructions;
  const input = parseInput(WorkOrderPatchSchema, body);
  const wo = await loadWorkOrder(tx, id);
  assertVersion(wo, ifMatch);
  if (wo.status === "CANCELLED") reject("WO_CANCELLED", { id });
  if (wo.status === "COMPLETED" || wo.status === "VERIFIED") reject("INVALID_TRANSITION", { from: wo.status, action: "patch" });
  const now = new Date();
  const set: Record<string, unknown> = { ...stampUpdate(scoped, now) };
  const changes: string[] = [];
  const assignField = (key: string, value: unknown): void => {
    set[key] = value;
    changes.push(key);
  };
  if (input.title !== undefined) assignField("title", input.title);
  if (input.description !== undefined) assignField("description", input.description);
  if (input.priority !== undefined) assignField("priority", input.priority);
  if (input.scheduledFor !== undefined) assignField("scheduledFor", input.scheduledFor);
  if (input.dueAt !== undefined) {
    const settings = await workOrderSettings(ctx.orgId);
    let dueAt: Date;
    if (input.dueAt === null) {
      const assetCategory = wo.assetId === null || wo.assetId === undefined ? null : ((await scoped.db.assets.findOne({ _id: wo.assetId }, { projection: { category: 1 } }))?.category ?? null);
      dueAt = await dueAtFor(tx, ctx.orgId, assetCategory, wo.createdAt, input.priority ?? wo.priority, settings.sla, settings.timeZone);
    } else {
      dueAt = new Date(input.dueAt);
    }
    assignField("dueAt", dueAt);
    set.slaAtRiskNotifiedAt = null;
    set.slaBreachedAt = null;
  }
  if (input.destination !== undefined) {
    assignField("destLat", input.destination?.lat ?? null);
    set.destLng = input.destination?.lng ?? null;
    set.locationNote = input.destination?.note ?? null;
  }
  if (input.checklistTemplateId !== undefined) {
    if (wo.status !== "OPEN" && wo.status !== "ASSIGNED") reject("INVALID_TRANSITION", { from: wo.status, action: "changeChecklist" });
    assignField("checklistTemplateId", input.checklistTemplateId);
    if (input.checklistTemplateId === null) {
      set.checklistSnapshot = null;
      set.checklistTemplateVersion = null;
    } else {
      const snapshot = await snapshotPublished(tx, input.checklistTemplateId);
      set.checklistSnapshot = [...snapshot.items];
      set.checklistTemplateVersion = snapshot.templateVersion;
    }
    set.checklistResponses = [];
  }
  await scoped.db.work_orders.updateOne({ _id: id }, { $set: set });
  await recordWoActivity(tx, { workOrderId: id, action: "workOrder.update", actorId: ctx.userId, fromStatus: null, toStatus: null, occurredAt: now, meta: { changes } });
  const assigneeId = wo.assigneeId ?? null;
  if (assigneeId !== null && changes.length > 0) {
    await createNotification(asSyncTx(tx), {
      type: "WO_UPDATED",
      userIds: [assigneeId],
      entity: { entityType: "WORK_ORDER", entityId: id },
      params: { title: notifyTitle({ number: wo.number, title: input.title ?? wo.title }) },
    });
  }
  await emitWorkOrderChanged(tx, id, wo.status);
  return getForRole(tx, ctx, id);
}

