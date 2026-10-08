import * as SecureStore from "expo-secure-store";

import type { TokenVault } from "./vault";

const key = (name: string) => `agrorende.${name.replace(/[^A-Za-z0-9._-]/g, "_")}`;

async function read(name: string): Promise<string | undefined> {
  return (await SecureStore.getItemAsync(key(name))) ?? undefined;
}

async function write(name: string, value: string | undefined): Promise<void> {
  if (value === undefined) await SecureStore.deleteItemAsync(key(name));
  else await SecureStore.setItemAsync(key(name), value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
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
