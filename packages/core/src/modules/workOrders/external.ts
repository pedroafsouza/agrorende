import { z } from "zod";
import type { WorkOrderDTO } from "@agrorende/contracts/dto";
import type { WorkOrderStatus } from "@agrorende/contracts/enums";
import type { Tx } from "@agrorende/contracts/seams";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { assertVersion, dbTx, parseInput, stampUpdate } from "../assets/kit.js";
import { emitWorkOrderChanged, loadWorkOrder, recordWoActivity, redactForRole, requireOffice, sameTenant, toWorkOrderDto, workOrderSettings } from "./common.js";

/**
 * External (third-party) costs of a work order, P1 ERP-03 (`PATCH /work-orders/:id/external-cost`, A§8).
 * Kept in its own file so the wave 6 owner (T14) extends it without touching `service.ts`.
 */
export const ExternalCostInputSchema = z.object({
  externalCostCents: z.number().int().nonnegative(),
  externalCostNote: z.string().optional(),
});
export type ExternalCostInput = z.infer<typeof ExternalCostInputSchema>;

/** Writes the external cost; callers have already checked the status. Bumps `syncVersion`. */
async function writeExternalCost(tx: Tx, ctx: Ctx, id: string, raw: unknown, ifMatch?: string | null): Promise<WorkOrderDTO> {
  const scoped = dbTx(tx);
  sameTenant(scoped, ctx);
  requireOffice(ctx);
  const input = parseInput(ExternalCostInputSchema, raw);
  const wo = await loadWorkOrder(tx, id);
  assertVersion(wo, ifMatch);
  if (wo.status === "CANCELLED") reject("WO_CANCELLED", { id });
  const now = new Date();
  await scoped.db.work_orders.updateOne(
    { _id: id },
    { $set: { externalCostCents: input.externalCostCents, externalCostNote: input.externalCostNote ?? null, ...stampUpdate(scoped, now) } },
  );
  await recordWoActivity(tx, {
    workOrderId: id,
    action: "workOrder.externalCost",
    actorId: ctx.userId,
    fromStatus: null,
    toStatus: null,
    occurredAt: now,
    meta: { from: wo.externalCostCents ?? null, to: input.externalCostCents },
  });
  await emitWorkOrderChanged(tx, id, wo.status);
  const settings = await workOrderSettings(ctx.orgId);
  return redactForRole(toWorkOrderDto(await loadWorkOrder(tx, id)), ctx.role, settings);
}

/** Statuses from which the office may record external costs (A§8: "from COMPLETED on"). */
export const EXTERNAL_COST_STATUSES: readonly WorkOrderStatus[] = ["COMPLETED", "VERIFIED"];

export function canEditExternalCost(status: WorkOrderStatus): boolean {
  return EXTERNAL_COST_STATUSES.includes(status);
}

/**
 * `PATCH /work-orders/:id/external-cost` (T14.4): office-only, needs `If-Match`, and works from
 * COMPLETED on. Earlier states answer `INVALID_TRANSITION`, a cancelled job `WO_CANCELLED`.
 */
export async function setExternalCost(tx: Tx, ctx: Ctx, id: string, raw: unknown, ifMatch?: string | null): Promise<WorkOrderDTO> {
  sameTenant(dbTx(tx), ctx);
  requireOffice(ctx);
  const wo = await loadWorkOrder(tx, id);
  if (wo.status === "CANCELLED") reject("WO_CANCELLED", { id });
  if (!canEditExternalCost(wo.status)) reject("INVALID_TRANSITION", { from: wo.status, action: "externalCost" });
  return writeExternalCost(tx, ctx, id, raw, ifMatch);
}

/** Name used by the route since T14; same rule as `setExternalCost` (CR T14-002). */
export const setExternalCostFromCompleted = setExternalCost;
