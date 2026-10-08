import { rentalCheckinDocument, type RentalPdfData } from "../modules/rentals/pdf.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- TS6142 only where `jsx` is unset (core); apps with `jsx` resolve it (change request T08-001).
// @ts-ignore
import { renderPdfNode } from "./rentalCheckout.js";

/** Rental check-in (return) PDF (RN-05). */
export async function renderRentalCheckin(data: RentalPdfData): Promise<Uint8Array> {
  return (renderPdfNode as (node: ReturnType<typeof rentalCheckinDocument>) => Promise<Uint8Array>)(rentalCheckinDocument(data));
}
