import { collections, getDb, type SyncTx as DbSyncTx, type User, type WorkOrder } from "@agrorende/db";
import type { WorkOrderDTO } from "@agrorende/contracts/dto";
import type { Role, WorkOrderStatus } from "@agrorende/contracts/enums";
import { RealtimeServerEvents, opsRoom, orgRoom } from "@agrorende/contracts/realtime";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { writeOutbox } from "../../notify/index.js";
import type { SyncTx } from "../../sync/types.js";
import { dbTx, toDto, writeActivity } from "../assets/kit.js";
import { slaSettingsOf, type SlaSettings } from "./sla.js";

export type WorkOrderDoc = WorkOrder;

export const OFFICE: readonly Role[] = ["ADMIN", "MANAGER"];
export const TERMINAL_STATUSES: readonly WorkOrderStatus[] = ["COMPLETED", "VERIFIED", "CANCELLED"];
/** Statuses in which a work order still counts as open work for an assignee or an asset. */
export const ACTIVE_STATUSES: readonly WorkOrderStatus[] = ["OPEN", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isOffice(role: Role): boolean {
  return OFFICE.includes(role);
}

export function requireOffice(ctx: Pick<Ctx, "role">): void {
  if (!isOffice(ctx.role)) reject("OFFICE_ROLE_REQUIRED", { role: ctx.role });
}

export function sameTenant(tx: DbSyncTx, ctx: Pick<Ctx, "orgId">): void {
  if (tx.orgId !== ctx.orgId) reject("FORBIDDEN", { orgId: ctx.orgId });
}

export function formatWoNumber(value: number): string {
  return `WO-${String(value).padStart(6, "0")}`;
}

export async function loadWorkOrder(tx: unknown, id: string): Promise<WorkOrderDoc> {
  const doc = await dbTx(tx).db.work_orders.findOne({ _id: id, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "WORK_ORDER", id });
  return doc as WorkOrderDoc;
}

export interface WorkOrderSettings {
  readonly sla: SlaSettings;
  readonly requireWoSignature: boolean;
  readonly showLaborCostToManager: boolean;
  readonly officePhone: string | null;
}

/** Organisation settings that drive work orders; read outside the transaction (settings are not written here). */
export async function workOrderSettings(orgId: string): Promise<WorkOrderSettings> {
  const org = await collections.organizations(await getDb()).findOne({ _id: orgId }, { projection: { settings: 1 } });
  const settings = (org?.settings ?? {}) as { requireWoSignature?: unknown; showLaborCostToManager?: unknown; officePhone?: unknown };
  return {
    sla: slaSettingsOf(settings),
    requireWoSignature: settings.requireWoSignature !== false,
    showLaborCostToManager: settings.showLaborCostToManager !== false,
    officePhone: typeof settings.officePhone === "string" ? settings.officePhone : null,
  };
}

export function toWorkOrderDto(doc: WorkOrderDoc): WorkOrderDTO {
  return toDto<WorkOrderDTO>(doc as unknown as { _id: string; syncVersion: number } & Record<string, unknown>);
}

/** Labour cost is shown to ADMIN, and to MANAGER only when `showLaborCostToManager` is on (ARCHITECTURE §15). */
export function canSeeLaborCost(role: Role, settings: Pick<WorkOrderSettings, "showLaborCostToManager">): boolean {
  if (role === "ADMIN") return true;
  if (role === "MANAGER") return settings.showLaborCostToManager;
  return false;
}

export function redactForRole(dto: WorkOrderDTO, role: Role, settings: Pick<WorkOrderSettings, "showLaborCostToManager">): WorkOrderDTO {
  if (canSeeLaborCost(role, settings)) return dto;
  return { ...dto, laborCostCents: null };
}

/** Field of the status timestamp that a transition into `to` stamps. */
export function statusStamp(to: WorkOrderStatus, at: Date): Partial<Record<keyof WorkOrderDoc, Date>> {
  switch (to) {
    case "ASSIGNED":
      return { assignedAt: at };
    case "ACCEPTED":
      return { acceptedAt: at };
    case "EN_ROUTE":
      return { enRouteAt: at };
    case "ON_SITE":
      return { arrivedAt: at };
    case "COMPLETED":
      return { completedAt: at };
    case "VERIFIED":
      return { verifiedAt: at };
    case "CANCELLED":
      return { cancelledAt: at };
    default:
      return {};
  }
}

export interface StatusActivity {
  readonly workOrderId: string;
  readonly action: string;
  readonly actorId: string | null;
  readonly fromStatus: WorkOrderStatus | null;
  readonly toStatus: WorkOrderStatus | null;
  readonly occurredAt: Date;
  readonly meta?: Record<string, unknown>;
}

export async function recordWoActivity(tx: unknown, row: StatusActivity): Promise<void> {
  await writeActivity(dbTx(tx), {
    entityType: "WORK_ORDER",
    entityId: row.workOrderId,
    action: row.action,
    actorId: row.actorId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    occurredAt: row.occurredAt,
    meta: row.meta ?? {},
  });
}

/** Realtime `entity:changed` for the office boards and the ops map. */
export async function emitWorkOrderChanged(tx: unknown, workOrderId: string, status: WorkOrderStatus): Promise<void> {
  const scoped = dbTx(tx);
  await writeOutbox(scoped as unknown as SyncTx, RealtimeServerEvents.entityChanged, {
    rooms: [orgRoom(scoped.orgId), opsRoom(scoped.orgId)],
    data: { entityType: "WORK_ORDER", id: workOrderId, status, version: String(scoped.syncVersion) },
  });
}

export function asSyncTx(tx: unknown): SyncTx {
  return dbTx(tx) as unknown as SyncTx;
}

export type AssigneeProblem = "NOT_FOUND" | "UNAVAILABLE" | "OFF_DUTY" | null;

/** Any active, joined, not disabled or archived user of the organisation can be assigned (Round 4). */
export function assigneeProblem(user: User | null, now: Date = new Date()): AssigneeProblem {
  if (user === null || (user.deletedAt ?? null) !== null) return "NOT_FOUND";
  if (!user.isActive || user.joinedAt === null || user.joinedAt === undefined || (user.disabledAt ?? null) !== null || (user.archivedAt ?? null) !== null) {
    return "UNAVAILABLE";
  }
  if (user.joinedAt.getTime() > now.getTime()) return "UNAVAILABLE";
  if (user.dutyStatus !== "ON_DUTY") return "OFF_DUTY";
  return null;
}
