import type { WorkOrderDTO } from "@agrorende/contracts/dto";
import type { Priority, WorkOrderStatus } from "@agrorende/contracts/enums";

export type SlaState = "NONE" | "OK" | "AT_RISK" | "BREACHED";

export interface WorkOrderListItem extends WorkOrderDTO {
  readonly sla: SlaState;
  readonly assetName?: string | null;
  readonly assetCode?: string | null;
  readonly assigneeName?: string | null;
  readonly siteName?: string | null;
}

export interface WorkOrderPart {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitCostCents?: number | null;
  readonly partNumber?: string | null;
}

export interface WorkOrderTimelineEntry {
  readonly id: string;
  readonly action: string;
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly occurredAt: string;
  readonly meta: Record<string, unknown>;
}

export interface WorkOrderMediaItem {
  readonly id: string;
  readonly tag: string;
  readonly kind: string;
  readonly status: string;
  readonly caption: string | null;
  readonly checklistItemKey: string | null;
  readonly isLateEvidence: boolean;
  readonly capturedAt: string;
}

export interface WorkOrderDetail {
  readonly workOrder: WorkOrderListItem;
  readonly parts: WorkOrderPart[];
  readonly timeline: WorkOrderTimelineEntry[];
  readonly media: WorkOrderMediaItem[];
  readonly names: Record<string, string>;
  readonly canSeeLaborCost: boolean;
}

export interface Suggestion {
  readonly userId: string;
  readonly name: string;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly distanceKm?: number | null;
  readonly openWorkOrders: number;
  readonly online: boolean;
}

export const WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = ["OPEN", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "VERIFIED", "CANCELLED"];
export const PRIORITIES: readonly Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const WORK_ORDER_TYPES = ["CORRECTIVE", "PREVENTIVE", "INSPECTION"] as const;
export const DUE_FILTERS = ["overdue", "atRisk", "today", "week"] as const;

/** Board columns (WO-02): statuses grouped by who must act next. */
export const BOARD_COLUMNS: ReadonlyArray<{ key: string; statuses: readonly WorkOrderStatus[] }> = [
  { key: "unassigned", statuses: ["OPEN"] },
  { key: "assigned", statuses: ["ASSIGNED", "ACCEPTED"] },
  { key: "inField", statuses: ["EN_ROUTE", "ON_SITE", "IN_PROGRESS"] },
  { key: "onHold", statuses: ["ON_HOLD"] },
  { key: "toVerify", statuses: ["COMPLETED"] },
];

const ACTIVE = new Set<WorkOrderStatus>(["OPEN", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD"]);

export type OfficeAction = "assign" | "reassign" | "releaseHold" | "verify" | "reopen" | "cancel" | "externalCost";

/** Office actions offered for a job (A§6.2 transition table, office side; EC-WO-09 safety release). */
export function officeActions(wo: { readonly status: WorkOrderStatus; readonly holdReason?: string | null }): OfficeAction[] {
  const { status } = wo;
  const actions: OfficeAction[] = [];
  if (status === "OPEN") actions.push("assign");
  if (ACTIVE.has(status) && status !== "OPEN") actions.push("reassign");
  if (status === "ON_HOLD" && wo.holdReason === "SAFETY") actions.push("releaseHold");
  if (status === "COMPLETED") actions.push("verify", "reopen");
  if (status === "COMPLETED" || status === "VERIFIED") actions.push("externalCost");
  if (ACTIVE.has(status)) actions.push("cancel");
  return actions;
}

export function isActive(status: WorkOrderStatus): boolean {
  return ACTIVE.has(status);
}

/** `POST /work-orders` body from the manual form; blank fields are left out. */
export interface NewWorkOrderValues {
  readonly title: string;
  readonly type: (typeof WORK_ORDER_TYPES)[number];
  readonly priority: Priority;
  readonly assetId: string | null;
  readonly siteId: string | null;
  readonly customerId: string | null;
  readonly assigneeId: string | null;
  readonly dueAt: string;
  readonly scheduledFor: string;
  readonly description: string;
}

export const EMPTY_NEW_WORK_ORDER: NewWorkOrderValues = { title: "", type: "CORRECTIVE", priority: "MEDIUM", assetId: null, siteId: null, customerId: null, assigneeId: null, dueAt: "", scheduledFor: "", description: "" };

export function newWorkOrderBody(values: NewWorkOrderValues, confirmOffDuty = false): Record<string, unknown> {
  const text = (value: string) => (value.trim().length > 0 ? value.trim() : undefined);
  return {
    source: "MANUAL",
    title: values.title.trim(),
    type: values.type,
    priority: values.priority,
    assetId: values.assetId ?? undefined,
    siteId: values.siteId ?? undefined,
    customerId: values.customerId ?? undefined,
    assigneeId: values.assigneeId ?? undefined,
    dueAt: values.dueAt.length > 0 ? new Date(values.dueAt).toISOString() : undefined,
    scheduledFor: values.scheduledFor.length > 0 ? values.scheduledFor : undefined,
    description: text(values.description),
    confirmOffDuty: confirmOffDuty ? true : undefined,
  };
}

/** Minutes as "1 h 05 min" style parts for the times panel. */
export function splitMinutes(minutes: number | null | undefined): { hours: number; minutes: number } | null {
  if (minutes === null || minutes === undefined) return null;
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}
