import { partsCore } from "@/features/parts/server";
import { OFFICE, query, readJson, route, write } from "@/lib/core.server";

const ANY_ROLE = ["ADMIN", "MANAGER", "FIELD"] as const;

/** Catalog (ERP-05): `q` searches SKU and name, `category` filters compatible categories, `includeArchived=true`. */
export const GET = route(ANY_ROLE, (request, ctx) => {
  const q = query(request);
  return partsCore.listParts(ctx, { q: q.q ?? null, category: q.category ?? null, includeArchived: q.includeArchived === "true" });
});

export const POST = route(OFFICE, async (request, ctx) => {
  const body = await readJson(request);
  return write(ctx, (tx) => partsCore.createPart(tx, ctx, body));
});
