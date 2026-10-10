import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { AppError } from "@agrorende/contracts/errors";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { setAuthConfigForTests } from "../../auth/config";
import { memoryRateLimiter, setRateLimiter } from "../../auth/rateLimit";
import { signAccess } from "../../auth/tokens";
import { findRepoRoot } from "../../storage/init";
import { tenancyApi, type TenancyRouteKey } from "./api";
import { DAY_MS, setTenancyConfigForTests } from "./config";
import { statusPatch } from "./lifecycle";
import { purgeOrganization, runOrgPurge } from "./purge";
import { acceptTerms, applyStatusChange, assertOrgWritable, cancelOrganization, gettingStarted, getSubscription, redeemSignupLoginCode, runLifecycle } from "./service";
import { issueSignupTicket, pkceChallenge, type SignupIdentity } from "./signupTicket";
import { normalizeCnpj } from "./taxId";
import { createTenancyDb, SEED, seedCtx, type TenancyTestDb } from "./testing";
import { readUsage, runUsageDaily, usageMonth } from "./usage";

const BASE = "http://localhost:3000";
const MEDIA_ROOT = path.join(findRepoRoot(), ".data", "media-t20", "service-test");
const noDispatch = async () => undefined;

let db: TenancyTestDb;
let subjectSeq = 0;

function identity(overrides: Partial<SignupIdentity> = {}): SignupIdentity {
  subjectSeq += 1;
  return { provider: "GOOGLE", subject: `google-sub-${subjectSeq}-${Date.now()}`, email: `owner${subjectSeq}-${Date.now()}@example.com`, emailVerified: true, isPrivateRelay: false, name: "Owner", ...overrides };
}

function form(ticket: string, overrides: Record<string, unknown> = {}) {
  return {
    ticket,
    name: "Locadora Teste",
    officePhone: "+5516999990000",
    taxId: "11.222.333/0001-81",
    city: "Ribeirão Preto",
    state: "SP",
    timezone: "America/Sao_Paulo",
    locale: "pt-BR",
    expectedFieldUsers: "6-20",
    acceptTerms: true,
    ...overrides,
  };
}

async function call(key: TenancyRouteKey, options: { body?: unknown; token?: string; ip?: string; params?: Record<string, string>; origin?: string | null } = {}) {
  const [method = "GET", pattern = "/"] = key.split(" ");
  const pathname = pattern.replace(/:(\w+)/g, (_, name: string) => options.params?.[name] ?? "");
  const headers = new Headers({ "x-forwarded-for": options.ip ?? "10.0.0.1" });
  if (options.origin !== null) headers.set("origin", options.origin ?? BASE);
  if (options.token !== undefined) headers.set("authorization", `Bearer ${options.token}`);
  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  return tenancyApi[key](new Request(new URL(`/api/v1${pathname}`, BASE), { method, headers, body }), options.params ?? {});
}

async function tokenFor(userId: string): Promise<string> {
  const user = await db.raw("users").findOne({ _id: userId });
  if (user === null) throw new Error("user missing");
  return (await signAccess(user as never, null)).token;
}

beforeAll(async () => {
  setAuthConfigForTests({ jwtSecret: "t20-service-test-secret-0123456789abcdef", redisUrl: null, appUrl: BASE });
  setTenancyConfigForTests({ trialDays: 30, termsVersion: "2026-10-08", supportWhatsApp: "+5516999990001", platformAdminEmails: ["staff@agrorende.dev"] });
  db = await createTenancyDb("service");
}, 60_000);

beforeEach(() => {
  setRateLimiter(memoryRateLimiter());
});

afterAll(async () => {
  setAuthConfigForTests(null);
  setTenancyConfigForTests(null);
  await db?.close();
});

describe("CNPJ", () => {
  it("accepts a valid CNPJ in any punctuation and rejects bad check digits", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeCnpj("11222333000182")).toBeNull();
    expect(normalizeCnpj("00000000000000")).toBeNull();
  });
});

describe("POST /signup/organization", () => {
  it("creates the organisation, defaults and ADMIN atomically and signs the web user in", async () => {
    const id = identity();
    const { ticket } = await issueSignupTicket(id);
    const response = await call("POST /signup/organization", { body: form(ticket) });
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("ar_access=");
    const body = (await response.json()) as { org: { id: string }; user: { id: string; role: string }; redirectTo: string };
    expect(body.redirectTo).toBe("/ops");
    expect(body.user.role).toBe("ADMIN");
    const orgId = body.org.id;
    const org = await db.raw("organizations").findOne({ _id: orgId });
    expect(org).toMatchObject({ status: "TRIAL", taxId: "11222333000181", termsVersion: "2026-10-08", signupSource: "web", expectedFieldUsers: "6-20" });
    expect((org?.trialEndsAt as Date).getTime() - (org?.createdAt as Date).getTime()).toBe(30 * DAY_MS);
    expect(await db.raw("sync_counters").findOne({ _id: orgId })).not.toBeNull();
    expect(await db.raw("number_sequences").countDocuments({ organizationId: orgId })).toBe(5);
    expect(await db.raw("checklist_templates").countDocuments({ organizationId: orgId })).toBe(2);
    expect(await db.raw("user_identities").countDocuments({ organizationId: orgId, provider: "GOOGLE", subject: id.subject })).toBe(1);
    expect(await db.raw("users").countDocuments({ organizationId: orgId, role: "ADMIN" })).toBe(1);
  });

  it("rejects ticket reuse with ACCOUNT_IN_OTHER_ORG and leaves no second organisation", async () => {
    const { ticket } = await issueSignupTicket(identity());
    expect((await call("POST /signup/organization", { body: form(ticket, { name: "Reuso Um" }) })).status).toBe(201);
    const again = await call("POST /signup/organization", { body: form(ticket, { name: "Reuso Dois" }) });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe("ACCOUNT_IN_OTHER_ORG");
    expect(await db.raw("organizations").countDocuments({ name: "Reuso Dois" })).toBe(0);
  });

  it("rejects an expired ticket", async () => {
    const { ticket } = await issueSignupTicket(identity(), { now: new Date(Date.now() - 16 * 60 * 1000) });
    const response = await call("POST /signup/organization", { body: form(ticket) });
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("OAUTH_STATE_EXPIRED");
  });

  it("validates phone, CNPJ, timezone and terms with field errors", async () => {
    const { ticket } = await issueSignupTicket(identity());
    const response = await call("POST /signup/organization", { body: form(ticket, { officePhone: "16 9999", taxId: "11222333000182", timezone: "Mars/Base", acceptTerms: false }) });
    expect(response.status).toBe(422);
    const { error: body } = (await response.json()) as { error: { code: string; fieldErrors: { path: string; code: string }[] } };
    expect(body.code).toBe("VALIDATION_FAILED");
    const paths = Object.fromEntries(body.fieldErrors.map((error) => [error.path, error.code]));
    expect(paths.taxId).toBe("cnpj_invalid");
    expect(paths.timezone).toBe("timezone_invalid");
    expect(paths.officePhone).toBeDefined();
    expect(paths.acceptTerms).toBeDefined();
  });

  it("rate-limits by IP (5 per day)", async () => {
    for (let index = 0; index < 5; index += 1) {
      await call("POST /signup/organization", { body: form("x".repeat(20)), ip: "10.9.9.9" });
    }
    const sixth = await call("POST /signup/organization", { body: form("x".repeat(20)), ip: "10.9.9.9" });
    expect(sixth.status).toBe(429);
  });

  it("rejects requests from another origin (CSRF)", async () => {
    const { ticket } = await issueSignupTicket(identity());
    const response = await call("POST /signup/organization", { body: form(ticket), origin: "https://evil.example" });
    expect(response.status).toBe(403);
  });

  it("returns the app deep link with a one-time login code bound to the PKCE verifier", async () => {
    const verifier = "v".repeat(64);
    const { ticket } = await issueSignupTicket(identity({ provider: "APPLE", email: null, emailVerified: false, isPrivateRelay: true }), {
      client: "app",
      appRedirectUri: "agrorende://auth/callback",
      codeChallenge: pkceChallenge(verifier),
    });
    const response = await call("POST /signup/organization", { body: form(ticket, { name: "Locadora App" }) });
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBeNull();
    const body = (await response.json()) as { redirectTo: string };
    expect(body.redirectTo.startsWith("agrorende://auth/callback?code=")).toBe(true);
    const code = decodeURIComponent(body.redirectTo.split("code=")[1] ?? "");
    await expect(redeemSignupLoginCode(code, "w".repeat(64))).rejects.toMatchObject({ code: "OAUTH_STATE_EXPIRED" });
    const redeemed = await redeemSignupLoginCode(code, verifier);
    expect(redeemed.user.role).toBe("ADMIN");
    expect(redeemed.organization.signupSource).toBe("app");
    await expect(redeemSignupLoginCode(code, verifier)).rejects.toMatchObject({ code: "OAUTH_STATE_EXPIRED" });
  });
});

async function newTrialOrg(name: string): Promise<{ orgId: string; adminId: string }> {
  const { ticket } = await issueSignupTicket(identity());
  const response = await call("POST /signup/organization", { body: form(ticket, { name }), ip: `10.1.${subjectSeq}.1` });
  const body = (await response.json()) as { org: { id: string }; user: { id: string } };
  return { orgId: body.org.id, adminId: body.user.id };
}

describe("lifecycle", () => {
  it("moves TRIAL → PAST_DUE after trialEndsAt and PAST_DUE → SUSPENDED after 14 days, emitting org:status", async () => {
    const { orgId } = await newTrialOrg("Ciclo de Vida");
    const created = await db.raw("organizations").findOne({ _id: orgId });
    const trialEnd = created?.trialEndsAt as Date;
    await runLifecycle(new Date(trialEnd.getTime() - 1000), { dispatch: noDispatch });
    expect((await db.raw("organizations").findOne({ _id: orgId }))?.status).toBe("TRIAL");
    const day31 = new Date(trialEnd.getTime() + 1000);
    const first = await runLifecycle(day31, { dispatch: noDispatch });
    expect(first.changed).toContainEqual({ organizationId: orgId, from: "TRIAL", to: "PAST_DUE" });
    expect((await db.raw("organizations").findOne({ _id: orgId }))?.status).toBe("PAST_DUE");
    await runLifecycle(new Date(day31.getTime() + 13 * DAY_MS), { dispatch: noDispatch });
    expect((await db.raw("organizations").findOne({ _id: orgId }))?.status).toBe("PAST_DUE");
    await runLifecycle(new Date(day31.getTime() + 14 * DAY_MS), { dispatch: noDispatch });
    const suspended = await db.raw("organizations").findOne({ _id: orgId });
    expect(suspended?.status).toBe("SUSPENDED");
    expect(suspended?.suspendedAt).toBeInstanceOf(Date);
    const events = await db.raw("event_outbox").find({ organizationId: orgId, type: "org:status" }).toArray();
    expect(events.map((event) => (event.payload as { data: { status: string } }).data.status)).toEqual(["PAST_DUE", "SUSPENDED"]);
    expect((events[0]?.payload as { rooms: string[] }).rooms).toEqual([`org:${orgId}`]);
  });

  it("makes SUSPENDED organisations read-only (EC-OPS-29) and reactivation writes sync:poke", async () => {
    const { assertOrganizationWritable } = await import("../../tenancy/index");
    const { orgId, adminId } = await newTrialOrg("Reativar");
    const ctx = seedCtx(adminId, "ADMIN", orgId);
    await expect(assertOrganizationWritable(ctx)).resolves.toBeUndefined();
    const now = new Date();
    await applyStatusChange(orgId, { status: "SUSPENDED", suspendedAt: now }, { now, dispatch: noDispatch });
    const error = await assertOrgWritable(orgId).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("ORG_SUSPENDED");
    expect((error as AppError).details).toMatchObject({ status: "SUSPENDED", supportWhatsApp: "+5516999990001" });
    const seamError = await assertOrganizationWritable(ctx).catch((caught: unknown) => caught);
    expect((seamError as AppError).code).toBe("ORG_SUSPENDED");
    await applyStatusChange(orgId, { status: "ACTIVE", suspendedAt: null }, { now, dispatch: noDispatch });
    await expect(assertOrgWritable(orgId)).resolves.toBeUndefined();
    await expect(assertOrganizationWritable(ctx)).resolves.toBeUndefined();
    const pokes = await db.raw("event_outbox").find({ organizationId: orgId, type: "sync:poke" }).toArray();
    expect(pokes).toHaveLength(1);
    expect((pokes[0]?.payload as { data: unknown }).data).toEqual({ reason: "org_reactivated" });
  });

  it("feeds the field push gate: grace after suspension, then RETRY hourly (T02 orgPushBackoff)", async () => {
    const { orgPushBackoff, ORG_SUSPENDED_RETRY_AFTER_MS } = await import("../../sync/push");
    const { orgId, adminId } = await newTrialOrg("Gate de Push");
    const now = new Date();
    await applyStatusChange(orgId, statusPatch("SUSPENDED", now), { now, dispatch: noDispatch });
    const ctx = seedCtx(adminId, "ADMIN", orgId);
    expect(await orgPushBackoff(ctx, new Date(now.getTime() + DAY_MS))).toBeNull();
    expect(await orgPushBackoff(ctx, new Date(now.getTime() + 8 * DAY_MS))).toBe(ORG_SUSPENDED_RETRY_AFTER_MS);
  });
});

describe("subscription, cancel and terms", () => {
  it("is ADMIN only and shows the caller's own org with usage and getting-started", async () => {
    expect((await call("GET /org/subscription", { token: await tokenFor(SEED.manager) })).status).toBe(403);
    const response = await call("GET /org/subscription", { token: await tokenFor(SEED.admin) });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { organizationId: string; status: string; gettingStarted: { steps: { id: string; completed: boolean }[] } };
    expect(body.organizationId).toBe(SEED.orgA);
    expect(body.status).toBe("ACTIVE");
    expect(body.gettingStarted.steps.find((step) => step.id === "assets")?.completed).toBe(true);
  });

  it("computes the getting-started checklist for a new company", async () => {
    const { orgId } = await newTrialOrg("Primeiros Passos");
    const started = await gettingStarted(orgId);
    expect(started.steps).toEqual([
      { id: "assets", completed: false },
      { id: "team", completed: false },
      { id: "qr", completed: false },
      { id: "app", completed: false },
    ]);
    expect(started.completed).toBe(false);
  });

  it("cancels only when the typed name matches, keeping data 90 days for export", async () => {
    const { orgId, adminId } = await newTrialOrg("Fazenda Cancelável");
    const ctx = seedCtx(adminId, "ADMIN", orgId);
    await expect(cancelOrganization(ctx, { confirmName: "Outra Fazenda" }, { dispatch: noDispatch })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const now = new Date();
    const result = await cancelOrganization(ctx, { confirmName: "  fazenda   cancelável " }, { now, dispatch: noDispatch });
    expect(result.status).toBe("CANCELLED");
    expect(result.readOnly).toBe(true);
    expect(new Date(result.exportDeadline ?? 0).getTime()).toBe(now.getTime() + 90 * DAY_MS);
    expect(await db.raw("platform_audit_events").countDocuments({ organizationId: orgId, action: "org.status.change" })).toBe(1);
    await expect(cancelOrganization(seedCtx(SEED.manager, "MANAGER"), { confirmName: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires re-acceptance when TERMS_VERSION changes", async () => {
    const { orgId, adminId } = await newTrialOrg("Termos Novos");
    const ctx = seedCtx(adminId, "ADMIN", orgId);
    setTenancyConfigForTests({ trialDays: 30, termsVersion: "2027-01-01", supportWhatsApp: "+5516999990001", platformAdminEmails: ["staff@agrorende.dev"] });
    try {
      expect((await getSubscription(ctx)).terms.needsAcceptance).toBe(true);
      await expect(acceptTerms(ctx, { version: "2026-10-08" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      const accepted = await acceptTerms(ctx, { version: "2027-01-01" });
      expect(accepted.terms).toMatchObject({ needsAcceptance: false, acceptedVersion: "2027-01-01" });
    } finally {
      setTenancyConfigForTests({ trialDays: 30, termsVersion: "2026-10-08", supportWhatsApp: "+5516999990001", platformAdminEmails: ["staff@agrorende.dev"] });
    }
  });
});

describe("usage", () => {
  it("records idempotent monthly rows per organisation and never returns another org's usage", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    await runUsageDaily(now);
    await runUsageDaily(now);
    const month = usageMonth(now, "America/Sao_Paulo");
    expect(await db.raw("org_usage").countDocuments({ organizationId: SEED.orgA, month })).toBe(1);
    const usageA = await readUsage(SEED.orgA);
    const usageB = await readUsage(SEED.orgB);
    expect(usageA[0]?.assetCount).toBeGreaterThan(usageB[0]?.assetCount ?? 0);
    expect(usageA[0]?.officeUsers).toBeGreaterThan(0);
    const orgBToken = await tokenFor(SEED.orgBUser);
    const response = await call("GET /org/subscription", { token: orgBToken });
    const body = (await response.json()) as { organizationId: string; usage: { assetCount: number }[] };
    expect(body.organizationId).toBe(SEED.orgB);
    expect(body.usage[0]?.assetCount).toBe(usageB[0]?.assetCount);
  });
});

describe("purge", () => {
  it("purges only CANCELLED organisations past purgeAfter, rows and media folder, and audits it", async () => {
    const { orgId } = await newTrialOrg("Purga");
    const now = new Date();
    await applyStatusChange(orgId, { status: "CANCELLED", cancelledAt: now, purgeAfter: new Date(now.getTime() + 90 * DAY_MS) }, { now, dispatch: noDispatch });
    const mediaDir = path.join(MEDIA_ROOT, "org", orgId, "media", "2026", "10");
    const otherDir = path.join(MEDIA_ROOT, "org", SEED.orgA, "media", "2026", "10");
    await mkdir(mediaDir, { recursive: true });
    await mkdir(otherDir, { recursive: true });
    await writeFile(path.join(mediaDir, "a.jpg"), "x");
    await writeFile(path.join(otherDir, "keep.jpg"), "x");
    expect(await runOrgPurge({ mediaRoot: MEDIA_ROOT, now: new Date(now.getTime() + 89 * DAY_MS) })).toHaveLength(0);
    const results = await runOrgPurge({ mediaRoot: MEDIA_ROOT, now: new Date(now.getTime() + 91 * DAY_MS) });
    expect(results.map((result) => result.organizationId)).toContain(orgId);
    expect(await db.raw("organizations").findOne({ _id: orgId })).toBeNull();
    expect(await db.raw("users").countDocuments({ organizationId: orgId })).toBe(0);
    expect(await db.raw("checklist_templates").countDocuments({ organizationId: orgId })).toBe(0);
    expect(await db.raw("sync_counters").findOne({ _id: orgId })).toBeNull();
    expect(await readdir(path.join(MEDIA_ROOT, "org"))).not.toContain(orgId);
    expect(await readdir(otherDir)).toContain("keep.jpg");
    expect(await db.raw("organizations").findOne({ _id: SEED.orgA })).not.toBeNull();
    expect(await db.raw("platform_audit_events").countDocuments({ organizationId: orgId, action: "org.purge" })).toBe(1);
  });

  it("refuses a media root escape", async () => {
    await expect(purgeOrganization("../../etc", { mediaRoot: MEDIA_ROOT, now: new Date() })).rejects.toThrow();
  });
});
