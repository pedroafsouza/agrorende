import "server-only";

import { NextResponse } from "next/server";

/** Inline PDF response for the check-out and check-in documents (RN-05). */
export function pdfResponse(pdf: { readonly bytes: Uint8Array; readonly filename: string }): NextResponse {
  return new NextResponse(Buffer.from(pdf.bytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${pdf.filename.replace(/["\\\r\n]/gu, "")}"`,
      "cache-control": "private, no-store",
    },
  });
}
