import type { AssetUpdateInput } from "@/lib/core.types";
import { assetsCore, assetsQueries, ifMatch, OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const GET = route(OFFICE, (_request, ctx, params) => assetsQueries.getAsset(ctx, param(params, "id")));

export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as AssetUpdateInput;
  return write(ctx, (tx) => assetsCore.updateAsset(tx, ctx, param(params, "id"), body, ifMatch(request)));
});
