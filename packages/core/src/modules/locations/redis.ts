import { Redis } from "ioredis";

let shared: Redis | null = null;

/** Shared Redis client for the location pipeline; created lazily from `REDIS_URL`. */
export function locationsRedis(): Redis {
  if (shared === null) {
    const url = process.env.REDIS_URL;
    if (url === undefined || url.trim().length === 0) {
      throw new Error("REDIS_URL is required.");
    }
    shared = new Redis(url, { maxRetriesPerRequest: 3 });
  }
  return shared;
}

/** Replaces the shared client, for example with the gateway's own connection or a test client. */
export function setLocationsRedis(client: Redis | null): void {
  shared = client;
}

export async function closeLocationsRedis(): Promise<void> {
  const client = shared;
  shared = null;
  if (client !== null) {
    await client.quit();
  }
}
