import { AppError } from "@agrorende/contracts/errors";
import { signAccessToken } from "@agrorende/core";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const releaseSafetyHold = vi.fn();
vi.mock("@/features/work-orders/server", () => ({ workOrdersField: { releaseSafetyHold: (...args: unknown[]) => releaseSafetyHold(...args) } }));
vi.mock("@/lib/core.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, write: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}) };
});

const SECRET = "t07-route-test-secret-0123456789abcdef";
const ORG_ID = "1b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d12";
const USER_ID = "2b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d13";
const WO_ID = "3b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d14";

async function request(body?: string): Promise<Response> {
  const token = await signAccessToken({ tokenUse: "access", sub: USER_ID, orgId: ORG_ID, role: "ADMIN" }, { secret: SECRET, expiresIn: "15m" });
  const { POST } = await import("./route");
  const req = new NextRequest(`http://localhost/api/v1/work-orders/${WO_ID}/release-hold`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });
  return POST(req, { params: Promise.resolve({ id: WO_ID }) });
}

describe("POST /work-orders/:id/release-hold (EC-WO-09)", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it("accepts an empty body", async () => {
    releaseSafetyHold.mockResolvedValueOnce({ id: WO_ID, status: "IN_PROGRESS" });
    const res = await request();
    expect(res.status).toBe(200);
    expect(releaseSafetyHold).toHaveBeenLastCalledWith({}, expect.anything(), WO_ID, {});
  });

  it("passes the review note", async () => {
    releaseSafetyHold.mockResolvedValueOnce({ id: WO_ID, status: "IN_PROGRESS" });
    await request(JSON.stringify({ note: "Guard replaced" }));
    expect(releaseSafetyHold).toHaveBeenLastCalledWith({}, expect.anything(), WO_ID, { note: "Guard replaced" });
  });

  it("answers 409 INVALID_TRANSITION when the job is not held for safety", async () => {
    releaseSafetyHold.mockRejectedValueOnce(new AppError("INVALID_TRANSITION"));
    const res = await request("{}");
    expect(res.status).toBe(409);
  });
});
