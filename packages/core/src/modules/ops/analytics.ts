import { collections } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { costRollup } from "../costs/service.js";
import type { CostRollupDTO } from "../costs/dto.js";
import type { Db } from "../locations/types.js";
import { loadOpsSettings, opsDb, type OpsDeps } from "./queries.js";
import { median, startOfZonedDay } from "./rules.js";

/**
 * Analytics metrics (ARCHITECTURE §6.4, `GET /ops/analytics`). Every metric takes a `from`/`to`
 * range in the organisation timezone and an optional season. Values are computed on read; the
 * seed volume keeps every metric well inside one aggregation round trip.
 */
export const ANALYTICS_METRICS = [
  "mttr",
  "first_time_fix",
  "reports_by_category",
  "wos_by_field_user",
  "downtime",
  "top_failing",
  "rental_utilization",
  "rental_revenue",
  "cost",
] as const;

export type AnalyticsMetric = (typeof ANALYTICS_METRICS)[number];
export type AnalyticsUnit = "hours" | "percent" | "count" | "cents";

export interface AnalyticsPoint {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /**
   * Second value of the point, when the metric has one: the median `workMinutes` for
   * `wos_by_field_user`, the completed WO count for `mttr` and `first_time_fix`, the INBOUND
   * rent-in cost for `rental_revenue` and the corrective WO count for `top_failing`.
   */
  readonly secondary?: number | null;
}

export interface AnalyticsDTO {
  readonly metric: AnalyticsMetric;
  readonly unit: AnalyticsUnit;
  readonly from: string;
  readonly to: string;
  readonly seasonId: string | null;
  readonly series: readonly AnalyticsPoint[];
  /** Whole-range figure: overall median, share, total or average depending on the metric. */
  readonly summary: number | null;
  /** Full cost roll-up for the `cost` metric (cost dashboard tab). */
  readonly cost?: CostRollupDTO;
}

export interface AnalyticsFilters {
  readonly metric?: string | null;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly seasonId?: string | null;
  readonly groupBy?: string | null;
  readonly locale?: string | null;
}

export type AnalyticsCtx = Pick<Ctx, "orgId" | "role">;

interface Range {
  readonly from: Date;
  readonly to: Date;
  readonly timeZone: string;
  readonly seasonId: string | null;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_RANGE_DAYS = 30;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const DONE_WO_STATUSES = ["COMPLETED", "VERIFIED"] as const;
const UNITS: Readonly<Record<AnalyticsMetric, AnalyticsUnit>> = {
  mttr: "hours",
  first_time_fix: "percent",
  reports_by_category: "count",
  wos_by_field_user: "count",
  downtime: "hours",
  top_failing: "count",
  rental_utilization: "percent",
  rental_revenue: "cents",
  cost: "cents",
};

export function parseAnalyticsMetric(value: string | null | undefined): AnalyticsMetric {
  if (value !== null && value !== undefined && (ANALYTICS_METRICS as readonly string[]).includes(value)) return value as AnalyticsMetric;
  return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "metric", code: "invalid_enum_value" }] });
}

/** Mirrors the cost roll-up bounds: a calendar date in the org timezone (`to` inclusive) or an ISO instant. */
function parseBound(value: string, path: "from" | "to", timeZone: string): Date {
  if (DATE_ONLY.test(value)) {
    const noon = new Date(`${value}T12:00:00.000Z`);
    if (Number.isNaN(noon.getTime())) return reject("VALIDATION_FAILED", { fieldErrors: [{ path, code: "invalid_date" }] });
    return path === "from" ? startOfZonedDay(noon, timeZone) : startOfZonedDay(new Date(noon.getTime() + DAY_MS), timeZone);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return reject("VALIDATION_FAILED", { fieldErrors: [{ path, code: "invalid_date" }] });
  return date;
}

function present(value: string | null | undefined): value is string {
  return typeof value === "string" && value !== "";
}

async function resolveRange(db: Db, orgId: string, filters: AnalyticsFilters, now: Date): Promise<Range> {
  const { timezone: timeZone } = await loadOpsSettings(db, orgId);
  const seasonId = present(filters.seasonId) ? filters.seasonId : null;
  let fromRaw = present(filters.from) ? filters.from : null;
  let toRaw = present(filters.to) ? filters.to : null;
  if (seasonId !== null && (fromRaw === null || toRaw === null)) {
    const season = await collections.seasons(db).findOne({ organizationId: orgId, _id: seasonId, deletedAt: null }, { projection: { startsOn: 1, endsOn: 1 } });
    if (season === null) return reject("NOT_FOUND", { entityType: "SEASON", entityId: seasonId });
    fromRaw ??= season.startsOn;
    toRaw ??= season.endsOn;
  }
  const to = toRaw === null ? startOfZonedDay(new Date(now.getTime() + DAY_MS), timeZone) : parseBound(toRaw, "to", timeZone);
  const from = fromRaw === null ? startOfZonedDay(new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS), timeZone) : parseBound(fromRaw, "from", timeZone);
  if (from.getTime() >= to.getTime()) return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "to", code: "before_from" }] });
  return { from, to, timeZone, seasonId };
}

function zonedDateKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Monday of the org-timezone week containing `at`, as `YYYY-MM-DD`. */
export function weekKey(at: Date, timeZone: string): string {
  const [y, m, d] = zonedDateKey(at, timeZone).split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d));
  const back = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - back * DAY_MS).toISOString().slice(0, 10);
}

function monthKey(at: Date, timeZone: string): string {
  return zonedDateKey(at, timeZone).slice(0, 7);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function seasonFilter(range: Range): Record<string, unknown> {
  return range.seasonId === null ? {} : { seasonId: range.seasonId };
}

function inRange(range: Range): { $gte: Date; $lt: Date } {
  return { $gte: range.from, $lt: range.to };
}

async function completedWorkOrders(db: Db, orgId: string, range: Range) {
  return collections
    .workOrders(db)
    .find(
      { organizationId: orgId, deletedAt: null, status: { $in: [...DONE_WO_STATUSES] }, completedAt: inRange(range), ...seasonFilter(range) },
      { projection: { _id: 1, createdAt: 1, completedAt: 1, assigneeId: 1, workMinutes: 1, holdReason: 1 } },
    )
    .toArray();
}

// ───────── Work-order metrics ─────────

async function mttr(db: Db, orgId: string, range: Range): Promise<Pick<AnalyticsDTO, "series" | "summary">> {
  const wos = await completedWorkOrders(db, orgId, range);
  const weeks = new Map<string, number[]>();
  const all: number[] = [];
  for (const wo of wos) {
    if (!(wo.completedAt instanceof Date)) continue;
    const hours = (wo.completedAt.getTime() - wo.createdAt.getTime()) / HOUR_MS;
    all.push(hours);
    const key = weekKey(wo.completedAt, range.timeZone);
    weeks.set(key, [...(weeks.get(key) ?? []), hours]);
  }
  const series = [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({ key, label: key, value: median(values) ?? 0, secondary: values.length }));
  return { series, summary: median(all) };
}

async function firstTimeFix(db: Db, orgId: string, range: Range): Promise<Pick<AnalyticsDTO, "series" | "summary">> {
  const wos = await completedWorkOrders(db, orgId, range);
  const ids = wos.map((wo) => wo._id);
  const spoiled = new Set<string>();
  if (ids.length > 0) {
    const events = await collections
      .activityEvents(db)
      .find(
        {
          organizationId: orgId,
          entityType: "WORK_ORDER",
          entityId: { $in: ids },
          $or: [{ action: "workOrder.reopen" }, { "meta.holdReason": "WAITING_PARTS" }],
        },
        { projection: { entityId: 1 } },
      )
      .toArray();
    for (const event of events) spoiled.add(event.entityId);
  }
  for (const wo of wos) if (wo.holdReason === "WAITING_PARTS") spoiled.add(wo._id);
  const weeks = new Map<string, { fixed: number; total: number }>();
  for (const wo of wos) {
    if (!(wo.completedAt instanceof Date)) continue;
    const key = weekKey(wo.completedAt, range.timeZone);
    const bucket = weeks.get(key) ?? { fixed: 0, total: 0 };
    bucket.total += 1;
    if (!spoiled.has(wo._id)) bucket.fixed += 1;
    weeks.set(key, bucket);
  }
  const series = [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => ({ key, label: key, value: round1((b.fixed / b.total) * 100), secondary: b.total }));
  const fixed = wos.filter((wo) => !spoiled.has(wo._id)).length;
  return { series, summary: wos.length === 0 ? null : round1((fixed / wos.length) * 100) };
}

async function wosByFieldUser(db: Db, orgId: string, range: Range): Promise<Pick<AnalyticsDTO, "series" | "summary">> {
  const wos = await completedWorkOrders(db, orgId, range);
  const byUser = new Map<string, number[]>();
  const counts = new Map<string, number>();
  for (const wo of wos) {
    const key = wo.assigneeId ?? "none";
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (typeof wo.workMinutes === "number") byUser.set(key, [...(byUser.get(key) ?? []), wo.workMinutes]);
  }
  const userIds = [...counts.keys()].filter((id) => id !== "none");
  const users = await collections
    .users(db)
    .find({ organizationId: orgId, _id: { $in: userIds } }, { projection: { name: 1 } })
    .toArray();
  const names = new Map(users.map((u) => [u._id, u.name]));
  const series = [...counts.entries()]
    .map(([key, value]) => ({ key, label: names.get(key) ?? key, value, secondary: median(byUser.get(key) ?? []) }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return { series, summary: wos.length };
}

async function reportsByCategory(db: Db, orgId: string, range: Range): Promise<Pick<AnalyticsDTO, "series" | "summary">> {
  const rows = await collections
    .fieldReports(db)
    .aggregate<{ _id: string; count: number }>([
      { $match: { organizationId: orgId, deletedAt: null, receivedAt: inRange(range), ...seasonFilter(range) } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ])
    .toArray();
  const series = rows.map((row) => ({ key: row._id, label: row._id, value: row.count })).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  return { series, summary: series.reduce((sum, point) => sum + point.value, 0) };
}

async function assetLabels(db: Db, orgId: string, ids: readonly string[]): Promise<Map<string, string>> {
  const assets = await collections
    .assets(db)
    .find({ organizationId: orgId, _id: { $in: [...ids] } }, { projection: { code: 1, name: 1 } })
    .toArray();
  return new Map(assets.map((a) => [a._id, `${a.code} · ${a.name}`]));
}

async function topFailing(db: Db, orgId: string, range: Range): Promise<Pick<AnalyticsDTO, "series" | "summary">> {
  const [reports, corrective] = await Promise.all([
    collections
      .fieldReports(db)
      .aggregate<{ _id: string; count: number }>([
        { $match: { organizationId: orgId, deletedAt: null, receivedAt: inRange(range), assetId: { $ne: null }, ...seasonFilter(range) } },
        { $group: { _id: "$assetId", count: { $sum: 1 } } },
      ])
      .toArray(),
    collections
      .workOrders(db)
      .aggregate<{ _id: string; count: number }>([
        { $match: { organizationId: orgId, deletedAt: null, type: "CORRECTIVE", createdAt: inRange(range), assetId: { $ne: null }, ...seasonFilter(range) } },
        { $group: { _id: "$assetId", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const totals = new Map<string, { reports: number; wos: number }>();
  for (const row of reports) totals.set(row._id, { reports: row.count, wos: 0 });
  for (const row of corrective) totals.set(row._id, { reports: totals.get(row._id)?.reports ?? 0, wos: row.count });
  const top = [...totals.entries()].sort(([ak, a], [bk, b]) => b.reports + b.wos - (a.reports + a.wos) || ak.localeCompare(bk)).slice(0, 10);
  const labels = await assetLabels(
    db,
    orgId,
    top.map(([id]) => id),
  );
  const series = top.map(([key, t]) => ({ key, label: labels.get(key) ?? key, value: t.reports + t.wos, secondary: t.wos }));
  return { series, summary: series.reduce((sum, point) => sum + point.value, 0) };
}

// ───────── Asset and rental metrics ─────────

async function downtime(db: Db, orgId: string, range: Range, now: Date): Promise<Pick<AnalyticsDTO, "series" | "summary">> {
  const end = Math.min(range.to.getTime(), now.getTime());
  const start = range.from.getTime();
  if (end <= start) return { series: [], summary: 0 };
  const assets = await collections
    .assets(db)
    .find({ organizationId: orgId, deletedAt: null, condition: { $ne: "RETIRED" } }, { projection: { code: 1, name: 1, condition: 1 } })
    .toArray();
  if (assets.length === 0) return { series: [], summary: 0 };
  const events = await collections
    .activityEvents(db)
    .find(
      { organizationId: orgId, entityType: "ASSET", action: "asset.conditionChanged", entityId: { $in: assets.map((a) => a._id) }, occurredAt: { $lt: new Date(end) } },
      { projection: { entityId: 1, fromStatus: 1, toStatus: 1, occurredAt: 1 }, sort: { occurredAt: 1 } },
    )
    .toArray();
  const byAsset = new Map<string, typeof events>();
  for (const event of events) byAsset.set(event.entityId, [...(byAsset.get(event.entityId) ?? []), event]);
  const series: AnalyticsPoint[] = [];
  for (const asset of assets) {
    const history = byAsset.get(asset._id) ?? [];
    const before = history.filter((e) => e.occurredAt.getTime() <= start);
    const within = history.filter((e) => e.occurredAt.getTime() > start);
    // Condition at the start of the range: the last change before it, else the `from` of the first change inside it, else today's condition.
    let condition: string = before.at(-1)?.toStatus ?? within[0]?.fromStatus ?? asset.condition;
    let cursor = start;
    let downMs = 0;
    for (const event of within) {
      const at = event.occurredAt.getTime();
      if (condition !== "OPERATIONAL") downMs += at - cursor;
      cursor = at;
      condition = event.toStatus ?? condition;
    }
    if (condition !== "OPERATIONAL") downMs += end - cursor;
    if (downMs > 0) series.push({ key: asset._id, label: `${asset.code} · ${asset.name}`, value: round1(downMs / HOUR_MS) });
  }
  series.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return { series, summary: round1(series.reduce((sum, point) => sum + point.value, 0)) };
}

async function rentalUtilization(db: Db, orgId: string, range: Range, now: Date): Promise<Pick<AnalyticsDTO, "series" | "summary">> {
  const start = range.from.getTime();
  const end = range.to.getTime();
  const rangeDays = (end - start) / DAY_MS;
  const assets = await collections
    .assets(db)
    .find({ organizationId: orgId, deletedAt: null, isRentable: true, condition: { $ne: "RETIRED" } }, { projection: { code: 1, name: 1 } })
    .toArray();
  if (assets.length === 0) return { series: [], summary: null };
  const rentals = await collections
    .rentals(db)
    .find(
      {
        organizationId: orgId,
        deletedAt: null,
        direction: "OUTBOUND",
        assetId: { $in: assets.map((a) => a._id) },
        actualStart: { $ne: null, $lt: range.to },
        $or: [{ actualEnd: null }, { actualEnd: { $gt: range.from } }],
        ...seasonFilter(range),
      },
      { projection: { assetId: 1, actualStart: 1, actualEnd: 1 } },
    )
    .toArray();
  const rented = new Map<string, number>();
  for (const rental of rentals) {
    if (!(rental.actualStart instanceof Date)) continue;
    const s = Math.max(start, rental.actualStart.getTime());
    const e = Math.min(end, rental.actualEnd instanceof Date ? rental.actualEnd.getTime() : now.getTime());
    if (e > s) rented.set(rental.assetId, (rented.get(rental.assetId) ?? 0) + (e - s) / DAY_MS);
  }
  const days = (id: string) => Math.min(rented.get(id) ?? 0, rangeDays);
  const series = assets
    .map((asset) => ({ key: asset._id, label: `${asset.code} · ${asset.name}`, value: round1((days(asset._id) / rangeDays) * 100), secondary: round1(days(asset._id)) }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const fleetDays = assets.reduce((sum, asset) => sum + days(asset._id), 0);
  return { series, summary: round1((fleetDays / (rangeDays * assets.length)) * 100) };
}

async function rentalRevenue(db: Db, orgId: string, range: Range): Promise<Pick<AnalyticsDTO, "series" | "summary">> {
  const rentals = await collections
    .rentals(db)
    .find(
      { organizationId: orgId, deletedAt: null, status: "CLOSED", closedAt: inRange(range), ...seasonFilter(range) },
      { projection: { direction: 1, closedAt: 1, chargesTotalCents: 1 } },
    )
    .toArray();
  const months = new Map<string, { revenue: number; cost: number }>();
  for (const rental of rentals) {
    if (!(rental.closedAt instanceof Date)) continue;
    const key = monthKey(rental.closedAt, range.timeZone);
    const bucket = months.get(key) ?? { revenue: 0, cost: 0 };
    const cents = Math.round(rental.chargesTotalCents ?? 0);
    if (rental.direction === "INBOUND") bucket.cost += cents;
    else bucket.revenue += cents;
    months.set(key, bucket);
  }
  const series = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, b]) => ({ key, label: key, value: b.revenue, secondary: b.cost }));
  return { series, summary: series.reduce((sum, point) => sum + point.value, 0) };
}

// ───────── Entry point ─────────

/** `GET /ops/analytics?metric=&from=&to=&seasonId=` (ARCHITECTURE §6.4). */
export async function getAnalytics(ctx: AnalyticsCtx, filters: AnalyticsFilters, deps: OpsDeps = {}): Promise<AnalyticsDTO> {
  const metric = parseAnalyticsMetric(filters.metric);
  const db = await opsDb(deps);
  const now = deps.now ?? new Date();
  const range = await resolveRange(db, ctx.orgId, filters, now);
  const base = { metric, unit: UNITS[metric], from: range.from.toISOString(), to: range.to.toISOString(), seasonId: range.seasonId };
  switch (metric) {
    case "mttr":
      return { ...base, ...(await mttr(db, ctx.orgId, range)) };
    case "first_time_fix":
      return { ...base, ...(await firstTimeFix(db, ctx.orgId, range)) };
    case "reports_by_category":
      return { ...base, ...(await reportsByCategory(db, ctx.orgId, range)) };
    case "wos_by_field_user":
      return { ...base, ...(await wosByFieldUser(db, ctx.orgId, range)) };
    case "downtime":
      return { ...base, ...(await downtime(db, ctx.orgId, range, now)) };
    case "top_failing":
      return { ...base, ...(await topFailing(db, ctx.orgId, range)) };
    case "rental_utilization":
      return { ...base, ...(await rentalUtilization(db, ctx.orgId, range, now)) };
    case "rental_revenue":
      return { ...base, ...(await rentalRevenue(db, ctx.orgId, range)) };
    case "cost": {
      const cost = await costRollup(
        ctx,
        { groupBy: filters.groupBy ?? "asset", from: range.from.toISOString(), to: range.to.toISOString(), seasonId: range.seasonId, locale: filters.locale ?? null },
        { db },
      );
      const series = cost.rows.map((row) => ({ key: row.key, label: row.label, value: row.totalCostCents, secondary: row.rentalRevenueCents }));
      return { ...base, series, summary: cost.totals.totalCostCents, cost };
    }
  }
}
