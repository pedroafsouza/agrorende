/**
 * T14 routes against the seeded demo organisation (T14.2, T14.4, T14.6): stock writes by the office
 * succeed, a technician's only stock write is `OUT_TO_WORK_ORDER` on their own job and van, every
 * other technician stock movement answers `FORBIDDEN`, maintenance plans are office only, and the
 * external cost opens from COMPLETED on.
 */
import { signAccessToken } from "@agrorende/core";
import { addPart } from "@agrorende/core/modules/workOrders/parts";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { write, type AuthedCtx } from "@/lib/core.server";

vi.mock("server-only", () => ({}));

const DB_NAME = "agrorende_t14_routes";
const SECRET = "t14-routes-test-secret-0123456789abcdef0123456789";

process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
process.env.MONGODB_DB = DB_NAME;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.MEDIA_ROOT = ".data/media-t14";
process.env.JWT_SECRET = SECRET;

type Role = "ADMIN" | "MANAGER" | "FIELD";
type Method = "GET" | "POST" | "PATCH";
type RouteHandler = (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
type RouteModule = Partial<Record<Method, RouteHandler>>;

function seedUuid(value: number): string {
  return `018fd000-0000-7000-8000-${value.toString(16).padStart(12, "0")}`;
}
const ORG_A = seedUuid(1);
const USERS: Readonly<Record<Role, string>> = { ADMIN: seedUuid(100), MANAGER: seedUuid(101), FIELD: seedUuid(104) };
const DEVICE_ID = seedUuid(0xd010);
/** Carlos's seeded ON_HOLD job, the seeded COMPLETED and CANCELLED jobs and an OPEN one. */
const CARLOS_JOB = seedUuid(1110);
const COMPLETED_JOB = seedUuid(1111);
const CANCELLED_JOB = seedUuid(1114);
const OPEN_JOB = seedUuid(1100);
const ASSET = seedUuid(400);

interface TestDbHandle {
  readonly db: unknown;
  drop(): Promise<void>;
}
const DB_PACKAGE = "../../../../../../../packages/db";
let handle: TestDbHandle | null = null;

beforeAll(async () => {
  const testing = (await import(/* @vite-ignore */ `${DB_PACKAGE}/src/testing/setupTestDb.ts`)) as { setupTestDb(name: string): Promise<TestDbHandle> };
  const seed = (await import(/* @vite-ignore */ `${DB_PACKAGE}/seed/index.ts`)) as { seedDatabase(db: unknown, options: { force?: boolean }): Promise<unknown> };
  handle = await testing.setupTestDb(DB_NAME);
  await seed.seedDatabase(handle.db, { force: true });
}, 60_000);

afterAll(async () => {
  await handle?.drop();
  const client = (await import(/* @vite-ignore */ `${DB_PACKAGE}/src/index.ts`)) as { closeClient(): Promise<void> };
  await client.closeClient();
});

async function tokenFor(role: Role): Promise<string> {
  return signAccessToken({ tokenUse: "access", sub: USERS[role], orgId: ORG_A, role, deviceId: DEVICE_ID }, { secret: SECRET, expiresIn: "15m" });
}

interface Reply {
  readonly status: number;
  readonly json: Record<string, unknown> & { error?: { code?: string }; items?: Array<Record<string, unknown>> };
}

async function call(load: () => Promise<RouteModule>, method: Method, path: string, role: Role, body?: unknown, params: Record<string, string> = {}): Promise<Reply> {
  const handler = (await load())[method];
  if (handler === undefined) throw new Error(`${method} ${path} is not exported`);
  const headers: Record<string, string> = { authorization: `Bearer ${await tokenFor(role)}`, "accept-language": "pt-BR" };
  if (method !== "GET") headers["content-type"] = "application/json";
  const request = new NextRequest(`http://localhost${path}`, { method, headers, ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }) });
  const response = await handler(request, { params: Promise.resolve(params) });
  const text = await response.text();
  return { status: response.status, json: text.length === 0 ? {} : (JSON.parse(text) as Reply["json"]) };
}

const parts = () => import("../parts/route");
const partById = () => import("../parts/[id]/route");
const locations = () => import("../stock-locations/route");
const levels = () => import("../stock-levels/route");
const movements = () => import("./route");
const plans = () => import("../maintenance-plans/route");
const planById = () => import("../maintenance-plans/[id]/route");
const planDue = () => import("../maintenance-plans/[id]/due/route");
const externalCost = () => import("../work-orders/[id]/external-cost/route");

const fieldCtx: AuthedCtx = { organizationId: ORG_A, orgId: ORG_A, userId: USERS.FIELD, role: "FIELD", deviceId: DEVICE_ID, requestId: "t14-route-test" };

let partId = "";
let warehouseId = "";
let vanId = "";
let otherVanId = "";

async function levelAt(locationId: string): Promise<number> {
  const reply = await call(levels, "GET", `/api/v1/stock-levels?partId=${partId}&locationId=${locationId}`, "ADMIN");
  return Number(reply.json.items?.[0]?.quantity ?? 0);
}

describe("T14.2 stock permissions", () => {
  it("lets ADMIN and MANAGER manage the catalog, locations and movements", async () => {
    const part = await call(parts, "POST", "/api/v1/parts", "ADMIN", { sku: "FH-10", name: "Filtro hidráulico", unit: "un", unitCostCents: 8_900, minStock: 1 });
    expect(part.status).toBe(200);
    partId = String(part.json.id);
    const edited = await call(partById, "PATCH", `/api/v1/parts/${partId}`, "MANAGER", { name: "Filtro hidráulico HF" }, { id: partId });
    expect(edited.status).toBe(200);
    expect(edited.json.name).toBe("Filtro hidráulico HF");

    warehouseId = String((await call(locations, "POST", "/api/v1/stock-locations", "ADMIN", { name: "Almoxarifado central", type: "WAREHOUSE" })).json.id);
    vanId = String((await call(locations, "POST", "/api/v1/stock-locations", "MANAGER", { name: "Furgão Carlos", type: "VAN", userId: USERS.FIELD })).json.id);
    otherVanId = String((await call(locations, "POST", "/api/v1/stock-locations", "ADMIN", { name: "Furgão Pedro", type: "VAN", userId: seedUuid(105) })).json.id);

    expect((await call(movements, "POST", "/api/v1/stock-movements", "MANAGER", { type: "IN", partId, quantity: 10, toLocationId: warehouseId, unitCostCents: 8_500 })).status).toBe(200);
    expect((await call(movements, "POST", "/api/v1/stock-movements", "ADMIN", { type: "TRANSFER", partId, quantity: 4, fromLocationId: warehouseId, toLocationId: vanId })).status).toBe(200);
    expect((await call(movements, "POST", "/api/v1/stock-movements", "ADMIN", { type: "ADJUSTMENT", partId, quantity: -1, toLocationId: warehouseId, note: "Contagem" })).status).toBe(200);
    expect(await levelAt(warehouseId)).toBe(5);
    expect(await levelAt(vanId)).toBe(4);
  });

  it("answers FORBIDDEN to every technician stock movement and OFFICE_ROLE_REQUIRED to catalog writes", async () => {
    for (const body of [
      { type: "IN", partId, quantity: 1, toLocationId: vanId },
      { type: "TRANSFER", partId, quantity: 1, fromLocationId: warehouseId, toLocationId: vanId },
      { type: "ADJUSTMENT", partId, quantity: 1, toLocationId: vanId },
      { type: "OUT_TO_WORK_ORDER", partId, quantity: 1, fromLocationId: vanId },
    ]) {
      const reply = await call(movements, "POST", "/api/v1/stock-movements", "FIELD", body);
      expect(reply.status, body.type).toBe(403);
      expect(reply.json.error?.code).toBe("FORBIDDEN");
    }
    const part = await call(parts, "POST", "/api/v1/parts", "FIELD", { sku: "X-1", name: "X" });
    expect(part.status).toBe(403);
    expect(part.json.error?.code).toBe("OFFICE_ROLE_REQUIRED");
    expect((await call(locations, "POST", "/api/v1/stock-locations", "FIELD", { name: "Meu", type: "WAREHOUSE" })).json.error?.code).toBe("OFFICE_ROLE_REQUIRED");
    expect(await levelAt(vanId)).toBe(4);
  });

  it("lets a technician take parts from their own van for their own job (OUT_TO_WORK_ORDER)", async () => {
    await write(fieldCtx, (tx) => addPart(tx, fieldCtx, { id: crypto.randomUUID(), workOrderId: CARLOS_JOB, name: "Filtro hidráulico HF", quantity: 2, unit: "un", partId, stockLocationId: vanId }, new Date()));
    expect(await levelAt(vanId)).toBe(2);
    const ledger = await call(movements, "GET", `/api/v1/stock-movements?workOrderId=${CARLOS_JOB}`, "ADMIN");
    expect(ledger.json.items?.map((m) => m.type)).toEqual(["OUT_TO_WORK_ORDER"]);
    const fromOtherVan = write(fieldCtx, (tx) => addPart(tx, fieldCtx, { id: crypto.randomUUID(), workOrderId: CARLOS_JOB, name: "Filtro", quantity: 1, unit: "un", partId, stockLocationId: otherVanId }, new Date()));
    await expect(fromOtherVan).rejects.toMatchObject({ code: "FORBIDDEN" });
    const tooMany = write(fieldCtx, (tx) => addPart(tx, fieldCtx, { id: crypto.randomUUID(), workOrderId: CARLOS_JOB, name: "Filtro", quantity: 3, unit: "un", partId, stockLocationId: vanId }, new Date()));
    await expect(tooMany).rejects.toMatchObject({ code: "WO_PART_NOT_IN_VAN_STOCK" });
    expect(await levelAt(vanId)).toBe(2);
  });

  it("shows a technician the warehouse and their own van, never another van", async () => {
    const reply = await call(levels, "GET", `/api/v1/stock-levels?partId=${partId}`, "FIELD");
    expect(reply.status).toBe(200);
    const seen = new Set(reply.json.items?.map((l) => l.stockLocationId));
    expect(seen.has(vanId)).toBe(true);
    expect(seen.has(otherVanId)).toBe(false);
    expect((await call(parts, "GET", "/api/v1/parts?q=FH", "FIELD")).json.items).toHaveLength(1);
  });
});

describe("T14.6 maintenance plan routes", () => {
  it("creates, edits and lists due machines for the office and refuses FIELD", async () => {
    const created = await call(plans, "POST", "/api/v1/maintenance-plans", "ADMIN", { name: "Troca de óleo 250 h", assetId: ASSET, trigger: "HOURS", intervalHours: 250, lastDoneHourMeter: 0 });
    expect(created.status).toBe(200);
    const id = String(created.json.id);
    const edited = await call(planById, "PATCH", `/api/v1/maintenance-plans/${id}`, "MANAGER", { leadHours: 50 }, { id });
    expect(edited.status).toBe(200);
    expect(edited.json.leadHours).toBe(50);
    const due = await call(planDue, "GET", `/api/v1/maintenance-plans/${id}/due`, "MANAGER", undefined, { id });
    expect(due.json.items?.[0]?.assetId).toBe(ASSET);
    expect((await call(plans, "GET", "/api/v1/maintenance-plans", "ADMIN")).json.items?.some((p) => p.id === id)).toBe(true);
    for (const reply of [await call(plans, "GET", "/api/v1/maintenance-plans", "FIELD"), await call(planDue, "GET", `/api/v1/maintenance-plans/${id}/due`, "FIELD", undefined, { id })]) {
      expect(reply.status).toBe(403);
      expect(reply.json.error?.code).toBe("OFFICE_ROLE_REQUIRED");
    }
  });

  it("rejects a plan without a target", async () => {
    const reply = await call(plans, "POST", "/api/v1/maintenance-plans", "ADMIN", { name: "Sem alvo", trigger: "CALENDAR", intervalDays: 30 });
    expect(reply.status).toBe(422);
    expect(reply.json.error?.code).toBe("VALIDATION_FAILED");
  });
});

describe("T14.4 PATCH /work-orders/:id/external-cost", () => {
  it("updates a COMPLETED job and bumps syncVersion", async () => {
    const first = await call(externalCost, "PATCH", `/api/v1/work-orders/${COMPLETED_JOB}/external-cost`, "MANAGER", { externalCostCents: 15_000, externalCostNote: "Torno" }, { id: COMPLETED_JOB });
    expect(first.status).toBe(200);
    expect(first.json.externalCostCents).toBe(15_000);
    const second = await call(externalCost, "PATCH", `/api/v1/work-orders/${COMPLETED_JOB}/external-cost`, "ADMIN", { externalCostCents: 20_000 }, { id: COMPLETED_JOB });
    expect(second.status).toBe(200);
    expect(BigInt(String(second.json.syncVersion))).toBeGreaterThan(BigInt(String(first.json.syncVersion)));
  });

  it("refuses jobs before COMPLETED and cancelled jobs", async () => {
    const open = await call(externalCost, "PATCH", `/api/v1/work-orders/${OPEN_JOB}/external-cost`, "ADMIN", { externalCostCents: 100 }, { id: OPEN_JOB });
    expect(open.status).toBe(409);
    expect(open.json.error?.code).toBe("INVALID_TRANSITION");
    const cancelled = await call(externalCost, "PATCH", `/api/v1/work-orders/${CANCELLED_JOB}/external-cost`, "ADMIN", { externalCostCents: 100 }, { id: CANCELLED_JOB });
    expect(cancelled.json.error?.code).toBe("WO_CANCELLED");
    expect((await call(externalCost, "PATCH", `/api/v1/work-orders/${COMPLETED_JOB}/external-cost`, "FIELD", { externalCostCents: 1 }, { id: COMPLETED_JOB })).status).toBe(403);
  });
});
