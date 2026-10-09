import { signAccessToken } from "@agrorende/core";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const linkAsset = vi.fn();
vi.mock("@/features/reports/server", () => ({ fieldReportsCore: { linkAsset: (...args: unknown[]) => linkAsset(...args) } }));
vi.mock("@/lib/core.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, write: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}) };
});

const SECRET = "t17-route-test-secret-0123456789abcdef";
const REPORT_ID = "0b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d11";
const ORG_ID = "1b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d12";
const USER_ID = "2b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d13";
const ASSET_ID = "3b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d14";

async function request(role: "MANAGER" | "FIELD"): Promise<Response> {
  const token = await signAccessToken({ tokenUse: "access", sub: USER_ID, orgId: ORG_ID, role }, { secret: SECRET, expiresIn: "15m" });
  const { POST } = await import("./route");
  const req = new NextRequest(`http://localhost/api/v1/field-reports/${REPORT_ID}/link-asset`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ assetId: ASSET_ID }),
  });
  return POST(req, { params: Promise.resolve({ id: REPORT_ID }) });
}

describe("POST /field-reports/:id/link-asset", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it("links the report for office roles", async () => {
    linkAsset.mockResolvedValueOnce({ id: REPORT_ID, assetId: ASSET_ID });
    const res = await request("MANAGER");
    expect(res.status).toBe(200);
    expect(linkAsset).toHaveBeenLastCalledWith({}, expect.objectContaining({ orgId: ORG_ID }), REPORT_ID, { assetId: ASSET_ID });
  });

  it("refuses field users with OFFICE_ROLE_REQUIRED", async () => {
    const res = await request("FIELD");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("OFFICE_ROLE_REQUIRED");
  });
});
