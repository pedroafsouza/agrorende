import { platformRoute } from "../auth/_platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = platformRoute("GET /settings");
export const PATCH = platformRoute("PATCH /settings");
