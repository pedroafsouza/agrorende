import type { UserDTO } from "@agrorende/contracts/dto";

import { isExpiring, jwtExpiryMs } from "../../src/auth/jwt";
import { createAuthSession, createAuthStore, type CachedProfile } from "../../src/auth/session";
import { memoryTokenVault } from "../../src/auth/vault";

const user = { id: "01900000-0000-7000-8000-000000000001", name: "Carlos" } as unknown as UserDTO;
const other = { id: "01900000-0000-7000-8000-000000000002", name: "Ana" } as unknown as UserDTO;

function jwt(expSeconds: number): string {
  const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc({ sub: "x", exp: expSeconds })}.sig`;
}

function setup(refresh: () => Promise<{ user: UserDTO; accessToken?: string; refreshToken?: string }>) {
  const store = createAuthStore();
  const vault = memoryTokenVault();
  const profiles = new Map<string, CachedProfile>();
  const session = createAuthSession({
    store,
    vault,
    api: { refresh },
    now: () => 1_000_000_000_000,
    loadProfile: async (id) => profiles.get(id),
    saveProfile: async (p) => {
      profiles.set(p.user.id, p);
    },
  });
  return { store, vault, session, profiles };
}

describe("auth session", () => {
  test("JWT expiry is read without verification", () => {
    expect(jwtExpiryMs(jwt(1000))).toBe(1_000_000);
    expect(isExpiring(jwt(1000), 1_000_000 - 30_000)).toBe(true);
    expect(isExpiring(jwt(2000), 1_000_000)).toBe(false);
    expect(isExpiring(undefined, 0)).toBe(true);
  });

  test("login stores the refresh token and restore works offline from the cached profile", async () => {
    const { store, vault, session } = setup(async () => ({ user }));
    await session.completeLogin({ user, accessToken: jwt(2_000_000_000), refreshToken: "r1" });
    expect(await vault.getRefreshToken(user.id)).toBe("r1");
    store.setState({ status: "loading", accessToken: undefined });
    expect(await session.restore()).toBe("signedIn");
    expect(store.getState()).toMatchObject({ status: "signedIn", needsReauth: false });
    expect(store.getState().user?.id).toBe(user.id);
  });

  test("a 401 on refresh asks to sign in again but keeps the user signed in locally", async () => {
    const { store, session } = setup(async () => {
      throw Object.assign(new Error("401"), { status: 401, code: "UNAUTHENTICATED" });
    });
    await session.completeLogin({ user, accessToken: jwt(1), refreshToken: "r1" });
    expect(await session.ensureFreshToken()).toBe(false);
    expect(store.getState()).toMatchObject({ status: "signedIn", needsReauth: true });
  });

  test("an offline refresh failure changes nothing", async () => {
    const { store, session } = setup(async () => {
      throw Object.assign(new Error("offline"), { status: 0 });
    });
    await session.completeLogin({ user, accessToken: jwt(1), refreshToken: "r1" });
    expect(await session.refresh()).toBe(false);
    expect(store.getState().needsReauth).toBe(false);
  });

  test("concurrent refreshes share one request and rotate the token", async () => {
    const refresh = jest.fn(async () => ({ user, accessToken: jwt(2_000_000_000), refreshToken: "r2" }));
    const { vault, session } = setup(refresh);
    await session.completeLogin({ user, accessToken: jwt(1), refreshToken: "r1" });
    await Promise.all([session.refresh(), session.refresh()]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await vault.getRefreshToken(user.id)).toBe("r2");
  });

  test("a different user signing in records the previous user", async () => {
    const { store, session } = setup(async () => ({ user }));
    await session.completeLogin({ user, refreshToken: "r1" });
    await session.signOut();
    expect(store.getState()).toMatchObject({ status: "signedOut", previousUserId: user.id });
    await session.completeLogin({ user: other, refreshToken: "r3" });
    expect(store.getState().user?.id).toBe(other.id);
  });
});
