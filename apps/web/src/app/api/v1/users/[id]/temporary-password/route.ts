import { platformRoute } from "../../../auth/_platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = platformRoute("POST /users/:id/temporary-password");
