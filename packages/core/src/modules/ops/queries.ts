import { collections, getDb } from "@agrorende/db";
import type { Priority } from "@agrorende/contracts/enums";
import type { LiveOperator } from "@agrorende/contracts/seams";
import type { Redis } from "ioredis";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { listLocations } from "../locations/queries.js";
import { liveSnapshot } from "../locations/service.js";
import type { Db } from "../locations/types.js";
import {
  KPI_RANGES,
  type AlertType,
  type KpiRange,
  type LiveAssetDTO,
  type LiveOperatorDTO,
  type LiveRentalDTO,
  type LiveReportDTO,
  type LiveWorkOrderDTO,
  type OperatorTrailDTO,
  type OpsActivityDTO,
  type OpsAlertDTO,
  type OpsAlertsDTO,
  type OpsKpisDTO,
  type OpsLiveDTO,
} from "./dto.js";
import {
  OPEN_WO_STATUSES,
  TERMINAL_WO_STATUSES,
  WORKING_WO_STATUSES,
  atRiskDueCutoff,
  isOperatorStale,
  isRentalOverdue,
  median,
  opsSettingsOf,
  slaStateOf,
  startOfZonedDay,
  type OpsSettings,
} from "./rules.js";

export type OpsCtx = Pick<Ctx, "orgId">;

export interface OpsDeps {
  readonly db?: Db;
  readonly redis?: Redis;
  readonly dbName?: string;
  readonly now?: Date;
  /** Override for tests; defaults to the real T05 `locations.liveSnapshot` seam. */
  readonly liveSnapshot?: (orgId: string) => Promise<LiveOperator[]>;
}

const HOUR_MS = 3_600_000;
const PRIORITIES: readonly Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const OPEN_REPORT_STATUSES = ["SUBMITTED", "IN_REVIEW"] as const;
const LIVE_LIMIT = 2_000;
const ALERT_LIMIT = 500;

export async function opsDb(deps: Pick<OpsDeps, "db" | "dbName">): Promise<Db> {
  return deps.db ?? (await getDb(deps.dbName));
}

export async function loadOpsSettings(db: Db, orgId: string): Promise<OpsSettings> {
  const org = await collections.organizations(db).findOne({ _id: orgId }, { projection: { timezone: 1, settings: 1 } });
  return opsSettingsOf(org);
}

function iso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

/** MongoDB filter for non-terminal WOs whose SLA is at risk or breached under the org settings. */
function slaRiskFilter(orgId: string, settings: OpsSettings, now: Date) {
  return {
    organizationId: orgId,
    deletedAt: null,
    status: { $in: [...OPEN_WO_STATUSES] },
    $or: PRIORITIES.map((priority) => ({ priority, dueAt: { $ne: null, $lte: atRiskDueCutoff(priority, settings, now) } })),
  };
}

/** Devices holding unsynced data for longer than `staleSyncAlertHours` (OPS-05, OFF-11). */
export function staleDeviceFilter(orgId: string, cutoff: Date) {
  return {
    organizationId: orgId,
    $or: [
      { oldestPendingAt: { $ne: null, $lt: cutoff } },
      { lastSyncAt: { $lt: cutoff }, $or: [{ pendingMutations: { $gt: 0 } }, { pendingUploads: { $gt: 0 } }] },
    ],
  };
}

/** `GET /ops/live`: map snapshot (operators from the live hash plus DB, open WOs, active rentals, open reports, located assets). */
export async function getLive(ctx: OpsCtx, deps: OpsDeps = {}): Promise<OpsLiveDTO> {
  const db = await opsDb(deps);
  const now = deps.now ?? new Date();
  const orgId = ctx.orgId;
  const settings = await loadOpsSettings(db, orgId);
  const snapshot =
    deps.liveSnapshot ??
    ((id: string) =>
      liveSnapshot(id, { db, now, ...(deps.redis === undefined ? {} : { redis: deps.redis }), ...(deps.dbName === undefined ? {} : { dbName: deps.dbName }) }));

  const [operators, workOrders, reports, rentals, assets] = await Promise.all([
    snapshot(orgId),
    collections
      .workOrders(db)
      .find({ organizationId: orgId, deletedAt: null, status: { $in: [...OPEN_WO_STATUSES] }, destLat: { $ne: null }, destLng: { $ne: null } })
      .sort({ dueAt: 1 })
      .limit(LIVE_LIMIT)
      .toArray(),
    collections
      .fieldReports(db)
      .find({ organizationId: orgId, deletedAt: null, status: { $in: [...OPEN_REPORT_STATUSES] }, lat: { $ne: null }, lng: { $ne: null } })
      .sort({ receivedAt: -1 })
      .limit(LIVE_LIMIT)
      .toArray(),
    collections.rentals(db).find({ organizationId: orgId, deletedAt: null, status: "ACTIVE" }).sort({ plannedEnd: 1 }).limit(LIVE_LIMIT).toArray(),
    collections
      .assets(db)
      .find({ organizationId: orgId, deletedAt: null, condition: { $ne: "RETIRED" }, lastLat: { $ne: null }, lastLng: { $ne: null } })
      .limit(LIVE_LIMIT)
      .toArray(),
  ]);

  const operatorIds = operators.map((o) => o.userId);
  const [devices, activeWos] = await Promise.all([
    operatorIds.length === 0
      ? []
      : collections
          .devices(db)
          .find({ organizationId: orgId, userId: { $in: operatorIds } }, { projection: { userId: 1, lastSeenAt: 1 } })
          .sort({ lastSeenAt: -1 })
          .toArray(),
    operatorIds.length === 0
      ? []
      : collections
          .workOrders(db)
          .find({ organizationId: orgId, deletedAt: null, assigneeId: { $in: operatorIds }, status: { $in: [...WORKING_WO_STATUSES] } }, { projection: { assigneeId: 1 } })
          .toArray(),
  ]);
  const deviceByUser = new Map<string, string>();
  for (const device of devices) if (!deviceByUser.has(device.userId)) deviceByUser.set(device.userId, device._id);
  const woByUser = new Map<string, string>();
  for (const wo of activeWos) if (typeof wo.assigneeId === "string" && !woByUser.has(wo.assigneeId)) woByUser.set(wo.assigneeId, wo._id);

  const assetPoints = new Map(assets.map((a) => [a._id, a]));
  const siteIds = [...new Set(rentals.map((r) => r.siteId ?? r.deliverySiteId).filter((id): id is string => typeof id === "string"))];
  const sites = siteIds.length === 0 ? [] : await collections.sites(db).find({ organizationId: orgId, _id: { $in: siteIds } }, { projection: { lat: 1, lng: 1 } }).toArray();
  const sitePoints = new Map(sites.map((s) => [s._id, s]));

  const operatorDtos: LiveOperatorDTO[] = operators.map((o) => ({
    userId: o.userId,
    name: o.name,
    lat: o.lat,
    lng: o.lng,
    accuracyM: o.accuracyM ?? null,
    heading: o.heading ?? null,
    speedMps: o.speedMps ?? null,
    recordedAt: o.recordedAt.toISOString(),
    lastSeenAt: iso(o.lastSeenAt),
    dutyStatus: o.dutyStatus,
    state: o.state,
    stale: isOperatorStale(o.recordedAt, o.lastSeenAt, now),
    deviceId: deviceByUser.get(o.userId) ?? null,
    activeWorkOrderId: woByUser.get(o.userId) ?? null,
  }));

  const woDtos: LiveWorkOrderDTO[] = workOrders.map((wo) => ({
    id: wo._id,
    number: wo.number,
    title: wo.title,
    status: wo.status,
    priority: wo.priority,
    assigneeId: wo.assigneeId ?? null,
    assetId: wo.assetId ?? null,
    lat: wo.destLat ?? 0,
    lng: wo.destLng ?? 0,
    dueAt: iso(wo.dueAt),
    sla: slaStateOf(wo, settings, now),
  }));

  const reportDtos: LiveReportDTO[] = reports.map((r) => ({
    id: r._id,
    number: r.number ?? null,
    title: r.title,
    status: r.status,
    priority: r.priority,
    machineOperable: r.machineOperable,
    critical: r.priority === "CRITICAL" || !r.machineOperable,
    assetId: r.assetId ?? null,
    lat: r.lat ?? 0,
    lng: r.lng ?? 0,
    receivedAt: (r.receivedAt instanceof Date ? r.receivedAt : r.createdAt).toISOString(),
  }));

  const rentalDtos: LiveRentalDTO[] = rentals.map((r) => {
    const site = sitePoints.get(r.siteId ?? r.deliverySiteId ?? "");
    const asset = assetPoints.get(r.assetId);
    return {
      id: r._id,
      number: r.number,
      direction: r.direction,
      assetId: r.assetId,
      customerId: r.customerId,
      plannedEnd: r.plannedEnd.toISOString(),
      overdue: isRentalOverdue(r, settings.rentalGraceHours, now),
      lat: r.deliveryLat ?? site?.lat ?? asset?.lastLat ?? null,
      lng: r.deliveryLng ?? site?.lng ?? asset?.lastLng ?? null,
    };
  });

  const assetDtos: LiveAssetDTO[] = assets.map((a) => ({
    id: a._id,
    code: a.code,
    name: a.name,
    condition: a.condition,
    rentedOut: typeof a.currentRentalId === "string",
    lat: a.lastLat ?? 0,
    lng: a.lastLng ?? 0,
  }));

  return { generatedAt: now.toISOString(), operators: operatorDtos, workOrders: woDtos, reports: reportDtos, rentals: rentalDtos, assets: assetDtos };
}

export function parseKpiRange(value: string | null | undefined): KpiRange {
  if (value === undefined || value === null || value === "") return "7d";
  if ((KPI_RANGES as readonly string[]).includes(value)) return value as KpiRange;
  return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "range", code: "invalid_enum_value" }] });
}

function rangeStart(range: KpiRange, settings: OpsSettings, now: Date): Date {
  const today = startOfZonedDay(now, settings.timezone);
  if (range === "today") return today;
  const days = range === "7d" ? 7 : 30;
  return new Date(today.getTime() - (days - 1) * 24 * HOUR_MS);
}

/** `GET /ops/kpis?range=`: the eight live counts of the KPI strip plus SLA %, MTTR and utilization. */
export async function getKpis(ctx: OpsCtx, input: { readonly range?: string | null } = {}, deps: OpsDeps = {}): Promise<OpsKpisDTO> {
  const db = await opsDb(deps);
  const now = deps.now ?? new Date();
  const orgId = ctx.orgId;
  const range = parseKpiRange(input.range);
  const settings = await loadOpsSettings(db, orgId);
  const today = startOfZonedDay(now, settings.timezone);
  const from = rangeStart(range, settings, now);
  const graceCutoff = new Date(now.getTime() - settings.rentalGraceHours * HOUR_MS);
  const wo = collections.workOrders(db);
  const rentals = collections.rentals(db);
  const assets = collections.assets(db);
  const base = { organizationId: orgId, deletedAt: null };

  const [openReports, unassigned, inProgress, doneToday, slaRisk, slaBreached, activeRentals, overdue, onDuty, completed, rentable, rentedOut] = await Promise.all([
    collections.fieldReports(db).countDocuments({ ...base, status: { $in: [...OPEN_REPORT_STATUSES] } }),
    wo.countDocuments({ ...base, status: { $in: [...OPEN_WO_STATUSES] }, assigneeId: null }),
    wo.countDocuments({ ...base, status: { $in: [...WORKING_WO_STATUSES] } }),
    wo.countDocuments({ ...base, status: { $in: ["COMPLETED", "VERIFIED"] }, completedAt: { $gte: today } }),
    wo.countDocuments(slaRiskFilter(orgId, settings, now)),
    wo.countDocuments({ ...base, status: { $in: [...OPEN_WO_STATUSES] }, dueAt: { $ne: null, $lt: now } }),
    rentals.countDocuments({ ...base, status: "ACTIVE" }),
    rentals.countDocuments({ ...base, status: "ACTIVE", plannedEnd: { $lt: graceCutoff } }),
    collections.users(db).countDocuments({ ...base, isActive: { $ne: false }, dutyStatus: "ON_DUTY" }),
    wo
      .find({ ...base, status: { $in: ["COMPLETED", "VERIFIED"] }, completedAt: { $gte: from, $lte: now } }, { projection: { createdAt: 1, completedAt: 1, dueAt: 1 } })
      .toArray(),
    assets.countDocuments({ ...base, isRentable: true, condition: { $ne: "RETIRED" } }),
    assets.countDocuments({ ...base, isRentable: true, condition: { $ne: "RETIRED" }, currentRentalId: { $ne: null } }),
  ]);

  let withDue = 0;
  let onTime = 0;
  const hours: number[] = [];
  for (const row of completed) {
    const done = row.completedAt;
    if (!(done instanceof Date)) continue;
    hours.push((done.getTime() - row.createdAt.getTime()) / HOUR_MS);
    if (row.dueAt instanceof Date) {
      withDue += 1;
      if (done.getTime() <= row.dueAt.getTime()) onTime += 1;
    }
  }

  return {
    range,
    generatedAt: now.toISOString(),
    counts: {
      open_reports: openReports,
      unassigned_wos: unassigned,
      in_progress: inProgress,
      done_today: doneToday,
      sla_at_risk: slaRisk,
      active_rentals: activeRentals,
      overdue_rentals: overdue,
      on_duty: onDuty,
    },
    slaBreached,
    slaCompliancePct: withDue === 0 ? null : Math.round((onTime / withDue) * 1000) / 10,
    mttrHours: median(hours),
    utilizationPct: rentable === 0 ? null : Math.round((rentedOut / rentable) * 1000) / 10,
  };
}

/** `GET /ops/alerts`: SLA at risk or breached, overdue rentals, critical unassigned reports and stale devices (OPS-05). */
export async function getAlerts(ctx: OpsCtx, deps: OpsDeps = {}): Promise<OpsAlertsDTO> {
  const db = await opsDb(deps);
  const now = deps.now ?? new Date();
  const orgId = ctx.orgId;
  const settings = await loadOpsSettings(db, orgId);
  const graceCutoff = new Date(now.getTime() - settings.rentalGraceHours * HOUR_MS);
  const staleCutoff = new Date(now.getTime() - settings.staleSyncAlertHours * HOUR_MS);

  const [riskWos, overdueRentals, criticalReports, staleDevices] = await Promise.all([
    collections.workOrders(db).find(slaRiskFilter(orgId, settings, now)).sort({ dueAt: 1 }).limit(ALERT_LIMIT).toArray(),
    collections
      .rentals(db)
      .find({ organizationId: orgId, deletedAt: null, status: "ACTIVE", plannedEnd: { $lt: graceCutoff } })
      .sort({ plannedEnd: 1 })
      .limit(ALERT_LIMIT)
      .toArray(),
    collections
      .fieldReports(db)
      .find({ organizationId: orgId, deletedAt: null, priority: "CRITICAL", status: { $in: ["SUBMITTED", "IN_REVIEW", "MARKED_FOR_REPAIR"] } })
      .sort({ receivedAt: 1 })
      .limit(ALERT_LIMIT)
      .toArray(),
    collections.devices(db).find(staleDeviceFilter(orgId, staleCutoff)).sort({ lastSyncAt: 1 }).limit(ALERT_LIMIT).toArray(),
  ]);

  const linkedWoIds = criticalReports.map((r) => r.workOrderId).filter((id): id is string => typeof id === "string");
  const linkedWos =
    linkedWoIds.length === 0
      ? []
      : await collections.workOrders(db).find({ organizationId: orgId, _id: { $in: linkedWoIds } }, { projection: { assigneeId: 1, status: 1 } }).toArray();
  const assignedWo = new Set(linkedWos.filter((w) => typeof w.assigneeId === "string" && !TERMINAL_WO_STATUSES.includes(w.status)).map((w) => w._id));
  const userIds = [...new Set(staleDevices.map((d) => d.userId))];
  const users = userIds.length === 0 ? [] : await collections.users(db).find({ organizationId: orgId, _id: { $in: userIds } }, { projection: { name: 1 } }).toArray();
  const userName = new Map(users.map((u) => [u._id, u.name]));

  const items: OpsAlertDTO[] = [];
  const push = (type: AlertType, alert: Omit<OpsAlertDTO, "id" | "type">) => items.push({ id: `${type}:${alert.entityId}`, type, ...alert });

  for (const wo of riskWos) {
    const sla = slaStateOf(wo, settings, now);
    if (sla === null || sla === "OK" || !(wo.dueAt instanceof Date)) continue;
    push(sla === "BREACHED" ? "SLA_BREACHED" : "SLA_AT_RISK", {
      severity: sla === "BREACHED" ? "critical" : "warning",
      entityType: "WORK_ORDER",
      entityId: wo._id,
      label: `${wo.number} · ${wo.title}`,
      at: wo.dueAt.toISOString(),
      params: { number: wo.number, title: wo.title, priority: wo.priority, assigneeId: wo.assigneeId ?? null },
    });
  }
  for (const rental of overdueRentals) {
    push("OVERDUE_RENTAL", {
      severity: "critical",
      entityType: "RENTAL",
      entityId: rental._id,
      label: rental.number,
      at: rental.plannedEnd.toISOString(),
      params: { number: rental.number, direction: rental.direction, hoursLate: Math.floor((now.getTime() - rental.plannedEnd.getTime()) / HOUR_MS) },
    });
  }
  for (const report of criticalReports) {
    if (typeof report.workOrderId === "string" && assignedWo.has(report.workOrderId)) continue;
    const number = report.number ?? null;
    push("CRITICAL_UNASSIGNED_REPORT", {
      severity: "critical",
      entityType: "FIELD_REPORT",
      entityId: report._id,
      label: number === null ? report.title : `${number} · ${report.title}`,
      at: (report.receivedAt instanceof Date ? report.receivedAt : report.createdAt).toISOString(),
      params: { number, title: report.title, workOrderId: report.workOrderId ?? null },
    });
  }
  for (const device of staleDevices) {
    const since = device.oldestPendingAt ?? device.lastSyncAt ?? device.createdAt;
    const name = userName.get(device.userId) ?? null;
    push("STALE_DEVICE", {
      severity: "warning",
      entityType: "DEVICE",
      entityId: device._id,
      label: name ?? device.model ?? device._id,
      at: since.toISOString(),
      params: { userId: device.userId, userName: name, pendingMutations: device.pendingMutations, pendingUploads: device.pendingUploads, lastSyncAt: iso(device.lastSyncAt) },
    });
  }
  return { generatedAt: now.toISOString(), items };
}

interface ActivityCursor {
  readonly at: number;
  readonly id: string;
}

export function encodeActivityCursor(cursor: ActivityCursor): string {
  return Buffer.from(`${cursor.at}|${cursor.id}`, "utf8").toString("base64url");
}

export function decodeActivityCursor(token: string | null | undefined): ActivityCursor | null {
  if (token === undefined || token === null || token === "") return null;
  const [at, id] = Buffer.from(token, "base64url").toString("utf8").split("|");
  const ms = Number(at);
  if (!Number.isFinite(ms) || id === undefined || id.length === 0) return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "cursor", code: "invalid_cursor" }] });
  return { at: ms, id };
}

/** `GET /ops/activity?cursor=`: org-wide feed, newest first, keyset-paged on `(occurredAt, _id)`. */
export async function listActivity(
  ctx: OpsCtx,
  input: { readonly cursor?: string | null; readonly limit?: string | number | null } = {},
  deps: OpsDeps = {},
): Promise<OpsActivityDTO> {
  const db = await opsDb(deps);
  const limit = Math.min(Math.max(Number(input.limit ?? 50) || 50, 1), 100);
  const cursor = decodeActivityCursor(input.cursor);
  const base = { organizationId: ctx.orgId, deletedAt: null };
  const filter =
    cursor === null
      ? base
      : { ...base, $or: [{ occurredAt: { $lt: new Date(cursor.at) } }, { occurredAt: new Date(cursor.at), _id: { $lt: cursor.id } }] };
  const rows = await collections.activityEvents(db).find(filter).sort({ occurredAt: -1, _id: -1 }).limit(limit + 1).toArray();
  const page = rows.slice(0, limit);
  const actorIds = [...new Set(page.map((r) => r.actorId).filter((id): id is string => typeof id === "string"))];
  const actors = actorIds.length === 0 ? [] : await collections.users(db).find({ organizationId: ctx.orgId, _id: { $in: actorIds } }, { projection: { name: 1 } }).toArray();
  const names = new Map(actors.map((u) => [u._id, u.name]));
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r._id,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      fromStatus: r.fromStatus ?? null,
      toStatus: r.toStatus ?? null,
      actorId: r.actorId ?? null,
      actorName: typeof r.actorId === "string" ? (names.get(r.actorId) ?? null) : null,
      occurredAt: r.occurredAt.toISOString(),
      meta: (r.meta ?? {}) as Record<string, unknown>,
    })),
    nextCursor: rows.length > limit && last !== undefined ? encodeActivityCursor({ at: last.occurredAt.getTime(), id: last._id }) : null,
  };
}

function parseInstant(value: string | null | undefined, path: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return reject("VALIDATION_FAILED", { fieldErrors: [{ path, code: "invalid_date" }] });
  return date;
}

/** `GET /ops/operators/:userId/trail?from=&to=`: location pings, last 2 h by default, through `locations.listLocations`. */
export async function getOperatorTrail(
  ctx: OpsCtx,
  userId: string,
  input: { readonly from?: string | null; readonly to?: string | null } = {},
  deps: OpsDeps = {},
): Promise<OperatorTrailDTO> {
  const db = await opsDb(deps);
  const now = deps.now ?? new Date();
  const user = await collections.users(db).findOne({ organizationId: ctx.orgId, _id: userId }, { projection: { _id: 1 } });
  if (user === null) return reject("NOT_FOUND", { entity: "USER" });
  const to = parseInstant(input.to, "to") ?? now;
  const from = parseInstant(input.from, "from") ?? new Date(to.getTime() - 2 * HOUR_MS);
  if (from.getTime() > to.getTime()) return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "from", code: "after_to" }] });
  const pings = await listLocations(ctx, { userId, from, to }, db);
  return {
    userId,
    from: from.toISOString(),
    to: to.toISOString(),
    points: pings.map((p) => ({ lat: p.lat, lng: p.lng, recordedAt: p.recordedAt, accuracyM: p.accuracyM, speedMps: p.speedMps, heading: p.heading })),
  };
}
