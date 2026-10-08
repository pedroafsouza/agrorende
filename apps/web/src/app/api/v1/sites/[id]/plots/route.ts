import type { PlotInput } from "@/lib/core.types";
import { OFFICE, param, query, readJson, route, sitesCore, sitesQueries, write } from "@/lib/core.server";

export const GET = route(OFFICE, (request, ctx, params) =>
  sitesQueries.listPlots(ctx, param(params, "id"), { includeArchived: query(request).includeArchived === "true" }),
);

export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as PlotInput;
  return write(ctx, (tx) => sitesCore.createPlot(tx, ctx, param(params, "id"), body));
});
