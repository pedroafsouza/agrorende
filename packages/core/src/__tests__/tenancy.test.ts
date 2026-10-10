/**
 * Cross-tenant suite (ARCHITECTURE §11 and §15, TASKS T10.4 and T10.13).
 *
 * An ADMIN of organisation B targets organisation A ids on every REST read by id, every REST
 * mutation and every sync push mutation. Each attempt must fail with `NOT_FOUND` (never
 * `FORBIDDEN`, never data) and must leave every organisation A document unchanged. The suite
 * also covers the `/platform/*` boundary, `OrgUsage` isolation and pull isolation.
 *
 * Route handlers in `apps/web` are thin adapters, so each table row calls the same core function
 * the route calls, with the context the route would build for the org B user. The coverage test
 * at the end reads the route files from disk and fails when a route and method is neither in the
 * table nor in the explicit allowlist.
 */
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

import { ERROR_HTTP_STATUS, type ErrorCode } from "@agrorende/contracts/errors";
import { collection, COLLECTION_NAMES, getDb, scoped, type CollectionName } from "@agrorende/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { platformApi, type PlatformRouteKey } from "../auth/api/index";
import { setAuthConfigForTests } from "../auth/config";
import { verifyAccessToken } from "../auth/jwt";
import { memoryRateLimiter, setRateLimiter } from "../auth/rateLimit";
import { createNamedSeededDb, SEED, seedCtx, seedUuid, type SeededDb } from "../auth/testing/seeded";
import type { Ctx } from "../context";
import * as assetQueries from "../modules/assets/queries";
import * as assetQrSheet from "../modules/assets/qrSheet";
import * as assetService from "../modules/assets/service";
import * as billingService from "../modules/billing/service";
import * as checklistQueries from "../modules/checklists/queries";
import * as checklistService from "../modules/checklists/service";
import * as commentService from "../modules/comments/service";
import * as costs from "../modules/costs/service";
import * as customerQueries from "../modules/customers/queries";
import * as customerService from "../modules/customers/service";
import * as exportsService from "../modules/exports/service";
import * as fieldReportQueries from "../modules/fieldReports/queries";
import * as fieldReportService from "../modules/fieldReports/service";
import * as fuelService from "../modules/fuel/service";
import * as maintenanceService from "../modules/maintenance/service";
import * as ops from "../modules/ops/service";
import * as partsService from "../modules/parts/service";
import * as rentalQueries from "../modules/rentals/queries";
import * as rentalService from "../modules/rentals/service";
import * as seasonQueries from "../modules/seasons/queries";
import * as seasonService from "../modules/seasons/service";
import * as siteQueries from "../modules/sites/queries";
import * as siteService from "../modules/sites/service";
import { tenancyApi, type TenancyRouteKey } from "../modules/tenancy/api";
import { setTenancyConfigForTests } from "../modules/tenancy/config";
import { issueStaffSession } from "../modules/tenancy/platform";
import { recordUsage } from "../modules/tenancy/usage";
import * as workOrderField from "../modules/workOrders/field";
import * as workOrderQueries from "../modules/workOrders/queries";
import * as workOrderReport from "../modules/workOrders/report";
import * as workOrderService from "../modules/workOrders/service";
import * as workOrderSuggest from "../modules/workOrders/suggest";
import { localMediaStore, setMediaStore } from "../storage/index";
import { findRepoRoot } from "../storage/init";
import { pull } from "../sync/pull";
import { push } from "../sync/push";
import { mutationRegistry } from "../sync/registry";
import type { SyncTx } from "../sync/types";
import { withSyncTx } from "../sync/withSyncTx";

const DB_NAME = "agrorende_t10_tenancy";
const BASE = "http://localhost:3000";
const REPO_ROOT = findRepoRoot();
const MEDIA_ROOT = path.join(REPO_ROOT, ".data", "media-t10-tenancy");
const ROUTES_ROOT = path.join(REPO_ROOT, "apps", "web", "src", "app", "api", "v1");
const JWT_SECRET = "t10-tenancy-test-secret-0123456789abcdef";
const STAFF_EMAIL = "staff@agrorende.dev";
const ORG_B_DEVICE = "t10-tenancy-org-b-device";
const ORG_B_DEVICE_UUID = "018fd000-0000-7000-8000-0000000b0d01";

/** Organisation A ids from `packages/db/seed/index.ts`. */
const A = {
  org: SEED.orgA,
  admin: SEED.admin,
  manager: SEED.manager,
  field: SEED.field,
  site: seedUuid(200),
  customer: seedUuid(300),
  asset: seedUuid(400),
  template: seedUuid(600),
  season: seedUuid(700),
  plot: seedUuid(800),
  damage: seedUuid(900),
  fieldReport: seedUuid(1000),
  workOrder: seedUuid(1100),
  workOrderWithPart: seedUuid(1111),
  rental: seedUuid(1200),
  rentalWithCharge: seedUuid(1205),
  inspection: seedUuid(1303),
  media: seedUuid(1400),
  device: seedUuid(1500),
  part: seedUuid(1700),
  charge: seedUuid(1800),
  notification: seedUuid(2000),
} as const;

const B: Ctx = { ...seedCtx(SEED.orgBUser, "ADMIN", SEED.orgB), requestId: "t10-tenancy" };

let seeded: SeededDb;
let orgBToken: string;
let staffToken: string;
let orgAExportJobId: string;
let orgAIds: ReadonlySet<string>;

/** Organisation A records of the P1 modules (T14, T15), created in `beforeAll` because the seed has none. */
const A1 = { billingDocument: "", fuelLog: "", catalogPart: "", warehouse: "", plan: "" };

// ───────── Helpers ─────────

function write<T>(fn: (tx: SyncTx) => Promise<T>): Promise<T> {
  return withSyncTx(B, fn);
}

/** Error code of a rejected call, or `OK` when it resolved. */
/**
 * `NOT_FOUND` or one of its documented 404 specialisations (for example `RENTAL_NOT_FOUND`).
 * `FORBIDDEN` and every other status are never accepted.
 */
function isNotFoundFamily(code: string | undefined): boolean {
  if (code === undefined || !(code in ERROR_HTTP_STATUS)) return false;
  return ERROR_HTTP_STATUS[code as ErrorCode] === 404;
}

async function outcome(run: () => Promise<unknown>): Promise<{ code: string; value: unknown }> {
  try {
    return { code: "OK", value: await run() };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return { code: typeof code === "string" ? code : String(error), value: null };
  }
}

interface RawCursor {
  sort(spec: Record<string, 1>): RawCursor;
  toArray(): Promise<{ _id: unknown }[]>;
}

/** Untyped read across every collection; the typed `collection` helper keeps raw driver access inside packages/db. */
function rawFind(name: CollectionName, filter: Record<string, unknown>, options: Record<string, unknown> = {}): RawCursor {
  const handle = collection(seeded.handle.db, name) as unknown as { find(f: Record<string, unknown>, o: Record<string, unknown>): RawCursor };
  return handle.find(filter, options);
}

/** Stable hash of every organisation A document, so any write to org A is detected. */
async function orgADigest(): Promise<string> {
  const hash = createHash("sha256");
  for (const name of [...COLLECTION_NAMES].sort()) {
    const filter = name === "organizations" || name === "sync_counters" ? { _id: A.org } : { organizationId: A.org };
    const docs = await rawFind(name, filter).sort({ _id: 1 }).toArray();
    hash.update(name);
    hash.update(JSON.stringify(docs));
  }
  return hash.digest("hex");
}

async function collectOrgAIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const name of COLLECTION_NAMES) {
    const docs = await rawFind(name, { organizationId: A.org }, { projection: { _id: 1 } }).toArray();
    for (const doc of docs) if (typeof doc._id === "string" && /^[0-9a-f-]{36}$/u.test(doc._id)) ids.add(doc._id);
  }
  ids.add(A.org);
  return ids;
}

function leakedIds(value: unknown): string[] {
  const text = JSON.stringify(value) ?? "";
  return [...orgAIds].filter((id) => text.includes(id));
}

interface HttpOptions {
  readonly params?: Record<string, string>;
  readonly query?: Record<string, string>;
  readonly body?: unknown;
  readonly bearer?: string;
  readonly cookies?: Record<string, string>;
}

function buildRequest(key: string, options: HttpOptions): Request {
  const [method = "GET", pattern = "/"] = key.split(" ");
  const pathname = pattern.replace(/:(\w+)/gu, (_, name: string) => options.params?.[name] ?? "");
  const url = new URL(`/api/v1${pathname}`, BASE);
  for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, value);
  const headers = new Headers({ origin: BASE });
  if (options.bearer !== undefined) headers.set("authorization", `Bearer ${options.bearer}`);
  if (options.cookies !== undefined) {
    headers.set("cookie", Object.entries(options.cookies).map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; "));
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  return new Request(url, { method, headers, body });
}

async function platformCall(key: PlatformRouteKey, options: HttpOptions = {}): Promise<Response> {
  return platformApi[key](buildRequest(key, options), options.params ?? {});
}

async function tenancyCall(key: TenancyRouteKey, options: HttpOptions = {}): Promise<Response> {
  return tenancyApi[key](buildRequest(key, options), options.params ?? {});
}

async function errorCode(response: Response): Promise<string | null> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: { code?: string } };
    return parsed.error?.code ?? null;
  } catch {
    return null;
  }
}

// ───────── Setup ─────────

beforeAll(async () => {
  process.env.MEDIA_ROOT ??= ".data/media-t10-tenancy";
  setAuthConfigForTests({ jwtSecret: JWT_SECRET, mediaUrlSecret: "t10-tenancy-media-secret-0123456789abcdef", redisUrl: null, appUrl: BASE });
  setTenancyConfigForTests({ platformAdminEmails: [STAFF_EMAIL] });
  setRateLimiter(memoryRateLimiter());
  seeded = await createNamedSeededDb(DB_NAME);
  setMediaStore(localMediaStore({ root: MEDIA_ROOT }));

  const login = await platformCall("POST /auth/login", {
    body: { email: "admin@boavista.dev", password: SEED.password, deviceId: ORG_B_DEVICE, platform: "ANDROID" },
  });
  expect(login.status).toBe(200);
  orgBToken = ((await login.json()) as { accessToken: string }).accessToken;
  staffToken = (await issueStaffSession(STAFF_EMAIL)).token;

  const deps = await exportsService.resolveExportDeps();
  const created = await exportsService.createExportJob({ orgId: A.org, userId: A.admin, role: "ADMIN" }, { entity: "assets" }, deps);
  orgAExportJobId = created.job.id;
  await recordUsage(await getDb(), A.org, "2099-01", new Date());

  const orgA: Ctx = { ...seedCtx(A.admin, "ADMIN"), requestId: "t10-tenancy-org-a" };
  await withSyncTx(orgA, async (tx) => {
    A1.billingDocument = (
      await billingService.createBillingDocument(tx, orgA, { source: "MANUAL", customerId: A.customer, lines: [{ description: "Frete", quantity: 1, unitAmountCents: 10_000 }] })
    ).id;
    A1.fuelLog = (await fuelService.createFuelLogOffice(tx, orgA, { assetId: A.asset, liters: 120, hourMeter: 1_500 })).id;
    A1.catalogPart = (await partsService.createPart(tx, orgA, { sku: "T10-FH", name: "Filtro hidráulico", unitCostCents: 4_500 })).id;
    A1.warehouse = (await partsService.createLocation(tx, orgA, { name: "Almoxarifado A", type: "WAREHOUSE" })).id;
    A1.plan = (await maintenanceService.createPlan(tx, orgA, { name: "Revisão 250 h", assetId: A.asset, trigger: "HOURS", intervalHours: 250 })).id;
  });
  await withSyncTx(orgA, (tx) =>
    partsService.createMovement(tx, orgA, { type: "IN", partId: A1.catalogPart, quantity: 5, toLocationId: A1.warehouse, unitCostCents: 4_500 }),
  );

  orgAIds = await collectOrgAIds();
}, 120_000);

beforeEach(() => {
  setRateLimiter(memoryRateLimiter());
});

afterAll(async () => {
  setMediaStore(null);
  setRateLimiter(null);
  setTenancyConfigForTests(null);
  setAuthConfigForTests(null);
  await rm(MEDIA_ROOT, { recursive: true, force: true });
  await seeded?.close();
});

// ───────── REST table ─────────

/**
 * `kind: "byId"` rows target an org A id and must fail with `NOT_FOUND`.
 * `kind: "list"` rows read an org B collection and must not return any org A id.
 * `kind: "scoped"` rows filter an org B list by an org A id: `NOT_FOUND` or an empty result.
 */
interface RestRow {
  readonly route: string;
  readonly kind: "byId" | "list" | "scoped";
  readonly run: () => Promise<unknown>;
}

const inspectionDate = new Date(Date.now() + 86_400_000).toISOString();
const later = new Date(Date.now() + 5 * 86_400_000).toISOString();

const coreRows: readonly RestRow[] = [
  // Assets
  { route: "GET assets/[id]", kind: "byId", run: () => assetQueries.getAsset(B, A.asset) },
  { route: "PATCH assets/[id]", kind: "byId", run: () => write((tx) => assetService.updateAsset(tx, B, A.asset, { name: "Hijack" })) },
  { route: "GET assets/[id]/history", kind: "byId", run: () => assetQueries.assetHistory(B, A.asset, { limit: 20 }) },
  { route: "GET assets/[id]/qr.png", kind: "byId", run: () => assetQueries.getAsset(B, A.asset) },
  { route: "POST assets/[id]/retire", kind: "byId", run: () => write((tx) => assetService.retireAsset(tx, B, A.asset, { reason: "hijack" })) },
  { route: "GET assets", kind: "list", run: () => assetQueries.listAssets(B, {}) },
  {
    route: "POST assets/qr-sheet",
    kind: "byId",
    run: () =>
      assetQrSheet.renderQrSheet(B, { assetIds: [A.asset] }, () => {
        throw new Error("the encoder must not run for another organisation's asset");
      }),
  },
  { route: "POST assets", kind: "byId", run: () => write((tx) => assetService.createAsset(tx, B, { name: "Ref", category: "TRACTOR", homeSiteId: A.site })) },
  // Sites and plots
  { route: "GET sites/[id]", kind: "byId", run: () => siteQueries.getSite(B, A.site) },
  { route: "PATCH sites/[id]", kind: "byId", run: () => write((tx) => siteService.updateSite(tx, B, A.site, { name: "Hijack" })) },
  { route: "DELETE sites/[id]", kind: "byId", run: () => write((tx) => siteService.deleteSite(tx, B, A.site)) },
  { route: "GET sites/[id]/plots", kind: "byId", run: () => siteQueries.listPlots(B, A.site, {}) },
  { route: "POST sites/[id]/plots", kind: "byId", run: () => write((tx) => siteService.createPlot(tx, B, A.site, { name: "Hijack" })) },
  { route: "GET sites", kind: "list", run: () => siteQueries.listSites(B, {}) },
  { route: "POST sites", kind: "byId", run: () => write((tx) => siteService.createSite(tx, B, { name: "Ref", type: "FARM", customerId: A.customer })) },
  { route: "GET plots/[id]", kind: "byId", run: () => siteQueries.getPlot(B, A.plot) },
  { route: "PATCH plots/[id]", kind: "byId", run: () => write((tx) => siteService.updatePlot(tx, B, A.plot, { name: "Hijack" })) },
  // Seasons
  { route: "PATCH seasons/[id]", kind: "byId", run: () => write((tx) => seasonService.updateSeason(tx, B, A.season, { name: "Hijack" })) },
  { route: "PATCH seasons/[id]", kind: "byId", run: () => write((tx) => seasonService.closeSeason(tx, B, A.season, { confirmOpenWork: true })) },
  { route: "GET seasons", kind: "list", run: () => seasonQueries.listSeasons(B) },
  // Customers
  { route: "GET customers/[id]", kind: "byId", run: () => customerQueries.getCustomer(B, A.customer) },
  { route: "PATCH customers/[id]", kind: "byId", run: () => write((tx) => customerService.updateCustomer(tx, B, A.customer, { name: "Hijack" })) },
  { route: "DELETE customers/[id]", kind: "byId", run: () => write((tx) => customerService.deleteCustomer(tx, B, A.customer)) },
  { route: "GET customers", kind: "list", run: () => customerQueries.listCustomers(B, {}) },
  // Checklist templates
  {
    route: "GET checklist-templates/[id]",
    kind: "byId",
    run: () => write(async (tx) => ({ template: await checklistQueries.getTemplate(B, A.template), inUse: await checklistService.inUseCount(tx, A.template) })),
  },
  { route: "PATCH checklist-templates/[id]", kind: "byId", run: () => write((tx) => checklistService.updateTemplate(tx, B, A.template, { name: "Hijack" })) },
  { route: "DELETE checklist-templates/[id]", kind: "byId", run: () => write((tx) => checklistService.deleteTemplate(tx, B, A.template)) },
  {
    route: "POST checklist-templates/[id]/publish",
    kind: "byId",
    run: () =>
      write((tx) =>
        checklistService.publishTemplate(tx, B, A.template, {
          items: [{ key: "k1", label: { "pt-BR": "Item", en: "Item" }, type: "PASS_FAIL_NA", required: true }],
          confirmInUse: true,
        }),
      ),
  },
  { route: "GET checklist-templates", kind: "list", run: () => checklistQueries.listTemplates(B) },
  // Rentals
  { route: "GET rentals/[id]", kind: "byId", run: () => rentalQueries.getRentalDetail(B, A.rental) },
  { route: "PATCH rentals/[id]", kind: "byId", run: () => write((tx) => rentalService.updateRental(tx, B, A.rental, { notes: "hijack" })) },
  { route: "POST rentals/[id]/reserve", kind: "byId", run: () => write((tx) => rentalService.reserveRental(tx, B, A.rental)) },
  { route: "POST rentals/[id]/cancel", kind: "byId", run: () => write((tx) => rentalService.cancelRental(tx, B, A.rental, { reason: "hijack" })) },
  { route: "POST rentals/[id]/extend", kind: "byId", run: () => write((tx) => rentalService.extendRental(tx, B, A.rental, { newPlannedEnd: later })) },
  { route: "POST rentals/[id]/close", kind: "byId", run: () => write((tx) => rentalService.closeRental(tx, B, A.rentalWithCharge, {})) },
  { route: "GET rentals/[id]/charges", kind: "byId", run: () => rentalQueries.getChargesView(B, A.rentalWithCharge) },
  {
    route: "POST rentals/[id]/charges",
    kind: "byId",
    run: () => write((tx) => rentalService.addManualCharge(tx, B, A.rentalWithCharge, { type: "OTHER", description: "hijack", unitAmountCents: 100 })),
  },
  { route: "POST rentals/[id]/charges/recompute", kind: "byId", run: () => write((tx) => rentalService.recomputeCharges(tx, B, A.rentalWithCharge)) },
  { route: "DELETE rentals/[id]/charges/[lineId]", kind: "byId", run: () => write((tx) => rentalService.deleteManualCharge(tx, B, A.rentalWithCharge, A.charge)) },
  { route: "GET rentals/[id]/checkin.pdf", kind: "byId", run: () => rentalQueries.renderRentalPdf(B, A.rentalWithCharge, "checkin") },
  { route: "GET rentals/[id]/checkout.pdf", kind: "byId", run: () => rentalQueries.renderRentalPdf(B, A.rentalWithCharge, "checkout") },
  { route: "GET rentals", kind: "list", run: () => rentalQueries.listRentals(B, {}) },
  {
    route: "POST rentals",
    kind: "byId",
    run: () => write((tx) => rentalService.createRental(tx, B, { assetId: A.asset, customerId: A.customer, plannedStart: inspectionDate, plannedEnd: later })),
  },
  { route: "GET rentals/calendar", kind: "list", run: () => rentalQueries.rentalCalendar(B, { from: new Date(0).toISOString(), to: later }) },
  { route: "GET rentals/eligibility", kind: "byId", run: () => rentalQueries.checkEligibility(B, { assetId: A.asset, customerId: A.customer, from: inspectionDate, to: later }) },
  // Damages and inspections
  { route: "PATCH damages/[id]", kind: "byId", run: () => write((tx) => rentalService.updateDamage(tx, B, A.damage, { description: "hijack" })) },
  { route: "POST damages/[id]/create-work-order", kind: "byId", run: () => write((tx) => rentalService.createDamageWorkOrder(tx, B, A.damage, {})) },
  { route: "GET damages", kind: "list", run: () => rentalQueries.listDamages(B, {}) },
  { route: "GET damages", kind: "scoped", run: () => rentalQueries.listDamages(B, { assetId: seedUuid(411) }) },
  { route: "GET inspections/[id]", kind: "byId", run: () => rentalQueries.getInspection(B, A.inspection) },
  { route: "GET inspections/[id]/compare", kind: "byId", run: () => rentalQueries.compareInspection(B, A.inspection) },
  // Field reports
  { route: "GET field-reports/[id]", kind: "byId", run: () => fieldReportQueries.getFieldReportDetail(B, A.fieldReport) },
  { route: "POST field-reports/[id]/start-review", kind: "byId", run: () => write((tx) => fieldReportService.startReview(tx, B, A.fieldReport)) },
  { route: "POST field-reports/[id]/mark-for-repair", kind: "byId", run: () => write((tx) => fieldReportService.markForRepair(tx, B, A.fieldReport, {})) },
  { route: "POST field-reports/[id]/monitor", kind: "byId", run: () => write((tx) => fieldReportService.monitor(tx, B, A.fieldReport, { note: "hijack" })) },
  { route: "POST field-reports/[id]/dismiss", kind: "byId", run: () => write((tx) => fieldReportService.dismiss(tx, B, A.fieldReport, { reason: "hijack" })) },
  { route: "POST field-reports/[id]/link-asset", kind: "byId", run: () => write((tx) => fieldReportService.linkAsset(tx, B, A.fieldReport, { assetId: A.asset })) },
  { route: "GET field-reports", kind: "list", run: () => fieldReportQueries.listFieldReports(B, {}) },
  // Work orders
  { route: "GET work-orders/[id]", kind: "byId", run: () => write((tx) => workOrderQueries.get(tx, B, A.workOrder)) },
  { route: "GET work-orders/[id]", kind: "byId", run: () => write((tx) => workOrderQueries.detail(tx, B, A.workOrder)) },
  { route: "PATCH work-orders/[id]", kind: "byId", run: () => write((tx) => workOrderService.patch(tx, B, A.workOrder, { title: "Hijack" })) },
  { route: "POST work-orders/[id]/assign", kind: "byId", run: () => write((tx) => workOrderService.assign(tx, B, A.workOrder, { assigneeId: SEED.orgBUser })) },
  {
    route: "POST work-orders/[id]/reassign",
    kind: "byId",
    run: () => write((tx) => workOrderService.reassign(tx, B, A.workOrder, { assigneeId: SEED.orgBUser, reason: "hijack" })),
  },
  { route: "POST work-orders/[id]/verify", kind: "byId", run: () => write((tx) => workOrderService.verify(tx, B, A.workOrder, {})) },
  { route: "POST work-orders/[id]/reopen", kind: "byId", run: () => write((tx) => workOrderService.reopen(tx, B, A.workOrder, { reason: "hijack" })) },
  { route: "POST work-orders/[id]/cancel", kind: "byId", run: () => write((tx) => workOrderService.cancel(tx, B, A.workOrder, { reason: "hijack" })) },
  {
    route: "PATCH work-orders/[id]/external-cost",
    kind: "byId",
    run: () => write((tx) => workOrderService.setExternalCost(tx, B, A.workOrder, { externalCostCents: 100 })),
  },
  { route: "POST work-orders/[id]/release-hold", kind: "byId", run: () => write((tx) => workOrderField.releaseSafetyHold(tx, B, A.workOrder, {})) },
  { route: "GET work-orders/[id]/report.pdf", kind: "byId", run: () => write((tx) => workOrderReport.buildReportModel(tx, B, A.workOrder, {})) },
  { route: "GET work-orders/[id]/suggestions", kind: "byId", run: () => write((tx) => workOrderSuggest.suggestTechnicians(tx, B, { workOrderId: A.workOrder })) },
  { route: "GET work-orders/suggestions", kind: "byId", run: () => write((tx) => workOrderSuggest.suggestTechnicians(tx, B, { fieldReportId: A.fieldReport })) },
  { route: "GET work-orders", kind: "list", run: () => write((tx) => workOrderQueries.list(tx, B, {})) },
  {
    route: "POST work-orders",
    kind: "byId",
    run: () => write((tx) => workOrderService.createManual(tx, B, { priority: "HIGH", title: "Hijack", assetId: A.asset })),
  },
  // Office operations
  { route: "POST attention/[kind]/[id]/resolve", kind: "byId", run: () => ops.resolveAttention(B, "MEDIA_PENDING", A.media, { note: "hijack" }) },
  { route: "POST attention/[kind]/[id]/resolve", kind: "byId", run: () => ops.resolveAttention(B, "STALE_DEVICE", A.device, { note: "hijack" }) },
  { route: "POST attention/[kind]/[id]/resolve", kind: "byId", run: () => ops.resolveAttention(B, "DIAGNOSTIC", A.device, { note: "hijack" }) },
  { route: "POST attention/[kind]/[id]/resolve", kind: "byId", run: () => ops.resolveAttention(B, "REJECTED_MUTATION", A.workOrder, { note: "hijack" }) },
  { route: "GET attention", kind: "list", run: () => ops.listAttention(B) },
  { route: "GET ops/live", kind: "list", run: () =>
      ops.getLive(B, {
        liveSnapshot: async (orgId) => {
          expect(orgId).toBe(SEED.orgB);
          return [];
        },
      }),
  },
  { route: "GET ops/kpis", kind: "list", run: () => ops.getKpis(B, { range: "30d" }) },
  { route: "GET ops/alerts", kind: "list", run: () => ops.getAlerts(B) },
  { route: "GET ops/activity", kind: "list", run: () => ops.listActivity(B, {}) },
  { route: "GET ops/operators/[userId]/trail", kind: "byId", run: () => ops.getOperatorTrail(B, A.field, {}) },
  { route: "GET ops/analytics", kind: "list", run: () => ops.getAnalytics(B, { metric: "top_failing", from: "2020-01-01", to: "2030-12-31" }) },
  { route: "GET ops/analytics", kind: "list", run: () => ops.getAnalytics(B, { metric: "rental_revenue", from: "2020-01-01", to: "2030-12-31" }) },
  { route: "GET ops/analytics", kind: "scoped", run: () => ops.getAnalytics(B, { metric: "reports_by_category", seasonId: A.season }) },
  { route: "GET ops/boundaries", kind: "list", run: () => ops.plotBoundaries(B) },
  { route: "GET search", kind: "list", run: () => ops.search(B, "Trator") },
  { route: "GET search", kind: "list", run: () => ops.search(B, "WO") },
  { route: "GET costs/rollup", kind: "list", run: () => costs.costRollup(B, { groupBy: "asset" }) },
  { route: "GET costs/rollup", kind: "scoped", run: () => costs.costRollup(B, { groupBy: "asset", assetId: A.asset, siteId: A.site, seasonId: A.season }) },
  // Comments (T17)
  { route: "GET comments", kind: "byId", run: () => commentService.listComments(B, { entityType: "WORK_ORDER", entityId: A.workOrder }) },
  { route: "POST comments", kind: "byId", run: () => write((tx) => commentService.createCommentFromInput(tx, B, { entityType: "WORK_ORDER", entityId: A.workOrder, body: "hijack" })) },
  // Parts and stock (T14)
  { route: "GET parts", kind: "list", run: () => partsService.listParts(B, { includeArchived: true }) },
  { route: "POST parts", kind: "list", run: () => write((tx) => partsService.createPart(tx, B, { sku: "T10-FH", name: "Same SKU as org A" })) },
  { route: "PATCH parts/[id]", kind: "byId", run: () => write((tx) => partsService.updatePart(tx, B, A1.catalogPart, { name: "Hijack" })) },
  { route: "PATCH parts/[id]", kind: "byId", run: () => write((tx) => partsService.updatePart(tx, B, A1.catalogPart, { archived: true })) },
  { route: "GET stock-locations", kind: "list", run: () => partsService.listLocations(B) },
  { route: "POST stock-locations", kind: "byId", run: () => write((tx) => partsService.createLocation(tx, B, { name: "Hijack van", type: "VAN", userId: A.field })) },
  { route: "POST stock-locations", kind: "byId", run: () => write((tx) => partsService.createLocation(tx, B, { name: "Hijack", type: "WAREHOUSE", siteId: A.site })) },
  { route: "GET stock-levels", kind: "list", run: () => partsService.listLevels(B, {}) },
  { route: "GET stock-levels", kind: "scoped", run: () => partsService.listLevels(B, { locationId: A1.warehouse, partId: A1.catalogPart }) },
  { route: "GET stock-movements", kind: "list", run: () => partsService.listMovements(B, {}) },
  { route: "GET stock-movements", kind: "scoped", run: () => partsService.listMovements(B, { partId: A1.catalogPart, locationId: A1.warehouse, workOrderId: A.workOrderWithPart }) },
  {
    route: "POST stock-movements",
    kind: "byId",
    run: () => write((tx) => partsService.createMovement(tx, B, { type: "ADJUSTMENT", partId: A1.catalogPart, quantity: -5, toLocationId: A1.warehouse, note: "hijack" })),
  },
  // Maintenance plans (T14)
  { route: "GET maintenance-plans", kind: "list", run: () => maintenanceService.listPlans(B, { includeInactive: true }) },
  { route: "GET maintenance-plans", kind: "scoped", run: () => maintenanceService.listPlans(B, { assetId: A.asset, includeInactive: true }) },
  { route: "POST maintenance-plans", kind: "byId", run: () => write((tx) => maintenanceService.createPlan(tx, B, { name: "Hijack", assetId: A.asset, trigger: "HOURS", intervalHours: 250 })) },
  { route: "PATCH maintenance-plans/[id]", kind: "byId", run: () => write((tx) => maintenanceService.updatePlan(tx, B, A1.plan, { name: "Hijack" })) },
  { route: "GET maintenance-plans/[id]/due", kind: "byId", run: () => maintenanceService.due(B, A1.plan) },
  // Billing documents (T15)
  { route: "GET billing-documents", kind: "list", run: () => billingService.listBillingDocuments(B, {}) },
  { route: "GET billing-documents", kind: "scoped", run: () => billingService.listBillingDocuments(B, { customerId: A.customer, workOrderId: A.workOrder, rentalId: A.rental }) },
  {
    route: "POST billing-documents",
    kind: "byId",
    run: () => write((tx) => billingService.createBillingDocument(tx, B, { source: "MANUAL", customerId: A.customer, lines: [{ description: "x", quantity: 1, unitAmountCents: 1 }] })),
  },
  { route: "POST billing-documents", kind: "byId", run: () => write((tx) => billingService.createBillingDocument(tx, B, { source: "WORK_ORDER", workOrderId: A.workOrder })) },
  { route: "POST billing-documents", kind: "byId", run: () => write((tx) => billingService.createBillingDocument(tx, B, { source: "RENTAL", rentalId: A.rentalWithCharge })) },
  { route: "GET billing-documents/preview", kind: "byId", run: () => write((tx) => billingService.previewBillingLines(tx, B, { workOrderId: A.workOrder })) },
  { route: "GET billing-documents/preview", kind: "byId", run: () => write((tx) => billingService.previewBillingLines(tx, B, { rentalId: A.rentalWithCharge })) },
  { route: "GET billing-documents/[id]", kind: "byId", run: () => billingService.getBillingDocument(B, A1.billingDocument) },
  { route: "PATCH billing-documents/[id]", kind: "byId", run: () => write((tx) => billingService.updateBillingDocument(tx, B, A1.billingDocument, { notes: "hijack" })) },
  { route: "POST billing-documents/[id]/issue", kind: "byId", run: () => write((tx) => billingService.issueBillingDocument(tx, B, A1.billingDocument, {})) },
  { route: "POST billing-documents/[id]/pay", kind: "byId", run: () => write((tx) => billingService.payBillingDocument(tx, B, A1.billingDocument, {})) },
  { route: "POST billing-documents/[id]/cancel", kind: "byId", run: () => write((tx) => billingService.cancelBillingDocument(tx, B, A1.billingDocument, { reason: "hijack" })) },
  { route: "GET billing-documents/[id]/pdf", kind: "byId", run: () => billingService.renderBillingPdf(B, A1.billingDocument) },
  // Fuel logs (T15)
  { route: "GET fuel-logs", kind: "list", run: () => fuelService.listFuelLogs(B, {}) },
  { route: "GET fuel-logs", kind: "scoped", run: () => fuelService.listFuelLogs(B, { assetId: A.asset, seasonId: A.season }) },
  { route: "POST fuel-logs", kind: "byId", run: () => write((tx) => fuelService.createFuelLogOffice(tx, B, { assetId: A.asset, liters: 10 })) },
  { route: "GET fuel-logs/consumption", kind: "scoped", run: () => fuelService.fuelConsumption(B, { assetId: A.asset }) },
  // Exports
  {
    route: "GET exports/[id]",
    kind: "byId",
    run: async () => exportsService.getExportJob({ orgId: B.orgId, userId: B.userId, role: "ADMIN" }, orgAExportJobId, await exportsService.resolveExportDeps()),
  },
  {
    route: "GET exports/[id]",
    kind: "byId",
    run: async () => exportsService.downloadExportJob({ orgId: B.orgId, userId: B.userId, role: "ADMIN" }, orgAExportJobId, await exportsService.resolveExportDeps()),
  },
  {
    route: "GET exports/[entity].csv",
    kind: "list",
    run: async () => {
      const result = await exportsService.requestExport({ orgId: B.orgId, userId: B.userId, role: "ADMIN" }, "assets", {}, await exportsService.resolveExportDeps());
      if (result.kind !== "stream") return result;
      let csv = "";
      for await (const chunk of result.chunks) csv += chunk;
      return csv;
    },
  },
  {
    route: "POST exports",
    kind: "list",
    run: async () => exportsService.createExportJob({ orgId: B.orgId, userId: B.userId, role: "ADMIN" }, { entity: "rentals" }, await exportsService.resolveExportDeps()),
  },
];

/** Routes served by the `platformApi` handler map, called with the org B bearer token. */
interface HttpRow {
  readonly route: string;
  readonly kind: "byId" | "list" | "scoped";
  readonly key: PlatformRouteKey;
  readonly options: HttpOptions;
}

const platformRows: readonly HttpRow[] = [
  { route: "GET users/[id]", kind: "byId", key: "GET /users/:id", options: { params: { id: A.manager } } },
  { route: "PATCH users/[id]", kind: "byId", key: "PATCH /users/:id", options: { params: { id: A.manager }, body: { name: "Hijack" } } },
  { route: "POST users/[id]/role", kind: "byId", key: "POST /users/:id/role", options: { params: { id: A.manager }, body: { role: "FIELD" } } },
  { route: "POST users/[id]/deactivate", kind: "byId", key: "POST /users/:id/deactivate", options: { params: { id: A.manager } } },
  { route: "POST users/[id]/reactivate", kind: "byId", key: "POST /users/:id/reactivate", options: { params: { id: A.manager } } },
  { route: "POST users/[id]/invite", kind: "byId", key: "POST /users/:id/invite", options: { params: { id: seedUuid(108) } } },
  { route: "POST users/[id]/reset-link", kind: "byId", key: "POST /users/:id/reset-link", options: { params: { id: A.manager } } },
  {
    route: "POST users/[id]/temporary-password",
    kind: "byId",
    key: "POST /users/:id/temporary-password",
    options: { params: { id: A.manager }, body: { password: "Hijacked-Password-2024!" } },
  },
  { route: "GET users/[id]/devices", kind: "scoped", key: "GET /users/:id/devices", options: { params: { id: A.field } } },
  { route: "GET users", kind: "list", key: "GET /users", options: {} },
  { route: "GET devices", kind: "list", key: "GET /devices", options: {} },
  { route: "GET devices/[id]/diagnostics", kind: "scoped", key: "GET /devices/:id/diagnostics", options: { params: { id: "seed-device-1" } } },
  { route: "GET devices/[id]/diagnostics", kind: "scoped", key: "GET /devices/:id/diagnostics", options: { params: { id: A.device } } },
  {
    route: "POST media",
    kind: "byId",
    key: "POST /media",
    options: { body: { kind: "PHOTO", mimeType: "image/jpeg", sizeBytes: 2048, parent: { type: "WORK_ORDER", id: A.workOrder } } },
  },
  { route: "POST media/[id]/upload-url", kind: "byId", key: "POST /media/:id/upload-url", options: { params: { id: A.media }, body: { sizeBytes: 2048, mimeType: "image/jpeg" } } },
  { route: "POST media/[id]/multipart/parts", kind: "byId", key: "POST /media/:id/multipart/parts", options: { params: { id: A.media }, body: { uploadId: randomUUID(), parts: [1] } } },
  { route: "POST media/[id]/complete", kind: "byId", key: "POST /media/:id/complete", options: { params: { id: A.media }, body: {} } },
  { route: "GET media/[id]/url", kind: "byId", key: "GET /media/:id/url", options: { params: { id: A.media } } },
  { route: "GET notifications", kind: "list", key: "GET /notifications", options: {} },
  { route: "GET settings", kind: "list", key: "GET /settings", options: {} },
];

describe("REST: org B user targeting org A", () => {
  it.each(coreRows.map((row, index) => [`${row.route} #${index}`, row] as const))("%s", async (_name, row) => {
    const before = await orgADigest();
    const result = await outcome(row.run);
    if (row.kind === "byId") {
      expect(isNotFoundFamily(result.code), `${row.route} answered ${result.code}`).toBe(true);
    } else if (row.kind === "scoped") {
      expect(["OK", "NOT_FOUND"], row.route).toContain(result.code);
      expect(leakedIds(result.value), row.route).toEqual([]);
    } else {
      expect(result.code, row.route).toBe("OK");
      expect(leakedIds(result.value), row.route).toEqual([]);
    }
    expect(await orgADigest(), `${row.route} changed organisation A`).toBe(before);
  });

  it.each(platformRows.map((row) => [`${row.route} (${row.key})`, row] as const))("%s", async (_name, row) => {
    const before = await orgADigest();
    const response = await platformCall(row.key, { ...row.options, bearer: orgBToken });
    const text = await response.text();
    if (row.kind === "byId") {
      expect(response.status, text).toBe(404);
      expect((JSON.parse(text) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
    } else if (row.kind === "scoped") {
      expect([200, 404], text).toContain(response.status);
      expect(leakedIds(text)).toEqual([]);
    } else {
      expect(response.status, text).toBe(200);
      expect(leakedIds(text)).toEqual([]);
    }
    expect(await orgADigest(), `${row.route} changed organisation A`).toBe(before);
  });

  it("POST notifications/read with org A ids leaves org A notifications untouched", async () => {
    const before = await orgADigest();
    const response = await platformCall("POST /notifications/read", { bearer: orgBToken, body: { ids: [A.notification] } });
    expect([200, 204, 404]).toContain(response.status);
    expect(leakedIds(await response.text())).toEqual([]);
    expect(await orgADigest()).toBe(before);
  });

  it("signed media blob routes refuse an org B session without the signed token", async () => {
    const before = await orgADigest();
    for (const [key, params] of [
      ["GET /media/:id/blob", { id: A.media }],
      ["PUT /media/:id/blob", { id: A.media }],
      ["PUT /media/:id/blob/parts/:n", { id: A.media, n: "1" }],
    ] as const) {
      const response = await platformCall(key, { bearer: orgBToken, params });
      expect(response.status, key).toBeGreaterThanOrEqual(400);
      expect(leakedIds(await response.text())).toEqual([]);
    }
    expect(await orgADigest()).toBe(before);
  });
});

// ───────── Platform boundary ─────────

const staffKeys: readonly { key: TenancyRouteKey; params?: Record<string, string>; body?: unknown }[] = [
  { key: "GET /platform/orgs" },
  { key: "GET /platform/orgs/:id", params: { id: A.org } },
  { key: "PATCH /platform/orgs/:id", params: { id: A.org }, body: { status: "SUSPENDED", reason: "hijack" } },
  { key: "POST /platform/orgs/:id/admin-reset-link", params: { id: A.org } },
];

describe("platform routes require ar_platform", () => {
  it.each(staffKeys.map((entry) => [entry.key, entry] as const))("%s rejects every tenant credential", async (_key, entry) => {
    const before = await orgADigest();
    const attempts: HttpOptions[] = [
      { bearer: orgBToken },
      { cookies: { ar_access: orgBToken } },
      { cookies: { ar_platform: orgBToken } },
      {},
    ];
    for (const auth of attempts) {
      const response = await tenancyCall(entry.key, { ...auth, params: entry.params ?? {}, body: entry.body });
      const text = await response.text();
      expect([401, 404], text).toContain(response.status);
      expect(leakedIds(text)).toEqual([]);
    }
    expect(await orgADigest()).toBe(before);
  });

  it("the staff token itself is accepted on the platform route (control)", async () => {
    const response = await tenancyCall("GET /platform/orgs/:id", { params: { id: A.org }, cookies: { ar_platform: staffToken } });
    expect(response.status).toBe(200);
  });

  it("a platform token is rejected on tenant APIs", async () => {
    await expect(verifyAccessToken(staffToken, { secret: JWT_SECRET })).rejects.toBeDefined();
    for (const auth of [{ bearer: staffToken }, { cookies: { ar_access: staffToken } }, { cookies: { ar_platform: staffToken } }] as HttpOptions[]) {
      for (const key of ["GET /users", "GET /settings", "GET /auth/me", "GET /notifications"] as const) {
        const response = await platformCall(key, auth);
        expect(response.status, key).toBe(401);
        expect(await errorCode(response)).toBe("UNAUTHENTICATED");
      }
      const subscription = await tenancyCall("GET /org/subscription", auth);
      expect(subscription.status).toBe(401);
      expect(await errorCode(subscription)).toBe("UNAUTHENTICATED");
    }
  });

  it("a tenant never reads another organisation's OrgUsage", async () => {
    const response = await tenancyCall("GET /org/subscription", { bearer: orgBToken });
    const text = await response.text();
    expect(response.status, text).toBe(200);
    expect(text).not.toContain("2099-01");
    expect(leakedIds(text)).toEqual([]);
  });
});

// ───────── Sync ─────────

function envelope(name: string, payload: unknown) {
  return { id: randomUUID(), name, payload, occurredAt: new Date().toISOString() };
}

const capturedAt = new Date().toISOString();

function inspection(extra: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    assetId: A.asset,
    templateId: A.template,
    templateVersion: 1,
    templateSnapshot: [],
    responses: [],
    accessories: [],
    documentLocale: "pt-BR",
    signatureStatus: "ABSENT",
    signatureReason: "hijack",
    agentSignatureMediaId: randomUUID(),
    ...extra,
  };
}

/** One envelope per mutation in the registry; each targets an org A id. */
const pushRows: Readonly<Record<string, { payload: () => unknown; expected: "NOT_FOUND" | "UNKNOWN_MUTATION" | "SELF_ONLY" | "UNREGISTERED" | "IGNORED" }>> = {
  // ARCHITECTURE §7.4: an unknown or other-org asset never rejects; the report is stored as unregistered.
  "fieldReport.create": {
    expected: "UNREGISTERED",
    payload: () => ({ id: randomUUID(), assetId: A.asset, category: "ENGINE", priority: "HIGH", machineOperable: true, suggestedAction: "REPAIR_SOON", title: "Hijack" }),
  },
  "fieldReport.update": { expected: "NOT_FOUND", payload: () => ({ id: A.fieldReport, patch: { title: "Hijack" } }) },
  "fieldReport.withdraw": { expected: "NOT_FOUND", payload: () => ({ id: A.fieldReport, reason: "hijack" }) },
  "media.register": {
    expected: "NOT_FOUND",
    payload: () => ({ id: randomUUID(), kind: "PHOTO", tag: "GENERAL", mimeType: "image/jpeg", capturedAt, parent: { type: "WORK_ORDER", id: A.workOrder } }),
  },
  "media.update": { expected: "NOT_FOUND", payload: () => ({ id: A.media, caption: "hijack" }) },
  "media.delete": { expected: "NOT_FOUND", payload: () => ({ id: A.media }) },
  "workOrder.transition": { expected: "NOT_FOUND", payload: () => ({ id: A.workOrder, action: "accept" }) },
  "workOrder.complete": { expected: "NOT_FOUND", payload: () => ({ id: A.workOrder, resolution: "hijack", documentLocale: "pt-BR", signatureStatus: "ABSENT", signatureReason: "x" }) },
  "workOrder.saveChecklist": {
    expected: "NOT_FOUND",
    payload: () => ({ id: A.workOrder, templateVersion: 1, responses: [{ key: "k1", value: "PASS", answeredAt: capturedAt }] }),
  },
  "workOrder.addPart": { expected: "NOT_FOUND", payload: () => ({ id: randomUUID(), workOrderId: A.workOrderWithPart, name: "Filter", quantity: 1, unit: "un" }) },
  "workOrder.removePart": { expected: "NOT_FOUND", payload: () => ({ id: A.part }) },
  "comment.create": { expected: "NOT_FOUND", payload: () => ({ id: randomUUID(), entityType: "WORK_ORDER", entityId: A.workOrder, body: "hijack" }) },
  "inspection.submit": { expected: "NOT_FOUND", payload: () => inspection({ rentalId: A.rental }) },
  "rental.checkout": {
    expected: "NOT_FOUND",
    payload: () => ({ rentalId: A.rental, inspection: inspection({ safetyBriefingGiven: true, termsAccepted: true }) }),
  },
  "rental.checkin": { expected: "NOT_FOUND", payload: () => ({ rentalId: A.rentalWithCharge, inspection: inspection() }) },
  "asset.updateReadings": { expected: "NOT_FOUND", payload: () => ({ assetId: A.asset, hourMeter: 999_999 }) },
  // Acts on the caller only: there is no foreign id to target, so only "org A unchanged" applies.
  "user.setDuty": { expected: "SELF_ONLY", payload: () => ({ status: "OFF_DUTY" }) },
  // Bulk acknowledgement of the caller's own notifications: foreign ids are silently ignored.
  "notification.markRead": { expected: "IGNORED", payload: () => ({ ids: [A.notification] }) },
  "fuelLog.create": { expected: "NOT_FOUND", payload: () => ({ id: randomUUID(), assetId: A.asset, liters: 10 }) },
};

function pushRequest(mutations: ReturnType<typeof envelope>[]) {
  return {
    deviceId: ORG_B_DEVICE_UUID,
    clientTime: new Date().toISOString(),
    deviceStatus: { appVersion: "1.0.0", runtimeVersion: "1", pendingMutations: mutations.length, pendingUploads: 0, pendingBytes: 0, scopeEpoch: 0 },
    mutations,
  };
}

describe("sync push: org B device targeting org A", () => {
  const pushCtx: Ctx = { ...B, deviceId: ORG_B_DEVICE_UUID };

  it("covers every mutation in the registry", () => {
    expect(Object.keys(pushRows).sort()).toEqual(Object.keys(mutationRegistry).sort());
  });

  it.each(Object.entries(pushRows))("%s", async (name, row) => {
    const before = await orgADigest();
    const env = envelope(name, row.payload());
    const response = await push(pushCtx, pushRequest([env]));
    const result = response.results[0];
    expect(result?.id).toBe(env.id);
    if (row.expected === "SELF_ONLY" || row.expected === "IGNORED") {
      expect(result?.status).toBe("APPLIED");
    } else if (row.expected === "UNREGISTERED") {
      expect(result?.status).toBe("APPLIED");
      const report = await scoped({ orgId: SEED.orgB }, seeded.handle.db).field_reports.findOne({ title: "Hijack" });
      expect(report).toMatchObject({ assetId: null, siteId: null });
      expect(leakedIds({ ...report, flags: undefined })).toEqual([]);
    } else if (row.expected === "UNKNOWN_MUTATION") {
      expect(result, JSON.stringify(result)).toMatchObject({ status: "REJECTED", code: "UNKNOWN_MUTATION" });
    } else {
      expect(result?.status, JSON.stringify(result)).toBe("REJECTED");
      const code = result?.status === "REJECTED" ? result.code : undefined;
      expect(isNotFoundFamily(code), `${name} answered ${code}`).toBe(true);
      // Rejection details may echo the client's own id; the server must never attach an org A snapshot.
      expect(result?.status === "REJECTED" ? (result.snapshot ?? null) : null).toBeNull();
    }
    expect(await orgADigest(), `${name} changed organisation A`).toBe(before);
  });
});

describe("sync pull", () => {
  it("never returns organisation A documents to an org B device", async () => {
    const ctx: Ctx = { ...B, deviceId: ORG_B_DEVICE_UUID };
    let cursor: string | undefined;
    let rows = 0;
    for (let guard = 0; guard < 50; guard += 1) {
      const page = await pull(ctx, { deviceId: ORG_B_DEVICE_UUID, scopeEpoch: 0, ...(cursor === undefined ? {} : { cursor }) });
      for (const list of Object.values(page.changes) as Record<string, unknown>[][]) {
        for (const doc of list) {
          rows += 1;
          if ("organizationId" in doc) expect(doc.organizationId).toBe(SEED.orgB);
          if ("id" in doc) expect(orgAIds.has(String(doc.id))).toBe(false);
        }
      }
      expect(leakedIds(page.deleted)).toEqual([]);
      cursor = page.cursor;
      if (!page.hasMore || page.resetRequired) break;
    }
    expect(rows).toBeGreaterThan(0);
  });
});

// ───────── Route coverage ─────────

/** Routes with no org A id to target (public, own-organisation or create-only), with the reason. */
const ALLOWLIST: Readonly<Record<string, string>> = {
  "GET health": "public liveness probe, no tenant data",
  "POST auth/login": "public sign-in; credentials resolve to the caller's own organisation",
  "POST auth/logout": "acts on the caller's own session",
  "POST auth/refresh": "acts on the caller's own refresh token",
  "GET auth/me": "returns the caller only",
  "DELETE auth/me": "deletes the caller only",
  "PATCH me": "updates the caller only",
  "POST auth/change-password": "acts on the caller only",
  "POST auth/socket-token": "issues a token for the caller's own organisation",
  "GET auth/invites/[code]": "public invite lookup keyed by a secret code, not a tenant id",
  "POST auth/invites/[code]/password": "public invite redemption keyed by a secret code",
  "GET auth/reset/[code]": "public reset lookup keyed by a secret code",
  "POST auth/reset/[code]": "public reset redemption keyed by a secret code",
  "GET auth/oauth/[provider]/start": "public OAuth start, owned by the OAuth helper",
  "GET auth/oauth/google/callback": "public OAuth callback, owned by the OAuth helper",
  "POST auth/oauth/apple/callback": "public OAuth callback, owned by the OAuth helper",
  "POST auth/oauth/exchange": "one-time code exchange for the caller",
  "POST auth/apple": "native Apple sign-in for the caller",
  "POST signup/organization": "public sign-up creates a new organisation",
  "GET org/subscription": "own organisation only; OrgUsage isolation is asserted above",
  "POST org/cancel": "own organisation only",
  "POST org/accept-terms": "own organisation only",
  "GET platform/auth/google/start": "staff sign-in start; covered by the platform boundary tests",
  "GET platform/auth/google/callback": "staff sign-in callback; covered by the platform boundary tests",
  "POST platform/auth/logout": "clears the staff cookie only",
  "GET platform/orgs": "covered by the platform boundary tests",
  "GET platform/orgs/[id]": "covered by the platform boundary tests",
  "PATCH platform/orgs/[id]": "covered by the platform boundary tests",
  "POST platform/orgs/[id]/admin-reset-link": "covered by the platform boundary tests",
  "POST sync/push": "covered by the sync push table",
  "GET sync/pull": "covered by the sync pull test",
  "POST telemetry": "writes the caller's own telemetry",
  "POST telemetry/diagnostics": "writes the caller's own diagnostics",
  "POST devices/register": "registers the caller's own device",
  "POST locations/batch": "writes the caller's own location fixes",
  "POST users": "creates a user in the caller's organisation; no foreign id",
  "POST customers": "creates a customer in the caller's organisation; no foreign id",
  "POST seasons": "creates a season in the caller's organisation; no foreign id",
  "POST checklist-templates": "creates a template in the caller's organisation; no foreign id",
  "PATCH settings": "updates the caller's own organisation settings",
  "POST notifications/read": "covered by the dedicated notifications test",
  "GET media/[id]/blob": "authorised by the signed URL token only; covered by the signed media test",
  "PUT media/[id]/blob": "authorised by the signed URL token only; covered by the signed media test",
  "PUT media/[id]/blob/parts/[n]": "authorised by the signed URL token only; covered by the signed media test",
};

const METHOD_PATTERN = /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/gu;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

describe("route coverage", () => {
  it("every route file and method is in the table, in the allowlist or a notImplemented stub", () => {
    const covered = new Set([...coreRows.map((row) => row.route), ...platformRows.map((row) => row.route)]);
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const file of routeFiles(ROUTES_ROOT)) {
      const source = readFileSync(file, "utf8");
      const dir = path.relative(ROUTES_ROOT, path.dirname(file)).split(path.sep).join("/");
      for (const match of source.matchAll(METHOD_PATTERN)) {
        const key = `${match[1]} ${dir}`;
        seen.add(key);
        if (covered.has(key) || ALLOWLIST[key] !== undefined) continue;
        // Unimplemented seams (owned by later tasks) answer NOT_IMPLEMENTED and serve no tenant data.
        if (source.includes("notImplemented(")) continue;
        missing.push(key);
      }
    }
    expect(missing).toEqual([]);
    const stale = [...covered, ...Object.keys(ALLOWLIST)].filter((key) => !seen.has(key));
    expect(stale).toEqual([]);
  });
});
