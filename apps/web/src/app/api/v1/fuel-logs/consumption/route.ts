import { fuelCore } from "@/features/fuel/server";
import { OFFICE, query, route } from "@/lib/core.server";

/** Litres per engine hour between consecutive fill-ups of one `assetId` (ERP-07). */
export const GET = route(OFFICE, (request, ctx) => fuelCore.fuelConsumption(ctx, query(request)));
