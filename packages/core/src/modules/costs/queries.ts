import { collections, getDb } from "@agrorende/db";

import type { Ctx } from "../../context";
import { reject } from "../../errors";
import type { Db } from "../locations/types";
import { loadOpsSettings } from "../ops/queries";
import { startOfZonedDay } from "../ops/rules";
import { COST_GROUP_BYS, COST_NONE_KEY, type CostGroupBy, type CostRollupDTO, type CostRollupFilters, type CostRollupRow } from "./dto";

export interface CostsDeps {
  readonly db?: Db;
  readonly dbName?: string;
}

export type CostsCtx = Pick<Ctx, "orgId" | "role">;

const NONE_LABELS: Readonly<Record<CostGroupBy, { readonly "pt-BR": string; readonly en: string }>> = {
  asset: { "pt-BR": "Sem máquina", en: "No machine" },
  site: { "pt-BR": "Sem local", en: "No site" },
  plot: { "pt-BR": "Sem talhão", en: "No plot" },
  season: { "pt-BR": "Sem safra", en: "No season" },
  category: { "pt-BR": "Sem categoria", en: "No category" },
  crop: { "pt-BR": "Sem cultura", en: "No crop" },
};

export function noneLabel(groupBy: CostGroupBy, locale: string | null | undefined): string {
  return locale?.toLowerCase().startsWith("en") === true ? NONE_LABELS[groupBy].en : NONE_LABELS[groupBy]["pt-BR"];
}

export function parseGroupBy(value: string | null | undefined): CostGroupBy {
  if (value === undefined || value === null || value === "") return "asset";
  if ((COST_GROUP_BYS as readonly string[]).includes(value)) return value as CostGroupBy;
  return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "groupBy", code: "invalid_enum_value" }] });
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

/** `from`/`to` accept a calendar date (org timezone; `to` is inclusive) or an ISO instant. */
function parseBound(value: string | null | undefined, path: "from" | "to", timeZone: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (DATE_ONLY.test(value)) {
    const noon = new Date(`${value}T12:00:00.000Z`);
    if (Number.isNaN(noon.getTime())) return reject("VALIDATION_FAILED", { fieldErrors: [{ path, code: "invalid_date" }] });
    const start = startOfZonedDay(noon, timeZone);
    return path === "from" ? start : startOfZonedDay(new Date(noon.getTime() + 24 * 3_600_000), timeZone);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return reject("VALIDATION_FAILED", { fieldErrors: [{ path, code: "invalid_date" }] });
  return date;
}

interface Source {
  readonly assetId: string | null;
  readonly siteId: string | null;
  readonly plotId: string | null;
  readonly seasonId: string | null;
}

interface Bucket {
  laborCents: number;
  partsCents: number;
  externalCents: number;
  fuelCents: number;
  rentInCostCents: number;
  rentalRevenueCents: number;
}

function cents(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

/**
 * `GET /costs/rollup` (ERP-03, ERP-04): labour, parts and external services from completed WOs, fuel
 * from fuel logs (by `filledAt`), rental revenue from OUTBOUND rentals and rent-in cost from INBOUND rentals, grouped by asset, site, plot, season,
 * category or crop. Records without the grouped reference roll up under the `none` key, so a
 * seasonless cost is never rejected (T09.12).
 */
export async function costRollup(ctx: CostsCtx, filters: CostRollupFilters = {}, deps: CostsDeps = {}): Promise<CostRollupDTO> {
  const db = deps.db ?? (await getDb(deps.dbName));
  const orgId = ctx.orgId;
  const groupBy = parseGroupBy(filters.groupBy);
  const settings = await loadOpsSettings(db, orgId);
  const from = parseBound(filters.from, "from", settings.timezone);
  const to = parseBound(filters.to, "to", settings.timezone);
  const laborVisible = ctx.role !== "MANAGER" || settings.showLaborCostToManager;

  const scope: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
  if (typeof filters.seasonId === "string" && filters.seasonId !== "") scope.seasonId = filters.seasonId === COST_NONE_KEY ? null : filters.seasonId;
  if (typeof filters.assetId === "string" && filters.assetId !== "") scope.assetId = filters.assetId;
  if (typeof filters.siteId === "string" && filters.siteId !== "") scope.siteId = filters.siteId === COST_NONE_KEY ? null : filters.siteId;
  const range: Record<string, Date> = {};
  if (from !== null) range.$gte = from;
  if (to !== null) range.$lt = to;
  const hasRange = Object.keys(range).length > 0;

  const [workOrders, rentals, fuelLogs] = await Promise.all([
    collections
      .workOrders(db)
      .find(
        { ...scope, status: { $in: ["COMPLETED", "VERIFIED"] }, completedAt: hasRange ? { $ne: null, ...range } : { $ne: null } },
        { projection: { assetId: 1, siteId: 1, plotId: 1, seasonId: 1, laborCostCents: 1, partsCostCents: 1, externalCostCents: 1 } },
      )
      .toArray(),
    collections
      .rentals(db)
      .find(
        {
          ...scope,
          status: { $in: ["RETURNED", "CLOSED"] },
          ...(hasRange ? { $or: [{ closedAt: range }, { closedAt: null, actualEnd: range }] } : {}),
        },
        { projection: { assetId: 1, siteId: 1, seasonId: 1, direction: 1, chargesTotalCents: 1 } },
      )
      .toArray(),
    collections
      .fuelLogs(db)
      .find({ ...scope, ...(hasRange ? { filledAt: range } : {}) }, { projection: { assetId: 1, siteId: 1, plotId: 1, seasonId: 1, totalCents: 1 } })
      .toArray(),
  ]);

  const buckets = new Map<string, Bucket>();
  const keyOf = await groupKeyResolver(db, orgId, groupBy, [
    ...workOrders.map((w) => ({ assetId: w.assetId ?? null, siteId: w.siteId ?? null, plotId: w.plotId ?? null, seasonId: w.seasonId ?? null })),
    ...rentals.map((r) => ({ assetId: r.assetId, siteId: r.siteId ?? null, plotId: null, seasonId: r.seasonId ?? null })),
    ...fuelLogs.map((f) => ({ assetId: f.assetId, siteId: f.siteId ?? null, plotId: f.plotId ?? null, seasonId: f.seasonId ?? null })),
  ]);
  const bucket = (source: Source): Bucket => {
    const key = keyOf.key(source);
    let entry = buckets.get(key);
    if (entry === undefined) {
      entry = { laborCents: 0, partsCents: 0, externalCents: 0, fuelCents: 0, rentInCostCents: 0, rentalRevenueCents: 0 };
      buckets.set(key, entry);
    }
    return entry;
  };

  for (const wo of workOrders) {
    const entry = bucket({ assetId: wo.assetId ?? null, siteId: wo.siteId ?? null, plotId: wo.plotId ?? null, seasonId: wo.seasonId ?? null });
    if (laborVisible) entry.laborCents += cents(wo.laborCostCents);
    entry.partsCents += cents(wo.partsCostCents);
    entry.externalCents += cents(wo.externalCostCents);
  }
  for (const log of fuelLogs) {
    bucket({ assetId: log.assetId, siteId: log.siteId ?? null, plotId: log.plotId ?? null, seasonId: log.seasonId ?? null }).fuelCents += cents(log.totalCents);
  }
  for (const rental of rentals) {
    const entry = bucket({ assetId: rental.assetId, siteId: rental.siteId ?? null, plotId: null, seasonId: rental.seasonId ?? null });
    if (rental.direction === "INBOUND") entry.rentInCostCents += cents(rental.chargesTotalCents);
    else entry.rentalRevenueCents += cents(rental.chargesTotalCents);
  }

  const rows: CostRollupRow[] = [...buckets.entries()].map(([key, b]) => ({
    key,
    label: key === COST_NONE_KEY ? noneLabel(groupBy, filters.locale) : keyOf.label(key),
    laborCents: b.laborCents,
    partsCents: b.partsCents,
    externalCents: b.externalCents,
    fuelCents: b.fuelCents,
    rentInCostCents: b.rentInCostCents,
    totalCostCents: b.laborCents + b.partsCents + b.externalCents + b.fuelCents + b.rentInCostCents,
    rentalRevenueCents: b.rentalRevenueCents,
  }));
  rows.sort((a, b) => (a.key === COST_NONE_KEY ? 1 : 0) - (b.key === COST_NONE_KEY ? 1 : 0) || b.totalCostCents - a.totalCostCents || a.label.localeCompare(b.label));

  const totals = rows.reduce(
    (sum, row) => ({
      laborCents: sum.laborCents + row.laborCents,
      partsCents: sum.partsCents + row.partsCents,
      externalCents: sum.externalCents + row.externalCents,
      fuelCents: sum.fuelCents + row.fuelCents,
      rentInCostCents: sum.rentInCostCents + row.rentInCostCents,
      totalCostCents: sum.totalCostCents + row.totalCostCents,
      rentalRevenueCents: sum.rentalRevenueCents + row.rentalRevenueCents,
    }),
    { laborCents: 0, partsCents: 0, externalCents: 0, fuelCents: 0, rentInCostCents: 0, totalCostCents: 0, rentalRevenueCents: 0 },
  );

  return {
    groupBy,
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    laborVisible,
    rows,
    totals,
    workOrderCount: workOrders.length,
    rentalCount: rentals.length,
    fuelLogCount: fuelLogs.length,
  };
}

interface KeyResolver {
  key(source: Source): string;
  label(key: string): string;
}

function ids(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string"))];
}

/** Loads the referenced labels once (tenant-filtered) and maps every source row to its group key. */
async function groupKeyResolver(db: Db, orgId: string, groupBy: CostGroupBy, sources: readonly Source[]): Promise<KeyResolver> {
  const byOrg = (list: string[]) => ({ organizationId: orgId, _id: { $in: list } });
  if (groupBy === "asset" || groupBy === "category") {
    const assets = await collections.assets(db).find(byOrg(ids(sources.map((s) => s.assetId))), { projection: { code: 1, name: 1, category: 1 } }).toArray();
    const map = new Map(assets.map((a) => [a._id, a]));
    if (groupBy === "category") {
      return { key: (s) => (s.assetId === null ? COST_NONE_KEY : (map.get(s.assetId)?.category ?? COST_NONE_KEY)), label: (key) => key };
    }
    return {
      key: (s) => (s.assetId !== null && map.has(s.assetId) ? s.assetId : COST_NONE_KEY),
      label: (key) => {
        const asset = map.get(key);
        return asset === undefined ? key : `${asset.code} · ${asset.name}`;
      },
    };
  }
  if (groupBy === "site") {
    const sites = await collections.sites(db).find(byOrg(ids(sources.map((s) => s.siteId))), { projection: { name: 1 } }).toArray();
    const map = new Map(sites.map((s) => [s._id, s.name]));
    return { key: (s) => (s.siteId !== null && map.has(s.siteId) ? s.siteId : COST_NONE_KEY), label: (key) => map.get(key) ?? key };
  }
  if (groupBy === "season") {
    const seasons = await collections.seasons(db).find(byOrg(ids(sources.map((s) => s.seasonId))), { projection: { name: 1 } }).toArray();
    const map = new Map(seasons.map((s) => [s._id, s.name]));
    return { key: (s) => (s.seasonId !== null && map.has(s.seasonId) ? s.seasonId : COST_NONE_KEY), label: (key) => map.get(key) ?? key };
  }
  const plots = await collections.plots(db).find(byOrg(ids(sources.map((s) => s.plotId))), { projection: { name: 1, crop: 1 } }).toArray();
  const plotMap = new Map(plots.map((p) => [p._id, p]));
  if (groupBy === "plot") {
    return { key: (s) => (s.plotId !== null && plotMap.has(s.plotId) ? s.plotId : COST_NONE_KEY), label: (key) => plotMap.get(key)?.name ?? key };
  }
  const seasons = await collections.seasons(db).find(byOrg(ids(sources.map((s) => s.seasonId))), { projection: { crop: 1 } }).toArray();
  const seasonCrop = new Map(seasons.map((s) => [s._id, s.crop ?? null]));
  const cropOf = (s: Source): string | null => {
    const plotCrop = s.plotId === null ? null : (plotMap.get(s.plotId)?.crop ?? null);
    const crop = plotCrop ?? (s.seasonId === null ? null : (seasonCrop.get(s.seasonId) ?? null));
    return crop === null || crop.trim() === "" ? null : crop.trim();
  };
  return { key: (s) => cropOf(s) ?? COST_NONE_KEY, label: (key) => key };
}
