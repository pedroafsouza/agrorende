import { AppError } from "@agrorende/contracts/errors";
import { signAccessToken } from "@agrorende/core";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const markForRepair = vi.fn();
vi.mock("@/features/reports/server", () => ({ fieldReportsCore: { markForRepair: (...args: unknown[]) => markForRepair(...args) } }));
vi.mock("@/lib/core.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, write: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}) };
});

const SECRET = "t06-route-test-secret-0123456789abcdef";
const REPORT_ID = "0b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d11";
const ORG_ID = "1b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d12";
const USER_ID = "2b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d13";

async function request(role: "ADMIN" | "FIELD", body: unknown): Promise<Response> {
  const token = await signAccessToken({ tokenUse: "access", sub: USER_ID, orgId: ORG_ID, role }, { secret: SECRET, expiresIn: "15m" });
  const { POST } = await import("./route");
  const req = new NextRequest(`http://localhost/api/v1/field-reports/${REPORT_ID}/mark-for-repair`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id: REPORT_ID }) });
}

describe("POST /field-reports/:id/mark-for-repair", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it("returns the created work order", async () => {
    markForRepair.mockResolvedValueOnce({ workOrderId: "w1", workOrderNumber: "OS-0001", attached: false });
    const res = await request("ADMIN", { priority: "HIGH" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ workOrderNumber: "OS-0001", attached: false });
    expect(markForRepair).toHaveBeenLastCalledWith({}, expect.objectContaining({ orgId: ORG_ID, userId: USER_ID }), REPORT_ID, { priority: "HIGH" });
  });

  it("answers 409 ASSET_REPAIR_ALREADY_OPEN with the open work order (EC-FR-15)", async () => {
    const workOrder = { id: "w9", number: "OS-0009", title: "Hydraulic leak", status: "ASSIGNED", priority: "HIGH", assigneeId: null, assigneeName: null, updatedAt: new Date().toISOString() };
    markForRepair.mockRejectedValueOnce(new AppError("ASSET_REPAIR_ALREADY_OPEN", { details: { workOrder } }));
    const res = await request("ADMIN", {});
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: { code: string; details: { workOrder: { number: string } } } };
    expect(json.error.code).toBe("ASSET_REPAIR_ALREADY_OPEN");
    expect(json.error.details.workOrder.number).toBe("OS-0009");
  });

  it("refuses field users with OFFICE_ROLE_REQUIRED", async () => {
    const res = await request("FIELD", {});
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("OFFICE_ROLE_REQUIRED");
  });
});
