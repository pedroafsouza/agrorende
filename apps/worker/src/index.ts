import { Redis } from "ioredis";
import { pino } from "pino";

import { readWorkerConfig } from "./config.js";
import { createWorkerHealthServer } from "./health.js";
import { createJobRuntime, createWorkerLogger, loadJobHandlers, loadWorkerPlatform } from "./jobs/index.js";
import { createExpoPushClient } from "./jobs/notifications.push.js";

/**
 * Worker entry (ARCHITECTURE §10, T05): one BullMQ worker per queue, repeatable jobs registered
 * with `upsertJobScheduler`, queues and Redis keys namespaced by `MONGODB_DB`, and a health
 * endpoint that checks Redis and `MEDIA_ROOT`. SIGTERM drains the workers before exiting.
 */

/** `APPLE_CLIENT_ID` has a non-secret default in `.env.example`, so the secrets decide whether revoke is enabled. */
const APPLE_SECRET_ENV = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"] as const;
const APPLE_ENV = [...APPLE_SECRET_ENV, "APPLE_CLIENT_ID"] as const;

const config = readWorkerConfig();
const dbName = process.env.MONGODB_DB ?? "agrorende";
const mediaRoot = process.env.MEDIA_ROOT ?? ".data/media";
const logger = createWorkerLogger(pino({ name: "worker", level: process.env.LOG_LEVEL ?? "info" }));

const isSet = (name: string): boolean => (process.env[name] ?? "").trim() !== "";
const appleSet = APPLE_ENV.filter(isSet);
if (APPLE_SECRET_ENV.some(isSet) && appleSet.length < APPLE_ENV.length) {
  throw new Error(`Apple revoke configuration is incomplete: missing ${APPLE_ENV.filter((name) => !appleSet.includes(name)).join(", ")}`);
}
if (!APPLE_SECRET_ENV.some(isSet)) {
  logger.warn("worker.apple.disabled", { reason: "APPLE_* variables are not set; auth.appleRevoke jobs will retry and fail" });
}

const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
const platform = await loadWorkerPlatform({
  dbName,
  mediaRoot,
  redis: connection,
  expo: createExpoPushClient(process.env.EXPO_ACCESS_TOKEN),
  logger,
});
const runtime = createJobRuntime({ connection, dbName, handlers: await loadJobHandlers(), platform, logger });
const health = createWorkerHealthServer(config.healthPort, connection, mediaRoot);

function stop(): void {
  const timer = setTimeout(() => {
    process.exit(1);
  }, config.shutdownGraceMs);
  timer.unref();
  void Promise.allSettled([runtime.stop(), health.stop()])
    .then(() => platform.close())
    .then(() => connection.quit())
    .finally(() => {
      clearTimeout(timer);
      process.exit(0);
    });
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await Promise.all([runtime.start(), health.start()]);
