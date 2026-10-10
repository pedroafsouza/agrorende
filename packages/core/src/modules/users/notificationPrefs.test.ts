import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loginHandler, meHandler, updateMeHandler } from "../../auth/api/auth";
import { setAuthConfigForTests } from "../../auth/config";
import { memoryRateLimiter, setRateLimiter } from "../../auth/rateLimit";
import { createNamedSeededDb, SEED, seedCtx, type SeededDb } from "../../auth/testing/seeded";
import { toUserDto } from "./dto";
import { mergeNotificationPrefs, updateNotificationPrefs, withNotificationPrefs } from "./notificationPrefs";

/** Push mute settings on the caller's own user (change request T05-008). */

let seeded: SeededDb;
const field = seedCtx(SEED.field, "FIELD");

const BASE = "http://localhost:3000";

beforeAll(async () => {
  setAuthConfigForTests({ jwtSecret: "t10-schema-test-secret-0123456789abcdef", mediaUrlSecret: "t10-media-secret-0123456789abcdef", redisUrl: null, appUrl: BASE });
  setRateLimiter(memoryRateLimiter());
  seeded = await createNamedSeededDb("agrorende_t10_schema_users");
}, 60_000);

afterAll(async () => {
  setRateLimiter(null);
  setAuthConfigForTests(null);
  await seeded.close();
});

function request(method: string, path: string, token?: string, body?: unknown): Request {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(new URL(`/api/v1${path}`, BASE), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe("notification prefs", () => {
  it("defaults rows written before T05-008", () => {
    expect(withNotificationPrefs({ id: SEED.field }).notificationPrefs).toEqual({ pushMuted: false, mutedTypes: [] });
  });

  it("merges a partial patch into the stored prefs", () => {
    expect(mergeNotificationPrefs({ pushMuted: true, mutedTypes: ["WO_ASSIGNED"] }, { pushMuted: false })).toEqual({ pushMuted: false, mutedTypes: ["WO_ASSIGNED"] });
    expect(mergeNotificationPrefs(undefined, { mutedTypes: ["RENTAL_OVERDUE", "RENTAL_OVERDUE"] })).toEqual({ pushMuted: false, mutedTypes: ["RENTAL_OVERDUE"] });
  });

  it("persists the prefs with a new syncVersion and hides them from other viewers", async () => {
    const before = await seeded.raw("users").findOne({ _id: SEED.field });
    const row = await updateNotificationPrefs(field, { pushMuted: true });
    expect(row.notificationPrefs).toEqual({ pushMuted: true, mutedTypes: [] });
    expect(row.passwordHash).toBeUndefined();
    const stored = await seeded.raw("users").findOne({ _id: SEED.field });
    expect(stored?.notificationPrefs).toEqual({ pushMuted: true, mutedTypes: [] });
    expect(Number(stored?.syncVersion)).toBeGreaterThan(Number(before?.syncVersion));

    await updateNotificationPrefs(field, { mutedTypes: ["WO_UPDATED"] });
    expect((await seeded.raw("users").findOne({ _id: SEED.field }))?.notificationPrefs).toEqual({ pushMuted: true, mutedTypes: ["WO_UPDATED"] });

    const doc = (await seeded.raw("users").findOne({ _id: SEED.field })) as object;
    expect(toUserDto(doc, { userId: SEED.field, role: "FIELD" })).toHaveProperty("notificationPrefs");
    expect(toUserDto(doc, { userId: SEED.admin, role: "ADMIN" })).not.toHaveProperty("notificationPrefs");
  });
});

describe("GET /auth/me and PATCH /me", () => {
  it("returns default prefs, persists a mute and keeps locale updates working", async () => {
    const manager = await seeded.raw("users").findOne({ _id: SEED.manager });
    const login = await loginHandler(request("POST", "/auth/login", undefined, { email: manager?.email, password: SEED.password, deviceId: "018fd000-0000-7000-8000-00000000d0b1", platform: "ANDROID" }), {});
    expect(login.status).toBe(200);
    const { accessToken } = (await login.json()) as { accessToken: string };

    const before = (await (await meHandler(request("GET", "/auth/me", accessToken), {})).json()) as { user: { notificationPrefs: unknown } };
    expect(before.user.notificationPrefs).toEqual({ pushMuted: false, mutedTypes: [] });

    const patched = await updateMeHandler(request("PATCH", "/me", accessToken, { notificationPrefs: { pushMuted: true } }), {});
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { notificationPrefs: unknown }).notificationPrefs).toEqual({ pushMuted: true, mutedTypes: [] });

    const locale = (await (await updateMeHandler(request("PATCH", "/me", accessToken, { locale: "en" }), {})).json()) as { locale: string; notificationPrefs: unknown };
    expect(locale).toMatchObject({ locale: "en", notificationPrefs: { pushMuted: true, mutedTypes: [] } });

    const after = (await (await meHandler(request("GET", "/auth/me", accessToken), {})).json()) as { user: { notificationPrefs: unknown } };
    expect(after.user.notificationPrefs).toEqual({ pushMuted: true, mutedTypes: [] });

    const invalid = await updateMeHandler(request("PATCH", "/me", accessToken, { notificationPrefs: { mutedTypes: ["NOPE"] } }), {});
    expect(invalid.status).toBe(422);
    expect(((await invalid.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  });
});
