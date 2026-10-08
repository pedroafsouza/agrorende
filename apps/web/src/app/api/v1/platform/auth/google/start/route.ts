import { tenancyRoute } from "@/features/tenancy/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = tenancyRoute("GET /platform/auth/google/start");
