import type { AssetCreateInput } from "@/lib/core.types";
import { assetsCore, assetsQueries, OFFICE, query, readJson, route, write } from "@/lib/core.server";

export const GET = route(OFFICE, (request, ctx) => assetsQueries.listAssets(ctx, query(request)));

export const POST = route(OFFICE, async (request, ctx) => {
  const body = (await readJson(request)) as AssetCreateInput;
  return write(ctx, (tx) => assetsCore.createAsset(tx, ctx, body));
});
