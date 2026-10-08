import { signAccessToken } from "@agrorende/core";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const buildReportModel = vi.fn();
const renderReportPdf = vi.fn();
vi.mock("@/features/work-orders/server", () => ({
  workOrdersReport: {
    buildReportModel: (...args: unknown[]) => buildReportModel(...args),
    renderReportPdf: (...args: unknown[]) => renderReportPdf(...args),
  },
}));
vi.mock("@/lib/core.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, write: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}) };
});

const SECRET = "t07-route-test-secret-0123456789abcdef";
const ORG_ID = "1b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d12";
const USER_ID = "2b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d13";
const WO_ID = "3b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d14";

async function request(search: string): Promise<Response> {
  const token = await signAccessToken({ tokenUse: "access", sub: USER_ID, orgId: ORG_ID, role: "ADMIN" }, { secret: SECRET, expiresIn: "15m" });
  const { GET } = await import("./route");
  const req = new NextRequest(`http://localhost/api/v1/work-orders/${WO_ID}/report.pdf${search}`, { headers: { authorization: `Bearer ${token}` } });
  return GET(req, { params: Promise.resolve({ id: WO_ID }) });
}

describe("GET /work-orders/:id/report.pdf", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it("streams the PDF with labels in the document locale", async () => {
    buildReportModel.mockResolvedValueOnce({ number: "OS-0007", locale: "pt-BR" });
    renderReportPdf.mockResolvedValueOnce(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    const res = await request("");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("OS-0007.pdf");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(buildReportModel).toHaveBeenLastCalledWith({}, expect.anything(), WO_ID, { includeCosts: true });
    expect(renderReportPdf.mock.lastCall?.[1]).toMatchObject({ title: "Relatório de serviço" });
  });

  it("hides costs with ?costs=0", async () => {
    buildReportModel.mockResolvedValueOnce({ number: "OS-0008", locale: "en" });
    renderReportPdf.mockResolvedValueOnce(new Uint8Array([1]));
    await request("?costs=0");
    expect(renderReportPdf.mock.lastCall?.[1]).toMatchObject({ title: "Service report" });
    expect(buildReportModel).toHaveBeenLastCalledWith({}, expect.anything(), WO_ID, { includeCosts: false });
  });
});
