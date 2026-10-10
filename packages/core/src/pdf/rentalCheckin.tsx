import { rentalCheckinDocument, type RentalPdfData } from "../modules/rentals/pdf";
import { renderPdfNode } from "./rentalCheckout";

/** Rental check-in (return) PDF (RN-05). */
export async function renderRentalCheckin(data: RentalPdfData): Promise<Uint8Array> {
  return (renderPdfNode as (node: ReturnType<typeof rentalCheckinDocument>) => Promise<Uint8Array>)(rentalCheckinDocument(data));
}
