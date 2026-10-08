import { createServer, type Server, type ServerResponse } from "node:http";

import Redis from "ioredis";

export interface WorkerHealthServer {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

function writeJson(response: ServerResponse, status: number, body: Readonly<Record<string, unknown>>): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export function createWorkerHealthServer(port: number, redisUrl: string): WorkerHealthServer {
  let server: Server | undefined;

  return {
    async start() {
      server = createServer((request, response) => {
        if (request.method !== "GET" || (request.url !== "/health" && request.url !== "/api/v1/health")) {
          writeJson(response, 404, { ok: false, app: "agrorende" });
          return;
        }
        const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
        void redis
          .connect()
          .then(() => redis.ping())
          .then(() => {
            writeJson(response, 200, { ok: true, app: "agrorende", service: "worker", redis: "ok" });
          })
          .catch((error: unknown) => {
            writeJson(response, 503, {
              ok: false,
              app: "agrorende",
              service: "worker",
              redis: "error",
              message: error instanceof Error ? error.message : "Redis health check failed",
            });
          })
          .finally(() => {
            void redis.quit();
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
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
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
