import { platformRoute } from "../auth/_platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = platformRoute("PATCH /me");
