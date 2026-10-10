import { computeWorkOrderTimes, type WorkOrderStatusEvent } from "@agrorende/contracts";
import { isChecklistComplete, type ChecklistItem, type ChecklistResponse } from "@agrorende/contracts/checklist";
import type { WorkOrderDTO } from "@agrorende/contracts/dto";
import type { WorkOrderStatus } from "@agrorende/contracts/enums";
import { workOrderMachine } from "@agrorende/contracts/machines";
import type { WorkOrderCompletePayload, WorkOrderSaveChecklistPayload, WorkOrderTransitionPayload } from "@agrorende/contracts/mutations";
import type { Tx } from "@agrorende/contracts/seams";

import type { Ctx } from "../../context";
import { reject } from "../../errors";
import { createNotification, officeRecipients } from "../../notify/index";
import { rentalSeams } from "../../seams";
import { dbTx, stampUpdate } from "../assets/kit";
import { applyReadings, recomputeCondition } from "../assets/service";
import { asSyncTx, emitWorkOrderChanged, loadWorkOrder, recordWoActivity, requireOffice, statusStamp, workOrderSettings, type WorkOrderDoc } from "./common";
import { evidenceMode, failedSafetyItems, flagLateEvidence, mergeResponses } from "./evidence";
import { partsCostCents } from "./parts";
import { getForRole, notifyTitle, pokeUser } from "./service";

export interface FieldMeta {
  readonly occurredAt: Date;
  readonly clockSkewed?: boolean;
  readonly lat?: number;
  readonly lng?: number;
}

function guardOrReject(from: WorkOrderStatus, action: workOrderMachine.WorkOrderAction, guard: workOrderMachine.WorkOrderGuardInput): WorkOrderStatus {
  const result = workOrderMachine.canTransition(from, action, guard);
  if (!result.ok) return reject(result.code, { from, action });
  return result.to;
}

async function notifyOffice(tx: Tx, wo: WorkOrderDoc, actorId: string): Promise<void> {
  const scoped = dbTx(tx);
  const office = (await officeRecipients(asSyncTx(tx), scoped.orgId, ["ADMIN", "MANAGER"])).filter((userId) => userId !== actorId);
  if (office.length === 0) return;
  await createNotification(asSyncTx(tx), {
    type: "WO_UPDATED",
    userIds: office,
    entity: { entityType: "WORK_ORDER", entityId: wo._id },
    params: { title: notifyTitle(wo) },
  });
}

/** `workOrder.transition`: accept, decline, startRoute, arrive, abortRoute, startWork, hold, resume. */
export async function transition(tx: Tx, ctx: Ctx, payload: WorkOrderTransitionPayload, meta: FieldMeta): Promise<void> {
  const scoped = dbTx(tx);
  const wo = await loadWorkOrder(tx, payload.id);
  const isAssignee = (wo.assigneeId ?? null) === ctx.userId;
  if (payload.action === "decline" && (payload.reason ?? "").trim().length === 0) reject("VALIDATION_FAILED", { fieldErrors: { reason: ["required"] }, clientCode: "WO_DECLINE_REASON_REQUIRED" });
  if (payload.action === "abortRoute" && (payload.reason ?? "").trim().length === 0) reject("VALIDATION_FAILED", { fieldErrors: { reason: ["required"] } });
  const to = guardOrReject(wo.status, payload.action, {
    actorRole: ctx.role,
    isAssignee,
    reason: payload.reason ?? null,
    holdReason: payload.holdReason ?? null,
    currentHoldReason: wo.holdReason ?? null,
  });

  if (payload.action === "startWork" || payload.action === "resume") {
    const failed = failedSafetyItems(wo.checklistSnapshot, wo.checklistResponses ?? []);
    if (failed.length > 0 && payload.action === "startWork") reject("WO_SAFETY_STOP_REQUIRED", { items: failed });
  }

  const at = meta.occurredAt;
  const now = new Date();
  const set: Record<string, unknown> = { status: to, ...statusStamp(to, at), ...stampUpdate(scoped, now) };
  const activityMeta: Record<string, unknown> = {};
  if (payload.reason !== undefined) activityMeta.reason = payload.reason;
  if (payload.note !== undefined) activityMeta.note = payload.note;
  if (meta.clockSkewed === true) activityMeta.clockSkewed = true;

  switch (payload.action) {
    case "decline": {
      set.assigneeId = null;
      set.assignedAt = null;
      set.acceptedAt = null;
      set.previousAssigneeIds = [...new Set([...(wo.previousAssigneeIds ?? []), ctx.userId])];
      break;
    }
    case "abortRoute": {
      set.enRouteAt = null;
      break;
    }
    case "startWork": {
      set.startedAt = wo.startedAt ?? at;
      // BR-F2-5: a second IN_PROGRESS job is allowed and only recorded as a warning.
      const other = await scoped.db.work_orders.findOne({ _id: { $ne: wo._id }, assigneeId: ctx.userId, status: "IN_PROGRESS", deletedAt: null });
      if (other !== null) activityMeta.warning = { code: "PARALLEL_IN_PROGRESS", workOrderId: other._id, number: other.number };
      break;
    }
    case "hold": {
      set.holdReason = payload.holdReason ?? null;
      set.holdNote = payload.note ?? null;
      activityMeta.holdReason = payload.holdReason ?? null;
      break;
    }
    case "resume": {
      activityMeta.releasedHoldReason = wo.holdReason ?? null;
      set.holdReason = null;
      set.holdNote = null;
      break;
    }
    default:
      break;
  }

  await scoped.db.work_orders.updateOne({ _id: wo._id }, { $set: set });
  await recordWoActivity(tx, {
    workOrderId: wo._id,
    action: `workOrder.${payload.action}`,
    actorId: ctx.userId,
    fromStatus: wo.status,
    toStatus: to,
    occurredAt: at,
    meta: activityMeta,
  });
  if (payload.action === "decline" || payload.action === "hold") await notifyOffice(tx, wo, ctx.userId);
  if (payload.action === "resume" && !isAssignee && (wo.assigneeId ?? null) !== null) await pokeUser(tx, wo.assigneeId as string, "workOrder.resumed");
  if (wo.assetId !== null && wo.assetId !== undefined && ["decline", "startWork", "hold", "resume"].includes(payload.action)) {
    await recomputeCondition(tx, wo.assetId, ctx.userId);
  }
  await emitWorkOrderChanged(tx, wo._id, to);
}

/** `workOrder.saveChecklist`: merges answers; never state-rejected (BR-F2-4). */
export async function saveChecklist(tx: Tx, ctx: Ctx, payload: WorkOrderSaveChecklistPayload, meta: FieldMeta): Promise<void> {
  const scoped = dbTx(tx);
  const wo = await loadWorkOrder(tx, payload.id);
  const mode = evidenceMode(wo, ctx);
  const responses = mergeResponses(wo.checklistResponses ?? [], payload.responses);
  const now = new Date();
  const set: Record<string, unknown> = { checklistResponses: responses, ...stampUpdate(scoped, now) };
  const snapshotVersion = wo.checklistTemplateVersion ?? null;
  const activityMeta: Record<string, unknown> = { keys: payload.responses.map((response) => response.key) };
  if (snapshotVersion !== null && snapshotVersion !== payload.templateVersion) activityMeta.templateVersionMismatch = { sent: payload.templateVersion, current: snapshotVersion };

  // EC-WO-09: a new safety-critical FAIL while working puts the job on a SAFETY hold.
  const failedBefore = new Set(failedSafetyItems(wo.checklistSnapshot, wo.checklistResponses ?? []));
  const failedNow = failedSafetyItems(wo.checklistSnapshot, responses).filter((key) => !failedBefore.has(key));
  const safetyStop = mode === "live" && wo.status === "IN_PROGRESS" && failedNow.length > 0;
  if (safetyStop) {
    set.status = "ON_HOLD";
    set.holdReason = "SAFETY";
    set.holdNote = failedNow.join(", ");
  }
  await scoped.db.work_orders.updateOne({ _id: wo._id }, { $set: set });
  await recordWoActivity(tx, { workOrderId: wo._id, action: "workOrder.saveChecklist", actorId: ctx.userId, fromStatus: null, toStatus: null, occurredAt: meta.occurredAt, meta: activityMeta });
  if (safetyStop) {
    await recordWoActivity(tx, {
      workOrderId: wo._id,
      action: "workOrder.hold",
      actorId: ctx.userId,
      fromStatus: wo.status,
      toStatus: "ON_HOLD",
      occurredAt: meta.occurredAt,
      meta: { holdReason: "SAFETY", automatic: true, items: failedNow },
    });
    await notifyOffice(tx, wo, ctx.userId);
    if (wo.assetId !== null && wo.assetId !== undefined) await recomputeCondition(tx, wo.assetId, ctx.userId);
  }
  if (mode === "late") await flagLateEvidence(tx, wo, ctx.userId, "checklist", meta.occurredAt);
  await emitWorkOrderChanged(tx, wo._id, safetyStop ? "ON_HOLD" : wo.status);
}

async function validMediaIds(tx: Tx, workOrderId: string): Promise<{ ids: Set<string>; afterCount: number }> {
  const rows = await dbTx(tx).db.media.find({ "parent.type": "WORK_ORDER", "parent.id": workOrderId, deletedAt: null }, { projection: { _id: 1, tag: 1 } }).toArray();
  return { ids: new Set(rows.map((row) => row._id)), afterCount: rows.filter((row) => row.tag === "AFTER").length };
}

/** Last time the asset meter was read: newest reading activity of the asset, else its creation. */
async function lastReadingAt(tx: Tx, assetId: string, fallback: Date): Promise<Date> {
  const row = await dbTx(tx).db.activity_events.findOne(
    { entityType: "ASSET", entityId: assetId, action: { $in: ["asset.readingsUpdated", "asset.meterReplaced"] } },
    { sort: { occurredAt: -1 } },
  );
  return row?.occurredAt ?? fallback;
}

/** EC-WO-14: readings never go down without a photographed meter replacement, and absurd jumps need review. */
async function checkMeter(tx: Tx, wo: WorkOrderDoc, payload: WorkOrderCompletePayload, at: Date): Promise<void> {
  const reading = payload.hourMeterReading;
  if (reading === undefined || wo.assetId === null || wo.assetId === undefined) return;
  if (payload.meterReplaced === true) {
    if (payload.meterPhotoMediaId === undefined) reject("VALIDATION_FAILED", { fieldErrors: { meterPhotoMediaId: ["required"] } });
    return;
  }
  const asset = await dbTx(tx).db.assets.findOne({ _id: wo.assetId });
  const current = asset?.hourMeter ?? null;
  if (asset === null || current === null) return;
  if (reading < current) reject("METER_READING_LOWER", { assetId: wo.assetId, current, reading });
  const since = await lastReadingAt(tx, wo.assetId, asset.createdAt);
  const elapsedHours = Math.max(1, (at.getTime() - since.getTime()) / 3_600_000);
  if (payload.confirmMeterJump !== true && reading - current > elapsedHours * 24) reject("METER_READING_JUMP", { assetId: wo.assetId, current, reading, elapsedHours: Math.round(elapsedHours) });
}

/** `workOrder.complete`: guards, times, costs, readings and damages (A§6.4, WO-10). */
export async function complete(tx: Tx, ctx: Ctx, payload: WorkOrderCompletePayload, meta: FieldMeta): Promise<void> {
  const scoped = dbTx(tx);
  const wo = await loadWorkOrder(tx, payload.id);
  if (wo.status === "VERIFIED") reject("WO_ALREADY_VERIFIED", { id: wo._id });
  const settings = await workOrderSettings(scoped.orgId);
  const media = await validMediaIds(tx, wo._id);
  const snapshot: readonly ChecklistItem[] = wo.checklistSnapshot ?? [];
  const responses: readonly ChecklistResponse[] = wo.checklistResponses ?? [];
  const isAssignee = (wo.assigneeId ?? null) === ctx.userId;
  const to = guardOrReject(wo.status, "complete", {
    actorRole: ctx.role,
    isAssignee,
    resolution: payload.resolution,
    afterPhotoCount: media.afterCount,
    checklistComplete: isChecklistComplete(snapshot, responses, media.ids),
    requireWoSignature: settings.requireWoSignature,
    signatureStatus: payload.signatureStatus ?? null,
    signatureReason: payload.signatureReason ?? null,
  });
  const failed = failedSafetyItems(snapshot, responses);
  if (failed.length > 0) reject("WO_SAFETY_STOP_REQUIRED", { items: failed });
  if (payload.signatureStatus === "SIGNED" && payload.signatureMediaId === undefined) reject("GUARD_SIGNATURE_REQUIRED", { reason: "signatureMediaMissing" });
  const at = meta.occurredAt;
  await checkMeter(tx, wo, payload, at);

  const events = await scoped.db.activity_events
    .find({ entityType: "WORK_ORDER", entityId: wo._id, toStatus: { $ne: null } }, { projection: { toStatus: 1, occurredAt: 1 } })
    .toArray();
  const statusEvents: WorkOrderStatusEvent[] = events
    .filter((event) => typeof event.toStatus === "string")
    .map((event) => ({ toStatus: event.toStatus as WorkOrderStatus, occurredAt: event.occurredAt }));
  statusEvents.push({ toStatus: "COMPLETED", occurredAt: at });
  const times = computeWorkOrderTimes(statusEvents);
  const assignee = await scoped.db.users.findOne({ _id: ctx.userId });
  const hourly = assignee?.hourlyCostCents ?? null;
  const parts = await scoped.db.work_order_parts.find({ workOrderId: wo._id, deletedAt: null }).toArray();

  const now = new Date();
  await scoped.db.work_orders.updateOne(
    { _id: wo._id },
    {
      $set: {
        status: to,
        completedAt: at,
        resolution: payload.resolution,
        rootCause: payload.rootCause ?? null,
        hourMeterReading: payload.hourMeterReading ?? null,
        customerSignerName: payload.customerSignerName ?? null,
        signatureStatus: payload.signatureStatus ?? null,
        signatureReason: payload.signatureReason ?? null,
        signatureWitnessName: payload.signatureWitnessName ?? null,
        signatureMediaId: payload.signatureMediaId ?? null,
        documentLocale: payload.documentLocale,
        travelMinutes: times.travelMinutes,
        workMinutes: times.workMinutes,
        laborCostCents: hourly === null ? null : Math.round((times.workMinutes / 60) * hourly),
        partsCostCents: partsCostCents(parts),
        ...stampUpdate(scoped, now),
      },
    },
  );
  await recordWoActivity(tx, {
    workOrderId: wo._id,
    action: "workOrder.complete",
    actorId: ctx.userId,
    fromStatus: wo.status,
    toStatus: to,
    occurredAt: at,
    meta: {
      travelMinutes: times.travelMinutes,
      workMinutes: times.workMinutes,
      ...(payload.meterReplaced === true ? { meterReplaced: true, meterPhotoMediaId: payload.meterPhotoMediaId ?? null } : {}),
      ...(payload.confirmMeterJump === true ? { meterJumpConfirmed: true, attention: true } : {}),
      ...(meta.clockSkewed === true ? { clockSkewed: true } : {}),
    },
  });

  if (wo.assetId !== null && wo.assetId !== undefined) {
    if (payload.hourMeterReading !== undefined) {
      const result = await applyReadings(tx, ctx, wo.assetId, {
        hourMeter: payload.hourMeterReading,
        source: { entityType: "WORK_ORDER", entityId: wo._id },
        meterReplaced: payload.meterReplaced === true,
      });
      if (result.ignored.length > 0) {
        await recordWoActivity(tx, { workOrderId: wo._id, action: "workOrder.readingIgnored", actorId: ctx.userId, fromStatus: null, toStatus: null, occurredAt: at, meta: { ignored: result.ignored } });
      }
    }
  }
  const damageIds = wo.damageIds ?? [];
  if (damageIds.length > 0) await rentalSeams.markDamagesRepaired(tx, { workOrderId: wo._id, damageIds: [...damageIds] });
  if (wo.assetId !== null && wo.assetId !== undefined) await recomputeCondition(tx, wo.assetId, ctx.userId);
  await notifyOffice(tx, wo, ctx.userId);
  await emitWorkOrderChanged(tx, wo._id, to);
}

export { flagLateEvidence };

/**
 * EC-WO-09 office release (`POST /work-orders/:id/release-hold`): a manager or admin resumes a job held for
 * safety after review. Only SAFETY holds can be released by the office; other holds belong to the assignee.
 */
export async function releaseSafetyHold(tx: Tx, ctx: Ctx, id: string, raw: unknown = {}): Promise<WorkOrderDTO> {
  requireOffice(ctx);
  const note = typeof raw === "object" && raw !== null && typeof (raw as { note?: unknown }).note === "string" ? (raw as { note: string }).note.trim() : "";
  const wo = await loadWorkOrder(tx, id);
  if (wo.status !== "ON_HOLD" || wo.holdReason !== "SAFETY") reject("INVALID_TRANSITION", { from: wo.status, action: "releaseHold" });
  await transition(tx, ctx, { id, action: "resume", ...(note.length > 0 ? { note } : {}) }, { occurredAt: new Date() });
  return getForRole(tx, ctx, id);
}
