import { tenancyRoute } from "@/features/tenancy/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = tenancyRoute("GET /platform/orgs/:id");
export const PATCH = tenancyRoute("PATCH /platform/orgs/:id");
