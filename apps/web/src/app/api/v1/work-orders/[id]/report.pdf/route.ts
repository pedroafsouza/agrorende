import { NextResponse } from "next/server";

import { reportLabels } from "@/features/work-orders/reportLabels";
import { workOrdersReport } from "@/features/work-orders/server";
import { OFFICE, param, query, route, write } from "@/lib/core.server";

/** WO-24 service report. `?costs=0` hides costs; labour is still hidden from managers when the org says so. */
export const GET = route(OFFICE, async (request, ctx, params) => {
  const id = param(params, "id");
  const model = await write(ctx, (tx) => workOrdersReport.buildReportModel(tx, ctx, id, { includeCosts: query(request).costs !== "0" }));
  const pdf = await workOrdersReport.renderReportPdf(model, await reportLabels(model.locale));
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${model.number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
});
