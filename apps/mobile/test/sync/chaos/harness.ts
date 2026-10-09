/**
 * Chaos harness (T12): the real `@agrorende/core` REST handlers run in-process behind msw, so the
 * real mobile sync engine talks HTTP to the real server code and the real MongoDB test database.
 * Faults (offline, lost responses, 5xx, captive portal HTML, slow links) are injected at the
 * msw layer, in front of the server, so the server state stays authoritative.
 */
import { rm } from "node:fs/promises";
import path from "node:path";

import { http, HttpResponse } from "msw";
import { setupServer, type SetupServer } from "msw/node";

import { platformApi } from "../../../../../packages/core/src/auth/api/index";
import { setAuthConfigForTests } from "../../../../../packages/core/src/auth/config";
import { json, route, readJson, type RouteHandler } from "../../../../../packages/core/src/auth/http";
import { memoryRateLimiter, setRateLimiter } from "../../../../../packages/core/src/auth/rateLimit";
import { authenticate } from "../../../../../packages/core/src/auth/session";
import { createNamedSeededDb, SEED, type SeededDb } from "../../../../../packages/core/src/auth/testing/seeded";
import { closeJobQueues } from "../../../../../packages/core/src/jobs/index";
import { closeLocationsRedis } from "../../../../../packages/core/src/modules/locations/redis";
import { ingest, REST_BATCH_MAX } from "../../../../../packages/core/src/modules/locations/index";
import { tenancyApi } from "../../../../../packages/core/src/modules/tenancy/api";
import { findRepoRoot } from "../../../../../packages/core/src/storage/init";
import { localMediaStore, setMediaStore } from "../../../../../packages/core/src/storage/index";

export const BASE = "http://localhost:3120";
export const DB_NAME = "agrorende_t12";
export const MEDIA_ROOT = path.join(findRepoRoot(), ".data", "media-t12");
export const SERVER_MEDIA_ROOT = path.join(MEDIA_ROOT, "server");
export const DEVICES_ROOT = path.join(MEDIA_ROOT, "devices");
export { SEED };

export type FaultKind =
  /** The request never reaches the server (airplane mode, no route). */
  | "network"
  /** The server processes the request, then the response is lost on the way back. */
  | "drop"
  /** The server is not reached; a fixed status and JSON body are returned instead. */
  | "status"
  /** A captive portal answers with an HTML login page. */
  | "html"
  /** The request hangs longer than the client timeout. */
  | "hang";

export interface Fault {
  readonly kind: FaultKind;
  /** Matches `"<METHOD> <path after /api/v1>"`, for example `/^POST \/sync\/push/`. Defaults to everything. */
  readonly match?: RegExp;
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  /** How many matching requests the fault affects; unlimited when omitted. */
  times?: number;
  /** Only requests issued by this device id (header `x-chaos-device`). */
  readonly device?: string;
  /** Lets this many matching requests through before the fault starts. */
  skip?: number;
}

export interface LoggedRequest {
  readonly key: string;
  readonly device: string | undefined;
  readonly status: number | "network" | "dropped" | "hang";
}

type Table = readonly { readonly method: string; readonly pattern: RegExp; readonly names: readonly string[]; readonly handler: RouteHandler }[];

function compile(map: Readonly<Record<string, RouteHandler>>): Table {
  return Object.entries(map).map(([key, handler]) => {
    const [method = "GET", pattern = "/"] = key.split(" ");
    const names: string[] = [];
    const source = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:(\w+)/g, (_, name: string) => {
      names.push(name);
      return "([^/]+)";
    });
    return { method, pattern: new RegExp(`^${source}$`), names, handler };
  });
}

const locationBatch: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request);
  return json(await ingest({ orgId: ctx.orgId, userId: ctx.userId, deviceId: ctx.deviceId ?? null }, await readJson(request), { maxFixes: REST_BATCH_MAX }));
});

const TABLE: Table = [...compile(platformApi), ...compile(tenancyApi), ...compile({ "POST /locations/batch": locationBatch })];

export interface ChaosServer {
  readonly seeded: SeededDb;
  readonly msw: SetupServer;
  readonly log: LoggedRequest[];
  readonly faults: Fault[];
  /** Server-side free space in bytes, used by the 507 STORAGE_FULL case. */
  serverFreeBytes: number;
  /** Count of requests that actually reached a core handler. */
  readonly reached: Map<string, number>;
  inject(fault: Fault): Fault;
  /** Clears faults, restores server storage and the login rate limiter between scenarios. */
  resetFaults(): void;
  close(): Promise<void>;
}

function pickFault(faults: Fault[], key: string, device: string | undefined): Fault | undefined {
  const index = faults.findIndex((fault) => (fault.match === undefined || fault.match.test(key)) && (fault.device === undefined || fault.device === device) && (fault.times === undefined || fault.times > 0));
  if (index < 0) return undefined;
  const fault = faults[index];
  if (fault?.skip !== undefined && fault.skip > 0) {
    fault.skip -= 1;
    return undefined;
  }
  if (fault?.times !== undefined) fault.times -= 1;
  return fault;
}

/** Starts the in-process server: seeded `agrorende_t12`, local media store, msw interception. */
export async function startChaosServer(): Promise<ChaosServer> {
  process.env.MONGODB_DB = DB_NAME;
  process.env.MEDIA_ROOT = MEDIA_ROOT;
  setAuthConfigForTests({ jwtSecret: "t12-chaos-jwt-secret-0123456789abcdef", mediaUrlSecret: "t12-chaos-media-secret-0123456789abcd", redisUrl: null, appUrl: BASE });
  setRateLimiter(memoryRateLimiter());
  await rm(MEDIA_ROOT, { recursive: true, force: true });
  const seeded = await createNamedSeededDb(DB_NAME);
  const log: LoggedRequest[] = [];
  const faults: Fault[] = [];
  const reached = new Map<string, number>();
  const state = { serverFreeBytes: 500 * 1024 * 1024 * 1024 };
  setMediaStore(localMediaStore({ root: SERVER_MEDIA_ROOT, freeSpace: async () => ({ freeBytes: state.serverFreeBytes, totalBytes: 1024 * 1024 * 1024 * 1024 }) }));

  const msw = setupServer(
    http.all(`${BASE}/api/v1/*`, async ({ request }) => {
      const url = new URL(request.url);
      const sub = url.pathname.slice("/api/v1".length) || "/";
      const key = `${request.method} ${sub}`;
      const device = request.headers.get("x-chaos-device") ?? undefined;
      const fault = pickFault(faults, key, device);
      if (fault?.kind === "network") {
        log.push({ key, device, status: "network" });
        return HttpResponse.error();
      }
      if (fault?.kind === "hang") {
        log.push({ key, device, status: "hang" });
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 60_000);
          request.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        return HttpResponse.error();
      }
      if (fault?.kind === "html") {
        log.push({ key, device, status: fault.status ?? 200 });
        return new HttpResponse("<html><body>Wi-Fi login</body></html>", { status: fault.status ?? 200, headers: { "content-type": "text/html" } });
      }
      if (fault?.kind === "status") {
        const status = fault.status ?? 503;
        log.push({ key, device, status });
        return HttpResponse.json((fault.body ?? { error: { code: "SERVICE_UNAVAILABLE", message: "chaos" } }) as Record<string, unknown>, { status, headers: fault.headers ?? {} });
      }
      const entry = TABLE.find((candidate) => candidate.method === request.method && candidate.pattern.test(sub));
      if (entry === undefined) {
        log.push({ key, device, status: 404 });
        return HttpResponse.json({ error: { code: "NOT_FOUND", message: `no route ${key}` } }, { status: 404 });
      }
      const match = entry.pattern.exec(sub);
      const params = Object.fromEntries(entry.names.map((name, i) => [name, decodeURIComponent(match?.[i + 1] ?? "")]));
      const routeKey = `${entry.method} ${entry.pattern.source}`;
      reached.set(routeKey, (reached.get(routeKey) ?? 0) + 1);
      const body = request.method === "GET" || request.method === "HEAD" ? undefined : new Uint8Array(await request.arrayBuffer());
      const forwarded = new Request(request.url, { method: request.method, headers: request.headers, ...(body === undefined || body.byteLength === 0 ? {} : { body }) });
      const response = await entry.handler(forwarded, params);
      if (fault?.kind === "drop") {
        await response.arrayBuffer().catch(() => undefined);
        log.push({ key, device, status: "dropped" });
        return HttpResponse.error();
      }
      log.push({ key, device, status: response.status });
      return response;
    }),
  );
  msw.listen({ onUnhandledRequest: "bypass" });

  return {
    seeded,
    msw,
    log,
    faults,
    reached,
    get serverFreeBytes() {
      return state.serverFreeBytes;
    },
    set serverFreeBytes(value: number) {
      state.serverFreeBytes = value;
    },
    inject(fault) {
      faults.push(fault);
      return fault;
    },
    resetFaults() {
      faults.length = 0;
      state.serverFreeBytes = 500 * 1024 * 1024 * 1024;
      // Every scenario signs in several times from one "IP"; a fresh limiter keeps them independent.
      setRateLimiter(memoryRateLimiter());
    },
    async close() {
      msw.close();
      setMediaStore(null);
      setRateLimiter(null);
      await closeJobQueues().catch(() => undefined);
      await closeLocationsRedis().catch(() => undefined);
      await seeded.close();
      setAuthConfigForTests(null);
      await rm(MEDIA_ROOT, { recursive: true, force: true });
    },
  };
}

/** Counts requests in the log whose key matches. */
export function countRequests(server: ChaosServer, match: RegExp, device?: string): number {
  return server.log.filter((entry) => match.test(entry.key) && (device === undefined || entry.device === device)).length;
}

export async function emailOf(server: ChaosServer, userId: string): Promise<string> {
  const user = await server.seeded.raw("users").findOne({ _id: userId });
  return String(user?.email);
}
