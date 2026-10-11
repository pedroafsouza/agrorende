import { AppError } from "@agrorende/contracts/errors";
import { signAccessToken } from "@agrorende/core";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createInvite = vi.fn();
const listInvites = vi.fn();
const setAgreement = vi.fn();
const viewProviderLink = vi.fn();
const counterProviderLink = vi.fn();
vi.mock("@/features/providers/server", () => ({
  providersCore: {
    createInvite: (...args: unknown[]) => createInvite(...args),
    listInvites: (...args: unknown[]) => listInvites(...args),
    setAgreement: (...args: unknown[]) => setAgreement(...args),
  },
  providerLinks: {
    viewProviderLink: (...args: unknown[]) => viewProviderLink(...args),
    counterProviderLink: (...args: unknown[]) => counterProviderLink(...args),
  },
}));
vi.mock("@/lib/core.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, write: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}) };
});

const SECRET = "supplier-route-test-secret-0123456789abcdef";
const ORG_ID = "1b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d12";
const USER_ID = "2b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d13";
const WO_ID = "3b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d14";
const INVITE_ID = "4b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d15";
const TOKEN = "a".repeat(43);

async function bearer(role: "MANAGER" | "FIELD"): Promise<string> {
  return `Bearer ${await signAccessToken({ tokenUse: "access", sub: USER_ID, orgId: ORG_ID, role }, { secret: SECRET, expiresIn: "15m" })}`;
}

function json(url: string, method: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("office provider-invite routes (#63, #65)", () => {
  it("POST creates an invite for an office user inside a transaction", async () => {
    createInvite.mockResolvedValueOnce({ invite: { id: INVITE_ID }, link: { url: `http://localhost/p/${TOKEN}`, expiresAt: "2030-01-01T00:00:00.000Z" } });
    const { POST } = await import("@/app/api/v1/work-orders/[id]/provider-invites/route");
    const body = { providerName: "Zé", phone: "64999990000" };
    const res = await POST(json(`http://localhost/api/v1/work-orders/${WO_ID}/provider-invites`, "POST", body, { authorization: await bearer("MANAGER") }), { params: Promise.resolve({ id: WO_ID }) });
    expect(res.status).toBe(200);
    expect(createInvite).toHaveBeenCalledWith({}, expect.objectContaining({ orgId: ORG_ID, role: "MANAGER" }), WO_ID, body);
  });

  it("keeps field users out", async () => {
    const { GET } = await import("@/app/api/v1/work-orders/[id]/provider-invites/route");
    const res = await GET(new NextRequest(`http://localhost/api/v1/work-orders/${WO_ID}/provider-invites`, { headers: { authorization: await bearer("FIELD") } }), { params: Promise.resolve({ id: WO_ID }) });
    expect(res.status).toBe(403);
    expect(listInvites).not.toHaveBeenCalled();
  });

  it("PATCH agreement passes both ids and the body", async () => {
    setAgreement.mockResolvedValueOnce({ id: INVITE_ID });
    const { PATCH } = await import("@/app/api/v1/work-orders/[id]/provider-invites/[inviteId]/agreement/route");
    const body = { agreedValueCents: 150_000, paymentMethod: "PIX" };
    const res = await PATCH(json("http://localhost/x", "PATCH", body, { authorization: await bearer("MANAGER") }), { params: Promise.resolve({ id: WO_ID, inviteId: INVITE_ID }) });
    expect(res.status).toBe(200);
    expect(setAgreement).toHaveBeenCalledWith({}, expect.anything(), WO_ID, INVITE_ID, body);
  });
});

describe("public provider-link routes (#64)", () => {
  it("GET needs no session and rate-limits by the forwarded address", async () => {
    viewProviderLink.mockResolvedValueOnce({ organizationName: "Org" });
    const { GET } = await import("@/app/api/v1/provider-links/[token]/route");
    const res = await GET(new NextRequest(`http://localhost/api/v1/provider-links/${TOKEN}`, { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(200);
    expect(viewProviderLink).toHaveBeenCalledWith(TOKEN, { clientKey: "203.0.113.9" });
  });

  it("answers 410 INVITE_EXPIRED with the reason for a dead link", async () => {
    viewProviderLink.mockRejectedValueOnce(new AppError("INVITE_EXPIRED", { details: { reason: "revoked" } }));
    const { GET } = await import("@/app/api/v1/provider-links/[token]/route");
    const res = await GET(new NextRequest(`http://localhost/api/v1/provider-links/${TOKEN}`), { params: Promise.resolve({ token: TOKEN }) });
    expect(res.status).toBe(410);
    const payload = (await res.json()) as { error: { code: string; details?: { reason?: string } } };
    expect(payload.error.code).toBe("INVITE_EXPIRED");
    expect(payload.error.details?.reason).toBe("revoked");
  });

  it("POST counter forwards the JSON body and rejects malformed JSON", async () => {
    counterProviderLink.mockResolvedValueOnce({ organizationName: "Org" });
    const { POST } = await import("@/app/api/v1/provider-links/[token]/counter/route");
    const ok = await POST(json("http://localhost/x", "POST", { priceCents: 1000 }), { params: Promise.resolve({ token: TOKEN }) });
    expect(ok.status).toBe(200);
    expect(counterProviderLink).toHaveBeenCalledWith(TOKEN, { priceCents: 1000 }, { clientKey: "unknown" });
    const bad = await POST(new NextRequest("http://localhost/x", { method: "POST", body: "{" }), { params: Promise.resolve({ token: TOKEN }) });
    expect(bad.status).toBe(422);
  });
});
