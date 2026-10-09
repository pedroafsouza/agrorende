import { fuelCore } from "@/features/fuel/server";
import { OFFICE, query, readJson, route, write } from "@/lib/core.server";

const ANY_ROLE = ["ADMIN", "MANAGER", "FIELD"] as const;

/** Office list (ERP-07): `assetId`, `seasonId` (`none` for seasonless), `from`, `to`, `cursor`, `limit`. */
export const GET = route(OFFICE, (request, ctx) => {
  const q = query(request);
  return fuelCore.listFuelLogs(ctx, { ...q, limit: q.limit === undefined ? null : Number(q.limit) });
});

/** Office entry of a fill-up; the field app uses the `fuelLog.create` mutation with the same body. */
export const POST = route(ANY_ROLE, async (request, ctx) => {
  const body = (await readJson(request)) as Parameters<typeof fuelCore.createFuelLogOffice>[2];
  return write(ctx, (tx) => fuelCore.createFuelLogOffice(tx, ctx, body));
});
