import type { ChecklistItem, ChecklistResponse } from "@agrorende/contracts/checklist";
import type { WorkOrderStatus } from "@agrorende/contracts/enums";
import { workOrderMachine } from "@agrorende/contracts/machines";

import { getMirrorRow, listMirrorRows, patchMirrorRow, upsertMirrorRow, type MirrorRow } from "../../db/mirror";
import type { SqlDb } from "../../db/sql";
import { defineMutator } from "../mutator";

export type { LocalMutationResult } from "../mutator";

const STAMP: Readonly<Partial<Record<WorkOrderStatus, string>>> = {
  ACCEPTED: "acceptedAt",
  EN_ROUTE: "enRouteAt",
  ON_SITE: "arrivedAt",
  COMPLETED: "completedAt",
};

function previousIds(row: MirrorRow | undefined): string[] {
  return Array.isArray(row?.previousAssigneeIds) ? (row.previousAssigneeIds as unknown[]).filter((id): id is string => typeof id === "string") : [];
}

/** Newer `answeredAt` wins per item key, as the server merges (A§7.3). */
export function mergeResponses(current: readonly ChecklistResponse[], incoming: readonly ChecklistResponse[]): ChecklistResponse[] {
  const byKey = new Map(current.map((response) => [response.key, response]));
  for (const response of incoming) {
    const existing = byKey.get(response.key);
    if (existing === undefined || Date.parse(response.answeredAt) >= Date.parse(existing.answeredAt)) byKey.set(response.key, response);
  }
  return [...byKey.values()];
}

function failedSafety(items: readonly ChecklistItem[], responses: readonly ChecklistResponse[]): string[] {
  return items.filter((item) => item.isSafetyCritical && responses.find((r) => r.key === item.key)?.value === "FAIL").map((item) => item.key);
}

/**
 * `workOrder.transition` (WO-04): the job moves at once on the phone; the server re-checks the
 * state machine on push and a rejection reverts the row (EC-WO-03, EC-WO-04).
 */
export const transitionWorkOrder = defineMutator({
  name: "workOrder.transition",
  entityType: "WORK_ORDER",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    const row = await getMirrorRow(tx, "workOrders", payload.id);
    if (row === undefined) return;
    const from = String(row.status) as WorkOrderStatus;
    const result = workOrderMachine.canTransition(from, payload.action, {
      isAssignee: row.assigneeId === ctx.runtime.userId,
      currentHoldReason: (row.holdReason as never) ?? null,
      reason: payload.reason ?? null,
      holdReason: payload.holdReason ?? null,
      // Office release of a safety hold never happens on the phone; the server is the judge.
      actorRole: "FIELD",
    });
    if (!result.ok) return;
    const patch: MirrorRow = { status: result.to, updatedAt: ctx.now };
    const stamp = STAMP[result.to];
    if (stamp !== undefined) patch[stamp] = ctx.now;
    switch (payload.action) {
      case "decline":
        patch.assigneeId = null;
        patch.assignedAt = null;
        patch.acceptedAt = null;
        patch.previousAssigneeIds = [...new Set([...previousIds(row), ctx.runtime.userId])];
        break;
      case "abortRoute":
        patch.enRouteAt = null;
        break;
      case "startWork":
        patch.startedAt = typeof row.startedAt === "string" ? row.startedAt : ctx.now;
        break;
      case "hold":
        patch.holdReason = payload.holdReason ?? null;
        patch.holdNote = payload.note ?? null;
        break;
      case "resume":
        patch.holdReason = null;
        patch.holdNote = null;
        break;
      default:
        break;
    }
    await patchMirrorRow(tx, "workOrders", payload.id, patch);
  },
});

/** `workOrder.complete` (WO-10): resolution, reading and signature; times and costs come back from the server. */
export const completeWorkOrder = defineMutator({
  name: "workOrder.complete",
  entityType: "WORK_ORDER",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    const row = await getMirrorRow(tx, "workOrders", payload.id);
    if (row === undefined) return;
    const patch: MirrorRow = {
      updatedAt: ctx.now,
      resolution: payload.resolution,
      rootCause: payload.rootCause ?? null,
      hourMeterReading: payload.hourMeterReading ?? null,
      customerSignerName: payload.customerSignerName ?? null,
      signatureStatus: payload.signatureStatus ?? null,
      signatureReason: payload.signatureReason ?? null,
      signatureWitnessName: payload.signatureWitnessName ?? null,
      signatureMediaId: payload.signatureMediaId ?? null,
      documentLocale: payload.documentLocale,
    };
    if (row.status === "IN_PROGRESS") {
      patch.status = "COMPLETED";
      patch.completedAt = ctx.now;
    }
    await patchMirrorRow(tx, "workOrders", payload.id, patch);
  },
});

/** `workOrder.saveChecklist`: merged by key; a new safety-critical FAIL puts the job on a SAFETY hold (EC-WO-09). */
export const saveChecklist = defineMutator({
  name: "workOrder.saveChecklist",
  entityType: "WORK_ORDER",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    const row = await getMirrorRow(tx, "workOrders", payload.id);
    if (row === undefined) return;
    const items = Array.isArray(row.checklistSnapshot) ? (row.checklistSnapshot as ChecklistItem[]) : [];
    const current = Array.isArray(row.checklistResponses) ? (row.checklistResponses as ChecklistResponse[]) : [];
    const responses = mergeResponses(current, payload.responses);
    const patch: MirrorRow = { checklistResponses: responses, updatedAt: ctx.now };
    const before = new Set(failedSafety(items, current));
    const fresh = failedSafety(items, responses).filter((key) => !before.has(key));
    if (row.status === "IN_PROGRESS" && fresh.length > 0) {
      patch.status = "ON_HOLD";
      patch.holdReason = "SAFETY";
      patch.holdNote = fresh.join(", ");
    }
    await patchMirrorRow(tx, "workOrders", payload.id, patch);
  },
});

/**
 * Moves the local level of one part at one location by `delta`. The row stays clean so the
 * next pull (or a scope reset and replay) replaces it with the server's number: server wins.
 */
export async function moveLocalStock(tx: SqlDb, partId: string, stockLocationId: string, delta: number, nowIso: string): Promise<void> {
  const [level] = await listMirrorRows(tx, "stockLevels", `"partId" = ? AND "stockLocationId" = ?`, [partId, stockLocationId]);
  if (level === undefined || typeof level.id !== "string") return;
  const quantity = typeof level.quantity === "number" ? level.quantity : 0;
  await patchMirrorRow(tx, "stockLevels", level.id, { quantity: quantity + delta, updatedAt: nowIso }, 0);
}

/**
 * `workOrder.addPart` (WO-09): a free-text line, or a catalog line taken from the technician's
 * van (P1), which lowers the local van level at once like the server's `OUT_TO_WORK_ORDER` movement.
 */
export const addPart = defineMutator({
  name: "workOrder.addPart",
  entityType: "WORK_ORDER_PART",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    const existing = await getMirrorRow(tx, "workOrderParts", payload.id);
    const wo = await getMirrorRow(tx, "workOrders", payload.workOrderId);
    await upsertMirrorRow(
      tx,
      "workOrderParts",
      {
        id: payload.id,
        organizationId: wo?.organizationId ?? "",
        syncVersion: 0,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        deletedAt: null,
        workOrderId: payload.workOrderId,
        name: payload.name,
        partNumber: payload.partNumber ?? null,
        quantity: payload.quantity,
        unit: payload.unit,
        unitCostCents: payload.unitCostCents ?? null,
        partId: payload.partId ?? null,
        stockLocationId: payload.stockLocationId ?? null,
        addedById: ctx.runtime.userId,
      },
      1,
    );
    const counted = existing !== undefined && existing.deletedAt == null;
    if (!counted && payload.partId != null && payload.stockLocationId != null) {
      await moveLocalStock(tx, payload.partId, payload.stockLocationId, -payload.quantity, ctx.now);
    }
  },
});

/** `workOrder.removePart`: soft delete, like the server; a catalog line puts its quantity back in the van. */
export const removePart = defineMutator({
  name: "workOrder.removePart",
  entityType: "WORK_ORDER_PART",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    const line = await getMirrorRow(tx, "workOrderParts", payload.id);
    await patchMirrorRow(tx, "workOrderParts", payload.id, { deletedAt: ctx.now, updatedAt: ctx.now });
    if (line === undefined || line.deletedAt != null) return;
    if (typeof line.partId === "string" && typeof line.stockLocationId === "string" && typeof line.quantity === "number") {
      await moveLocalStock(tx, line.partId, line.stockLocationId, line.quantity, ctx.now);
    }
  },
});
