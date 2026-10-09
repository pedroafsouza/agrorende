/**
 * T10.3 / T10.14 — the PRD §8 golden path, end to end, against the seeded replica set, Redis and
 * the navikt mock OAuth2 server.
 *
 * Every write goes through the code the apps call: field mutations through `sync/push`, office
 * actions through the REST service functions inside `withSyncTx` (what web `write()` does), and
 * authentication through the platform and tenancy route handlers. Nothing is written directly to
 * the database apart from the demo seed. After each step the undispatched `event_outbox` rows are
 * dispatched (as the worker's `events.dispatch` does) and the messages published on
 * `agrorende:events:<db>` are asserted, together with each user's incremental pull.
 *
 * The clock: OAuth runs on the real clock (the mock provider signs ID tokens with real time).
 * Afterwards `Date` is faked and moved to each step's time, so envelopes, services and derived
 * times are deterministic.
 */
import { rm } from "node:fs/promises";
import path from "node:path";

import type { CheckInInspection, CheckOutInspection, DamageInput } from "@agrorende/contracts/mutations";
import { opsRoom, realtimeRedisChannel, userRoom, type RedisRealtimeMessage } from "@agrorende/contracts/realtime";
import type { MediaMeta, TableName } from "@agrorende/contracts/sync";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { platformApi } from "../auth/api/index.js";
import { setAuthConfigForTests } from "../auth/config.js";
import { memoryRateLimiter, setRateLimiter } from "../auth/rateLimit.js";
import { setOAuthConfigForTests } from "../auth/oidc.js";
import { mockProviderLogin, type MockCallback } from "../auth/testing/mockOidc.js";
import { createNamedSeededDb, seedCtx, seedUuid, type SeededDb } from "../auth/testing/seeded.js";
import type { Ctx } from "../context.js";
import { dispatchClaimKey, dispatchPending } from "../events/index.js";
import { closeJobQueues, jobQueuePrefix } from "../jobs/index.js";
import { newId } from "../modules/assets/kit.js";
import { costRollup } from "../modules/costs/service.js";
import { markForRepair } from "../modules/fieldReports/service.js";
import { closeLocationsRedis } from "../modules/locations/redis.js";
import { completeUpload, issueUploadUrl, putBlob } from "../modules/media/upload.js";
import { closeRental, createDamageWorkOrder, createRental, reserveRental } from "../modules/rentals/service.js";
import { checkInInspection, checkOutInspection, mediaMeta } from "../modules/rentals/testing/harness.js";
import { tenancyApi } from "../modules/tenancy/api.js";
import { setTenancyConfigForTests } from "../modules/tenancy/config.js";
import { gettingStarted } from "../modules/tenancy/service.js";
import { verify } from "../modules/workOrders/service.js";
import { suggestTechnicians } from "../modules/workOrders/suggest.js";
import { localMediaStore, setMediaStore } from "../storage/index.js";
import { findRepoRoot } from "../storage/init.js";
import { pull } from "../sync/pull.js";
import { push } from "../sync/push.js";
import type { SyncTx } from "../sync/types.js";
import { withSyncTx } from "../sync/withSyncTx.js";

const DB = "agrorende_t10";
const BASE = "http://localhost:3000";
const GOOGLE_ISSUER = "http://localhost:4003/google";
const MEDIA_ROOT = path.join(findRepoRoot(), process.env.MEDIA_ROOT ?? ".data/media-t10");
process.env.REDIS_URL ??= "redis://localhost:6379";

const ORG_A = seedUuid(1);
const USERS = {
  admin: seedUuid(100),
  paulo: seedUuid(101),
  marina: seedUuid(102),
  joana: seedUuid(103),
  carlos: seedUuid(104),
  rafael: seedUuid(107),
} as const;
const ASSET_12 = seedUuid(411);
const SANTA_CLARA = seedUuid(203);
const BOA_VISTA = seedUuid(300);
const SAFRA = seedUuid(700);
const RENTAL_TEMPLATE = seedUuid(600);
const KNOWN_SCRATCHES = [seedUuid(900), seedUuid(901)] as const;

const marina = seedCtx(USERS.marina, "MANAGER");
const joana = seedCtx(USERS.joana, "FIELD");
const carlos = seedCtx(USERS.carlos, "FIELD");
const rafael = seedCtx(USERS.rafael, "FIELD");

const DEVICES: Record<string, string> = {
  [USERS.marina]: "018fd000-0000-7000-8000-00000000e102",
  [USERS.joana]: "018fd000-0000-7000-8000-00000000e103",
  [USERS.carlos]: "018fd000-0000-7000-8000-00000000e104",
  [USERS.rafael]: "018fd000-0000-7000-8000-00000000e107",
};

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
const MP4 = Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d]);
const M4A = Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 0x00, 0x00, 0x02, 0x00, 0x4d, 0x34, 0x41, 0x20]);

type Row = Record<string, unknown>;
type Changes = Partial<Record<TableName, Row[]>>;

let seeded: SeededDb;
let subscriber: Redis;
let admin: Redis;
let notificationsQueue: Queue;
const received: RedisRealtimeMessage[] = [];
const cursors = new Map<string, string>();

// ───────── Helpers ─────────

function at(iso: string): Date {
  const date = new Date(iso);
  vi.setSystemTime(date);
  return date;
}

/** The faked clock keeps ticking (`shouldAdvanceTime`), so stamped times land a few milliseconds after the step time. */
function expectNear(value: unknown, iso: string, toleranceMs = 30_000): void {
  expect(value).toBeInstanceOf(Date);
  expect(Math.abs((value as Date).getTime() - new Date(iso).getTime())).toBeLessThan(toleranceMs);
}

function run<T>(ctx: Ctx, fn: (tx: SyncTx) => Promise<T>): Promise<T> {
  return withSyncTx(ctx, fn);
}

interface Mutation {
  readonly name: string;
  readonly payload: unknown;
  /** When the device recorded the action; defaults to now (the faked clock). */
  readonly occurredAt?: Date;
}

/** One push request, as the device sends it; every mutation must be APPLIED. */
async function pushAll(ctx: Ctx, mutations: readonly Mutation[]): Promise<void> {
  const response = await push(ctx, {
    deviceId: DEVICES[ctx.userId] ?? newId(),
    clientTime: new Date().toISOString(),
    deviceStatus: { appVersion: "1.0.0", runtimeVersion: "1", pendingMutations: mutations.length, pendingUploads: 0, pendingBytes: 0, scopeEpoch: 0 },
    mutations: mutations.map((mutation) => ({ id: newId(), name: mutation.name, payload: mutation.payload, occurredAt: (mutation.occurredAt ?? new Date()).toISOString() })),
  });
  const names = mutations.map((mutation) => mutation.name).join(", ");
  expect(response.results, `${names} → ${JSON.stringify(response.results)}`).toEqual(mutations.map(() => expect.objectContaining({ status: "APPLIED" })));
}

function pushOne(ctx: Ctx, name: string, payload: unknown, occurredAt?: Date): Promise<void> {
  return pushAll(ctx, [{ name, payload, ...(occurredAt === undefined ? {} : { occurredAt }) }]);
}

/** Incremental pull from the user's last cursor, following `hasMore` to the end. */
async function pullDelta(ctx: Ctx): Promise<Changes> {
  const changes: Changes = {};
  let cursor = cursors.get(ctx.userId);
  for (let guard = 0; guard < 50; guard += 1) {
    const page = await pull(ctx, { deviceId: DEVICES[ctx.userId], scopeEpoch: 0, ...(cursor === undefined ? {} : { cursor }) });
    for (const [table, rows] of Object.entries(page.changes) as [TableName, Row[]][]) {
      changes[table] = [...(changes[table] ?? []), ...rows];
    }
    expect(page.resetRequired ?? false).toBe(false);
    cursor = page.cursor;
    if (!page.hasMore) {
      cursors.set(ctx.userId, cursor);
      return changes;
    }
  }
  throw new Error("pull did not converge");
}

function rowOf(changes: Changes, table: TableName, id: string): Row | undefined {
  return changes[table]?.find((item) => item.id === id);
}

function pulled(changes: Changes, table: TableName, id: string): Row {
  const found = rowOf(changes, table, id);
  expect(found, `${table}/${id} in pull`).toBeDefined();
  return found as Row;
}

async function settle(): Promise<void> {
  await admin.ping();
  await new Promise((resolve) => setTimeout(resolve, 200));
}

/** Dispatches every undispatched outbox row (what `events.dispatch` does) and returns what was published. */
async function publishedEvents(): Promise<RedisRealtimeMessage[]> {
  const rows = await seeded.raw("event_outbox").find({ dispatchedAt: null }, { projection: { _id: 1 } }).toArray();
  const before = received.length;
  const result = await dispatchPending(rows.map((row) => String(row._id)));
  expect(result.failed).toBe(0);
  await settle();
  return received.slice(before);
}

function data(message: RedisRealtimeMessage): Row {
  return (message.payload ?? {}) as Row;
}

function notificationsOf(events: readonly RedisRealtimeMessage[], type: string): RedisRealtimeMessage[] {
  return events.filter((event) => event.event === "notification:new" && data(event).type === type);
}

function entityChanges(events: readonly RedisRealtimeMessage[], entityType: string, id: string): RedisRealtimeMessage[] {
  return events.filter((event) => event.event === "entity:changed" && data(event).entityType === entityType && data(event).id === id);
}

async function row(collectionName: string, id: string): Promise<Row> {
  const doc = await seeded.raw(collectionName).findOne({ _id: id });
  expect(doc, `${collectionName}/${id}`).not.toBeNull();
  return doc as Row;
}

/** The single-mode REST upload: `POST /media/:id/upload-url` → `PUT` blob → `POST /media/:id/complete`. */
async function upload(ctx: Ctx, media: MediaMeta, bytes: Uint8Array): Promise<void> {
  const instructions = await issueUploadUrl(ctx, media.id, { sizeBytes: bytes.length, mimeType: media.mimeType });
  if (instructions.mode !== "single" || instructions.url === undefined) throw new Error("expected a single upload");
  const url = new URL(instructions.url);
  await putBlob(media.id, url.searchParams.get("variant"), url.searchParams.get("t"), bytes);
  const done = await completeUpload(ctx, media.id, {});
  expect(done.media.status).toBe("UPLOADED");
}

function woMedia(workOrderId: string, kind: "PHOTO" | "SIGNATURE", tag: string): MediaMeta {
  return {
    id: newId(),
    kind,
    tag,
    mimeType: kind === "SIGNATURE" ? "image/png" : "image/jpeg",
    sizeBytes: JPEG.length,
    capturedAt: new Date().toISOString(),
    parent: { type: "WORK_ORDER", id: workOrderId },
  };
}

/** Answers every item of the work order snapshot with PASS (photo items get the given photo). */
async function checklistResponses(workOrderId: string, photoId: string): Promise<{ templateVersion: number; responses: Row[] }> {
  const wo = await row("work_orders", workOrderId);
  const snapshot = (wo.checklistSnapshot ?? []) as { key: string; photo?: string }[];
  return {
    templateVersion: Number(wo.checklistTemplateVersion ?? 1),
    responses: snapshot.map((item) => ({ key: item.key, value: "PASS", mediaIds: item.photo === "ALWAYS" ? [photoId] : [], answeredAt: new Date().toISOString() })),
  };
}

// ───────── OAuth helpers (mock Google) ─────────

function setCookies(response: Response): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const header of response.headers.getSetCookie()) {
    const [pair = ""] = header.split(";");
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), decodeURIComponent(pair.slice(index + 1)));
  }
  return cookies;
}

async function oauthStart(query: Record<string, string>): Promise<{ authorizeUrl: string; cookie: string }> {
  const url = new URL("/api/v1/auth/oauth/google/start", BASE);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await platformApi["GET /auth/oauth/:provider/start"](new Request(url, { headers: { "x-forwarded-for": "10.10.0.1" } }), { provider: "google" });
  expect(response.status).toBe(303);
  const cookie = setCookies(response).get("ar_oauth_google");
  const location = response.headers.get("location");
  if (location === null || cookie === undefined) throw new Error("OAuth start did not redirect");
  return { authorizeUrl: location, cookie };
}

async function oauthCallback(result: MockCallback, cookie: string): Promise<Response> {
  expect(result.method).toBe("GET");
  const headers = new Headers({ "x-forwarded-for": "10.10.0.1", cookie: `ar_oauth_google=${encodeURIComponent(cookie)}` });
  return platformApi["GET /auth/oauth/google/callback"](new Request(result.url, { headers }), {});
}

function jsonRequest(pathname: string, body: unknown, cookies: Map<string, string>): Request {
  const cookie = [...cookies.entries()].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
  return new Request(new URL(`/api/v1${pathname}`, BASE), {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json", "x-forwarded-for": "10.10.0.1", ...(cookie.length > 0 ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

// ───────── Setup ─────────

beforeAll(async () => {
  setAuthConfigForTests({ jwtSecret: "t10-golden-test-secret-0123456789abcdef0123", mediaUrlSecret: "t10-golden-media-secret-0123456789abcdef", redisUrl: null, appUrl: BASE });
  setTenancyConfigForTests({ trialDays: 30, termsVersion: "2026-10-08", supportWhatsApp: null, platformAdminEmails: [] });
  setOAuthConfigForTests({
    google: { issuer: GOOGLE_ISSUER, clientId: "agrorende-local", clientSecret: "agrorende-local-secret" },
    apple: {
      issuer: "http://localhost:4003/apple",
      servicesId: "app.agrorende.signin",
      clientId: "app.agrorende.signin",
      bundleIds: ["app.agrorende"],
      teamId: "",
      keyId: "",
      privateKey: "",
    },
    encryptionKey: "a".repeat(64),
    mobileSchemes: ["agrorende", "agrorende-dev", "agrorende-preview"],
  });
  setRateLimiter(memoryRateLimiter());
  seeded = await createNamedSeededDb(DB);
  setMediaStore(localMediaStore({ root: MEDIA_ROOT }));

  admin = new Redis(process.env.REDIS_URL ?? "", { maxRetriesPerRequest: null });
  subscriber = new Redis(process.env.REDIS_URL ?? "");
  const channel = realtimeRedisChannel(DB);
  subscriber.on("message", (from: string, message: string) => {
    if (from === channel) received.push(JSON.parse(message) as RedisRealtimeMessage);
  });
  await subscriber.subscribe(channel);
  notificationsQueue = new Queue("notifications", { connection: admin, prefix: jobQueuePrefix(DB) });
  await notificationsQueue.obliterate({ force: true });
}, 120_000);

afterAll(async () => {
  vi.useRealTimers();
  await notificationsQueue?.obliterate({ force: true });
  await notificationsQueue?.close();
  if (admin !== undefined) {
    const keys = await admin.keys(`${dispatchClaimKey(DB, "")}*`);
    if (keys.length > 0) await admin.del(...keys);
  }
  await subscriber?.quit();
  await admin?.quit();
  await closeJobQueues();
  await closeLocationsRedis();
  setMediaStore(null);
  setRateLimiter(null);
  setOAuthConfigForTests(null);
  setTenancyConfigForTests(null);
  setAuthConfigForTests(null);
  await rm(MEDIA_ROOT, { recursive: true, force: true });
  await seeded?.close();
}, 60_000);

// ───────── The story ─────────

describe("PRD §8 golden path", () => {
  const story = {
    reportId: newId(),
    reportMedia: [] as MediaMeta[],
    workOrderId: "",
    rentalId: newId(),
    dentId: newId(),
    dentReportId: "",
    damageWorkOrderId: "",
  };

  it("0. a new company signs up with Google, sees the getting-started checklist and redeems an invite", async () => {
    const owner = { sub: `golden-owner-${Date.now()}`, email: `golden-owner-${Date.now()}@example.com` };
    const signup = await oauthStart({ intent: "signup" });
    const ownerLogin = await mockProviderLogin(signup.authorizeUrl, { sub: owner.sub, email: owner.email, name: "Dona da Locadora Dourada" });
    const ticketRedirect = new URL((await oauthCallback(ownerLogin, signup.cookie)).headers.get("location") ?? "");
    expect(ticketRedirect.pathname).toBe("/signup/company");
    const ticket = ticketRedirect.searchParams.get("ticket") ?? "";
    expect(ticket).not.toBe("");

    const created = await tenancyApi["POST /signup/organization"](
      jsonRequest("/signup/organization", {
        ticket,
        name: "Locadora Dourada",
        officePhone: "+5516999990101",
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
        expectedFieldUsers: "1-5",
        acceptTerms: true,
      }, new Map()),
      {},
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { user: { id: string; role: string; email: string }; org: { id: string }; redirectTo: string };
    expect(body).toMatchObject({ user: { role: "ADMIN", email: owner.email }, redirectTo: "/ops" });
    const newOrgId = body.org.id;
    const organization = await row("organizations", newOrgId);
    expect(organization).toMatchObject({ status: "TRIAL" });
    const session = setCookies(created);
    expect(session.has("ar_access")).toBe(true);

    const checklist = await gettingStarted(newOrgId);
    expect(checklist).toEqual({
      steps: [
        { id: "assets", completed: false },
        { id: "team", completed: false },
        { id: "qr", completed: false },
        { id: "app", completed: false },
      ],
      completed: false,
      dismissedAt: null,
    });

    // The new ADMIN invites a field user (`POST /users` creates the user and the invite link).
    const inviteeEmail = `golden-tech-${Date.now()}@example.com`;
    const invited = await platformApi["POST /users"](jsonRequest("/users", { name: "Técnico Dourado", email: inviteeEmail, role: "FIELD", skills: ["HYDRAULIC"] }, session), {});
    expect(invited.status).toBe(201);
    const { user: inviteeUser, invite } = (await invited.json()) as { user: { id: string }; invite: { code: string } };
    expect(invite.code).toMatch(/^[A-Z0-9]{10}$/u);
    expect((await gettingStarted(newOrgId)).steps.find((step) => step.id === "team")?.completed).toBe(true);

    // The invitee signs in with Google through the invite intent and ends up bound to the invited user.
    const inviteeSub = `golden-tech-${Date.now()}`;
    const inviteStart = await oauthStart({ intent: "invite", inviteCode: invite.code });
    const inviteeLogin = await mockProviderLogin(inviteStart.authorizeUrl, { sub: inviteeSub, email: inviteeEmail, name: "Técnico Dourado" });
    const redeemed = await oauthCallback(inviteeLogin, inviteStart.cookie);
    expect(redeemed.headers.get("location")).toBe(`${BASE}/office-role-required`);
    expect(setCookies(redeemed).has("ar_access")).toBe(true);
    const identity = await seeded.raw("user_identities").findOne({ provider: "GOOGLE", subject: inviteeSub });
    expect(identity).toMatchObject({ userId: inviteeUser.id, organizationId: newOrgId });
    expect((await row("users", inviteeUser.id)).joinedAt).toBeInstanceOf(Date);

    // Nothing of the new company leaks into organisation A.
    expect(await seeded.raw("users").countDocuments({ organizationId: ORG_A, email: inviteeEmail })).toBe(0);
  }, 60_000);

  it("prepares the clock and every device's bootstrap pull", async () => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    at("2026-10-14T09:00:00.000Z");
    for (const ctx of [marina, joana, carlos, rafael]) {
      const changes = await pullDelta(ctx);
      expect(changes.assets?.length ?? 0).toBeGreaterThan(0);
    }
    await publishedEvents();
  }, 60_000);

  it("1. Joana files an offline critical report with 3 photos, a video and a voice note", async () => {
    const capturedAt = new Date("2026-10-14T10:00:00.000Z");
    const media = (kind: string, tag: string, mimeType: string, sizeBytes: number, durationMs?: number): MediaMeta => ({
      id: newId(),
      kind,
      tag,
      mimeType,
      sizeBytes,
      ...(durationMs === undefined ? {} : { durationMs }),
      capturedAt: capturedAt.toISOString(),
      lat: -21.112,
      lng: -47.712,
      parent: { type: "FIELD_REPORT", id: story.reportId },
    });
    story.reportMedia = [
      media("PHOTO", "GENERAL", "image/jpeg", JPEG.length),
      media("PHOTO", "GENERAL", "image/jpeg", JPEG.length),
      media("PHOTO", "GENERAL", "image/jpeg", JPEG.length),
      media("VIDEO", "GENERAL", "video/mp4", MP4.length, 12_000),
      media("AUDIO", "GENERAL", "audio/mp4", M4A.length, 8_000),
    ];
    // The device was offline: the report was recorded at 10:00 and synced at 12:00.
    at("2026-10-14T12:00:00.000Z");
    await pushOne(
      joana,
      "fieldReport.create",
      {
        id: story.reportId,
        assetId: ASSET_12,
        category: "HYDRAULIC",
        priority: "HIGH",
        machineOperable: false,
        suggestedAction: "REPAIR_NOW",
        title: "Vazamento na mangueira hidráulica",
        description: "Óleo escorrendo pelo braço do levante.",
        lat: -21.112,
        lng: -47.712,
        media: story.reportMedia,
      },
      capturedAt,
    );
    // Replaying the same offline queue does not create a second report.
    expect(await seeded.raw("field_reports").countDocuments({ assetId: ASSET_12, title: "Vazamento na mangueira hidráulica" })).toBe(1);

    const report = await row("field_reports", story.reportId);
    expect(report).toMatchObject({ number: "FR-000021", status: "SUBMITTED", reporterId: USERS.joana, assetId: ASSET_12, category: "HYDRAULIC", priority: "HIGH", machineOperable: false });
    expectNear(report.createdAt, "2026-10-14T12:00:00.000Z");
    const mediaRows = await seeded.raw("media").find({ "parent.type": "FIELD_REPORT", "parent.id": story.reportId }).toArray();
    expect(mediaRows).toHaveLength(5);
    expect(mediaRows.map((item) => item.kind).sort()).toEqual(["AUDIO", "PHOTO", "PHOTO", "PHOTO", "VIDEO"]);
    expect((await row("assets", ASSET_12)).condition).toBe("NEEDS_REPAIR");

    // Uploads run after the metadata, through the REST upload flow.
    const bytes: Record<string, Uint8Array> = { "image/jpeg": JPEG, "video/mp4": MP4, "audio/mp4": M4A };
    for (const item of story.reportMedia) await upload(joana, item, bytes[item.mimeType] ?? JPEG);
    expect(await seeded.raw("media").countDocuments({ "parent.id": story.reportId, status: "UPLOADED" })).toBe(5);

    const events = await publishedEvents();
    const critical = notificationsOf(events, "REPORT_CRITICAL");
    const office = await seeded.raw("users").find({ organizationId: ORG_A, role: { $in: ["ADMIN", "MANAGER"] }, isActive: true, deletedAt: null }).toArray();
    expect(critical.map((event) => event.rooms[0]).sort()).toEqual(office.map((user) => userRoom(String(user._id))).sort());
    expect(critical.every((event) => data(event).entityId === story.reportId)).toBe(true);
    expect(entityChanges(events, "FIELD_REPORT", story.reportId).some((event) => event.rooms.includes(opsRoom(ORG_A)))).toBe(true);
    expect(await seeded.raw("notifications").countDocuments({ type: "REPORT_CRITICAL", entityId: story.reportId })).toBe(office.length);
    // Dispatch enqueues the push delivery jobs for the notifications (one per REPORT_CRITICAL row).
    expect(await notificationsQueue.count()).toBeGreaterThanOrEqual(office.length);

    const joanaPull = await pullDelta(joana);
    expect(pulled(joanaPull, "fieldReports", story.reportId)).toMatchObject({ status: "SUBMITTED", number: "FR-000021" });
    for (const item of story.reportMedia) expect(pulled(joanaPull, "media", item.id)).toMatchObject({ status: "UPLOADED" });
    expect(pulled(joanaPull, "assets", ASSET_12)).toMatchObject({ condition: "NEEDS_REPAIR" });
    const marinaPull = await pullDelta(marina);
    // The mobile pull scope (§7.5) gives an office user only their own reports; the report reaches Marina as the notification.
    expect(rowOf(marinaPull, "fieldReports", story.reportId)).toBeUndefined();
    expect(pulled(marinaPull, "notifications", String((await seeded.raw("notifications").findOne({ type: "REPORT_CRITICAL", userId: USERS.marina, entityId: story.reportId }))?._id))).toMatchObject({ type: "REPORT_CRITICAL" });
  }, 60_000);

  it("2. Marina sees Carlos ranked first, marks for repair with Carlos assigned", async () => {
    at("2026-10-14T12:30:00.000Z");
    const suggestions = await run(marina, (tx) => suggestTechnicians(tx, marina, { fieldReportId: story.reportId }));
    expect(suggestions.items[0]).toMatchObject({ userId: USERS.carlos, reasons: expect.arrayContaining(["onDuty", "skillMatch"]) });

    const result = await run(marina, (tx) => markForRepair(tx, marina, story.reportId, { assigneeId: USERS.carlos }));
    story.workOrderId = result.workOrderId;
    expect(result).toMatchObject({ workOrderNumber: "WO-000016", attached: false });
    expect(await row("work_orders", story.workOrderId)).toMatchObject({
      status: "ASSIGNED",
      assigneeId: USERS.carlos,
      fieldReportId: story.reportId,
      assetId: ASSET_12,
      siteId: SANTA_CLARA,
      seasonId: SAFRA,
      priority: "HIGH",
    });
    expect(await row("field_reports", story.reportId)).toMatchObject({ status: "MARKED_FOR_REPAIR", workOrderId: story.workOrderId });

    const events = await publishedEvents();
    const assigned = notificationsOf(events, "WO_ASSIGNED");
    expect(assigned).toHaveLength(1);
    expect(assigned[0]?.rooms).toEqual([userRoom(USERS.carlos)]);
    expect(data(assigned[0] as RedisRealtimeMessage).entityId).toBe(story.workOrderId);
    expect(notificationsOf(events, "REPORT_MARKED_FOR_REPAIR").map((event) => event.rooms[0])).toEqual([userRoom(USERS.joana)]);
    expect(events.some((event) => event.event === "sync:poke" && event.rooms.includes(userRoom(USERS.carlos)))).toBe(true);

    const carlosPull = await pullDelta(carlos);
    expect(pulled(carlosPull, "workOrders", story.workOrderId)).toMatchObject({ status: "ASSIGNED", assigneeId: USERS.carlos, number: "WO-000016" });
    expect(pulled(carlosPull, "fieldReports", story.reportId)).toMatchObject({ status: "MARKED_FOR_REPAIR" });
    const joanaPull = await pullDelta(joana);
    expect(pulled(joanaPull, "fieldReports", story.reportId)).toMatchObject({ status: "MARKED_FOR_REPAIR", workOrderId: story.workOrderId });
  }, 60_000);

  it("3. Carlos runs the job: route, work, hold for parts, part, photos, checklist, signature, complete", async () => {
    const id = story.workOrderId;
    const transition = (action: string, iso: string, extra: Row = {}) => {
      at(iso);
      return pushOne(carlos, "workOrder.transition", { id, action, ...extra });
    };
    await transition("accept", "2026-10-14T13:00:00.000Z");
    await transition("startRoute", "2026-10-14T13:10:00.000Z");
    await transition("arrive", "2026-10-14T13:50:00.000Z");
    await transition("startWork", "2026-10-14T14:00:00.000Z");
    expect((await row("assets", ASSET_12)).condition).toBe("IN_REPAIR");
    at("2026-10-14T14:05:00.000Z");
    const before = woMedia(id, "PHOTO", "BEFORE");
    await pushOne(carlos, "media.register", before);
    await upload(carlos, before, JPEG);
    await transition("hold", "2026-10-14T16:00:00.000Z", { holdReason: "WAITING_PARTS", note: "Mangueira em falta" });
    expect(await row("work_orders", id)).toMatchObject({ status: "ON_HOLD", holdReason: "WAITING_PARTS" });

    await transition("resume", "2026-10-15T11:00:00.000Z");
    at("2026-10-15T11:10:00.000Z");
    const partId = newId();
    await pushOne(carlos, "workOrder.addPart", { id: partId, workOrderId: id, name: "Mangueira hidráulica 1/2\"", quantity: 1, unit: "un", unitCostCents: 18_500 });
    at("2026-10-15T12:20:00.000Z");
    const after = woMedia(id, "PHOTO", "AFTER");
    await pushOne(carlos, "media.register", after);
    at("2026-10-15T12:25:00.000Z");
    await pushOne(carlos, "workOrder.saveChecklist", { id, ...(await checklistResponses(id, after.id)) });
    at("2026-10-15T12:28:00.000Z");
    const signature = woMedia(id, "SIGNATURE", "SIGNATURE_CUSTOMER");
    await pushOne(carlos, "media.register", signature);
    at("2026-10-15T12:30:00.000Z");
    await pushOne(carlos, "workOrder.complete", {
      id,
      resolution: "Mangueira hidráulica substituída e sistema testado.",
      hourMeterReading: 4_312,
      customerSignerName: "José da Fazenda Santa Clara",
      signatureStatus: "SIGNED",
      signatureMediaId: signature.id,
      documentLocale: "pt-BR",
    });

    const wo = await row("work_orders", id);
    // Work excludes ON_HOLD: 14:00–16:00 and 11:00–12:30 = 210 minutes; travel 13:10–13:50.
    expect(wo).toMatchObject({ status: "COMPLETED", workMinutes: 210, travelMinutes: 40, laborCostCents: 29_750, partsCostCents: 18_500, hourMeterReading: 4_312, signatureStatus: "SIGNED" });
    expectNear(wo.completedAt, "2026-10-15T12:30:00.000Z");
    expect(await row("assets", ASSET_12)).toMatchObject({ condition: "OPERATIONAL", hourMeter: 4_312 });
    expect(await row("work_order_parts", partId)).toMatchObject({ workOrderId: id, unitCostCents: 18_500 });

    const events = await publishedEvents();
    expect(entityChanges(events, "WORK_ORDER", id).some((event) => data(event).status === "COMPLETED")).toBe(true);
    expect(events.filter((event) => event.event === "activity:new" && data(event).entityId === id).map((event) => data(event).toStatus)).toEqual(
      expect.arrayContaining(["ACCEPTED", "EN_ROUTE", "ON_SITE", "IN_PROGRESS", "ON_HOLD", "COMPLETED"]),
    );

    const carlosPull = await pullDelta(carlos);
    expect(pulled(carlosPull, "workOrders", id)).toMatchObject({ status: "COMPLETED", laborCostCents: 29_750 });
    expect(pulled(carlosPull, "workOrderParts", partId)).toMatchObject({ name: "Mangueira hidráulica 1/2\"" });
    expect(pulled(carlosPull, "assets", ASSET_12)).toMatchObject({ condition: "OPERATIONAL", hourMeter: 4_312 });
    const marinaPull = await pullDelta(marina);
    // A completed WO assigned to someone else is outside an office user's mobile scope (§7.5); the asset row still refreshes.
    expect(rowOf(marinaPull, "workOrders", id)).toBeUndefined();
    expect(pulled(marinaPull, "assets", ASSET_12)).toMatchObject({ condition: "OPERATIONAL", hourMeter: 4_312 });
  }, 60_000);

  it("4. Marina verifies and the cost roll-up shows labour and parts for AGR-000012", async () => {
    at("2026-10-15T14:00:00.000Z");
    await run(marina, (tx) => verify(tx, marina, story.workOrderId, {}));
    expect(await row("work_orders", story.workOrderId)).toMatchObject({ status: "VERIFIED", verifiedById: USERS.marina });
    expect(await row("field_reports", story.reportId)).toMatchObject({ status: "MARKED_FOR_REPAIR", workOrderId: story.workOrderId });

    const events = await publishedEvents();
    expect(events.some((event) => event.event === "entity:changed" && data(event).entityType === "WORK_ORDER" && data(event).id === story.workOrderId && data(event).status === "VERIFIED")).toBe(true);

    const filters = { groupBy: "asset", assetId: ASSET_12, from: "2026-10-01", to: "2026-10-31", locale: "pt-BR" } as const;
    const byAsset = await costRollup(marina, filters);
    expect(byAsset.rows).toEqual([expect.objectContaining({ key: ASSET_12, label: expect.stringContaining("AGR-000012"), laborCents: 29_750, partsCents: 18_500, totalCostCents: 48_250 })]);
    const bySite = await costRollup(marina, { ...filters, siteId: SANTA_CLARA, seasonId: SAFRA });
    expect(bySite.totals).toMatchObject({ laborCents: 29_750, partsCents: 18_500 });
    const groupedBySite = await costRollup(marina, { groupBy: "site", assetId: ASSET_12, from: "2026-10-01", to: "2026-10-31", locale: "pt-BR" });
    expect(groupedBySite.rows.filter((item) => item.totalCostCents > 0)).toEqual([expect.objectContaining({ key: SANTA_CLARA, label: expect.stringContaining("Fazenda Santa Clara"), laborCents: 29_750, partsCents: 18_500 })]);
    const groupedBySeason = await costRollup(marina, { groupBy: "season", assetId: ASSET_12, from: "2026-10-01", to: "2026-10-31", locale: "pt-BR" });
    expect(groupedBySeason.rows.filter((item) => item.totalCostCents > 0)).toEqual([expect.objectContaining({ key: SAFRA, label: "Safra 2026/27", laborCents: 29_750, partsCents: 18_500 })]);

    const carlosPull = await pullDelta(carlos);
    expect(pulled(carlosPull, "workOrders", story.workOrderId)).toMatchObject({ status: "VERIFIED", verifiedById: USERS.marina });
  }, 60_000);

  it("5. Rafael rents AGR-000012 to Fazenda Boa Vista; the V1 charges, the dent repair and the revenue follow", async () => {
    // Office creates and reserves the rental with Rafael as the field agent (createRental is office-only).
    at("2026-10-30T12:00:00.000Z");
    await run(marina, (tx) =>
      createRental(tx, marina, {
        id: story.rentalId,
        assetId: ASSET_12,
        customerId: BOA_VISTA,
        agentId: USERS.rafael,
        plannedStart: "2026-11-01T08:00:00.000Z",
        plannedEnd: "2026-11-11T08:00:00.000Z",
        rateCents: 85_000,
        rateUnit: "DAY",
        depositCents: 200_000,
        includedHoursPerDay: 8,
        extraHourRateCents: 12_000,
        fuelPolicy: "CHARGE_DIFFERENCE",
        fuelPriceCents: 620,
      }),
    );
    await run(marina, (tx) => reserveRental(tx, marina, story.rentalId));
    expect(await row("rentals", story.rentalId)).toMatchObject({ status: "RESERVED", number: expect.stringMatching(/^RN-\d{6}$/u), siteId: SANTA_CLARA, seasonId: SAFRA });
    let events = await publishedEvents();
    expect(entityChanges(events, "RENTAL", story.rentalId).length).toBeGreaterThan(0);
    expect(pulled(await pullDelta(rafael), "rentals", story.rentalId)).toMatchObject({ status: "RESERVED", agentId: USERS.rafael });

    const template = await row("checklist_templates", RENTAL_TEMPLATE);
    const items = template.items as CheckOutInspection["templateSnapshot"];
    const accessories = (template.accessories as { accessoryKey: string }[]).map((item) => ({ accessoryKey: item.accessoryKey, expected: 1, present: 1 }));
    const responses = () => items.map((item) => ({ key: item.key, value: "PASS", mediaIds: [], answeredAt: new Date().toISOString() }));
    const confirmScratches = (): DamageInput[] =>
      KNOWN_SCRATCHES.map((damageId, index) => ({
        id: newId(),
        zone: index === 0 ? "LEFT" : "RIGHT",
        severity: "MINOR",
        description: `Pre-existing scratch ${index + 1}`,
        isPreExisting: true,
        matchStatus: "MATCHED",
        matchedDamageId: damageId,
        mediaIds: [],
      }));

    // Check-out: 7 walkaround photos, the 2 known scratches confirmed, both signatures.
    at("2026-11-01T08:00:00.000Z");
    const checkOut = checkOutInspection(ASSET_12, { templateId: RENTAL_TEMPLATE, templateVersion: 1, templateSnapshot: items, responses: responses(), accessories, damages: confirmScratches() });
    expect(checkOut.media.filter((item) => item.kind === "PHOTO")).toHaveLength(7);
    await pushOne(rafael, "rental.checkout", { rentalId: story.rentalId, inspection: checkOut });
    expect(await row("rentals", story.rentalId)).toMatchObject({ status: "ACTIVE", checkOutInspectionId: checkOut.id });
    expectNear((await row("rentals", story.rentalId)).actualStart, "2026-11-01T08:00:00.000Z");
    expect(await row("assets", ASSET_12)).toMatchObject({ currentRentalId: story.rentalId, hourMeter: 4_312 });
    events = await publishedEvents();
    expect(entityChanges(events, "RENTAL", story.rentalId).some((event) => data(event).status === "ACTIVE")).toBe(true);
    const afterCheckOut = await pullDelta(rafael);
    expect(pulled(afterCheckOut, "rentals", story.rentalId)).toMatchObject({ status: "ACTIVE" });
    expect(pulled(afterCheckOut, "inspections", checkOut.id)).toMatchObject({ type: "CHECK_OUT", hourMeter: 4_312, fuelPercent: 100 });

    // Check-in: V1 readings, the scratches confirmed again and a new MODERATE dent of R$ 1 200,00.
    at("2026-11-11T09:30:00.000Z");
    const base = checkInInspection(ASSET_12, { templateId: RENTAL_TEMPLATE, templateVersion: 1, templateSnapshot: items, responses: responses(), accessories, hourMeter: 4_398, fuelPercent: 85 });
    const dentPhoto = mediaMeta(base.id, "PHOTO", "DAMAGE", { damageId: story.dentId });
    const checkIn: CheckInInspection = {
      ...base,
      media: [...base.media, dentPhoto],
      damages: [
        ...confirmScratches(),
        { id: story.dentId, zone: "FRONT", severity: "MODERATE", description: "Amassado no capô", isPreExisting: false, matchStatus: "NEW", mediaIds: [dentPhoto.id] },
      ],
    };
    await pushOne(rafael, "rental.checkin", { rentalId: story.rentalId, inspection: checkIn, damageCosts: [{ damageId: story.dentId, estimatedCostCents: 120_000 }] });

    const returned = await row("rentals", story.rentalId);
    expect(returned).toMatchObject({ status: "RETURNED", chargesTotalCents: 1_069_900, balanceDueCents: 869_900 });
    expectNear(returned.actualEnd, "2026-11-11T09:30:00.000Z");
    const charges = await seeded.raw("rental_charges").find({ rentalId: story.rentalId, deletedAt: null }).toArray();
    const byType = Object.fromEntries(charges.map((charge) => [String(charge.type), charge.amountCents]));
    expect(byType).toMatchObject({ BASE: 850_000, EXTRA_HOURS: 72_000, FUEL: 27_900, DAMAGE: 120_000 });
    expect(byType.EXTRA_TIME ?? 0).toBe(0);

    const dent = await row("damages", story.dentId);
    expect(dent).toMatchObject({ assetId: ASSET_12, detectedRentalId: story.rentalId, severity: "MODERATE", estimatedCostCents: 120_000, repairedAt: null });
    story.dentReportId = String(dent.fieldReportId);
    expect(await row("field_reports", story.dentReportId)).toMatchObject({ damageId: story.dentId, rentalId: story.rentalId, assetId: ASSET_12, status: "SUBMITTED" });
    // A MODERATE dent is not SEVERE and the dent report is operable, so the condition stays OPERATIONAL (§6.4); the rental is released.
    expect(await row("assets", ASSET_12)).toMatchObject({ condition: "OPERATIONAL", currentRentalId: null, hourMeter: 4_398 });
    events = await publishedEvents();
    expect(entityChanges(events, "RENTAL", story.rentalId).some((event) => data(event).status === "RETURNED")).toBe(true);
    const afterCheckIn = await pullDelta(rafael);
    expect(pulled(afterCheckIn, "rentals", story.rentalId)).toMatchObject({ status: "RETURNED", chargesTotalCents: 1_069_900 });
    expect(pulled(afterCheckIn, "damages", story.dentId)).toMatchObject({ severity: "MODERATE" });

    // Damage → work order for Carlos; the dent report is attached to it.
    at("2026-11-11T11:00:00.000Z");
    const damageWo = await run(marina, (tx) => createDamageWorkOrder(tx, marina, story.dentId, { priority: "HIGH", assigneeId: USERS.carlos }));
    story.damageWorkOrderId = damageWo.id;
    expect(damageWo.number).toBe("WO-000017");
    const attached = await run(marina, (tx) => markForRepair(tx, marina, story.dentReportId, { existing: "attach" }));
    expect(attached).toEqual({ workOrderId: damageWo.id, workOrderNumber: "WO-000017", attached: true });
    events = await publishedEvents();
    expect(notificationsOf(events, "WO_ASSIGNED").filter((event) => data(event).entityId === damageWo.id).map((event) => event.rooms[0])).toEqual([userRoom(USERS.carlos)]);
    expect(pulled(await pullDelta(carlos), "workOrders", damageWo.id)).toMatchObject({ status: "ASSIGNED", rentalId: story.rentalId, damageIds: [story.dentId] });

    // Carlos repairs the dent the next morning.
    const id = damageWo.id;
    for (const [action, iso] of [
      ["accept", "2026-11-12T08:00:00.000Z"],
      ["startRoute", "2026-11-12T08:05:00.000Z"],
      ["arrive", "2026-11-12T08:35:00.000Z"],
      ["startWork", "2026-11-12T08:40:00.000Z"],
    ] as const) {
      at(iso);
      await pushOne(carlos, "workOrder.transition", { id, action });
    }
    at("2026-11-12T10:40:00.000Z");
    const afterPhoto = woMedia(id, "PHOTO", "AFTER");
    const signature = woMedia(id, "SIGNATURE", "SIGNATURE_CUSTOMER");
    await pushAll(carlos, [
      { name: "media.register", payload: afterPhoto },
      { name: "workOrder.saveChecklist", payload: { id, ...(await checklistResponses(id, afterPhoto.id)) } },
      { name: "media.register", payload: signature },
      {
        name: "workOrder.complete",
        payload: { id, resolution: "Capô desamassado e repintado.", customerSignerName: "Marina Despacho", signatureStatus: "SIGNED", signatureMediaId: signature.id, documentLocale: "pt-BR" },
      },
    ]);
    expect(await row("work_orders", id)).toMatchObject({ status: "COMPLETED", workMinutes: 120, laborCostCents: 17_000 });
    expect(await row("damages", story.dentId)).toMatchObject({ repairedWorkOrderId: id, repairedAt: expect.any(Date) });
    expect((await row("assets", ASSET_12)).condition).toBe("OPERATIONAL");
    events = await publishedEvents();
    expect(events.some((event) => event.event === "entity:changed" && data(event).entityType === "WORK_ORDER" && data(event).id === id && data(event).status === "COMPLETED")).toBe(true);

    // Close the rental; the revenue appears in the roll-up next to the maintenance costs.
    at("2026-11-12T14:00:00.000Z");
    await run(marina, (tx) => closeRental(tx, marina, story.rentalId, { paymentNote: "PIX recebido" }));
    expect(await row("rentals", story.rentalId)).toMatchObject({ status: "CLOSED", closedById: USERS.marina });
    events = await publishedEvents();
    expect(entityChanges(events, "RENTAL", story.rentalId).some((event) => data(event).status === "CLOSED")).toBe(true);
    expect(pulled(await pullDelta(rafael), "rentals", story.rentalId)).toMatchObject({ status: "CLOSED" });

    const rollup = await costRollup(marina, { groupBy: "asset", assetId: ASSET_12, siteId: SANTA_CLARA, seasonId: SAFRA, from: "2026-10-01", to: "2026-11-30", locale: "pt-BR" });
    expect(rollup.rows).toEqual([
      expect.objectContaining({ key: ASSET_12, laborCents: 29_750 + 17_000, partsCents: 18_500, rentalRevenueCents: 1_069_900 }),
    ]);
    expect(rollup).toMatchObject({ workOrderCount: 2, rentalCount: 1 });
  }, 120_000);
});
