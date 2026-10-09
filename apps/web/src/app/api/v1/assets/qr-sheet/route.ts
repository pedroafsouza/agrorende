import { renderQrSheet } from "@agrorende/core/modules/assets/qrSheet";
import { NextResponse } from "next/server";

import { encodeQr } from "@/features/assets/qrEncoder";
import { OFFICE, readJson, route } from "@/lib/core.server";

/** `POST /assets/qr-sheet` (PLT-06, T16.6): A4 PDF of QR labels for the selected assets. */
export const POST = route(OFFICE, async (request, ctx) => {
  const { bytes } = await renderQrSheet(ctx, await readJson(request), encodeQr);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="agrorende-qr.pdf"',
      "cache-control": "no-store",
    },
  });
});
