import { collections } from "@agrorende/db";

import type { Ctx } from "../../context";
import { opsDb, type OpsDeps } from "./queries";

/** Plot boundaries for the Ops map layer (T16.4), as a GeoJSON FeatureCollection. */
export interface PlotBoundaryFeature {
  readonly type: "Feature";
  readonly id: string;
  readonly geometry: { readonly type: "Polygon"; readonly coordinates: readonly (readonly (readonly number[])[])[] };
  readonly properties: { readonly plotId: string; readonly siteId: string; readonly name: string; readonly crop: string | null; readonly areaHa: number | null };
}

export interface PlotBoundariesDTO {
  readonly type: "FeatureCollection";
  readonly features: readonly PlotBoundaryFeature[];
}

const BOUNDARY_LIMIT = 2_000;

export async function plotBoundaries(ctx: Pick<Ctx, "orgId">, deps: OpsDeps = {}): Promise<PlotBoundariesDTO> {
  const db = await opsDb(deps);
  const plots = await collections
    .plots(db)
    .find(
      { organizationId: ctx.orgId, deletedAt: null, archivedAt: null, boundary: { $ne: null } },
      { projection: { siteId: 1, name: 1, crop: 1, areaHa: 1, boundary: 1 }, limit: BOUNDARY_LIMIT },
    )
    .toArray();
  const features: PlotBoundaryFeature[] = [];
  for (const plot of plots) {
    if (plot.boundary === null || plot.boundary === undefined) continue;
    features.push({
      type: "Feature",
      id: plot._id,
      geometry: { type: "Polygon", coordinates: plot.boundary.coordinates },
      properties: { plotId: plot._id, siteId: plot.siteId, name: plot.name, crop: plot.crop ?? null, areaHa: plot.areaHa ?? null },
    });
  }
  return { type: "FeatureCollection", features };
}
