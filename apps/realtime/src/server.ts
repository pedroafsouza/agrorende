import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { Server, type Socket } from "socket.io";

import {
  RealtimeClientEvents,
  RedisRealtimeMessageSchema,
  ServerPayloadSchemas,
  opsRoom,
  realtimeRedisChannel,
  userRoom,
  type LocationBatchAck,
  type RedisRealtimeMessage,
} from "@agrorende/contracts/realtime";
import { AppError, type ErrorCode } from "@agrorende/contracts/errors";
import { noopLogger, type Logger } from "@agrorende/core";

import { isOfficeRole, verifySocketToken, type SocketAuthPayload } from "./auth.js";
import type { RealtimeConfig } from "./config.js";
import { EventIdCache } from "./dedupe.js";
import { createLocationHandlers, type RealtimeHandlers } from "./handlers.js";

/** Negative ack for `location:batch`; the client keeps the fixes and retries over REST. */
export interface LocationBatchNack {
  readonly ok: false;
  readonly code: ErrorCode;
}

type AckFn = (response: LocationBatchAck | LocationBatchNack) => void;

type ClientToServerEvents = {
  [RealtimeClientEvents.locationBatch]: (payload: unknown, ack?: AckFn) => void;
  [RealtimeClientEvents.presencePing]: (payload?: unknown) => void;
};

type ServerToClientEvents = Record<string, (payload: unknown) => void>;

interface SocketData {
  auth: SocketAuthPayload;
}

type RealtimeIo = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Every socket joins its tenant room so `org:status` reaches all devices of the organisation. */
export function orgRoom(orgId: string): `org:${string}` {
  return `org:${orgId}`;
}

function writeJson(response: ServerResponse, status: number, body: Readonly<Record<string, unknown>>): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function handleHealth(request: IncomingMessage, response: ServerResponse, redis: Redis): Promise<void> {
  const url = request.url?.split("?")[0];
  if (request.method !== "GET" || (url !== "/health" && url !== "/api/v1/health")) {
    writeJson(response, 404, { ok: false, app: "agrorende" });
    return;
  }
  try {
    await redis.ping();
    writeJson(response, 200, { ok: true, app: "agrorende", service: "realtime", redis: "ok" });
  } catch {
    writeJson(response, 503, { ok: false, app: "agrorende", service: "realtime", redis: "error" });
  }
}

function errorCode(error: unknown): ErrorCode {
  return error instanceof AppError ? error.code : "INTERNAL";
}

/** Rooms named after an organisation must belong to the message's organisation. */
function roomsBelongToOrg(message: RedisRealtimeMessage): boolean {
  return message.rooms.every((room) => !room.startsWith("org:") || room === orgRoom(message.orgId) || room === opsRoom(message.orgId));
}

export interface RealtimeServerOptions {
  readonly handlers?: RealtimeHandlers;
  readonly logger?: Logger;
  readonly dedupeCapacity?: number;
}

export interface RealtimeServerRuntime {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  /** Bound port (useful when `config.port` is 0 in tests). */
  readonly port: () => number;
  readonly io: RealtimeIo;
}

export function createRealtimeServer(config: RealtimeConfig, options: RealtimeServerOptions = {}): RealtimeServerRuntime {
  const logger = options.logger ?? noopLogger;
  const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
  const adapterSubscriber = redis.duplicate();
  const eventSubscriber = redis.duplicate();
  const handlers = options.handlers ?? createLocationHandlers({ redis, dbName: config.mongoDbName, logger });
  const relayed = new EventIdCache(options.dedupeCapacity);
  const channel = realtimeRedisChannel(config.mongoDbName);

  const httpServer = createServer((request, response) => {
    void handleHealth(request, response, redis);
  });
  const io: RealtimeIo = new Server(httpServer, {
    transports: ["websocket"],
    cors: { origin: config.corsOrigins.length === 0 ? false : [...config.corsOrigins], credentials: true },
    serveClient: false,
  });
  io.adapter(createAdapter(redis, adapterSubscriber, { key: `socket.io:${config.mongoDbName}` }));

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth.token;
    if (typeof token !== "string" || token.trim() === "") {
      next(Object.assign(new Error("UNAUTHENTICATED"), { data: { code: "UNAUTHENTICATED" } }));
      return;
    }
    verifySocketToken(token, config.jwtSecret)
      .then((auth) => {
        socket.data.auth = auth;
        next();
      })
      .catch(() => {
        next(Object.assign(new Error("UNAUTHENTICATED"), { data: { code: "UNAUTHENTICATED" } }));
      });
  });

  function relay(raw: string): void {
    let message: RedisRealtimeMessage;
    try {
      message = RedisRealtimeMessageSchema.parse(JSON.parse(raw) as unknown);
    } catch {
      logger.warn("realtime.relay_invalid_message");
      return;
    }
    if (!relayed.remember(message.eventId)) return;
    if (!roomsBelongToOrg(message)) {
      logger.warn("realtime.relay_cross_org_rooms", { eventId: message.eventId, orgId: message.orgId });
      return;
    }
    const parsed = ServerPayloadSchemas[message.event].safeParse(message.payload);
    if (!parsed.success) {
      logger.warn("realtime.relay_invalid_payload", { eventId: message.eventId, event: message.event });
      return;
    }
    // Every gateway instance subscribes to the channel, so each one emits to its local sockets only.
    io.local.to(message.rooms).emit(message.event, parsed.data);
  }

  async function userStillConnected(userId: string): Promise<boolean> {
    try {
      return (await io.in(userRoom(userId)).fetchSockets()).length > 0;
    } catch {
      return false;
    }
  }

  function onConnection(socket: RealtimeSocket): void {
    const auth = socket.data.auth;
    void socket.join([userRoom(auth.userId), orgRoom(auth.orgId)]);
    if (isOfficeRole(auth.role)) void socket.join(opsRoom(auth.orgId));

    if (auth.role === "FIELD") {
      handlers.recordPresence(auth, { online: true, publish: true }).catch((error: unknown) => {
        logger.warn("realtime.presence_failed", { userId: auth.userId, code: errorCode(error) });
      });
    }

    socket.on(RealtimeClientEvents.locationBatch, (payload, ack) => {
      handlers
        .ingestLocationBatch(auth, payload)
        .then(({ accepted }) => {
          if (typeof ack === "function") ack({ ok: true, accepted });
        })
        .catch((error: unknown) => {
          const code = errorCode(error);
          if (code === "INTERNAL") logger.error("realtime.location_batch_failed", { userId: auth.userId }, error);
          if (typeof ack === "function") ack({ ok: false, code });
        });
    });

    socket.on(RealtimeClientEvents.presencePing, () => {
      handlers.recordPresence(auth, { online: true, publish: false }).catch((error: unknown) => {
        logger.warn("realtime.presence_failed", { userId: auth.userId, code: errorCode(error) });
      });
    });

    socket.on("disconnect", () => {
      if (auth.role !== "FIELD") return;
      void userStillConnected(auth.userId).then(async (connected) => {
        if (connected) return;
        await handlers.recordPresence(auth, { online: false, publish: true }).catch((error: unknown) => {
          logger.warn("realtime.presence_failed", { userId: auth.userId, code: errorCode(error) });
        });
      });
    });
  }

  io.on("connection", onConnection);

  let started = false;
  return {
    io,
    port() {
      const address = httpServer.address();
      return typeof address === "object" && address !== null ? (address as AddressInfo).port : config.port;
    },
    async start() {
      await Promise.all([redis, adapterSubscriber, eventSubscriber].map(async (client) => (client.status === "wait" ? client.connect() : undefined)));
      await redis.ping();
      eventSubscriber.on("message", (_channel: string, raw: string) => relay(raw));
      await eventSubscriber.subscribe(channel);
      await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(config.port, () => resolve());
      });
      started = true;
      logger.info("realtime.started", { port: this.port(), channel });
    },
    async stop() {
      if (started) {
        await new Promise<void>((resolve) => {
          io.close(() => resolve());
        });
      } else {
        httpServer.close();
      }
      await handlers.close().catch((error: unknown) => logger.error("realtime.handlers_close_failed", {}, error));
      await Promise.allSettled([eventSubscriber.quit(), adapterSubscriber.quit(), redis.quit()]);
      started = false;
      logger.info("realtime.stopped");
    },
  };
}
