import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";
import { SignJWT } from "jose";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { opsRoom, realtimeRedisChannel, userRoom } from "@agrorende/contracts/realtime";

import { closeClient, collections } from "../../../packages/db/src/index.js";
import { setupTestDb, type TestDbHandle } from "../../../packages/db/src/testing/setupTestDb.js";
import { liveKey, liveSnapshot, presenceKey } from "../../../packages/core/src/modules/locations/index.js";
import { EventIdCache } from "./dedupe.js";
import { createJsonLogger } from "./logger.js";
import { createRealtimeServer, orgRoom, type RealtimeServerRuntime } from "./server.js";

const SECRET = "t05-realtime-test-secret-with-enough-length";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const ORG = "0190f5a0-0000-7000-8000-0000000ca001";
const OTHER_ORG = "0190f5a0-0000-7000-8000-0000000ca002";
const ADMIN = "0190f5a0-0000-7000-8000-0000000cb001";
const MANAGER = "0190f5a0-0000-7000-8000-0000000cb002";
const FIELD = "0190f5a0-0000-7000-8000-0000000cb003";
const OTHER_ADMIN = "0190f5a0-0000-7000-8000-0000000cb004";

type Role = "ADMIN" | "MANAGER" | "FIELD";

async function token(userId: string, orgId: string, role: Role, audience = "realtime", secret = SECRET): Promise<string> {
  return new SignJWT({ orgId, role, deviceId: role === "FIELD" ? "device-1" : undefined })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}

let handle: TestDbHandle;
let dbName: string;
let publisher: Redis;
let gatewayA: RealtimeServerRuntime;
let gatewayB: RealtimeServerRuntime;
const clients: ClientSocket[] = [];
const logLines: string[] = [];

function start(): RealtimeServerRuntime {
  return createRealtimeServer(
    { port: 0, corsOrigins: [], redisUrl: REDIS_URL, jwtSecret: SECRET, mongoDbName: dbName },
    { logger: createJsonLogger("realtime-test", (line) => logLines.push(line)) },
  );
}

function open(gateway: RealtimeServerRuntime, authToken?: string): ClientSocket {
  const socket = connect(`http://127.0.0.1:${gateway.port()}`, {
    transports: ["websocket"],
    auth: authToken === undefined ? {} : { token: authToken },
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  return socket;
}

async function connected(socket: ClientSocket): Promise<ClientSocket> {
  if (socket.connected) return socket;
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

async function connectAs(gateway: RealtimeServerRuntime, userId: string, orgId: string, role: Role): Promise<ClientSocket> {
  return connected(open(gateway, await token(userId, orgId, role)));
}

function record(socket: ClientSocket, event: string): unknown[] {
  const seen: unknown[] = [];
  socket.on(event, (payload: unknown) => seen.push(payload));
  return seen;
}

async function publish(rooms: string[], event: string, payload: unknown, options: { orgId?: string; eventId?: string; channel?: string } = {}): Promise<void> {
  await publisher.publish(
    options.channel ?? realtimeRedisChannel(dbName),
    JSON.stringify({ eventId: options.eventId ?? randomUUID(), orgId: options.orgId ?? ORG, rooms, event, payload }),
  );
}

const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

function userDoc(id: string, orgId: string, role: Role, name: string) {
  const now = new Date();
  return {
    _id: id,
    organizationId: orgId,
    syncVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name,
    role,
    skills: [],
    locale: "pt-BR",
    isActive: true,
    mustChangePassword: false,
    dutyStatus: "ON_DUTY",
    scopeEpoch: 0,
  } as never;
}

describe("realtime gateway", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI ??= "mongodb://localhost:27017/?directConnection=true";
    handle = await setupTestDb("agrorende_t05_realtime");
    dbName = handle.db.databaseName;
    publisher = new Redis(REDIS_URL);
    gatewayA = start();
    gatewayB = start();
    await Promise.all([gatewayA.start(), gatewayB.start()]);
  });

  afterAll(async () => {
    for (const socket of clients) socket.disconnect();
    await Promise.all([gatewayA.stop(), gatewayB.stop()]);
    await publisher.del(liveKey(ORG, dbName), presenceKey(ORG, dbName));
    await publisher.quit();
    await handle.drop();
    await closeClient();
  });

  beforeEach(async () => {
    for (const socket of clients.splice(0)) socket.disconnect();
    await handle.truncate();
    await collections.users(handle.db).insertMany([
      userDoc(ADMIN, ORG, "ADMIN", "Alice"),
      userDoc(MANAGER, ORG, "MANAGER", "Marcos"),
      userDoc(FIELD, ORG, "FIELD", "Fábio"),
      userDoc(OTHER_ADMIN, OTHER_ORG, "ADMIN", "Olga"),
    ]);
  });

  it("answers the health probe with the captive-portal shape", async () => {
    const response = await fetch(`http://127.0.0.1:${gatewayA.port()}/api/v1/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, app: "agrorende" });
  });

  it("rejects missing, forged and wrong-audience tokens", async () => {
    const attempts = [undefined, await token(ADMIN, ORG, "ADMIN", "realtime", "another-secret-of-sufficient-length"), await token(ADMIN, ORG, "ADMIN", "web")];
    for (const attempt of attempts) {
      const socket = open(gatewayA, attempt);
      const error = await new Promise<Error>((resolve) => socket.once("connect_error", resolve));
      expect(error.message).toBe("UNAUTHENTICATED");
    }
    expect(logLines.join("")).not.toContain("eyJ");
  });

  it("relays through Redis to sockets on both instances, once each, honouring tenant and ops rooms", async () => {
    const admin = await connectAs(gatewayA, ADMIN, ORG, "ADMIN");
    const manager = await connectAs(gatewayB, MANAGER, ORG, "MANAGER");
    const field = await connectAs(gatewayA, FIELD, ORG, "FIELD");
    const otherAdmin = await connectAs(gatewayB, OTHER_ADMIN, OTHER_ORG, "ADMIN");
    const seen = [admin, manager, field, otherAdmin].map((socket) => record(socket, "entity:changed"));
    await settle(100);

    await publish([opsRoom(ORG)], "entity:changed", { entityType: "WORK_ORDER", id: randomUUID(), version: "7" });
    await settle();
    expect(seen.map((events) => events.length)).toEqual([1, 1, 0, 0]);
  });

  it("only receives events published on its own database channel", async () => {
    const admin = await connectAs(gatewayA, ADMIN, ORG, "ADMIN");
    const entity = record(admin, "entity:changed");
    const activity = record(admin, "activity:new");
    const notifications = record(admin, "notification:new");
    await settle(100);
    const payload = { entityType: "ASSET", id: randomUUID(), version: "1" };
    await publish([opsRoom(ORG)], "entity:changed", payload, { channel: "agrorende:events" });
    await publish([opsRoom(ORG)], "entity:changed", payload, { channel: realtimeRedisChannel("agrorende_t05_someone_else") });
    await publish([opsRoom(ORG)], "entity:changed", payload);
    await settle();
    expect(entity).toHaveLength(1);
    expect(activity).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });

  it("delivers a duplicated outbox event once and drops cross-tenant room targets", async () => {
    const admin = await connectAs(gatewayA, ADMIN, ORG, "ADMIN");
    const manager = await connectAs(gatewayB, MANAGER, ORG, "MANAGER");
    const seenA = record(admin, "sync:poke");
    const seenB = record(manager, "sync:poke");
    await settle(100);
    const eventId = randomUUID();
    await publish([userRoom(ADMIN), userRoom(MANAGER)], "sync:poke", { reason: "test" }, { eventId });
    await publish([userRoom(ADMIN), userRoom(MANAGER)], "sync:poke", { reason: "test" }, { eventId });
    await publish([opsRoom(ORG)], "sync:poke", { reason: "spoof" }, { orgId: OTHER_ORG });
    await settle();
    expect(seenA).toEqual([{ reason: "test" }]);
    expect(seenB).toEqual([{ reason: "test" }]);
  });

  it("broadcasts org:status to every device of the tenant only", async () => {
    const field = await connectAs(gatewayA, FIELD, ORG, "FIELD");
    const manager = await connectAs(gatewayB, MANAGER, ORG, "MANAGER");
    const otherAdmin = await connectAs(gatewayB, OTHER_ADMIN, OTHER_ORG, "ADMIN");
    const seen = [field, manager, otherAdmin].map((socket) => record(socket, "org:status"));
    await settle(100);
    await publish([orgRoom(ORG)], "org:status", { status: "PAST_DUE", pastDueAt: new Date().toISOString() });
    await settle();
    expect(seen.map((events) => events.length)).toEqual([1, 1, 0]);
  });

  it("acks a location batch, updates the live snapshot and notifies the ops room", async () => {
    const admin = await connectAs(gatewayB, ADMIN, ORG, "ADMIN");
    const presence = record(admin, "operator:presence");
    const locations = record(admin, "operator:location");
    const field = await connectAs(gatewayA, FIELD, ORG, "FIELD");
    await settle(150);
    expect(presence).toEqual([expect.objectContaining({ userId: FIELD, online: true, dutyStatus: "ON_DUTY" })]);

    const recordedAt = new Date(Date.now() - 10_000).toISOString();
    const ack = (await field.timeout(5_000).emitWithAck("location:batch", { fixes: [{ recordedAt, lat: -23.55, lng: -46.63, accuracyM: 8 }] })) as unknown;
    expect(ack).toEqual({ ok: true, accepted: 1 });
    const nack = (await field.timeout(5_000).emitWithAck("location:batch", { fixes: [{ lat: 1000 }] })) as unknown;
    expect(nack).toEqual({ ok: false, code: "VALIDATION_FAILED" });
    field.emit("presence:ping", {});
    await settle();

    expect(locations).toEqual([expect.objectContaining({ userId: FIELD, lat: -23.55, lng: -46.63, state: "IDLE" })]);
    const snapshot = await liveSnapshot(ORG, { redis: publisher, dbName, db: handle.db });
    expect(snapshot).toEqual([expect.objectContaining({ userId: FIELD, name: "Fábio", lat: -23.55, state: "IDLE", dutyStatus: "ON_DUTY" })]);

    field.disconnect();
    await settle(400);
    expect(presence.at(-1)).toEqual(expect.objectContaining({ userId: FIELD, online: false }));
  });

  it("flushes buffered pings to MongoDB on graceful shutdown", async () => {
    const gateway = start();
    await gateway.start();
    const field = await connectAs(gateway, FIELD, ORG, "FIELD");
    const ack = (await field.timeout(5_000).emitWithAck("location:batch", {
      fixes: [{ recordedAt: new Date(Date.now() - 5_000).toISOString(), lat: 1, lng: 2 }],
    })) as unknown;
    expect(ack).toEqual({ ok: true, accepted: 1 });
    field.disconnect();
    await gateway.stop();
    expect(await collections.locationPings(handle.db).countDocuments({ organizationId: ORG, userId: FIELD })).toBe(1);
  });
});

describe("EventIdCache", () => {
  it("remembers ids up to its capacity", () => {
    const cache = new EventIdCache(2);
    expect(cache.remember("a")).toBe(true);
    expect(cache.remember("a")).toBe(false);
    cache.remember("b");
    cache.remember("c");
    expect(cache.size).toBe(2);
    expect(cache.remember("a")).toBe(true);
  });
});
