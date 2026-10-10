import type { WorkOrderDTO, WorkOrderPartDTO } from "@agrorende/contracts/dto";
import type { Priority, WorkOrderStatus } from "@agrorende/contracts/enums";
import type { Tx } from "@agrorende/contracts/seams";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { clampLimit, dbTx, pageOf, parseCursor, toDto } from "../assets/kit.js";
import { canSeeLaborCost, loadWorkOrder, redactForRole, requireOffice, sameTenant, toWorkOrderDto, workOrderSettings, ACTIVE_STATUSES, type WorkOrderDoc } from "./common.js";
import { slaState, type SlaState } from "./sla.js";

export type DueFilter = "overdue" | "atRisk" | "today" | "week";

export interface WorkOrderListFilters {
  readonly status?: string | null;
  readonly assigneeId?: string | null;
  readonly priority?: Priority | null;
  readonly siteId?: string | null;
  readonly assetId?: string | null;
  readonly due?: string | null;
  readonly q?: string | null;
  readonly cursor?: string | null;
  readonly limit?: number | null;
}

export interface WorkOrderListItem extends WorkOrderDTO {
  readonly sla: SlaState;
  /** Display names resolved for the board and table; `null` when the reference is empty or deleted. */
  readonly assetName?: string | null;
  readonly assetCode?: string | null;
  readonly assigneeName?: string | null;
  readonly siteName?: string | null;
}

const STATUSES: readonly WorkOrderStatus[] = ["OPEN", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "VERIFIED", "CANCELLED"];

function parseStatuses(value: string | null | undefined): WorkOrderStatus[] | null {
  if (value === null || value === undefined || value.length === 0) return null;
  if (value === "active") return [...ACTIVE_STATUSES];
  const list = value.split(",").map((part) => part.trim().toUpperCase());
  const bad = list.filter((part) => !STATUSES.includes(part as WorkOrderStatus));
  if (bad.length > 0) reject("VALIDATION_FAILED", { fieldErrors: { status: ["invalid"] } });
  return list as WorkOrderStatus[];
}

/** `GET /work-orders` (office). Sorted by due date (nulls last), then number, newest first on ties. */
export async function list(tx: Tx, ctx: Ctx, filters: WorkOrderListFilters = {}): Promise<{ items: readonly WorkOrderListItem[]; nextCursor: string | null }> {
  const scoped = dbTx(tx);
  sameTenant(scoped, ctx);
  requireOffice(ctx);
  const settings = await workOrderSettings(ctx.orgId);
  const now = new Date();
  const filter: Record<string, unknown> = { deletedAt: null };
  const statuses = parseStatuses(filters.status);
  if (statuses !== null) filter.status = { $in: statuses };
  if (filters.assigneeId === "none") filter.assigneeId = null;
  else if (filters.assigneeId) filter.assigneeId = filters.assigneeId;
  if (filters.priority) filter.priority = filters.priority;
  if (filters.siteId) filter.siteId = filters.siteId;
  if (filters.assetId) filter.assetId = filters.assetId;
  const due = filters.due ?? null;
  if (due !== null && due.length > 0) {
    if (!["overdue", "atRisk", "today", "week"].includes(due)) reject("VALIDATION_FAILED", { fieldErrors: { due: ["invalid"] } });
    filter.status = statuses === null ? { $in: [...ACTIVE_STATUSES] } : { $in: statuses.filter((status) => ACTIVE_STATUSES.includes(status)) };
    if (due === "overdue") filter.dueAt = { $lt: now };
    if (due === "today") filter.dueAt = { $lt: new Date(now.getTime() + 24 * 3_600_000) };
    if (due === "week") filter.dueAt = { $lt: new Date(now.getTime() + 7 * 24 * 3_600_000) };
    if (due === "atRisk") filter.dueAt = { $ne: null };
  }
  if (filters.q) {
    const text = filters.q.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    filter.$or = [{ number: { $regex: text, $options: "i" } }, { title: { $regex: text, $options: "i" } }];
  }
  const limit = clampLimit(filters.limit);
  const offset = parseCursor(filters.cursor);
  const toItem = (row: WorkOrderDoc): WorkOrderListItem => ({ ...redactForRole(toWorkOrderDto(row), ctx.role, settings), sla: slaState(row, now, settings.sla) });
  if (due === "atRisk") {
    // The SLA state is computed in code, so this view filters the (active, dated) jobs in memory.
    const rows = (await scoped.db.work_orders.find(filter, { sort: LIST_SORT }).toArray()) as WorkOrderDoc[];
    const items = rows.map(toItem).filter((item) => item.sla === "AT_RISK" || item.sla === "BREACHED");
    const page = pageOf(items.slice(offset, offset + limit + 1), offset, limit);
    return { ...page, items: await withNames(tx, page.items) };
  }
  const rows = await pageDatedThenUndated(scoped, filter, offset, limit + 1);
  const page = pageOf(rows.map(toItem), offset, limit);
  return { ...page, items: await withNames(tx, page.items) };
}

const LIST_SORT = { dueAt: 1, createdAt: -1, _id: 1 } as const;

/**
 * Reads one page of the list order "due date ascending, jobs without a due date last" straight from
 * the database: dated jobs first, then undated ones, each with skip and limit, so the list never
 * loads the whole organisation.
 */
async function pageDatedThenUndated(scoped: ReturnType<typeof dbTx>, filter: Record<string, unknown>, offset: number, take: number): Promise<WorkOrderDoc[]> {
  const wo = scoped.db.work_orders;
  const datedFilter = filter.dueAt === undefined ? { ...filter, dueAt: { $ne: null } } : filter;
  const dated = (await wo.find(datedFilter, { sort: LIST_SORT, skip: offset, limit: take }).toArray()) as WorkOrderDoc[];
  // A due-date range already excludes undated jobs.
  if (dated.length === take || filter.dueAt !== undefined) return dated;
  const datedTotal = dated.length > 0 || offset === 0 ? offset + dated.length : await wo.countDocuments(datedFilter);
  const undated = (await wo
    .find({ ...filter, dueAt: null }, { sort: LIST_SORT, skip: Math.max(0, offset - datedTotal), limit: take - dated.length })
    .toArray()) as WorkOrderDoc[];
  return [...dated, ...undated];
}

async function withNames(tx: Tx, items: readonly WorkOrderListItem[]): Promise<WorkOrderListItem[]> {
  const scoped = dbTx(tx);
  const ids = (key: "assetId" | "assigneeId" | "siteId") => [...new Set(items.map((item) => item[key]).filter((value): value is string => typeof value === "string"))];
  const [assets, users, sites] = await Promise.all([
    scoped.db.assets.find({ _id: { $in: ids("assetId") } }, { projection: { name: 1, code: 1 } }).toArray(),
    scoped.db.users.find({ _id: { $in: ids("assigneeId") } }, { projection: { name: 1 } }).toArray(),
    scoped.db.sites.find({ _id: { $in: ids("siteId") } }, { projection: { name: 1 } }).toArray(),
  ]);
  const assetById = new Map(assets.map((asset) => [asset._id, asset]));
  const userById = new Map(users.map((user) => [user._id, user.name]));
  const siteById = new Map(sites.map((site) => [site._id, site.name]));
  return items.map((item) => {
    const asset = item.assetId == null ? undefined : assetById.get(item.assetId);
    return {
      ...item,
      assetName: asset?.name ?? null,
      assetCode: typeof asset?.code === "string" ? asset.code : null,
      assigneeName: item.assigneeId == null ? null : (userById.get(item.assigneeId) ?? null),
      siteName: item.siteId == null ? null : (siteById.get(item.siteId) ?? null),
    };
  });
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
  readonly parts: WorkOrderPartDTO[];
  readonly timeline: WorkOrderTimelineEntry[];
  readonly media: WorkOrderMediaItem[];
  readonly names: Record<string, string>;
  readonly canSeeLaborCost: boolean;
}

/** `GET /work-orders/:id`. */
export async function get(tx: Tx, ctx: Ctx, id: string): Promise<WorkOrderListItem> {
  const scoped = dbTx(tx);
  sameTenant(scoped, ctx);
  requireOffice(ctx);
  const wo = await loadWorkOrder(tx, id);
  const settings = await workOrderSettings(ctx.orgId);
  const [item] = await withNames(tx, [{ ...redactForRole(toWorkOrderDto(wo), ctx.role, settings), sla: slaState(wo, new Date(), settings.sla) }]);
  return item ?? reject("NOT_FOUND", { entityType: "WORK_ORDER", id });
}

export async function listParts(tx: Tx, workOrderId: string): Promise<WorkOrderPartDTO[]> {
  const rows = await dbTx(tx).db.work_order_parts.find({ workOrderId, deletedAt: null }, { sort: { createdAt: 1, _id: 1 } }).toArray();
  return rows.map((row) => toDto(row) as unknown as WorkOrderPartDTO);
}

/** Detail for the office page: job, parts, timeline (oldest first), media and the names they reference. */
export async function detail(tx: Tx, ctx: Ctx, id: string): Promise<WorkOrderDetail> {
  const scoped = dbTx(tx);
  const workOrder = await get(tx, ctx, id);
  const settings = await workOrderSettings(ctx.orgId);
  const parts = await listParts(tx, id);
  const events = await scoped.db.activity_events.find({ entityType: "WORK_ORDER", entityId: id }, { sort: { occurredAt: 1, receivedAt: 1 } }).toArray();
  const media = await scoped.db.media.find({ "parent.type": "WORK_ORDER", "parent.id": id, deletedAt: null }, { sort: { capturedAt: 1 } }).toArray();
  const userIds = new Set<string>();
  for (const event of events) if (typeof event.actorId === "string") userIds.add(event.actorId);
  for (const userId of [workOrder.assigneeId, workOrder.createdById, workOrder.verifiedById, ...(workOrder.previousAssigneeIds ?? [])]) if (typeof userId === "string") userIds.add(userId);
  const users = userIds.size === 0 ? [] : await scoped.db.users.find({ _id: { $in: [...userIds] } }, { projection: { _id: 1, name: 1 } }).toArray();
  const names: Record<string, string> = Object.fromEntries(users.map((user) => [user._id, user.name]));
  return {
    workOrder,
    parts,
    timeline: events.map((event) => ({
      id: event._id,
      action: event.action,
      actorId: event.actorId ?? null,
      actorName: typeof event.actorId === "string" ? (names[event.actorId] ?? null) : null,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus ?? null,
      occurredAt: event.occurredAt.toISOString(),
      meta: (event.meta ?? {}) as Record<string, unknown>,
    })),
    media: media.map((row) => ({
      id: row._id,
      tag: row.tag,
      kind: row.kind,
      status: row.status,
      caption: row.caption ?? null,
      checklistItemKey: row.checklistItemKey ?? null,
      isLateEvidence: row.isLateEvidence === true,
      capturedAt: row.capturedAt.toISOString(),
    })),
    names,
    canSeeLaborCost: canSeeLaborCost(ctx.role, settings),
  };
}

