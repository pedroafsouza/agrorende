import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDb } from "@agrorende/db";
import { Redis } from "ioredis";

import { authConfig } from "../config.js";
import { json, route, type RouteHandler } from "../http.js";
import { mediaStore } from "../../storage/index.js";

const PROBE_TIMEOUT_MS = 1500;

export interface HealthProbes {
  readonly db: () => Promise<boolean>;
  readonly redis: () => Promise<boolean>;
  /** Writable `MEDIA_ROOT`; defaults to a real probe-file write when omitted. */
  readonly media?: () => Promise<boolean>;
}

function withTimeout(promise: Promise<boolean>): Promise<boolean> {
  return Promise.race([promise.catch(() => false), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PROBE_TIMEOUT_MS).unref())]);
}

async function probeMediaRoot(): Promise<boolean> {
  const store = mediaStore();
  if (store.driver !== "local") return true;
  const dir = path.join(store.root, ".health");
  const file = path.join(dir, `${randomUUID()}.probe`);
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(file, "ok");
    return true;
  } finally {
    await rm(file, { force: true });
  }
}

const defaultProbes: Required<HealthProbes> = {
  db: async () => {
    const db = await getDb();
    const result = await db.command({ ping: 1 });
    return result.ok === 1;
  },
  redis: async () => {
    const url = authConfig().redisUrl;
    if (url === null) return false;
    const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: PROBE_TIMEOUT_MS, enableOfflineQueue: false });
    try {
      await client.connect();
      return (await client.ping()) === "PONG";
    } finally {
      client.disconnect();
    }
  },
  media: probeMediaRoot,
};

let probes: Required<HealthProbes> = defaultProbes;

export function setHealthProbes(value: HealthProbes | null): void {
  probes = value === null ? defaultProbes : { ...value, media: value.media ?? probeMediaRoot };
}

/**
 * `GET /api/v1/health` (public): `{ok, app, db, redis, media, version}`. The body shape lets the mobile
 * sync engine detect captive portals; dependency state never turns the probe into an HTML page.
 */
export const healthHandler: RouteHandler = route(async () => {
  const [db, redis, media] = await Promise.all([withTimeout(probes.db()), withTimeout(probes.redis()), withTimeout(probes.media())]);
  const version = authConfig().appVersion;
  return json({ ok: true, app: "agrorende", db, redis, media, version }, { status: db ? 200 : 503 });
});
