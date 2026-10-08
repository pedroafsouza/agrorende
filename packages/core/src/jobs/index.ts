import { getDatabaseName } from "@agrorende/db";
import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";

/**
 * Producer side of the BullMQ jobs of ARCHITECTURE §10. The worker (`apps/worker/src/jobRegistry.ts`)
 * owns the schedules and processors; the names and queue names here must match it, which the
 * worker's registry test checks.
 */
export const JOB_NAMES = [
  "usage.daily",
  "orgs.lifecycle",
  "orgs.purge",
  "auth.appleRevoke",
  "events.dispatch",
  "notifications.push",
  "rentals.overdueScan",
  "workOrders.slaScan",
  "devices.staleSync",
  "media.cleanupPending",
  "locations.prune",
  "mutations.prune",
  "diagnostics.prune",
  "exports.build",
  "tombstones.prune",
  "pdf.render",
  "maintenance.dueScan",
  "stock.lowScan",
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export type JobQueueName = "default" | "events" | "notifications" | "maintenance" | "exports" | "media";

export const JOB_QUEUES = {
  "usage.daily": "default",
  "orgs.lifecycle": "default",
  "orgs.purge": "default",
  "auth.appleRevoke": "default",
  "events.dispatch": "events",
  "notifications.push": "notifications",
  "rentals.overdueScan": "default",
  "workOrders.slaScan": "default",
  "devices.staleSync": "default",
  "media.cleanupPending": "media",
  "locations.prune": "default",
  "mutations.prune": "default",
  "diagnostics.prune": "default",
  "exports.build": "exports",
  "tombstones.prune": "default",
  "pdf.render": "exports",
  "maintenance.dueScan": "maintenance",
  "stock.lowScan": "maintenance",
} as const satisfies Record<JobName, JobQueueName>;

/** BullMQ prefix: `agrorende` for the default database and `agrorende:<MONGODB_DB>` otherwise. */
export function jobQueuePrefix(dbName: string = getDatabaseName()): string {
  return dbName === "agrorende" ? "agrorende" : `agrorende:${dbName}`;
}

export interface EnqueueOptions {
  /** Deduplication key; events use `jobId = event._id`. */
  readonly jobId?: string;
  readonly delayMs?: number;
}

let connection: Redis | null = null;
const queues = new Map<string, Queue>();

function jobsRedis(): Redis {
  if (connection === null) {
    const url = process.env.REDIS_URL;
    if (url === undefined || url.trim().length === 0) {
      throw new Error("REDIS_URL is required.");
    }
    connection = new Redis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

/** Replaces the Redis connection used by `enqueueJob` (tests, or a process that already has one). */
export function setJobsRedis(client: Redis | null): void {
  connection = client;
  queues.clear();
}

function queueFor(queueName: JobQueueName, dbName: string): Queue {
  const key = `${dbName}|${queueName}`;
  let queue = queues.get(key);
  if (queue === undefined) {
    queue = new Queue(queueName, { connection: jobsRedis(), prefix: jobQueuePrefix(dbName) });
    queues.set(key, queue);
  }
  return queue;
}

/** Adds one job with the worker's retry policy (5 attempts, exponential backoff from 1 s). */
export async function enqueueJob(name: JobName, payload: Readonly<Record<string, unknown>>, options: EnqueueOptions = {}): Promise<void> {
  const jobOptions: JobsOptions = {
    attempts: 5,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
    ...(options.jobId === undefined ? {} : { jobId: options.jobId }),
    ...(options.delayMs === undefined ? {} : { delay: options.delayMs }),
  };
  await queueFor(JOB_QUEUES[name], getDatabaseName()).add(name, { ...payload }, jobOptions);
}

/** Closes the producer queues and the connection this module opened. */
export async function closeJobQueues(): Promise<void> {
  const open = [...queues.values()];
  queues.clear();
  await Promise.all(open.map((queue) => queue.close()));
  const client = connection;
  connection = null;
  if (client !== null) await client.quit();
}
