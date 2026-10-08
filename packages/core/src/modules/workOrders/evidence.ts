import type { ChecklistItem, ChecklistResponse } from "@agrorende/contracts/checklist";
import type { Tx } from "@agrorende/contracts/seams";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { createNotification, officeRecipients } from "../../notify/index.js";
import { dbTx } from "../assets/kit.js";
import { asSyncTx, isOffice, recordWoActivity, TERMINAL_STATUSES, type WorkOrderDoc } from "./common.js";

export type EvidenceMode = "live" | "late";

/**
 * BR-F2-4 / EC-WO-15: evidence (checklist answers, parts, photos) is never rejected for state.
 * The assignee writes live evidence; a previous assignee, or anyone after the job closed, writes
 * late evidence that is flagged for office review. The office may always add evidence.
 */
export function evidenceMode(wo: WorkOrderDoc, ctx: Pick<Ctx, "userId" | "role">): EvidenceMode {
  const isAssignee = (wo.assigneeId ?? null) === ctx.userId;
  const wasAssignee = (wo.previousAssigneeIds ?? []).includes(ctx.userId);
  if (!isAssignee && !wasAssignee && !isOffice(ctx.role)) reject("FORBIDDEN", { entityType: "WORK_ORDER", id: wo._id });
  if (TERMINAL_STATUSES.includes(wo.status)) return "late";
  if (!isAssignee && !isOffice(ctx.role)) return "late";
  return "live";
}

/** Flags the job, writes the activity and tells the office that late evidence arrived. */
export async function flagLateEvidence(tx: Tx, wo: WorkOrderDoc, actorId: string, kind: string, occurredAt: Date): Promise<void> {
  const scoped = dbTx(tx);
  if (wo.hasLateEvidence !== true) {
    await scoped.db.work_orders.updateOne({ _id: wo._id }, { $set: { hasLateEvidence: true, syncVersion: scoped.syncVersion, updatedAt: new Date() } });
  }
  await recordWoActivity(tx, {
    workOrderId: wo._id,
    action: "workOrder.lateEvidence",
    actorId,
    fromStatus: null,
    toStatus: null,
    occurredAt,
    meta: { kind, status: wo.status },
  });
  const office = (await officeRecipients(asSyncTx(tx), scoped.orgId, ["ADMIN", "MANAGER"])).filter((userId) => userId !== actorId);
  if (office.length > 0) {
    await createNotification(asSyncTx(tx), {
      type: "LATE_EVIDENCE",
      userIds: office,
      entity: { entityType: "WORK_ORDER", entityId: wo._id },
      params: { title: `${wo.number} · ${wo.title}` },
    });
  }
}

/** EC-WO-09: a safety-critical item answered FAIL stops the job until the office releases it. */
export function failedSafetyItems(snapshot: readonly ChecklistItem[] | null | undefined, responses: readonly ChecklistResponse[]): string[] {
  if (snapshot === null || snapshot === undefined) return [];
  const byKey = new Map(responses.map((response) => [response.key, response]));
  return snapshot.filter((item) => item.isSafetyCritical && byKey.get(item.key)?.value === "FAIL").map((item) => item.key);
}

/** Merge by item key; the newer `answeredAt` wins (A§7.3). */
export function mergeResponses(current: readonly ChecklistResponse[], incoming: readonly ChecklistResponse[]): ChecklistResponse[] {
  const merged = new Map(current.map((response) => [response.key, response]));
  for (const response of incoming) {
    const existing = merged.get(response.key);
    if (existing === undefined || Date.parse(response.answeredAt) >= Date.parse(existing.answeredAt)) merged.set(response.key, response);
  }
  return [...merged.values()];
}
