import { randomUUID } from "node:crypto";

import { getDatabaseName } from "@agrorende/db";
import { realtimeRedisChannel, type RedisRealtimeMessage } from "@agrorende/contracts/realtime";
import type { Redis } from "ioredis";

/**
 * Publishes one message on the database-aware realtime channel
 * (`agrorende:events` or `agrorende:events:<MONGODB_DB>`). The gateway relays it to `rooms`.
 */
export async function publishRealtime(
  redis: Redis,
  message: Omit<RedisRealtimeMessage, "eventId"> & { readonly eventId?: string },
  dbName: string = getDatabaseName(),
): Promise<void> {
  const body: RedisRealtimeMessage = { ...message, eventId: message.eventId ?? randomUUID() };
  await redis.publish(realtimeRedisChannel(dbName), JSON.stringify(body));
}
