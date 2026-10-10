import type { Plot, Site } from "@agrorende/db";

import type { Ctx } from "../../context";
import { reject } from "../../errors";
import { clampLimit, escapeRegex, pageOf, parseCursor, readDb, type Page, parseInput } from "../assets/kit";
import { SiteListFilterSchema, type PlotDTO, type SiteDTO, type SiteListFilter } from "./dto";
import { toPlotDto, toSiteDto } from "./service";

export async function listSites(ctx: Pick<Ctx, "orgId">, raw: Partial<SiteListFilter> = {}): Promise<Page<SiteDTO>> {
  const f = parseInput(SiteListFilterSchema, raw);
  const db = await readDb(ctx);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (f.includeArchived !== "true") filter.archivedAt = null;
  if (f.type !== undefined) filter.type = f.type;
  if (f.customerId !== undefined) filter.customerId = f.customerId;
  if (f.q !== undefined && f.q.length > 0) {
    const pattern = new RegExp(escapeRegex(f.q), "iu");
    filter.$or = [{ name: pattern }, { city: pattern }, { address: pattern }];
  }
  const offset = parseCursor(f.cursor);
  const limit = clampLimit(f.limit);
  const docs: Site[] = await db.sites.find(filter).sort({ name: 1, _id: 1 }).skip(offset).limit(limit + 1).toArray();
  return pageOf(docs.map(toSiteDto), offset, limit);
}

export async function getSite(ctx: Pick<Ctx, "orgId">, siteId: string): Promise<SiteDTO> {
  const db = await readDb(ctx);
  const doc = await db.sites.findOne({ _id: siteId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "SITE", entityId: siteId });
  return toSiteDto(doc);
}

export async function listPlots(ctx: Pick<Ctx, "orgId">, siteId: string, opts: { includeArchived?: boolean } = {}): Promise<Page<PlotDTO>> {
  const db = await readDb(ctx);
  const site = await db.sites.findOne({ _id: siteId, deletedAt: null }, { projection: { _id: 1 } });
  if (site === null) return reject("NOT_FOUND", { entityType: "SITE", entityId: siteId });
  const filter: Record<string, unknown> = { siteId, deletedAt: null };
  if (opts.includeArchived !== true) filter.archivedAt = null;
  const docs: Plot[] = await db.plots.find(filter).sort({ name: 1 }).toArray();
  return { items: docs.map(toPlotDto), nextCursor: null };
}

export async function getPlot(ctx: Pick<Ctx, "orgId">, plotId: string): Promise<PlotDTO> {
  const db = await readDb(ctx);
  const doc = await db.plots.findOne({ _id: plotId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "PLOT", entityId: plotId });
  return toPlotDto(doc);
}
