import type { CustomerCreateInput } from "@/lib/core.types";
import { customersCore, customersQueries, OFFICE, query, readJson, route, write } from "@/lib/core.server";

export const GET = route(OFFICE, (request, ctx) => customersQueries.listCustomers(ctx, query(request)));

export const POST = route(OFFICE, async (request, ctx) => {
  const body = (await readJson(request)) as CustomerCreateInput;
  return write(ctx, (tx) => customersCore.createCustomer(tx, ctx, body));
});
