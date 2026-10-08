import type { Redis } from "ioredis";
import type { Logger } from "@agrorende/core";

import type { SocketAuthPayload } from "./auth.js";
import { createPingWriter, ingest, recordPresence, SOCKET_BATCH_MAX, type PingWriter } from "./core.js";

export interface RealtimeHandlers {
  readonly ingestLocationBatch: (ctx: SocketAuthPayload, payload: unknown) => Promise<{ accepted: number }>;
  readonly recordPresence: (ctx: SocketAuthPayload, presence: { online: boolean; publish: boolean }) => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface LocationHandlerOptions {
  readonly redis: Redis;
  readonly dbName: string;
  readonly logger: Logger;
  readonly flushMs?: number;
}

/** Socket handlers backed by the core locations module (`locations.ingest`, presence ZSET). */
export function createLocationHandlers(options: LocationHandlerOptions): RealtimeHandlers {
  const writer: PingWriter = createPingWriter({
    dbName: options.dbName,
    flushMs: options.flushMs,
    onError: (error) => options.logger.error("realtime.ping_flush_failed", {}, error),
  });
  const deps = { redis: options.redis, dbName: options.dbName };
  return {
    async ingestLocationBatch(ctx, payload) {
      const result = await ingest(
        { orgId: ctx.orgId, userId: ctx.userId, deviceId: ctx.deviceId },
        payload,
        { ...deps, maxFixes: SOCKET_BATCH_MAX, writer },
      );
      return { accepted: result.accepted };
    },
    async recordPresence(ctx, presence) {
      await recordPresence({ orgId: ctx.orgId, userId: ctx.userId }, presence, deps);
    },
    async close() {
      await writer.close();
    },
  };
}
