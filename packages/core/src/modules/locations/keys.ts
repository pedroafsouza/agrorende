import { getDatabaseName } from "@agrorende/db";

/**
 * Redis keys used by the location pipeline (ARCHITECTURE §7.8 and §9).
 *
 * The canonical names are `live:<orgId>` and `presence:<orgId>`. When `MONGODB_DB` is not
 * `agrorende` (tests, the E2E stack), every key is prefixed with `<MONGODB_DB>:` so that
 * parallel stacks sharing one Redis never read each other's live data, matching the
 * database-aware `agrorende:events:<MONGODB_DB>` channel.
 */
export function redisNamespace(dbName: string = getDatabaseName()): string {
  return dbName === "agrorende" ? "" : `${dbName}:`;
}

export function liveKey(orgId: string, dbName?: string): string {
  return `${redisNamespace(dbName)}live:${orgId}`;
}

export function presenceKey(orgId: string, dbName?: string): string {
  return `${redisNamespace(dbName)}presence:${orgId}`;
}

export function locationThrottleKey(orgId: string, userId: string, dbName?: string): string {
  return `${redisNamespace(dbName)}live-throttle:${orgId}:${userId}`;
}
