import { AppError } from "@agrorende/contracts/errors";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assertOrganizationWritable = vi.fn<(ctx: { organizationId: string }) => Promise<void>>();

vi.mock("@agrorende/core", () => ({
  verifyAccessToken: vi.fn(async () => ({ sub: "user-1", orgId: "org-1", role: "ADMIN", deviceId: null })),
}));
vi.mock("@agrorende/core/tenancy", () => ({
  assertOrganizationWritable: (ctx: { organizationId: string }) => assertOrganizationWritable(ctx),
}));

const { requiresWritableOrg, withApi } = await import("./withApi");

function request(method: string, path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method, headers: { authorization: "Bearer token" } });
}

const handler = withApi(() => ({ ok: true }), { roles: ["ADMIN"] });

describe("organisation read-only gate (EC-OPS-29)", () => {
  beforeEach(() => {
    assertOrganizationWritable.mockReset();
  });

  it("only gates office writes, not reads or the exempt routes", () => {
    expect(requiresWritableOrg("GET", "/api/v1/assets")).toBe(false);
    expect(requiresWritableOrg("POST", "/api/v1/assets")).toBe(true);
    expect(requiresWritableOrg("PATCH", "/api/v1/work-orders/1")).toBe(true);
    expect(requiresWritableOrg("POST", "/api/v1/exports")).toBe(false);
    expect(requiresWritableOrg("POST", "/api/v1/auth/login")).toBe(false);
    expect(requiresWritableOrg("POST", "/api/v1/org/accept-terms")).toBe(false);
    expect(requiresWritableOrg("POST", "/api/v1/sync/push")).toBe(false);
    expect(requiresWritableOrg("POST", "/api/v1/media/1/complete")).toBe(false);
    expect(requiresWritableOrg("POST", "/api/v1/maintenance-plans")).toBe(true);
  });

  it("rejects an office write with ORG_SUSPENDED while the organisation is read-only", async () => {
    assertOrganizationWritable.mockRejectedValue(new AppError("ORG_SUSPENDED", { details: { status: "SUSPENDED" } }));
    const response = await handler(request("POST", "/api/v1/assets"), {});
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("ORG_SUSPENDED");
    expect(assertOrganizationWritable).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1" }));
  });

  it("lets reads and exports through without checking the organisation", async () => {
    assertOrganizationWritable.mockRejectedValue(new AppError("ORG_SUSPENDED"));
    expect((await handler(request("GET", "/api/v1/assets"), {})).status).toBe(200);
    expect((await handler(request("POST", "/api/v1/exports"), {})).status).toBe(200);
    expect(assertOrganizationWritable).not.toHaveBeenCalled();
  });

  it("accepts writes for a writable organisation", async () => {
    assertOrganizationWritable.mockResolvedValue(undefined);
    expect((await handler(request("POST", "/api/v1/assets"), {})).status).toBe(200);
  });
});
