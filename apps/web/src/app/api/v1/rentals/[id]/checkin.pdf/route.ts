import { pdfResponse } from "@/features/rentals/pdfResponse";
import { rentalsQueries } from "@/features/rentals/server";
import { OFFICE, param, route } from "@/lib/core.server";

export const GET = route(OFFICE, async (_request, ctx, params) => pdfResponse(await rentalsQueries.renderRentalPdf(ctx, param(params, "id"), "checkin")));
