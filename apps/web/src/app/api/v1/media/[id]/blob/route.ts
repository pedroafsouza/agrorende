import { platformRoute } from "../../../auth/_platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = platformRoute("PUT /media/:id/blob");
export const GET = platformRoute("GET /media/:id/blob");
