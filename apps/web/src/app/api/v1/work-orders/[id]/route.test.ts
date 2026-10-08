import { AppError } from "@agrorende/contracts/errors";
import { signAccessToken } from "@agrorende/core";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const patch = vi.fn();
const detail = vi.fn();
const get = vi.fn();
vi.mock("@/features/work-orders/server", () => ({
  workOrdersCore: { patch: (...args: unknown[]) => patch(...args) },
  workOrdersQueries: { detail: (...args: unknown[]) => detail(...args), get: (...args: unknown[]) => get(...args) },
}));
vi.mock("@/lib/core.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, write: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}) };
});

const SECRET = "t07-route-test-secret-0123456789abcdef";
const ORG_ID = "1b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d12";
const USER_ID = "2b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d13";
const WO_ID = "3b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d14";

async function token(): Promise<string> {
  return signAccessToken({ tokenUse: "access", sub: USER_ID, orgId: ORG_ID, role: "ADMIN" }, { secret: SECRET, expiresIn: "15m" });
}

describe("/work-orders/:id", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it("GET ?include=detail returns the detail view", async () => {
    detail.mockResolvedValueOnce({ id: WO_ID, parts: [] });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://localhost/api/v1/work-orders/${WO_ID}?include=detail`, { headers: { authorization: `Bearer ${await token()}` } }), { params: Promise.resolve({ id: WO_ID }) });
    expect(res.status).toBe(200);
    expect(detail).toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("PATCH forwards If-Match and maps CONFLICT to 409", async () => {
    patch.mockRejectedValueOnce(new AppError("CONFLICT"));
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest(`http://localhost/api/v1/work-orders/${WO_ID}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json", "if-match": '"3"' },
        body: JSON.stringify({ title: "Trocar mangueira" }),
      }),
      { params: Promise.resolve({ id: WO_ID }) },
    );
    expect(res.status).toBe(409);
    expect(patch).toHaveBeenLastCalledWith({}, expect.anything(), WO_ID, { title: "Trocar mangueira" }, '"3"');
  });
});
