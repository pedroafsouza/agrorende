import { z } from "zod";
import { DutyStatusEnum, OrgStatusEnum } from "./enums.js";
import { ActivityEventDTOSchema } from "./dto/activityEvents.js";
import { NotificationDTOSchema } from "./dto/notifications.js";
import { EntityTypeEnum } from "./enums.js";
import { ERROR_CODES } from "./errors.js";

export const RealtimeClientEvents = {
  locationBatch: "location:batch",
  presencePing: "presence:ping",
} as const;
export type RealtimeClientEvent = (typeof RealtimeClientEvents)[keyof typeof RealtimeClientEvents];

export const RealtimeServerEvents = {
  operatorLocation: "operator:location",
  operatorPresence: "operator:presence",
  entityChanged: "entity:changed",
  activityNew: "activity:new",
  orgStatus: "org:status",
  notificationNew: "notification:new",
  syncPoke: "sync:poke",
} as const;
export type RealtimeServerEvent = (typeof RealtimeServerEvents)[keyof typeof RealtimeServerEvents];

export const OperatorStateEnum = z.enum(["OFFLINE", "IDLE", "EN_ROUTE", "ON_SITE", "WORKING", "ON_HOLD"]);
export type OperatorState = z.infer<typeof OperatorStateEnum>;

export const LocationFixSchema = z.object({
  recordedAt: z.string().datetime(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
  speedMps: z.number().optional(),
  heading: z.number().min(0).max(360).optional(),
  batteryLevel: z.number().min(0).max(1).optional(),
  workOrderId: z.string().uuid().optional(),
});
export type LocationFix = z.infer<typeof LocationFixSchema>;

export const LocationBatchPayloadSchema = z.object({
  fixes: z.array(LocationFixSchema).max(50),
});
export type LocationBatchPayload = z.infer<typeof LocationBatchPayloadSchema>;

export const LocationBatchAckSchema = z.object({
  ok: z.literal(true),
  accepted: z.number().int().nonnegative(),
});
export type LocationBatchAck = z.infer<typeof LocationBatchAckSchema>;

/** Negative ack for `location:batch`; the device keeps the fixes and retries over REST. */
export const LocationBatchNackSchema = z.object({
  ok: z.literal(false),
  code: z.enum(ERROR_CODES),
});
export type LocationBatchNack = z.infer<typeof LocationBatchNackSchema>;

export const PresencePingPayloadSchema = z.object({});
export type PresencePingPayload = z.infer<typeof PresencePingPayloadSchema>;

export const OperatorLocationPayloadSchema = z.object({
  userId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
  heading: z.number().min(0).max(360).optional(),
  speedMps: z.number().optional(),
  recordedAt: z.string().datetime(),
  state: OperatorStateEnum,
});
export type OperatorLocationPayload = z.infer<typeof OperatorLocationPayloadSchema>;

export const OperatorPresencePayloadSchema = z.object({
  userId: z.string().uuid(),
  online: z.boolean(),
  dutyStatus: DutyStatusEnum,
  lastSeenAt: z.string().datetime().optional(),
});
export type OperatorPresencePayload = z.infer<typeof OperatorPresencePayloadSchema>;

export const EntityChangedPayloadSchema = z.object({
  entityType: EntityTypeEnum,
  id: z.string().uuid(),
  status: z.string().optional(),
  version: z.string(),
});
export type EntityChangedPayload = z.infer<typeof EntityChangedPayloadSchema>;

export const OrgStatusPayloadSchema = z.object({
  status: OrgStatusEnum,
  trialEndsAt: z.string().datetime().optional(),
  pastDueAt: z.string().datetime().optional(),
  suspendedAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional(),
  purgeAfter: z.string().datetime().optional(),
});
export type OrgStatusPayload = z.infer<typeof OrgStatusPayloadSchema>;

export const SyncPokePayloadSchema = z.object({ reason: z.string() });
export type SyncPokePayload = z.infer<typeof SyncPokePayloadSchema>;

export const RedisRealtimeMessageSchema = z.object({
  eventId: z.string().uuid(),
  orgId: z.string().uuid(),
  rooms: z.array(z.string()),
  event: z.union([
    z.literal(RealtimeServerEvents.operatorLocation),
    z.literal(RealtimeServerEvents.operatorPresence),
    z.literal(RealtimeServerEvents.entityChanged),
    z.literal(RealtimeServerEvents.activityNew),
    z.literal(RealtimeServerEvents.orgStatus),
    z.literal(RealtimeServerEvents.notificationNew),
    z.literal(RealtimeServerEvents.syncPoke),
  ]),
  payload: z.unknown(),
});
export type RedisRealtimeMessage = z.infer<typeof RedisRealtimeMessageSchema>;

export const ServerPayloadSchemas = {
  [RealtimeServerEvents.operatorLocation]: OperatorLocationPayloadSchema,
  [RealtimeServerEvents.operatorPresence]: OperatorPresencePayloadSchema,
  [RealtimeServerEvents.entityChanged]: EntityChangedPayloadSchema,
  [RealtimeServerEvents.activityNew]: ActivityEventDTOSchema,
  [RealtimeServerEvents.orgStatus]: OrgStatusPayloadSchema,
  [RealtimeServerEvents.notificationNew]: NotificationDTOSchema,
  [RealtimeServerEvents.syncPoke]: SyncPokePayloadSchema,
} as const;

export function userRoom(userId: string): `user:${string}` {
  return `user:${userId}`;
}

/** Tenant room every socket of the organisation joins; `org:status` is sent here. */
export function orgRoom(orgId: string): `org:${string}` {
  return `org:${orgId}`;
}

export function opsRoom(orgId: string): `org:${string}:ops` {
  return `org:${orgId}:ops`;
}

export function realtimeRedisChannel(dbName: string): string {
  return dbName === "agrorende" ? "agrorende:events" : `agrorende:events:${dbName}`;
}
