import { renderToBuffer } from "@react-pdf/renderer";

import { rentalCheckoutDocument, type PdfNode, type RentalPdfData } from "../modules/rentals/pdf.js";

/** Renders a react-pdf element tree built by `modules/rentals/pdf.ts` to PDF bytes. */
export async function renderPdfNode(node: PdfNode): Promise<Uint8Array> {
  const buffer = await renderToBuffer(node as unknown as Parameters<typeof renderToBuffer>[0]);
  return new Uint8Array(buffer);
}

/** Rental check-out (hand-over) PDF (RN-05). */
export async function renderRentalCheckout(data: RentalPdfData): Promise<Uint8Array> {
  return renderPdfNode(rentalCheckoutDocument(data));
}
