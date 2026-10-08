/** Refresh tokens per user plus the last signed-in user id (ARCHITECTURE §7.9). Access tokens stay in memory. */
export interface TokenVault {
  getRefreshToken(userId: string): Promise<string | undefined>;
  setRefreshToken(userId: string, token: string): Promise<void>;
  clearRefreshToken(userId: string): Promise<void>;
  getLastUserId(): Promise<string | undefined>;
  setLastUserId(userId: string | undefined): Promise<void>;
  getDeviceId(): Promise<string | undefined>;
  setDeviceId(deviceId: string): Promise<void>;
}

/** In-memory vault for tests and previews. */
export function memoryTokenVault(): TokenVault {
  const store = new Map<string, string>();
  const set = async (name: string, value: string | undefined) => {
    if (value === undefined) store.delete(name);
    else store.set(name, value);
  };
  return {
    getRefreshToken: async (userId) => store.get(`refresh.${userId}`),
    setRefreshToken: (userId, token) => set(`refresh.${userId}`, token),
    clearRefreshToken: (userId) => set(`refresh.${userId}`, undefined),
    getLastUserId: async () => store.get("lastUserId"),
    setLastUserId: (userId) => set("lastUserId", userId),
    getDeviceId: async () => store.get("deviceId"),
    setDeviceId: (deviceId) => set("deviceId", deviceId),
  };
}
