import type { PlotUpdateInput } from "@/lib/core.types";
import { ifMatch, OFFICE, param, readJson, route, sitesCore, write } from "@/lib/core.server";

export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as PlotUpdateInput;
  return write(ctx, (tx) => sitesCore.updatePlot(tx, ctx, param(params, "id"), body, ifMatch(request)));
});
