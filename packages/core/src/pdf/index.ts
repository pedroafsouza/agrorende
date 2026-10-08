import type { Ctx } from "../context.js";

/** Renders the check-out or check-in PDF of a rental (RN-05). Delegates to the rentals module, which loads the data. */
export async function renderRentalDocument(
  ctx: Pick<Ctx, "orgId">,
  rentalId: string,
  kind: "checkout" | "checkin" = "checkout",
): Promise<Uint8Array> {
  const { renderRentalPdf } = await import("../modules/rentals/queries.js");
  const { bytes } = await renderRentalPdf(ctx, rentalId, kind);
  return bytes;
}

export { renderRentalCheckin } from "./rentalCheckin.js";
export { renderPdfNode, renderRentalCheckout } from "./rentalCheckout.js";
export { renderWorkOrderReport } from "./workOrderReport.js";
