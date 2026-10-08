import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";

import type { Redis } from "ioredis";

export interface WorkerHealthServer {
  readonly port: () => number;
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export interface WorkerHealthStatus {
  readonly ok: boolean;
  readonly app: "agrorende";
  readonly service: "worker";
  readonly redis: "ok" | "error";
  readonly media: "ok" | "error";
}

/** Pings the shared Redis client and proves `MEDIA_ROOT` is writable (ARCHITECTURE §17). */
export async function checkWorkerHealth(redis: Pick<Redis, "ping">, mediaRoot: string): Promise<WorkerHealthStatus> {
  const [redisOk, mediaOk] = await Promise.all([
    redis.ping().then(
      (reply) => reply === "PONG",
      () => false,
    ),
    (async () => {
      const dir = join(mediaRoot, ".tmp");
      const probe = join(dir, `health-${process.pid}-${Date.now()}.tmp`);
      await mkdir(dir, { recursive: true });
      await writeFile(probe, "ok");
      await rm(probe, { force: true });
      return true;
    })().catch(() => false),
  ]);
  return { ok: redisOk && mediaOk, app: "agrorende", service: "worker", redis: redisOk ? "ok" : "error", media: mediaOk ? "ok" : "error" };
}

function writeJson(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

export function createWorkerHealthServer(port: number, redis: Pick<Redis, "ping">, mediaRoot: string): WorkerHealthServer {
  let server: Server | undefined;

  return {
    port() {
      const address = server?.address();
      return typeof address === "object" && address !== null ? address.port : port;
    },
    async start() {
      server = createServer((request, response) => {
        const path = (request.url ?? "").split("?")[0];
        if (request.method !== "GET" || (path !== "/health" && path !== "/api/v1/health")) {
          writeJson(response, 404, { ok: false, app: "agrorende" });
          return;
        }
        void checkWorkerHealth(redis, mediaRoot).then((status) => {
          writeJson(response, status.ok ? 200 : 503, status);
        });
      });
      await new Promise<void>((resolve) => {
        server?.listen(port, resolve);
      });
    },
    async stop() {
      if (server === undefined) {
        return;
      }
      const current = server;
      server = undefined;
      await new Promise<void>((resolve, reject) => {
        current.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
