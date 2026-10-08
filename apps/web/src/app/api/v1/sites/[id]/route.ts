import type { SiteUpdateInput } from "@/lib/core.types";
import { ifMatch, OFFICE, param, readJson, route, sitesCore, sitesQueries, write } from "@/lib/core.server";

export const GET = route(OFFICE, (_request, ctx, params) => sitesQueries.getSite(ctx, param(params, "id")));

export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as SiteUpdateInput;
  return write(ctx, (tx) => sitesCore.updateSite(tx, ctx, param(params, "id"), body, ifMatch(request)));
});

export const DELETE = route(OFFICE, (_request, ctx, params) => write(ctx, (tx) => sitesCore.deleteSite(tx, ctx, param(params, "id"))));
