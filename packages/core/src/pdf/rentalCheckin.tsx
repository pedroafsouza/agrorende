import { rentalCheckinDocument, type RentalPdfData } from "../modules/rentals/pdf.js";
import { renderPdfNode } from "./rentalCheckout.js";

/** Rental check-in (return) PDF (RN-05). */
export async function renderRentalCheckin(data: RentalPdfData): Promise<Uint8Array> {
  return (renderPdfNode as (node: ReturnType<typeof rentalCheckinDocument>) => Promise<Uint8Array>)(rentalCheckinDocument(data));
}
