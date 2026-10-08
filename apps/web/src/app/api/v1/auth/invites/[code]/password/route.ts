import { platformRoute } from "../../../_platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = platformRoute("POST /auth/invites/:code/password");
