import { tenancyRoute } from "@/features/tenancy/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = tenancyRoute("POST /platform/auth/logout");
