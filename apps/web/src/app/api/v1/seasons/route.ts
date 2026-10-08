import type { SeasonCreateInput } from "@/lib/core.types";
import { ADMIN_ONLY, OFFICE, readJson, route, seasonsCore, seasonsQueries, write } from "@/lib/core.server";

export const GET = route(OFFICE, (_request, ctx) => seasonsQueries.listSeasons(ctx));

export const POST = route(ADMIN_ONLY, async (request, ctx) => {
  const body = (await readJson(request)) as SeasonCreateInput;
  return write(ctx, (tx) => seasonsCore.createSeason(tx, ctx, body));
});
