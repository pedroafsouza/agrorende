import type { WorkOrderAddPartPayload } from "@agrorende/contracts/mutations";
import type { Tx } from "@agrorende/contracts/seams";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { dbTx, stampCreate, stampUpdate } from "../assets/kit.js";
import { emitWorkOrderChanged, loadWorkOrder, recordWoActivity } from "./common.js";
import { evidenceMode, flagLateEvidence } from "./evidence.js";

export interface PartCostLine {
  readonly quantity: number;
  readonly unitCostCents?: number | null;
}

/** Parts cost = Σ round(quantity × unitCostCents); a part without a cost counts as zero. */
export function partsCostCents(parts: readonly PartCostLine[]): number {
  return parts.reduce((sum, part) => sum + Math.round(part.quantity * (part.unitCostCents ?? 0)), 0);
}

/** `workOrder.addPart`. Idempotent on the client-generated part id. */
export async function addPart(tx: Tx, ctx: Ctx, payload: WorkOrderAddPartPayload, occurredAt: Date): Promise<void> {
  const scoped = dbTx(tx);
  const wo = await loadWorkOrder(tx, payload.workOrderId);
  const mode = evidenceMode(wo, ctx);
  const existing = await scoped.db.work_order_parts.findOne({ _id: payload.id });
  if (existing !== null) {
    if (existing.workOrderId !== wo._id) reject("CONFLICT", { id: payload.id });
    return;
  }
  const now = new Date();
  await scoped.db.work_order_parts.insertOne({
    _id: payload.id,
    organizationId: scoped.orgId,
    ...stampCreate(scoped, now),
    deletedAt: null,
    workOrderId: wo._id,
    name: payload.name,
    partNumber: payload.partNumber ?? null,
    quantity: payload.quantity,
    unit: payload.unit,
    unitCostCents: payload.unitCostCents ?? null,
    partId: payload.partId ?? null,
    stockLocationId: payload.stockLocationId ?? null,
    addedById: ctx.userId,
  });
  await recordWoActivity(tx, {
    workOrderId: wo._id,
    action: "workOrder.addPart",
    actorId: ctx.userId,
    fromStatus: null,
    toStatus: null,
    occurredAt,
    meta: { partId: payload.id, name: payload.name, quantity: payload.quantity, unit: payload.unit },
  });
  await refreshPartsCost(tx, wo._id, wo.status === "COMPLETED" || wo.status === "VERIFIED");
  if (mode === "late") await flagLateEvidence(tx, wo, ctx.userId, "part", occurredAt);
  await emitWorkOrderChanged(tx, wo._id, wo.status);
}

/** `workOrder.removePart`: soft delete; a part already removed is a no-op. */
export async function removePart(tx: Tx, ctx: Ctx, partId: string, occurredAt: Date): Promise<void> {
  const scoped = dbTx(tx);
  const part = await scoped.db.work_order_parts.findOne({ _id: partId });
  if (part === null) return reject("NOT_FOUND", { entityType: "WORK_ORDER_PART", id: partId });
  const wo = await loadWorkOrder(tx, part.workOrderId);
  const mode = evidenceMode(wo, ctx);
  if ((part.deletedAt ?? null) !== null) return;
  const now = new Date();
  await scoped.db.work_order_parts.updateOne({ _id: partId }, { $set: { deletedAt: now, ...stampUpdate(scoped, now) } });
  await recordWoActivity(tx, {
    workOrderId: wo._id,
    action: "workOrder.removePart",
    actorId: ctx.userId,
    fromStatus: null,
    toStatus: null,
    occurredAt,
    meta: { partId, name: part.name },
  });
  await refreshPartsCost(tx, wo._id, wo.status === "COMPLETED" || wo.status === "VERIFIED");
  if (mode === "late") await flagLateEvidence(tx, wo, ctx.userId, "part", occurredAt);
  await emitWorkOrderChanged(tx, wo._id, wo.status);
}

/** Keeps `partsCostCents` current once the job is closed (late parts); open jobs compute it at completion. */
async function refreshPartsCost(tx: Tx, workOrderId: string, closed: boolean): Promise<void> {
  if (!closed) return;
  const scoped = dbTx(tx);
  const parts = await scoped.db.work_order_parts.find({ workOrderId, deletedAt: null }).toArray();
  await scoped.db.work_orders.updateOne({ _id: workOrderId }, { $set: { partsCostCents: partsCostCents(parts), ...stampUpdate(scoped, new Date()) } });
}
