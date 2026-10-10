import type { TokenVault } from "./vault";

/**
 * Web variant of `secureVault.ts` (development web preview only). expo-secure-store has no web
 * implementation, so the preview keeps its tokens in `sessionStorage`, which is cleared when the
 * browser tab closes. Native builds keep using the device keychain.
 */
const key = (name: string) => `agrorende.${name.replace(/[^A-Za-z0-9._-]/g, "_")}`;

async function read(name: string): Promise<string | undefined> {
  return globalThis.sessionStorage?.getItem(key(name)) ?? undefined;
}

async function write(name: string, value: string | undefined): Promise<void> {
  if (value === undefined) globalThis.sessionStorage?.removeItem(key(name));
  else globalThis.sessionStorage?.setItem(key(name), value);
}

export const secureTokenVault: TokenVault = {
  getRefreshToken: (userId) => read(`refresh.${userId}`),
  setRefreshToken: (userId, token) => write(`refresh.${userId}`, token),
  clearRefreshToken: (userId) => write(`refresh.${userId}`, undefined),
  getLastUserId: () => read("lastUserId"),
  setLastUserId: (userId) => write("lastUserId", userId),
  getDeviceId: () => read("deviceId"),
  setDeviceId: (deviceId) => write("deviceId", deviceId),
};
