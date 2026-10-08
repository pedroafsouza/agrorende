import QRCode from "qrcode";
import { NextResponse } from "next/server";

import { assetsQueries, OFFICE, param, route } from "@/lib/core.server";

/** PNG label for an asset; the payload is `agrorende://a/<code>` (ARCHITECTURE §6, PLT-06). */
export const GET = route(OFFICE, async (_request, ctx, params) => {
  const asset = await assetsQueries.getAsset(ctx, param(params, "id"));
  const png = await QRCode.toBuffer(`agrorende://a/${asset.code}`, { type: "png", errorCorrectionLevel: "H", margin: 2, width: 512 });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-disposition": `attachment; filename="${asset.code}.png"`,
      "cache-control": "private, max-age=300",
    },
  });
});
