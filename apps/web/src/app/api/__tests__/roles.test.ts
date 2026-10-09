/**
 * Role matrix (TASKS T10.5 and T10.13): every P0 row of the PRD §5 permissions table is checked
 * against the REST endpoints that implement it, for ADMIN, MANAGER and FIELD. Route handlers are
 * invoked directly with `Request` objects (ARCHITECTURE §15 "API routes") against the seeded demo
 * organisation in an isolated database, so allowed calls reach the real handlers and core services.
 *
 * A role is "allowed" when the response is neither 401, 403 nor 5xx, and "denied" when the response
 * is 403 with the expected code: `OFFICE_ROLE_REQUIRED` for FIELD on office routes and `FORBIDDEN`
 * for MANAGER on ADMIN-only routes.
 */
import { signAccessToken } from "@agrorende/core";
import { closeLocationsRedis } from "@agrorende/core/modules/locations";
import { checkOutInspection } from "@agrorende/core/modules/rentals/testing/harness";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// `test/setup.ts` stubs the organisation read-only gate; this suite runs the real one against MongoDB.
vi.mock("@agrorende/core/tenancy", async (importOriginal) => importOriginal());

const DB_NAME = "agrorende_t10_roles";
const SECRET = "t10-roles-test-secret-0123456789abcdef0123456789";
const APP_URL = "http://localhost:3000";

process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
process.env.MONGODB_DB = DB_NAME;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.MEDIA_ROOT = ".data/media-t10-roles";
process.env.MEDIA_DRIVER = "local";
process.env.JWT_SECRET = SECRET;
process.env.MEDIA_URL_SECRET = SECRET;
process.env.APP_URL = APP_URL;

type Role = "ADMIN" | "MANAGER" | "FIELD";
type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type RouteHandler = (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
type RouteModule = Partial<Record<Method, RouteHandler>>;

const ROLES: readonly Role[] = ["ADMIN", "MANAGER", "FIELD"];
const ALL: readonly Role[] = ROLES;
const OFFICE: readonly Role[] = ["ADMIN", "MANAGER"];
const ADMIN_ONLY: readonly Role[] = ["ADMIN"];

/* Seeded identifiers of the demo organisation (packages/db/seed). */
function seedUuid(value: number): string {
  return `018fd000-0000-7000-8000-${value.toString(16).padStart(12, "0")}`;
}
const ORG_A = seedUuid(1);
const USERS: Readonly<Record<Role, string>> = { ADMIN: seedUuid(100), MANAGER: seedUuid(101), FIELD: seedUuid(104) };
const DEVICE_ID = seedUuid(0xd010);
const ASSET = seedUuid(400);
const SITE = seedUuid(200);
const CUSTOMER = seedUuid(300);
const TEMPLATE = seedUuid(600);
const SEASON = seedUuid(700);
const REPORT = seedUuid(1000);
const WORK_ORDER = seedUuid(1100);
const RENTAL = seedUuid(1205);
const INSPECTION = seedUuid(1303);
const INVITEE = seedUuid(108);
/** A well-formed id that matches nothing: mutations stop at validation or NOT_FOUND after the role gate. */
const MISSING = "018fd000-0000-7000-8000-00000000fff1";

interface Endpoint {
  readonly method: Method;
  readonly path: string;
  readonly load: () => Promise<RouteModule>;
  readonly params: Readonly<Record<string, string>>;
  readonly body: unknown;
}

interface PermissionRow {
  /** The capability column of PRD §5 "Permissions (P0)", quoted verbatim. */
  readonly prd: string;
  readonly allowed: readonly Role[];
  readonly endpoints: readonly Endpoint[];
}

function ep(method: Method, path: string, load: () => Promise<RouteModule>, params: Readonly<Record<string, string>> = {}, body: unknown = {}): Endpoint {
  return { method, path, load, params, body };
}

const PERMISSIONS: readonly PermissionRow[] = [
  {
    prd: "Use the mobile app (reports, my jobs, rental check-out/check-in, assets, Near me)",
    allowed: ALL,
    endpoints: [
      ep("GET", `/api/v1/sync/pull?deviceId=${DEVICE_ID}`, () => import("../v1/sync/pull/route")),
      ep("GET", "/api/v1/settings", () => import("../v1/settings/route")),
      ep("GET", "/api/v1/notifications", () => import("../v1/notifications/route")),
      ep("POST", "/api/v1/notifications/read", () => import("../v1/notifications/read/route"), {}, { ids: [MISSING] }),
      ep("POST", "/api/v1/locations/batch", () => import("../v1/locations/batch/route"), {}, { fixes: [] }),
      ep("POST", "/api/v1/telemetry", () => import("../v1/telemetry/route"), {}, { events: [] }),
      ep("POST", "/api/v1/devices/register", () => import("../v1/devices/register/route")),
    ],
  },
  {
    prd: "Use the office web",
    allowed: OFFICE,
    endpoints: [
      ep("GET", "/api/v1/users", () => import("../v1/users/route")),
      ep("GET", "/api/v1/users/:id", () => import("../v1/users/[id]/route"), { id: INVITEE }),
      ep("GET", "/api/v1/seasons", () => import("../v1/seasons/route")),
      ep("GET", "/api/v1/inspections/:id", () => import("../v1/inspections/[id]/route"), { id: INSPECTION }),
      ep("GET", "/api/v1/inspections/:id/compare", () => import("../v1/inspections/[id]/compare/route"), { id: INSPECTION }),
      ep("POST", "/api/v1/media", () => import("../v1/media/route")),
    ],
  },
  {
    prd: "Triage reports, mark for repair",
    allowed: OFFICE,
    endpoints: [
      ep("GET", "/api/v1/field-reports", () => import("../v1/field-reports/route")),
      ep("GET", "/api/v1/field-reports/:id", () => import("../v1/field-reports/[id]/route"), { id: REPORT }),
      ep("POST", "/api/v1/field-reports/:id/start-review", () => import("../v1/field-reports/[id]/start-review/route"), { id: MISSING }),
      ep("POST", "/api/v1/field-reports/:id/mark-for-repair", () => import("../v1/field-reports/[id]/mark-for-repair/route"), { id: MISSING }),
      ep("POST", "/api/v1/field-reports/:id/monitor", () => import("../v1/field-reports/[id]/monitor/route"), { id: MISSING }, { note: "Watching" }),
      ep("POST", "/api/v1/field-reports/:id/dismiss", () => import("../v1/field-reports/[id]/dismiss/route"), { id: MISSING }, { reason: "Duplicate" }),
    ],
  },
  {
    prd: "Create, assign, reassign, cancel, verify and reopen work orders",
    allowed: OFFICE,
    endpoints: [
      ep("GET", "/api/v1/work-orders", () => import("../v1/work-orders/route")),
      ep("POST", "/api/v1/work-orders", () => import("../v1/work-orders/route")),
      ep("GET", "/api/v1/work-orders/:id", () => import("../v1/work-orders/[id]/route"), { id: WORK_ORDER }),
      ep("PATCH", "/api/v1/work-orders/:id", () => import("../v1/work-orders/[id]/route"), { id: MISSING }),
      ep("POST", "/api/v1/work-orders/:id/assign", () => import("../v1/work-orders/[id]/assign/route"), { id: MISSING }),
      ep("POST", "/api/v1/work-orders/:id/reassign", () => import("../v1/work-orders/[id]/reassign/route"), { id: MISSING }),
      ep("POST", "/api/v1/work-orders/:id/cancel", () => import("../v1/work-orders/[id]/cancel/route"), { id: MISSING }),
      ep("POST", "/api/v1/work-orders/:id/verify", () => import("../v1/work-orders/[id]/verify/route"), { id: MISSING }),
      ep("POST", "/api/v1/work-orders/:id/reopen", () => import("../v1/work-orders/[id]/reopen/route"), { id: MISSING }),
      ep("POST", "/api/v1/work-orders/:id/release-hold", () => import("../v1/work-orders/[id]/release-hold/route"), { id: MISSING }),
      ep("PATCH", "/api/v1/work-orders/:id/external-cost", () => import("../v1/work-orders/[id]/external-cost/route"), { id: MISSING }),
      ep("GET", "/api/v1/work-orders/:id/suggestions", () => import("../v1/work-orders/[id]/suggestions/route"), { id: WORK_ORDER }),
      ep("GET", "/api/v1/work-orders/suggestions", () => import("../v1/work-orders/suggestions/route")),
      ep("GET", "/api/v1/work-orders/:id/report.pdf", () => import("../v1/work-orders/[id]/report.pdf/route"), { id: MISSING }),
    ],
  },
  {
    prd: "Create, reserve, cancel, close rentals and edit charges",
    allowed: OFFICE,
    endpoints: [
      ep("GET", "/api/v1/rentals", () => import("../v1/rentals/route")),
      ep("POST", "/api/v1/rentals", () => import("../v1/rentals/route")),
      ep("GET", "/api/v1/rentals/calendar", () => import("../v1/rentals/calendar/route")),
      ep("GET", "/api/v1/rentals/eligibility", () => import("../v1/rentals/eligibility/route")),
      ep("GET", "/api/v1/rentals/:id", () => import("../v1/rentals/[id]/route"), { id: RENTAL }),
      ep("PATCH", "/api/v1/rentals/:id", () => import("../v1/rentals/[id]/route"), { id: MISSING }),
      ep("POST", "/api/v1/rentals/:id/reserve", () => import("../v1/rentals/[id]/reserve/route"), { id: MISSING }),
      ep("POST", "/api/v1/rentals/:id/cancel", () => import("../v1/rentals/[id]/cancel/route"), { id: MISSING }),
      ep("POST", "/api/v1/rentals/:id/close", () => import("../v1/rentals/[id]/close/route"), { id: MISSING }),
      ep("POST", "/api/v1/rentals/:id/extend", () => import("../v1/rentals/[id]/extend/route"), { id: MISSING }),
      ep("GET", "/api/v1/rentals/:id/charges", () => import("../v1/rentals/[id]/charges/route"), { id: RENTAL }),
      ep("POST", "/api/v1/rentals/:id/charges", () => import("../v1/rentals/[id]/charges/route"), { id: MISSING }),
      ep("POST", "/api/v1/rentals/:id/charges/recompute", () => import("../v1/rentals/[id]/charges/recompute/route"), { id: MISSING }),
      ep("DELETE", "/api/v1/rentals/:id/charges/:lineId", () => import("../v1/rentals/[id]/charges/[lineId]/route"), { id: MISSING, lineId: MISSING }),
      ep("GET", "/api/v1/rentals/:id/checkout.pdf", () => import("../v1/rentals/[id]/checkout.pdf/route"), { id: MISSING }),
      ep("GET", "/api/v1/rentals/:id/checkin.pdf", () => import("../v1/rentals/[id]/checkin.pdf/route"), { id: MISSING }),
      ep("GET", "/api/v1/damages", () => import("../v1/damages/route")),
      ep("PATCH", "/api/v1/damages/:id", () => import("../v1/damages/[id]/route"), { id: MISSING }),
      ep("POST", "/api/v1/damages/:id/create-work-order", () => import("../v1/damages/[id]/create-work-order/route"), { id: MISSING }),
    ],
  },
  {
    prd: "Live map, Operations Center and Needs-attention queue",
    allowed: OFFICE,
    endpoints: [
      ep("GET", "/api/v1/ops/live", () => import("../v1/ops/live/route")),
      ep("GET", "/api/v1/ops/kpis", () => import("../v1/ops/kpis/route")),
      ep("GET", "/api/v1/ops/alerts", () => import("../v1/ops/alerts/route")),
      ep("GET", "/api/v1/ops/activity", () => import("../v1/ops/activity/route")),
      ep("GET", "/api/v1/ops/operators/:userId/trail", () => import("../v1/ops/operators/[userId]/trail/route"), { userId: USERS.FIELD }),
      ep("GET", "/api/v1/attention", () => import("../v1/attention/route")),
      ep("POST", "/api/v1/attention/:kind/:id/resolve", () => import("../v1/attention/[kind]/[id]/resolve/route"), { kind: "WORK_ORDER", id: MISSING }),
    ],
  },
  {
    prd: "Costs and analytics, CSV export",
    allowed: OFFICE,
    endpoints: [
      ep("GET", "/api/v1/costs/rollup", () => import("../v1/costs/rollup/route")),
      ep("GET", "/api/v1/exports/assets.csv", () => import("../v1/exports/[entity].csv/route"), { entity: "assets" }),
      ep("GET", "/api/v1/exports/:id", () => import("../v1/exports/[id]/route"), { id: MISSING }),
    ],
  },
  {
    prd: "Manage assets, sites, plots, checklist templates, customers",
    allowed: OFFICE,
    endpoints: [
      ep("GET", "/api/v1/assets", () => import("../v1/assets/route")),
      ep("POST", "/api/v1/assets", () => import("../v1/assets/route")),
      ep("GET", "/api/v1/assets/:id", () => import("../v1/assets/[id]/route"), { id: ASSET }),
      ep("PATCH", "/api/v1/assets/:id", () => import("../v1/assets/[id]/route"), { id: MISSING }),
      ep("POST", "/api/v1/assets/:id/retire", () => import("../v1/assets/[id]/retire/route"), { id: MISSING }),
      ep("GET", "/api/v1/assets/:id/history", () => import("../v1/assets/[id]/history/route"), { id: ASSET }),
      ep("GET", "/api/v1/assets/:id/qr.png", () => import("../v1/assets/[id]/qr.png/route"), { id: ASSET }),
      ep("POST", "/api/v1/imports/:entity?dryRun=1", () => import("../v1/imports/[entity]/route"), { entity: "assets" }),
      ep("GET", "/api/v1/sites", () => import("../v1/sites/route")),
      ep("POST", "/api/v1/sites", () => import("../v1/sites/route")),
      ep("GET", "/api/v1/sites/:id", () => import("../v1/sites/[id]/route"), { id: SITE }),
      ep("PATCH", "/api/v1/sites/:id", () => import("../v1/sites/[id]/route"), { id: MISSING }),
      ep("DELETE", "/api/v1/sites/:id", () => import("../v1/sites/[id]/route"), { id: MISSING }),
      ep("GET", "/api/v1/sites/:id/plots", () => import("../v1/sites/[id]/plots/route"), { id: SITE }),
      ep("POST", "/api/v1/sites/:id/plots", () => import("../v1/sites/[id]/plots/route"), { id: MISSING }),
      ep("PATCH", "/api/v1/plots/:id", () => import("../v1/plots/[id]/route"), { id: MISSING }),
      ep("GET", "/api/v1/checklist-templates", () => import("../v1/checklist-templates/route")),
      ep("POST", "/api/v1/checklist-templates", () => import("../v1/checklist-templates/route")),
      ep("GET", "/api/v1/checklist-templates/:id", () => import("../v1/checklist-templates/[id]/route"), { id: TEMPLATE }),
      ep("PATCH", "/api/v1/checklist-templates/:id", () => import("../v1/checklist-templates/[id]/route"), { id: MISSING }),
      ep("DELETE", "/api/v1/checklist-templates/:id", () => import("../v1/checklist-templates/[id]/route"), { id: MISSING }),
      ep("POST", "/api/v1/checklist-templates/:id/publish", () => import("../v1/checklist-templates/[id]/publish/route"), { id: MISSING }),
      ep("GET", "/api/v1/customers", () => import("../v1/customers/route")),
      ep("POST", "/api/v1/customers", () => import("../v1/customers/route")),
      ep("PATCH", "/api/v1/customers/:id", () => import("../v1/customers/[id]/route"), { id: MISSING }),
      ep("DELETE", "/api/v1/customers/:id", () => import("../v1/customers/[id]/route"), { id: MISSING }),
    ],
  },
  {
    prd: "See customer CPF/CNPJ",
    allowed: OFFICE,
    endpoints: [ep("GET", "/api/v1/customers/:id", () => import("../v1/customers/[id]/route"), { id: CUSTOMER })],
  },
  {
    prd: "Manage team (invites, roles, deactivate), settings, seasons, labour rates",
    allowed: ADMIN_ONLY,
    endpoints: [
      ep("POST", "/api/v1/users", () => import("../v1/users/route")),
      ep("PATCH", "/api/v1/users/:id", () => import("../v1/users/[id]/route"), { id: MISSING }),
      ep("POST", "/api/v1/users/:id/role", () => import("../v1/users/[id]/role/route"), { id: MISSING }),
      ep("POST", "/api/v1/users/:id/deactivate", () => import("../v1/users/[id]/deactivate/route"), { id: MISSING }),
      ep("POST", "/api/v1/users/:id/reactivate", () => import("../v1/users/[id]/reactivate/route"), { id: MISSING }),
      ep("POST", "/api/v1/users/:id/invite", () => import("../v1/users/[id]/invite/route"), { id: MISSING }),
      ep("POST", "/api/v1/users/:id/reset-link", () => import("../v1/users/[id]/reset-link/route"), { id: MISSING }),
      ep("POST", "/api/v1/users/:id/temporary-password", () => import("../v1/users/[id]/temporary-password/route"), { id: MISSING }),
      ep("GET", "/api/v1/users/:id/devices", () => import("../v1/users/[id]/devices/route"), { id: INVITEE }),
      ep("GET", "/api/v1/devices", () => import("../v1/devices/route")),
      ep("GET", "/api/v1/devices/:id/diagnostics", () => import("../v1/devices/[id]/diagnostics/route"), { id: MISSING }),
      ep("PATCH", "/api/v1/settings", () => import("../v1/settings/route"), {}, { labourRates: "invalid" }),
      ep("POST", "/api/v1/seasons", () => import("../v1/seasons/route")),
      ep("PATCH", "/api/v1/seasons/:id", () => import("../v1/seasons/[id]/route"), { id: SEASON }, { name: "" }),
    ],
  },
  {
    prd: "Subscription page (status, usage, cancel)",
    allowed: ADMIN_ONLY,
    endpoints: [
      ep("GET", "/api/v1/org/subscription", () => import("../v1/org/subscription/route")),
      ep("POST", "/api/v1/org/cancel", () => import("../v1/org/cancel/route"), {}, { confirmName: "not the organisation name" }),
      ep("POST", "/api/v1/org/accept-terms", () => import("../v1/org/accept-terms/route")),
    ],
  },
];

const tokens = new Map<Role, string>();

async function tokenFor(role: Role): Promise<string> {
  const cached = tokens.get(role);
  if (cached !== undefined) return cached;
  const token = await signAccessToken({ tokenUse: "access", sub: USERS[role], orgId: ORG_A, role, deviceId: DEVICE_ID }, { secret: SECRET, expiresIn: "15m" });
  tokens.set(role, token);
  return token;
}

type Transport = (token: string) => Record<string, string>;

const BEARER: Transport = (token) => ({ authorization: `Bearer ${token}` });
/* Cookie-authenticated mutations must come from the app origin (CSRF check). */
const COOKIE: Transport = (token) => ({ cookie: `ar_access=${token}`, origin: APP_URL });

function urlOf(endpoint: Endpoint): URL {
  return new URL(endpoint.path.replace(/:([A-Za-z]+)/gu, (_match, key: string) => endpoint.params[key] ?? key), APP_URL);
}

async function call(endpoint: Endpoint, role: Role, transport: Transport = BEARER): Promise<{ status: number; code: string | null }> {
  const module = await endpoint.load();
  const handler = module[endpoint.method];
  if (handler === undefined) throw new Error(`${endpoint.method} is not exported for ${endpoint.path}`);
  const headers: Record<string, string> = { ...transport(await tokenFor(role)), "accept-language": "pt-BR" };
  const hasBody = endpoint.method !== "GET" && endpoint.method !== "DELETE";
  if (hasBody) headers["content-type"] = "application/json";
  const request = new NextRequest(urlOf(endpoint), { method: endpoint.method, headers, ...(hasBody ? { body: JSON.stringify(endpoint.body) } : {}) });
  const response = await handler(request, { params: Promise.resolve({ ...endpoint.params }) });
  let code: string | null = null;
  if (response.status >= 400 && (response.headers.get("content-type") ?? "").includes("json")) {
    const json = (await response.json()) as { error?: { code?: string } };
    code = json.error?.code ?? null;
  }
  return { status: response.status, code };
}

function deniedCode(role: Role, allowed: readonly Role[]): "OFFICE_ROLE_REQUIRED" | "FORBIDDEN" {
  return role === "FIELD" && !allowed.includes("FIELD") ? "OFFICE_ROLE_REQUIRED" : "FORBIDDEN";
}

interface TestCollection {
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>;
  findOne(filter: Record<string, unknown>): Promise<Record<string, unknown> | null>;
}
interface TestDb {
  readonly databaseName: string;
}
interface TestDbHandle {
  readonly db: TestDb;
  drop(): Promise<void>;
}
interface DbTestingModule {
  setupTestDb(name: string): Promise<TestDbHandle>;
}
interface DbModule {
  closeClient(): Promise<void>;
  /** The typed `@agrorende/db` accessor; raw driver access stays inside packages/db (ARCHITECTURE §11). */
  collection(db: TestDb, name: string): TestCollection;
}
interface SeedModule {
  seedDatabase(db: TestDb, options: { readonly force?: boolean }): Promise<unknown>;
}

/*
 * `apps/web` does not depend on `@agrorende/db` (ARCHITECTURE §4), so `setupTestDb` and the demo
 * seed are loaded by path, the same way the core test harnesses load the seed.
 */
const DB_PACKAGE = "../../../../../../packages/db";
let handle: TestDbHandle | null = null;
let dbModule: DbModule | null = null;

beforeAll(async () => {
  const testing = (await import(/* @vite-ignore */ `${DB_PACKAGE}/src/testing/setupTestDb.ts`)) as DbTestingModule;
  const seed = (await import(/* @vite-ignore */ `${DB_PACKAGE}/seed/index.ts`)) as SeedModule;
  dbModule = (await import(/* @vite-ignore */ `${DB_PACKAGE}/src/index.ts`)) as DbModule;
  handle = await testing.setupTestDb(DB_NAME);
  await seed.seedDatabase(handle.db, { force: true });
}, 60_000);

afterAll(async () => {
  await closeLocationsRedis();
  await handle?.drop();
  const client = (await import(/* @vite-ignore */ `${DB_PACKAGE}/src/index.ts`)) as DbModule;
  await client.closeClient();
});

function collection(name: string): TestCollection {
  if (handle === null || dbModule === null) throw new Error("The test database is not ready.");
  const { collection: typedCollection } = dbModule;
  return typedCollection(handle.db, name);
}

describe("PRD §5 permissions (P0) on the REST API", () => {
  for (const row of PERMISSIONS) {
    describe(`PRD §5 "${row.prd}"`, () => {
      for (const role of ROLES) {
        const allowed = row.allowed.includes(role);
        const expected = allowed ? "not 401, 403 or 5xx" : `403 ${deniedCode(role, row.allowed)}`;
        it(`${allowed ? "allows" : "denies"} ${role} (${expected})`, async () => {
          const failures: string[] = [];
          for (const endpoint of row.endpoints) {
            const { status, code } = await call(endpoint, role);
            const ok = allowed ? status !== 401 && status !== 403 && status < 500 : status === 403 && code === deniedCode(role, row.allowed);
            if (!ok) failures.push(`${endpoint.method} ${endpoint.path} → ${status} ${code ?? ""}`.trim());
          }
          expect(failures, failures.join("; ")).toEqual([]);
        });
      }
    });
  }

  it("applies the same gates to the ar_access cookie (with the app Origin)", async () => {
    const office = ep("GET", "/api/v1/assets", () => import("../v1/assets/route"));
    const adminOnly = ep("POST", "/api/v1/org/accept-terms", () => import("../v1/org/accept-terms/route"));
    expect(await call(office, "FIELD", COOKIE)).toEqual({ status: 403, code: "OFFICE_ROLE_REQUIRED" });
    expect((await call(office, "MANAGER", COOKIE)).status).toBe(200);
    expect(await call(adminOnly, "MANAGER", COOKIE)).toEqual({ status: 403, code: "FORBIDDEN" });
    expect(await call(adminOnly, "FIELD", COOKIE)).toEqual({ status: 403, code: "OFFICE_ROLE_REQUIRED" });
  });
});

/*
 * The field rows of PRD §5 are served by `POST /sync/push` (ARCHITECTURE §7). Each mutation must be
 * applied, or rejected for a reason other than the caller's role.
 */
interface PushResult {
  readonly id: string;
  readonly status: "APPLIED" | "REJECTED" | "RETRY";
  readonly code?: string;
}

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `018fd000-0000-7000-8000-${(0xe000 + sequence).toString(16).padStart(12, "0")}`;
}

async function push(role: Role, name: string, payload: unknown): Promise<PushResult> {
  const id = nextId();
  const body = {
    deviceId: DEVICE_ID,
    clientTime: new Date().toISOString(),
    deviceStatus: { appVersion: "1.0.0", runtimeVersion: "1.0.0", pendingMutations: 1, pendingUploads: 0, pendingBytes: 0, scopeEpoch: 0 },
    mutations: [{ id, name, payload, occurredAt: new Date().toISOString() }],
  };
  const { POST } = await import("../v1/sync/push/route");
  const request = new NextRequest(new URL("/api/v1/sync/push", APP_URL), {
    method: "POST",
    headers: { ...BEARER(await tokenFor(role)), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await POST(request, { params: Promise.resolve({}) });
  expect(response.status).toBe(200);
  const json = (await response.json()) as { results: PushResult[] };
  const result = json.results.find((candidate) => candidate.id === id);
  if (result === undefined) throw new Error(`No push result for ${name}`);
  return result;
}

const ROLE_CODES = new Set(["FORBIDDEN", "OFFICE_ROLE_REQUIRED"]);

describe("PRD §5 field rows through POST /sync/push", () => {
  for (const role of ROLES) {
    it(`PRD §5 "Create field reports" allows ${role}`, async () => {
      const result = await push(role, "fieldReport.create", {
        id: nextId(),
        assetId: ASSET,
        category: "HYDRAULIC",
        priority: "HIGH",
        machineOperable: false,
        suggestedAction: "REPAIR_NOW",
        title: `Hydraulic leak reported by ${role}`,
        media: [],
      });
      expect(result.status, JSON.stringify(result)).toBe("APPLIED");
    });

    it(`PRD §5 "Update hour meter and odometer readings" allows ${role}`, async () => {
      const asset = await collection("assets").findOne({ _id: ASSET });
      const hourMeter = (typeof asset?.hourMeter === "number" ? asset.hourMeter : 0) + 10;
      const result = await push(role, "asset.updateReadings", { assetId: ASSET, hourMeter });
      expect(result.status, JSON.stringify(result)).toBe("APPLIED");
    });

    it(`PRD §5 "Progress and complete work orders assigned to me" allows ${role}`, async () => {
      const workOrderId = seedUuid(1102);
      await collection("work_orders").updateOne({ _id: workOrderId }, { $set: { status: "ASSIGNED", assigneeId: USERS[role], acceptedAt: null } });
      const result = await push(role, "workOrder.transition", { id: workOrderId, action: "accept" });
      expect(result.status, JSON.stringify(result)).toBe("APPLIED");
    });

    it(`PRD §5 "Rental check-out and check-in inspections" allows ${role}`, async () => {
      const rentalId = seedUuid(1201);
      const rental = await collection("rentals").findOne({ _id: rentalId });
      await collection("rentals").updateOne({ _id: rentalId }, { $set: { status: "RESERVED", checkOutInspectionId: null, actualStart: null } });
      const result = await push(role, "rental.checkout", { rentalId, inspection: checkOutInspection(String(rental?.assetId)) });
      expect(result.status === "APPLIED" || (result.code !== undefined && !ROLE_CODES.has(result.code)), JSON.stringify(result)).toBe(true);
    });
  }
});
