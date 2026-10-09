import { billingCore } from "@/features/billing/server";
import { pdfResponse } from "@/features/rentals/pdfResponse";
import { OFFICE, param, route } from "@/lib/core.server";

/** Billing document PDF (PLT-11) in the source document language. */
export const GET = route(OFFICE, async (_request, ctx, params) => pdfResponse(await billingCore.renderBillingPdf(ctx, param(params, "id"))));
