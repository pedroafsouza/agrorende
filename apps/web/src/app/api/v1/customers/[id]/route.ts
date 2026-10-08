import type { CustomerUpdateInput } from "@/lib/core.types";
import { customersCore, customersQueries, ifMatch, OFFICE, param, readJson, route, write } from "@/lib/core.server";

export const GET = route(OFFICE, (_request, ctx, params) => customersQueries.getCustomer(ctx, param(params, "id")));

export const PATCH = route(OFFICE, async (request, ctx, params) => {
  const body = (await readJson(request)) as CustomerUpdateInput;
  return write(ctx, (tx) => customersCore.updateCustomer(tx, ctx, param(params, "id"), body, ifMatch(request)));
});

export const DELETE = route(OFFICE, (_request, ctx, params) => write(ctx, (tx) => customersCore.deleteCustomer(tx, ctx, param(params, "id"))));
