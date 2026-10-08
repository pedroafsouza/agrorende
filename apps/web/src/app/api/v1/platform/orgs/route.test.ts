import { signAccessToken } from "@agrorende/core";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const SECRET = "t20-route-test-secret-0123456789abcdef";
const ORG_ID = "1b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d12";
const USER_ID = "2b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d13";

async function tenantToken(): Promise<string> {
  return signAccessToken({ tokenUse: "access", sub: USER_ID, orgId: ORG_ID, role: "ADMIN" }, { secret: SECRET, expiresIn: "15m" });
}

async function errorCode(res: Response): Promise<string> {
  const json = (await res.json()) as { error: { code: string } };
  return json.error.code;
}

describe("GET /platform/orgs (TEN-06 tenant boundary)", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
    process.env.PLATFORM_ADMIN_EMAILS = "staff@agrorende.app";
  });

  it("rejects a tenant ADMIN bearer token with 401 UNAUTHENTICATED", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/v1/platform/orgs", { headers: { authorization: `Bearer ${await tenantToken()}` } }), {});
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("UNAUTHENTICATED");
  });

  it("rejects a tenant access token smuggled into the ar_platform cookie", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/v1/platform/orgs", { headers: { cookie: `ar_platform=${await tenantToken()}; ar_access=${await tenantToken()}` } }), {});
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("UNAUTHENTICATED");
  });
});
