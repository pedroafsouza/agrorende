import { platformRoute } from "../_platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = platformRoute("GET /auth/me");
export const DELETE = platformRoute("DELETE /auth/me");
