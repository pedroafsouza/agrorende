import { assetsQueries, OFFICE, param, query, route } from "@/lib/core.server";

export const GET = route(OFFICE, (request, ctx, params) => {
  const q = query(request);
  return assetsQueries.assetHistory(ctx, param(params, "id"), { ...(q.cursor === undefined ? {} : { cursor: q.cursor }), limit: Number(q.limit ?? 50) });
});
