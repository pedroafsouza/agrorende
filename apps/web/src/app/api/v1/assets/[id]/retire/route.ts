import type { AssetRetireInput } from "@/lib/core.types";
import { assetsCore, OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const POST = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as AssetRetireInput;
  return write(ctx, (tx) => assetsCore.retireAsset(tx, ctx, param(params, "id"), body));
});
