import { signAccessToken } from "@agrorende/core";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const suggestTechnicians = vi.fn();
vi.mock("@/features/work-orders/server", () => ({ workOrdersSuggest: { suggestTechnicians: (...args: unknown[]) => suggestTechnicians(...args) } }));
vi.mock("@/lib/core.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, write: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}) };
});

const SECRET = "t07-route-test-secret-0123456789abcdef";
const ORG_ID = "1b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d12";
const USER_ID = "2b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d13";
const REPORT_ID = "0b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d11";

async function request(role: "ADMIN" | "FIELD", search: string): Promise<Response> {
  const token = await signAccessToken({ tokenUse: "access", sub: USER_ID, orgId: ORG_ID, role }, { secret: SECRET, expiresIn: "15m" });
  const { GET } = await import("./route");
  const req = new NextRequest(`http://localhost/api/v1/work-orders/suggestions${search}`, { headers: { authorization: `Bearer ${token}` } });
  return GET(req, { params: Promise.resolve({}) });
}

describe("GET /work-orders/suggestions", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it("ranks technicians for a field report before the job exists", async () => {
    suggestTechnicians.mockResolvedValueOnce([{ userId: "u1", name: "Ana", online: true, openCount: 1, distanceKm: 3.2, reasons: ["onDuty", "nearby"] }]);
    const res = await request("ADMIN", `?fieldReportId=${REPORT_ID}`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject([{ userId: "u1", reasons: ["onDuty", "nearby"] }]);
    expect(suggestTechnicians).toHaveBeenLastCalledWith({}, expect.objectContaining({ orgId: ORG_ID }), { fieldReportId: REPORT_ID });
  });

  it("passes an empty input when no field report is given", async () => {
    suggestTechnicians.mockResolvedValueOnce([]);
    const res = await request("ADMIN", "");
    expect(res.status).toBe(200);
    expect(suggestTechnicians).toHaveBeenLastCalledWith({}, expect.anything(), {});
  });

  it("refuses field users", async () => {
    const res = await request("FIELD", "");
    expect(res.status).toBe(403);
  });
});
