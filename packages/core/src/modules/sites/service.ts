import type { SiteSummary, Tx } from "@agrorende/contracts/seams";
import type { Plot, Site } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { assertVersion, dbTx, newId, stampCreate, stampUpdate, toDto, writeActivity, parseInput } from "../assets/kit.js";
import {
  PlotInputSchema,
  PlotUpdateInputSchema,
  SiteCreateInputSchema,
  SiteUpdateInputSchema,
  type PlotDTO,
  type PlotInput,
  type PlotUpdateInput,
  type SiteCreateInput,
  type SiteDTO,
  type SiteUpdateInput,
} from "./dto.js";
import { validatePlotGeometry } from "./geometry.js";

export function toSiteDto(doc: Site): SiteDTO {
  return toDto<SiteDTO>(doc);
}

export function toPlotDto(doc: Plot): PlotDTO {
  return toDto<PlotDTO>(doc);
}

async function loadSite(tx: Tx, siteId: string): Promise<Site> {
  const doc = await dbTx(tx).db.sites.findOne({ _id: siteId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "SITE", entityId: siteId });
  return doc;
}

/** Seam `sites.getSummary` (DELIVERY-PLAN §4). */
export async function getSummary(tx: Tx, siteId: string): Promise<SiteSummary> {
  const site = await loadSite(tx, siteId);
  return { id: site._id, name: site.name, type: site.type, lat: site.lat ?? null, lng: site.lng ?? null, radiusM: site.radiusM };
}

export async function createSite(tx: Tx, ctx: Ctx, raw: SiteCreateInput): Promise<SiteDTO> {
  const input = parseInput(SiteCreateInputSchema, raw);
  const scopedTx = dbTx(tx);
  const now = new Date();
  const doc: Site = {
    _id: newId(now.getTime()),
    organizationId: scopedTx.orgId,
    ...stampCreate(scopedTx, now),
    deletedAt: null,
    name: input.name,
    type: input.type,
    customerId: input.customerId ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    radiusM: input.radiusM,
    notes: input.notes ?? null,
    isActive: input.isActive,
    archivedAt: null,
  };
  await scopedTx.db.sites.insertOne(doc);
  await writeActivity(scopedTx, { entityType: "SITE", entityId: doc._id, action: "site.created", actorId: ctx.userId });
  return toSiteDto(doc);
}

export async function updateSite(tx: Tx, ctx: Ctx, siteId: string, raw: SiteUpdateInput, ifMatch?: string | null): Promise<SiteDTO> {
  const input = parseInput(SiteUpdateInputSchema, raw);
  const scopedTx = dbTx(tx);
  const site = await loadSite(tx, siteId);
  assertVersion(site, ifMatch);
  const { archived, ...fields } = input;
  const set: Record<string, unknown> = { ...fields, ...stampUpdate(scopedTx) };
  if (archived === true) {
    set.archivedAt = new Date();
    set.isActive = false;
  } else if (archived === false) {
    set.archivedAt = null;
    set.isActive = true;
  }
  await scopedTx.db.sites.updateOne({ _id: siteId }, { $set: set });
  if (archived !== undefined) {
    await writeActivity(scopedTx, { entityType: "SITE", entityId: siteId, action: archived ? "site.archived" : "site.restored", actorId: ctx.userId });
  }
  return toSiteDto(await loadSite(tx, siteId));
}

/** EC-OPS-12: a site referenced by assets, plots or work is archived instead of deleted. */
export async function deleteSite(tx: Tx, ctx: Ctx, siteId: string): Promise<void> {
  const scopedTx = dbTx(tx);
  await loadSite(tx, siteId);
  const db = scopedTx.db;
  const [asset, plot, workOrder, report, rental] = await Promise.all([
    db.assets.findOne({ $or: [{ homeSiteId: siteId }, { currentSiteId: siteId }] }, { projection: { _id: 1 } }),
    db.plots.findOne({ siteId, deletedAt: null }, { projection: { _id: 1 } }),
    db.work_orders.findOne({ siteId }, { projection: { _id: 1 } }),
    db.field_reports.findOne({ siteId }, { projection: { _id: 1 } }),
    db.rentals.findOne({ $or: [{ deliverySiteId: siteId }, { siteId }] }, { projection: { _id: 1 } }),
  ]);
  if (asset !== null || plot !== null || workOrder !== null || report !== null || rental !== null) {
    reject("RECORD_IN_USE", { entityType: "SITE", entityId: siteId });
  }
  await db.sites.softDeleteOne({ _id: siteId }, new Date(), scopedTx.syncVersion);
  await writeActivity(scopedTx, { entityType: "SITE", entityId: siteId, action: "site.deleted", actorId: ctx.userId });
}

function geometryOrReject(input: Parameters<typeof validatePlotGeometry>[0]) {
  const result = validatePlotGeometry(input);
  if (!result.ok) return reject("PLOT_GEOMETRY_INVALID", { problem: result.problem });
  return result.geometry;
}

export async function createPlot(tx: Tx, ctx: Ctx, siteId: string, raw: PlotInput): Promise<PlotDTO> {
  const input = parseInput(PlotInputSchema, raw);
  const scopedTx = dbTx(tx);
  await loadSite(tx, siteId);
  const geometry = geometryOrReject(input);
  const now = new Date();
  const doc: Plot = {
    _id: newId(now.getTime()),
    organizationId: scopedTx.orgId,
    ...stampCreate(scopedTx, now),
    deletedAt: null,
    siteId,
    name: input.name,
    code: input.code ?? null,
    crop: input.crop ?? null,
    boundary: input.boundary ?? null,
    ...geometry,
    archivedAt: null,
  };
  await scopedTx.db.plots.insertOne(doc);
  await writeActivity(scopedTx, { entityType: "PLOT", entityId: doc._id, action: "plot.created", actorId: ctx.userId, meta: { siteId } });
  return toPlotDto(doc);
}

export async function updatePlot(tx: Tx, ctx: Ctx, plotId: string, raw: PlotUpdateInput, ifMatch?: string | null): Promise<PlotDTO> {
  const input = parseInput(PlotUpdateInputSchema, raw);
  const scopedTx = dbTx(tx);
  const plot = await scopedTx.db.plots.findOne({ _id: plotId, deletedAt: null });
  if (plot === null) return reject("NOT_FOUND", { entityType: "PLOT", entityId: plotId });
  assertVersion(plot, ifMatch);
  const { archived, ...fields } = input;
  const touchesGeometry = ["boundary", "areaHa", "centroidLat", "centroidLng"].some((key) => key in fields);
  const set: Record<string, unknown> = { ...fields, ...stampUpdate(scopedTx) };
  if (touchesGeometry) {
    const geometry = geometryOrReject({
      boundary: fields.boundary !== undefined ? fields.boundary : plot.boundary,
      areaHa: "areaHa" in fields ? fields.areaHa : fields.boundary !== undefined ? null : plot.areaHa,
      centroidLat: "centroidLat" in fields ? fields.centroidLat : fields.boundary !== undefined ? null : plot.centroidLat,
      centroidLng: "centroidLng" in fields ? fields.centroidLng : fields.boundary !== undefined ? null : plot.centroidLng,
    });
    Object.assign(set, geometry);
  }
  if (archived !== undefined) set.archivedAt = archived ? new Date() : null;
  await scopedTx.db.plots.updateOne({ _id: plotId }, { $set: set });
  if (archived !== undefined) {
    await writeActivity(scopedTx, { entityType: "PLOT", entityId: plotId, action: archived ? "plot.archived" : "plot.restored", actorId: ctx.userId });
  }
  const updated = await scopedTx.db.plots.findOne({ _id: plotId });
  if (updated === null) return reject("NOT_FOUND", { entityType: "PLOT", entityId: plotId });
  return toPlotDto(updated);
}
