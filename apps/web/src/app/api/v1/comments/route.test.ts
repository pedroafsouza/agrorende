import { AppError } from "@agrorende/contracts/errors";
import { signAccessToken } from "@agrorende/core";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const listComments = vi.fn();
const createCommentFromInput = vi.fn();
vi.mock("@/features/comments/server", () => ({
  commentsCore: {
    listComments: (...args: unknown[]) => listComments(...args),
    createCommentFromInput: (...args: unknown[]) => createCommentFromInput(...args),
  },
}));
vi.mock("@/lib/core.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, write: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}) };
});

const SECRET = "t17-route-test-secret-0123456789abcdef";
const ORG_ID = "1b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d12";
const USER_ID = "2b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d13";
const WO_ID = "3b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d14";

async function token(role: "ADMIN" | "FIELD"): Promise<string> {
  return signAccessToken({ tokenUse: "access", sub: USER_ID, orgId: ORG_ID, role }, { secret: SECRET, expiresIn: "15m" });
}

describe("/comments", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it("GET passes the query to the thread reader", async () => {
    listComments.mockResolvedValueOnce({ items: [] });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://localhost/api/v1/comments?entityType=WORK_ORDER&entityId=${WO_ID}`, { headers: { authorization: `Bearer ${await token("FIELD")}` } }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(listComments).toHaveBeenLastCalledWith(expect.objectContaining({ orgId: ORG_ID, userId: USER_ID }), expect.objectContaining({ entityType: "WORK_ORDER", entityId: WO_ID }));
  });

  it("POST lets a field user comment inside a transaction", async () => {
    createCommentFromInput.mockResolvedValueOnce({ id: "c1", body: "Done" });
    const { POST } = await import("./route");
    const body = { entityType: "WORK_ORDER", entityId: WO_ID, body: "Done" };
    const res = await POST(
      new NextRequest("http://localhost/api/v1/comments", { method: "POST", headers: { authorization: `Bearer ${await token("FIELD")}`, "content-type": "application/json" }, body: JSON.stringify(body) }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    expect(createCommentFromInput).toHaveBeenLastCalledWith({}, expect.objectContaining({ role: "FIELD" }), body);
  });

  it("answers 404 when the record is outside the caller's reach", async () => {
    createCommentFromInput.mockRejectedValueOnce(new AppError("NOT_FOUND"));
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/comments", { method: "POST", headers: { authorization: `Bearer ${await token("ADMIN")}`, "content-type": "application/json" }, body: JSON.stringify({ entityType: "RENTAL", entityId: WO_ID, body: "x" }) }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(404);
  });
});
