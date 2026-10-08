import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { findRepoRoot } from "../../storage/init.js";
import { localMediaStore, setMediaStore } from "../../storage/index.js";
import { setAuthConfigForTests } from "../config.js";
import { signAccessToken } from "../jwt.js";
import { memoryRateLimiter, setRateLimiter } from "../rateLimit.js";
import { createSeededDb, SEED, seedUuid, type SeededDb } from "../testing/seeded.js";
import { platformApi, setHealthProbes, type PlatformRouteKey } from "./index.js";

const BASE = "http://localhost:3000";
const MEDIA_ROOT = path.join(findRepoRoot(), ".data", "media-t02", "api-test");
const DEVICE = "018fd000-0000-7000-8000-00000000d0a1";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 2044 }, (_, i) => i % 251), 0xff, 0xd9]);

let seeded: SeededDb;

interface Call {
  readonly params?: Record<string, string>;
  readonly query?: Record<string, string>;
  readonly body?: unknown;
  readonly raw?: Uint8Array;
  readonly token?: string;
  readonly headers?: Record<string, string>;
}

async function call(key: PlatformRouteKey, options: Call = {}): Promise<Response> {
  const [method = "GET", pattern = "/"] = key.split(" ");
  const params = options.params ?? {};
  const pathname = pattern.replace(/:(\w+)/g, (_, name: string) => params[name] ?? "");
  const url = new URL(`/api/v1${pathname}`, BASE);
  for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, value);
  return send(key, method, url.toString(), options);
}

async function send(key: PlatformRouteKey, method: string, url: string, options: Call): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.token !== undefined) headers.set("authorization", `Bearer ${options.token}`);
  let body: BodyInit | undefined;
  if (options.raw !== undefined) body = new Blob([Uint8Array.from(options.raw)]);
  else if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  return platformApi[key](new Request(url, { method, headers, body }), options.params ?? {});
}

async function loginAs(email: string): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await call("POST /auth/login", { body: { email, password: SEED.password, deviceId: DEVICE, platform: "ANDROID" } });
  expect(response.status).toBe(200);
  return (await response.json()) as { accessToken: string; refreshToken: string };
}

async function emailOf(userId: string): Promise<string> {
  const user = await seeded.raw("users").findOne({ _id: userId });
  return String(user?.email);
}

let admin: string;
let manager: string;
let field: string;

beforeAll(async () => {
  setAuthConfigForTests({ jwtSecret: "t02-api-test-secret-0123456789abcdef", mediaUrlSecret: "t02-media-secret-0123456789abcdef", redisUrl: null, appUrl: BASE });
  setRateLimiter(memoryRateLimiter());
  seeded = await createSeededDb("api");
  setMediaStore(localMediaStore({ root: MEDIA_ROOT }));
  admin = (await loginAs(await emailOf(SEED.admin))).accessToken;
  manager = (await loginAs(await emailOf(SEED.manager))).accessToken;
  field = (await loginAs(await emailOf(SEED.field))).accessToken;
}, 60_000);

beforeEach(() => {
  setRateLimiter(memoryRateLimiter());
});

afterAll(async () => {
  setMediaStore(null);
  setHealthProbes(null);
  setRateLimiter(null);
  setAuthConfigForTests(null);
  await rm(MEDIA_ROOT, { recursive: true, force: true });
  await seeded?.close();
});

describe("health", () => {
  it("answers the captive-portal shape", async () => {
    setHealthProbes({ db: async () => true, redis: async () => false });
    const response = await call("GET /health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, app: "agrorende", db: true, redis: false, media: true });
  });

  it("answers 503 when the database is down", async () => {
    setHealthProbes({ db: async () => false, redis: async () => true, media: async () => true });
    const response = await call("GET /health");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: true, db: false });
  });
});

describe("auth", () => {
  it("web login sets HttpOnly cookies and never returns the password hash", async () => {
    const response = await call("POST /auth/login", { body: { email: await emailOf(SEED.admin), password: SEED.password } });
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.startsWith("ar_access=") && cookie.includes("HttpOnly"))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("ar_refresh=") && cookie.includes("Path=/api/v1/auth"))).toBe(true);
    const body = (await response.json()) as Record<string, Record<string, unknown>>;
    expect(body.accessToken).toBeUndefined();
    expect(body.user?.passwordHash).toBeUndefined();
  });

  it("rejects a wrong password with INVALID_CREDENTIALS", async () => {
    const response = await call("POST /auth/login", { body: { email: await emailOf(SEED.admin), password: "wrong-password" } });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
  });

  it("rate limits repeated logins for one email", async () => {
    const email = await emailOf(SEED.manager);
    let last = 0;
    for (let i = 0; i < 6; i += 1) last = (await call("POST /auth/login", { body: { email, password: "nope-nope" } })).status;
    expect(last).toBe(429);
  });

  it("rotates mobile refresh tokens", async () => {
    const pair = await loginAs(await emailOf(SEED.field));
    const response = await call("POST /auth/refresh", { body: { refreshToken: pair.refreshToken } });
    expect(response.status).toBe(200);
    const next = (await response.json()) as { refreshToken: string };
    expect(next.refreshToken).not.toBe(pair.refreshToken);
  });

  it("revokes the whole family when an old refresh token is reused after the grace", async () => {
    const pair = await loginAs(await emailOf(SEED.field));
    const rotated = (await (await call("POST /auth/refresh", { body: { refreshToken: pair.refreshToken } })).json()) as { refreshToken: string };
    const tokens = seeded.raw("refresh_tokens");
    const old = await tokens.findOne({ replacedById: { $ne: null }, revokedAt: { $ne: null } }, { sort: { revokedAt: -1 } });
    await tokens.updateOne({ _id: old?._id ?? "" }, { $set: { revokedAt: new Date(Date.now() - 120_000) } });
    const reuse = await call("POST /auth/refresh", { body: { refreshToken: pair.refreshToken } });
    expect(reuse.status).toBe(401);
    expect(await reuse.json()).toMatchObject({ error: { code: "REFRESH_REUSED" } });
    const after = await call("POST /auth/refresh", { body: { refreshToken: rotated.refreshToken } });
    expect(after.status).toBe(401);
  });

  it("answers TOKEN_EXPIRED for an expired access token", async () => {
    const token = await signAccessToken(
      { tokenUse: "access", sub: SEED.admin, orgId: SEED.orgA, role: "ADMIN" },
      { secret: "t02-api-test-secret-0123456789abcdef", expiresIn: "-10s" },
    );
    const response = await call("GET /auth/me", { token });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "TOKEN_EXPIRED" } });
  });

  it("requires a session for /auth/me and returns the org settings", async () => {
    expect((await call("GET /auth/me")).status).toBe(401);
    const response = await call("GET /auth/me", { token: field });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ role: "FIELD", settings: expect.any(Object) });
  });

  it("looks up an invite by code and answers 404 for an unknown code", async () => {
    expect((await call("GET /auth/invites/:code", { params: { code: SEED.inviteCode } })).status).toBe(200);
    expect((await call("GET /auth/invites/:code", { params: { code: "ZZZZZZZZZZ" } })).status).toBe(404);
  });

  it("answers OAUTH_PROVIDER_ERROR while providers are not configured", async () => {
    const response = await call("POST /auth/apple", { body: {} });
    expect(await response.json()).toMatchObject({ error: { code: "OAUTH_PROVIDER_ERROR" } });
  });
});

describe("users", () => {
  it("lets a manager read but not create users", async () => {
    expect((await call("GET /users", { token: manager })).status).toBe(200);
    const created = await call("POST /users", { token: manager, body: { name: "X", role: "FIELD" } });
    expect(created.status).toBe(403);
  });

  it("changing a role bumps scopeEpoch", async () => {
    const target = seedUuid(105);
    const before = await seeded.raw("users").findOne({ _id: target });
    const role = before?.role === "MANAGER" ? "FIELD" : "MANAGER";
    const response = await call("POST /users/:id/role", { token: admin, params: { id: target }, body: { role } });
    expect(response.status).toBe(200);
    const after = await seeded.raw("users").findOne({ _id: target });
    expect(after?.role).toBe(role);
    expect(Number(after?.scopeEpoch ?? 0)).toBe(Number(before?.scopeEpoch ?? 0) + 1);
  });

  it("guards the last active admin", async () => {
    await seeded.raw("users").updateMany({ organizationId: SEED.orgA, role: "ADMIN", _id: { $ne: SEED.admin } }, { $set: { role: "MANAGER" } });
    const response = await call("POST /users/:id/role", { token: admin, params: { id: SEED.admin }, body: { role: "MANAGER" } });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "LAST_ADMIN" } });
  });
});

describe("devices and telemetry", () => {
  it("registers a device and keeps one row per installation and user", async () => {
    const installation = randomUUID();
    for (let i = 0; i < 2; i += 1) {
      const response = await call("POST /devices/register", { token: field, body: { deviceId: installation, platform: "ANDROID", pushToken: "ExponentPushToken[abc]" } });
      expect(response.status).toBe(200);
    }
    expect(await seeded.raw("devices").countDocuments({ installationId: installation })).toBe(1);
  });

  it("rejects diagnostics larger than 256 KB", async () => {
    const response = await call("POST /telemetry/diagnostics", {
      token: field,
      body: { id: randomUUID(), deviceId: DEVICE, createdAt: new Date().toISOString(), appVersion: "1.0.0", payload: { log: "x".repeat(300 * 1024) } },
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("only admins list devices", async () => {
    expect((await call("GET /devices", { token: manager })).status).toBe(403);
    expect((await call("GET /devices", { token: admin })).status).toBe(200);
  });
});

describe("media", () => {
  async function createPhoto(sizeBytes: number) {
    const response = await call("POST /media", {
      token: admin,
      body: { kind: "PHOTO", mimeType: "image/jpeg", sizeBytes, parent: { type: "ASSET", id: seedUuid(400) } },
    });
    const json: unknown = await response.json();
    if (response.status === 500) throw new Error(JSON.stringify(json));
    return { response, body: json as { media: { id: string }; upload: { url: string } } };
  }

  async function put(url: string, bytes: Uint8Array): Promise<Response> {
    const target = new URL(url);
    return send("PUT /media/:id/blob", "PUT", url, { raw: bytes, params: { id: target.pathname.split("/")[4] ?? "" } });
  }

  it("uploads, completes and serves a photo with ranges", async () => {
    const { response, body } = await createPhoto(JPEG.byteLength);
    expect(response.status).toBe(201);
    const id = body.media.id;
    expect((await put(body.upload.url, JPEG)).status).toBe(200);
    const complete = await call("POST /media/:id/complete", { token: admin, params: { id }, body: { variant: "original" } });
    expect(complete.status).toBe(200);
    const again = await call("POST /media/:id/complete", { token: admin, params: { id }, body: { variant: "original" } });
    expect(again.status).toBe(200);

    const redirect = await call("GET /media/:id/url", { token: field, params: { id } });
    expect([302, 404]).toContain(redirect.status);
    const signed = await call("GET /media/:id/url", { token: admin, params: { id } });
    expect(signed.status).toBe(302);
    const location = signed.headers.get("location") ?? "";
    const full = await send("GET /media/:id/blob", "GET", location, { params: { id } });
    expect(full.status).toBe(200);
    expect(new Uint8Array(await full.arrayBuffer()).byteLength).toBe(JPEG.byteLength);
    const partial = await send("GET /media/:id/blob", "GET", location, { params: { id }, headers: { range: "bytes=0-9" } });
    expect(partial.status).toBe(206);
    expect(new Uint8Array(await partial.arrayBuffer()).byteLength).toBe(10);
    const invalid = await send("GET /media/:id/blob", "GET", location, { params: { id }, headers: { range: "bytes=999999-" } });
    expect(invalid.status).toBe(416);

    const locked = await call("POST /media/:id/upload-url", { token: admin, params: { id }, body: { variant: "original", mimeType: "image/jpeg", sizeBytes: JPEG.byteLength } });
    expect(locked.status).toBe(409);
  });

  it("rejects a token for another media id", async () => {
    const first = await createPhoto(JPEG.byteLength);
    const second = await createPhoto(JPEG.byteLength);
    const url = new URL(first.body.upload.url);
    url.pathname = url.pathname.replace(first.body.media.id, second.body.media.id);
    const response = await send("PUT /media/:id/blob", "PUT", url.toString(), { raw: JPEG, params: { id: second.body.media.id } });
    expect(response.status).toBe(403);
  });

  it("rejects bytes that do not match the declared type", async () => {
    const { body } = await createPhoto(JPEG.byteLength);
    const png = new Uint8Array(JPEG.byteLength).fill(7);
    expect((await put(body.upload.url, png)).status).toBe(200);
    const response = await call("POST /media/:id/complete", { token: admin, params: { id: body.media.id }, body: { variant: "original" } });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "MEDIA_TYPE_MISMATCH" } });
  });

  it("reports a missing upload as MEDIA_PART_MISSING", async () => {
    const { body } = await createPhoto(JPEG.byteLength);
    const response = await call("POST /media/:id/complete", { token: admin, params: { id: body.media.id }, body: { variant: "original" } });
    expect(response.status).toBe(409);
  });

  it("rejects oversize photos with MEDIA_TOO_LARGE", async () => {
    const { response } = await createPhoto(26 * 1024 * 1024);
    expect(response.status).toBe(413);
  });

  it("answers STORAGE_FULL when the disk is nearly full", async () => {
    setMediaStore(localMediaStore({ root: MEDIA_ROOT, freeSpace: async () => ({ freeBytes: 1024, totalBytes: 100 * 1024 ** 3 }) }));
    try {
      const { response } = await createPhoto(JPEG.byteLength);
      expect(response.status).toBe(507);
    } finally {
      setMediaStore(localMediaStore({ root: MEDIA_ROOT }));
    }
  });
});

describe("notifications and settings", () => {
  it("lists and marks notifications read", async () => {
    const list = await call("GET /notifications", { token: field, query: { limit: "5" } });
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ items: expect.any(Array), unreadCount: expect.any(Number) });
    expect((await call("POST /notifications/read", { token: field, body: { all: true } })).status).toBe(204);
    const after = (await (await call("GET /notifications", { token: field })).json()) as { unreadCount: number };
    expect(after.unreadCount).toBe(0);
  });

  it("returns settings with an ETag and rejects a stale If-Match", async () => {
    const get = await call("GET /settings", { token: field });
    expect(get.status).toBe(200);
    const etag = get.headers.get("etag") ?? "";
    expect((await call("PATCH /settings", { token: manager, body: { slaAtRiskRatio: 0.3 } })).status).toBe(403);
    const ok = await call("PATCH /settings", { token: admin, body: { slaAtRiskRatio: 0.3 }, headers: { "if-match": etag } });
    expect(ok.status).toBe(200);
    const stale = await call("PATCH /settings", { token: admin, body: { slaAtRiskRatio: 0.4 }, headers: { "if-match": etag } });
    expect(stale.status).toBe(409);
  });
});
