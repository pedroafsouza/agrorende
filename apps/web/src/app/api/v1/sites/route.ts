import type { SiteCreateInput } from "@/lib/core.types";
import { OFFICE, query, readJson, route, sitesCore, sitesQueries, write } from "@/lib/core.server";

export const GET = route(OFFICE, (request, ctx) => sitesQueries.listSites(ctx, query(request)));

export const POST = route(OFFICE, async (request, ctx) => {
  const body = (await readJson(request)) as SiteCreateInput;
  return write(ctx, (tx) => sitesCore.createSite(tx, ctx, body));
});
