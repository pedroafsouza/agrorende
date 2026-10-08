import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { Server, type Socket } from "socket.io";

import {
  LocationBatchPayloadSchema,
  PresencePingPayloadSchema,
  RealtimeClientEvents,
  RealtimeServerEvents,
  RedisRealtimeMessageSchema,
  ServerPayloadSchemas,
  opsRoom,
  realtimeRedisChannel,
  userRoom,
  type EntityChangedPayload,
  type LocationBatchAck,
  type LocationBatchPayload,
  type OperatorLocationPayload,
  type OperatorPresencePayload,
  type OrgStatusPayload,
  type PresencePingPayload,
  type SyncPokePayload,
} from "@agrorende/contracts/realtime";
import type { ActivityEventDTO, NotificationDTO } from "@agrorende/contracts/dto";
import { AppError } from "@agrorende/contracts/errors";

import { isOfficeRole, verifySocketToken, type SocketAuthPayload } from "./auth.js";
import type { RealtimeConfig } from "./config.js";
import { createFoundationHandlers, type RealtimeHandlers } from "./handlers.js";

type ClientToServerEvents = {
  [RealtimeClientEvents.locationBatch]: (payload: LocationBatchPayload, ack: (response: LocationBatchAck) => void) => void;
  [RealtimeClientEvents.presencePing]: (payload: PresencePingPayload) => void;
};

type ServerToClientEvents = {
  [RealtimeServerEvents.operatorLocation]: (payload: OperatorLocationPayload) => void;
  [RealtimeServerEvents.operatorPresence]: (payload: OperatorPresencePayload) => void;
  [RealtimeServerEvents.entityChanged]: (payload: EntityChangedPayload) => void;
  [RealtimeServerEvents.activityNew]: (payload: ActivityEventDTO) => void;
  [RealtimeServerEvents.orgStatus]: (payload: OrgStatusPayload) => void;
  [RealtimeServerEvents.notificationNew]: (payload: NotificationDTO) => void;
  [RealtimeServerEvents.syncPoke]: (payload: SyncPokePayload) => void;
};

type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface SocketData {
  readonly auth: SocketAuthPayload;
}

function writeJson(response: ServerResponse, status: number, body: Readonly<Record<string, unknown>>): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function handleHealth(request: IncomingMessage, response: ServerResponse, redis: Redis): Promise<void> {
  if (request.method !== "GET" || (request.url !== "/health" && request.url !== "/api/v1/health")) {
    writeJson(response, 404, { ok: false, app: "agrorende" });
    return;
  }

  try {
    await redis.ping();
    writeJson(response, 200, { ok: true, app: "agrorende", service: "realtime", redis: "ok" });
  } catch (error) {
    writeJson(response, 503, {
      ok: false,
      app: "agrorende",
      service: "realtime",
      redis: "error",
      message: error instanceof Error ? error.message : "Redis health check failed",
    });
  }
}

function getAuthToken(socket: RealtimeSocket): string {
  const token = socket.handshake.auth.token;
  if (typeof token !== "string" || token.trim() === "") {
    throw new AppError("UNAUTHENTICATED", { message: "Missing realtime socket token" });
  }
  return token;
}

function emitRedisMessage(io: Server<ClientToServerEvents, ServerToClientEvents>, raw: string): void {
  const message = RedisRealtimeMessageSchema.parse(JSON.parse(raw) as unknown);
  const target = io.to(message.rooms);

  switch (message.event) {
    case RealtimeServerEvents.operatorLocation:
      target.emit(message.event, ServerPayloadSchemas[message.event].parse(message.payload));
      break;
    case RealtimeServerEvents.operatorPresence:
      target.emit(message.event, ServerPayloadSchemas[message.event].parse(message.payload));
      break;
    case RealtimeServerEvents.entityChanged:
      target.emit(message.event, ServerPayloadSchemas[message.event].parse(message.payload));
      break;
    case RealtimeServerEvents.activityNew:
      target.emit(message.event, ServerPayloadSchemas[message.event].parse(message.payload));
      break;
    case RealtimeServerEvents.orgStatus:
      target.emit(message.event, ServerPayloadSchemas[message.event].parse(message.payload));
      break;
    case RealtimeServerEvents.notificationNew:
      target.emit(message.event, ServerPayloadSchemas[message.event].parse(message.payload));
      break;
    case RealtimeServerEvents.syncPoke:
      target.emit(message.event, ServerPayloadSchemas[message.event].parse(message.payload));
      break;
  }
}

function registerSocketHandlers(socket: RealtimeSocket, handlers: RealtimeHandlers): void {
  const data = socket.data as SocketData;

  socket.on(RealtimeClientEvents.locationBatch, (payload, ack) => {
    void handlers
      .ingestLocationBatch(data.auth, LocationBatchPayloadSchema.parse(payload))
      .then(ack)
      .catch((error: unknown) => {
        socket.emit(RealtimeServerEvents.syncPoke, {
          reason: error instanceof Error ? error.message : "location batch failed",
        });
      });
  });

  socket.on(RealtimeClientEvents.presencePing, (payload) => {
    void handlers.recordPresencePing(data.auth, PresencePingPayloadSchema.parse(payload));
  });
}

export interface RealtimeServerRuntime {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export function createRealtimeServer(config: RealtimeConfig, handlers: RealtimeHandlers = createFoundationHandlers()): RealtimeServerRuntime {
  const redisPublisher = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
  const redisSubscriber = redisPublisher.duplicate();
  const socketAdapterSubscriber = redisPublisher.duplicate();
  const httpServer = createServer((request, response) => {
    void handleHealth(request, response, redisPublisher);
  });
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: config.corsOrigins.length === 0 ? false : [...config.corsOrigins] },
  });

  io.adapter(createAdapter(redisPublisher, socketAdapterSubscriber));

  io.use((socket, next) => {
    void verifySocketToken(getAuthToken(socket), config.jwtSecret)
      .then((auth) => {
        socket.data = { auth } satisfies SocketData;
        next();
      })
      .catch((error: unknown) => {
        next(error instanceof Error ? error : new Error("UNAUTHENTICATED"));
      });
  });

  io.on("connection", (socket) => {
    const data = socket.data as SocketData;
    void socket.join(userRoom(data.auth.userId));
    if (isOfficeRole(data.auth.role)) {
      void socket.join(opsRoom(data.auth.orgId));
    }
    registerSocketHandlers(socket, handlers);
  });

  return {
    async start() {
      await redisSubscriber.subscribe(realtimeRedisChannel(config.mongoDbName));
      redisSubscriber.on("message", (_channel: string, raw: string) => {
        emitRedisMessage(io, raw);
      });
      await new Promise<void>((resolve) => {
        httpServer.listen(config.port, resolve);
      });
    },
    async stop() {
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
      await Promise.all([redisSubscriber.quit(), socketAdapterSubscriber.quit(), redisPublisher.quit()]);
    },
  };
}
