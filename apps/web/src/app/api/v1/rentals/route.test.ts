import { AppError } from "@agrorende/contracts/errors";
import { signAccessToken } from "@agrorende/core";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const core = {
  createRental: vi.fn(),
  reserveRental: vi.fn(),
  closeRental: vi.fn(),
  cancelRental: vi.fn(),
  addManualCharge: vi.fn(),
  deleteManualCharge: vi.fn(),
  updateDamage: vi.fn(),
  createDamageWorkOrder: vi.fn(),
};
const queries = {
  listRentals: vi.fn(),
  getRentalDetail: vi.fn(),
  checkEligibility: vi.fn(),
  compareInspection: vi.fn(),
  renderRentalPdf: vi.fn(),
};
vi.mock("@/features/rentals/server", () => ({ rentalsCore: core, rentalsQueries: queries }));
vi.mock("@/lib/core.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, write: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({}) };
});

const SECRET = "t08-route-test-secret-0123456789abcdef";
const ORG_ID = "1b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d12";
const USER_ID = "2b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d13";
const RENTAL_ID = "3b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d14";
const INSPECTION_ID = "4b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d15";
const DAMAGE_ID = "5b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d16";

type Role = "ADMIN" | "MANAGER" | "FIELD";
type Handler = (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: Handler, role: Role, init: { path: string; method: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string> }): Promise<Response> {
  const token = await signAccessToken({ tokenUse: "access", sub: USER_ID, orgId: ORG_ID, role }, { secret: SECRET, expiresIn: "15m" });
  const req = new NextRequest(`http://localhost/api/v1${init.path}`, {
    method: init.method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return handler(req, { params: Promise.resolve(init.params ?? {}) });
}

async function errorOf(res: Response): Promise<{ code: string; details?: Record<string, unknown> }> {
  const json = (await res.json()) as { error: { code: string; details?: Record<string, unknown> } };
  return json.error;
}

const rental = { id: RENTAL_ID, number: "LOC-0001", status: "RESERVED", chargesVersion: 1 };

describe("rental office routes", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("role matrix (T08.17)", () => {
    const writes: Array<[string, () => Promise<Handler>, { path: string; method: string; body?: unknown; params?: Record<string, string> }]> = [
      ["POST /rentals", async () => (await import("./route")).POST, { path: "/rentals", method: "POST", body: {} }],
      ["POST /rentals/:id/reserve", async () => (await import("./[id]/reserve/route")).POST, { path: `/rentals/${RENTAL_ID}/reserve`, method: "POST", params: { id: RENTAL_ID } }],
      ["POST /rentals/:id/cancel", async () => (await import("./[id]/cancel/route")).POST, { path: `/rentals/${RENTAL_ID}/cancel`, method: "POST", body: { reason: "x" }, params: { id: RENTAL_ID } }],
      ["POST /rentals/:id/close", async () => (await import("./[id]/close/route")).POST, { path: `/rentals/${RENTAL_ID}/close`, method: "POST", body: {}, params: { id: RENTAL_ID } }],
      ["POST /rentals/:id/charges", async () => (await import("./[id]/charges/route")).POST, { path: `/rentals/${RENTAL_ID}/charges`, method: "POST", body: {}, params: { id: RENTAL_ID } }],
      ["DELETE /rentals/:id/charges/:lineId", async () => (await import("./[id]/charges/[lineId]/route")).DELETE, { path: `/rentals/${RENTAL_ID}/charges/l1`, method: "DELETE", params: { id: RENTAL_ID, lineId: "l1" } }],
      ["PATCH /damages/:id", async () => (await import("../damages/[id]/route")).PATCH, { path: `/damages/${DAMAGE_ID}`, method: "PATCH", body: {}, params: { id: DAMAGE_ID } }],
      ["POST /damages/:id/create-work-order", async () => (await import("../damages/[id]/create-work-order/route")).POST, { path: `/damages/${DAMAGE_ID}/create-work-order`, method: "POST", body: {}, params: { id: DAMAGE_ID } }],
      ["GET /rentals", async () => (await import("./route")).GET, { path: "/rentals", method: "GET" }],
    ];

    it.each(writes)("refuses FIELD on %s with OFFICE_ROLE_REQUIRED", async (_name, load, init) => {
      const res = await call(await load(), "FIELD", init);
      expect(res.status).toBe(403);
      expect((await errorOf(res)).code).toBe("OFFICE_ROLE_REQUIRED");
      for (const fn of [...Object.values(core), ...Object.values(queries)]) expect(fn).not.toHaveBeenCalled();
    });

    it("lets MANAGER create a draft rental", async () => {
      core.createRental.mockResolvedValueOnce({ ...rental, status: "DRAFT" });
      const { POST } = await import("./route");
      const body = { assetId: "a", customerId: "c", plannedStart: "2026-11-01T08:00:00-03:00", plannedEnd: "2026-11-03T08:00:00-03:00" };
      const res = await call(POST, "MANAGER", { path: "/rentals", method: "POST", body });
      expect(res.status).toBe(200);
      expect(core.createRental).toHaveBeenCalledWith({}, expect.objectContaining({ orgId: ORG_ID, role: "MANAGER" }), body);
    });

    it("passes the list filters through, including OVERDUE", async () => {
      queries.listRentals.mockResolvedValueOnce({ items: [], nextCursor: null });
      const { GET } = await import("./route");
      const res = await call(GET, "ADMIN", { path: "/rentals?status=OVERDUE&q=LOC", method: "GET" });
      expect(res.status).toBe(200);
      expect(queries.listRentals).toHaveBeenCalledWith(expect.objectContaining({ orgId: ORG_ID }), { status: "OVERDUE", q: "LOC" });
    });
  });

  describe("POST /rentals/:id/reserve", () => {
    it("reserves and forwards If-Match", async () => {
      core.reserveRental.mockResolvedValueOnce(rental);
      const { POST } = await import("./[id]/reserve/route");
      const res = await call(POST, "ADMIN", { path: `/rentals/${RENTAL_ID}/reserve`, method: "POST", params: { id: RENTAL_ID }, headers: { "if-match": '"3"' } });
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ status: "RESERVED" });
      expect(core.reserveRental).toHaveBeenCalledWith({}, expect.objectContaining({ userId: USER_ID }), RENTAL_ID, '"3"');
    });

    it("answers 422 CUSTOMER_INCOMPLETE with every eligibility code (EC-RN-03)", async () => {
      core.reserveRental.mockRejectedValueOnce(new AppError("CUSTOMER_INCOMPLETE", { details: { codes: ["CUSTOMER_INCOMPLETE"] } }));
      const { POST } = await import("./[id]/reserve/route");
      const res = await call(POST, "ADMIN", { path: `/rentals/${RENTAL_ID}/reserve`, method: "POST", params: { id: RENTAL_ID } });
      expect(res.status).toBe(422);
      const error = await errorOf(res);
      expect(error.code).toBe("CUSTOMER_INCOMPLETE");
      expect(error.details).toMatchObject({ codes: ["CUSTOMER_INCOMPLETE"] });
    });

    it("answers 409 ASSET_DOUBLE_BOOKED (EC-RN-01)", async () => {
      core.reserveRental.mockRejectedValueOnce(new AppError("ASSET_DOUBLE_BOOKED", { details: { codes: ["ASSET_DOUBLE_BOOKED"] } }));
      const { POST } = await import("./[id]/reserve/route");
      const res = await call(POST, "MANAGER", { path: `/rentals/${RENTAL_ID}/reserve`, method: "POST", params: { id: RENTAL_ID } });
      expect(res.status).toBe(409);
      expect((await errorOf(res)).code).toBe("ASSET_DOUBLE_BOOKED");
    });
  });

  describe("GET /rentals/eligibility", () => {
    it("returns codes and the site warning", async () => {
      queries.checkEligibility.mockResolvedValueOnce({ eligible: false, codes: ["CUSTOMER_INCOMPLETE"], warnings: ["RENTAL_SITE_MISMATCH"] });
      const { GET } = await import("./eligibility/route");
      const res = await call(GET, "ADMIN", { path: "/rentals/eligibility?assetId=a&from=f&to=t", method: "GET" });
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ eligible: false, codes: ["CUSTOMER_INCOMPLETE"], warnings: ["RENTAL_SITE_MISMATCH"] });
      expect(queries.checkEligibility).toHaveBeenCalledWith(expect.anything(), { assetId: "a", from: "f", to: "t" });
    });
  });

  describe("POST /rentals/:id/close", () => {
    it("closes with the payment note and charges version", async () => {
      core.closeRental.mockResolvedValueOnce({ ...rental, status: "CLOSED" });
      const { POST } = await import("./[id]/close/route");
      const res = await call(POST, "ADMIN", { path: `/rentals/${RENTAL_ID}/close`, method: "POST", body: { paymentNote: "PIX", chargesVersion: 4 }, params: { id: RENTAL_ID } });
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ status: "CLOSED" });
      expect(core.closeRental).toHaveBeenCalledWith({}, expect.anything(), RENTAL_ID, { paymentNote: "PIX", chargesVersion: 4 });
    });

    it("is blocked while a damage is held", async () => {
      core.closeRental.mockRejectedValueOnce(new AppError("VALIDATION_FAILED", { details: { reason: "damageHeld", damageIds: [DAMAGE_ID] } }));
      const { POST } = await import("./[id]/close/route");
      const res = await call(POST, "ADMIN", { path: `/rentals/${RENTAL_ID}/close`, method: "POST", body: {}, params: { id: RENTAL_ID } });
      expect(res.status).toBe(422);
      const error = await errorOf(res);
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.details).toMatchObject({ reason: "damageHeld", damageIds: [DAMAGE_ID] });
    });

    it("returns the new totals when charges changed (RENTAL_CHARGES_UPDATED)", async () => {
      core.closeRental.mockRejectedValueOnce(new AppError("RENTAL_CHARGES_UPDATED", { details: { chargesVersion: 5, totalCents: 120000, balanceDueCents: 20000 } }));
      const { POST } = await import("./[id]/close/route");
      const res = await call(POST, "MANAGER", { path: `/rentals/${RENTAL_ID}/close`, method: "POST", body: { chargesVersion: 4 }, params: { id: RENTAL_ID } });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const error = await errorOf(res);
      expect(error.code).toBe("RENTAL_CHARGES_UPDATED");
      expect(error.details).toMatchObject({ chargesVersion: 5, totalCents: 120000 });
    });
  });

  describe("GET /inspections/:id/compare", () => {
    it("returns check-out and check-in side by side", async () => {
      const checkOut = { id: INSPECTION_ID, type: "CHECK_OUT", hourMeter: 100, media: [] };
      const checkIn = { id: "6b6f5d8e-2f43-4a1c-9d7e-0a4b2f6c1d17", type: "CHECK_IN", hourMeter: 140, media: [] };
      queries.compareInspection.mockResolvedValueOnce({ rentalId: RENTAL_ID, checkOut, checkIn, damages: [] });
      const { GET } = await import("../inspections/[id]/compare/route");
      const res = await call(GET, "ADMIN", { path: `/inspections/${INSPECTION_ID}/compare`, method: "GET", params: { id: INSPECTION_ID } });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { checkOut: { type: string }; checkIn: { type: string } };
      expect(json.checkOut.type).toBe("CHECK_OUT");
      expect(json.checkIn.type).toBe("CHECK_IN");
      expect(queries.compareInspection).toHaveBeenCalledWith(expect.objectContaining({ orgId: ORG_ID }), INSPECTION_ID);
    });

    it("refuses FIELD", async () => {
      const { GET } = await import("../inspections/[id]/compare/route");
      const res = await call(GET, "FIELD", { path: `/inspections/${INSPECTION_ID}/compare`, method: "GET", params: { id: INSPECTION_ID } });
      expect(res.status).toBe(403);
    });
  });

  describe("PDFs and charges", () => {
    it("serves the check-out PDF inline", async () => {
      queries.renderRentalPdf.mockResolvedValueOnce({ bytes: new Uint8Array([37, 80, 68, 70]), filename: "LOC-0001-checkout.pdf" });
      const { GET } = await import("./[id]/checkout.pdf/route");
      const res = await call(GET, "ADMIN", { path: `/rentals/${RENTAL_ID}/checkout.pdf`, method: "GET", params: { id: RENTAL_ID } });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toBe('inline; filename="LOC-0001-checkout.pdf"');
      expect(queries.renderRentalPdf).toHaveBeenCalledWith(expect.anything(), RENTAL_ID, "checkout");
    });

    it("answers 204 when a manual line is deleted", async () => {
      core.deleteManualCharge.mockResolvedValueOnce(undefined);
      const { DELETE } = await import("./[id]/charges/[lineId]/route");
      const res = await call(DELETE, "ADMIN", { path: `/rentals/${RENTAL_ID}/charges/l1`, method: "DELETE", params: { id: RENTAL_ID, lineId: "l1" } });
      expect(res.status).toBe(204);
      expect(core.deleteManualCharge).toHaveBeenCalledWith({}, expect.anything(), RENTAL_ID, "l1");
    });
  });
});
