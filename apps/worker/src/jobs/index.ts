import { collection as dbCollection, type CollectionName } from "@agrorende/db";
import { Queue, Worker, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";

import { JOB_NAMES, JOB_REGISTRY, QUEUE_NAMES, type JobDefinition, type JobName, type QueueName } from "../jobRegistry.js";
import type { ExpoPushClient } from "./notifications.push.js";

/**
 * Worker job platform (T05).
 *
 * Every job of ARCHITECTURE §10 is registered here. T05 jobs are imported statically. Jobs owned
 * by other tasks are loaded from `apps/worker/src/jobs/<job name>.ts` when that file exists and
 * exports `handler: JobHandler`; until then the job runs an explicit no-op. Owners add their file
 * and nothing else: there is no list to edit here.
 */

export type Doc = Record<string, unknown>;

export interface WorkerCursor {
  toArray(): Promise<Doc[]>;
}

/** The subset of the MongoDB collection API that platform jobs use. */
export interface WorkerCollection {
  find(filter: Doc, options?: Doc): WorkerCursor;
  findOne(filter: Doc, options?: Doc): Promise<Doc | null>;
  findOneAndUpdate(filter: Doc, update: Doc, options?: Doc): Promise<Doc | null>;
  insertOne(doc: Doc): Promise<unknown>;
  insertMany(docs: Doc[]): Promise<unknown>;
  updateOne(filter: Doc, update: Doc, options?: Doc): Promise<{ matchedCount: number; modifiedCount: number }>;
  updateMany(filter: Doc, update: Doc, options?: Doc): Promise<{ matchedCount: number; modifiedCount: number }>;
  deleteMany(filter: Doc): Promise<{ deletedCount: number }>;
  countDocuments(filter: Doc, options?: Doc): Promise<number>;
  aggregate(pipeline: Doc[]): WorkerCursor;
}

export interface ObjectStore {
  put(key: string, body: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export interface NotifyInput {
  readonly type: string;
  readonly userIds: string[];
  readonly entity: { readonly entityType: string; readonly entityId: string };
  readonly params: Record<string, string | number>;
}

export interface ExportBuildSummary {
  readonly built: boolean;
  readonly status?: string;
}

export interface ExportRunner {
  build(jobId: string): Promise<ExportBuildSummary>;
  runQueued(max?: number): Promise<ExportBuildSummary[]>;
  expire(): Promise<number>;
}

export interface AppleRevokeInput {
  readonly orgId: string;
  readonly identityId: string;
}

/** Structured logger; fields must never contain tokens, coordinates or other personal data. */
export interface WorkerLogger {
  info(event: string, fields?: Doc): void;
  warn(event: string, fields?: Doc): void;
  error(event: string, fields?: Doc): void;
}

export interface WorkerPlatform {
  readonly dbName: string;
  /** Redis key prefix for worker state, namespaced by `MONGODB_DB`. */
  readonly keyPrefix: string;
  readonly mediaRoot: string;
  readonly redis: Redis;
  /** A collection of the platform database, resolved through the `@agrorende/db` accessor. */
  readonly table: (name: string) => WorkerCollection;
  readonly store: ObjectStore;
  /** Creates notifications (and their outbox events) through the T02 notifications seam. */
  readonly notify: (orgId: string, input: NotifyInput) => Promise<void>;
  /** Allocates the next `SyncCounter` version of an organisation for maintenance writes. */
  readonly nextSyncVersion: (orgId: string) => Promise<number>;
  /** Collections whose documents carry `syncVersion` and `deletedAt` (soft-delete tombstones). */
  readonly syncedCollections: readonly string[];
  readonly pruneLocationPings: (now: Date) => Promise<{ deleted: number; chunks: number }>;
  readonly exports: ExportRunner;
  readonly expo: ExpoPushClient;
  readonly appleRevoke: (input: AppleRevokeInput) => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface JobContext {
  readonly platform: WorkerPlatform;
  readonly logger: WorkerLogger;
  readonly now: Date;
}

export interface WorkerJob {
  readonly id?: string;
  readonly name: string;
  readonly data: Doc;
  readonly attemptsMade?: number;
}

export type JobHandler = (ctx: JobContext, job: WorkerJob) => Promise<unknown>;

/** Tasks that own the job files T05 does not implement (DELIVERY-PLAN §3.1). */
export const PEER_JOB_OWNERS = {
  "usage.daily": "T20",
  "orgs.lifecycle": "T20",
  "orgs.purge": "T20",
  "events.dispatch": "T02",
  "rentals.overdueScan": "T08",
  "workOrders.slaScan": "T07",
  "pdf.render": "optional (MVP renders PDFs inline)",
  "maintenance.dueScan": "T14",
  "stock.lowScan": "T14",
} as const satisfies Partial<Record<JobName, string>>;

type PeerJobName = keyof typeof PEER_JOB_OWNERS;
type OwnJobName = Exclude<JobName, PeerJobName>;

export function workerKeyPrefix(dbName: string): string {
  return dbName === "agrorende" ? "agrorende" : `agrorende:${dbName}`;
}

/** BullMQ queue prefix: one namespace per `MONGODB_DB`, so parallel test databases never share queues. */
export function workerQueuePrefix(dbName: string): string {
  return workerKeyPrefix(dbName);
}

function isHandler(value: unknown): value is JobHandler {
  return typeof value === "function";
}

async function loadOwnHandlers(): Promise<Record<OwnJobName, JobHandler>> {
  const [push, stale, media, diagnostics, locations, mutations, tombstones, exportsBuild] = await Promise.all([
    import("./notifications.push.js"),
    import("./devices.staleSync.js"),
    import("./media.cleanupPending.js"),
    import("./diagnostics.prune.js"),
    import("./locations.prune.js"),
    import("./mutations.prune.js"),
    import("./tombstones.prune.js"),
    import("./exports.build.js"),
  ]);
  return {
    "notifications.push": push.handler,
    "devices.staleSync": stale.handler,
    "media.cleanupPending": media.handler,
    "diagnostics.prune": diagnostics.handler,
    "locations.prune": locations.handler,
    "mutations.prune": mutations.handler,
    "tombstones.prune": tombstones.handler,
    "exports.build": exportsBuild.handler,
    "auth.appleRevoke": appleRevokeHandler,
  };
}

/**
 * `auth.appleRevoke` registration (T05.10). The revoke itself is the T02 handler. Failures are
 * rethrown as a generic error so BullMQ retries with backoff, and nothing from the provider
 * response (which may echo the token) reaches the logs.
 */
export const appleRevokeHandler: JobHandler = async (ctx, job) => {
  const orgId = readString(job.data, "orgId");
  const identityId = readString(job.data, "identityId");
  if (orgId === undefined || identityId === undefined) {
    ctx.logger.warn("auth.appleRevoke.invalid", { jobId: job.id });
    return { revoked: false };
  }
  try {
    await ctx.platform.appleRevoke({ orgId, identityId });
  } catch (error) {
    ctx.logger.warn("auth.appleRevoke.retry", {
      jobId: job.id,
      orgId,
      identityId,
      attempt: (job.attemptsMade ?? 0) + 1,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    // The upstream error may echo the refresh token, so it is deliberately not attached as `cause`.
    // eslint-disable-next-line preserve-caught-error
    throw new Error("APPLE_REVOKE_FAILED");
  }
  ctx.logger.info("auth.appleRevoke.done", { jobId: job.id, orgId, identityId });
  return { revoked: true };
};

function noopHandler(name: PeerJobName): JobHandler {
  return async (ctx) => {
    ctx.logger.info("worker.job.noop", { job: name, owner: PEER_JOB_OWNERS[name] });
    return { skipped: true, owner: PEER_JOB_OWNERS[name] };
  };
}

/**
 * Peer job modules, imported with literal specifiers so bundlers resolve them at build time
 * (change request T18-002). The dynamic form keeps the import cycle with this module lazy: the
 * job files import helpers from here. Jobs without a module yet run the explicit no-op.
 */
const PEER_JOB_MODULES: Partial<Record<PeerJobName, () => Promise<Doc>>> = {
  "usage.daily": () => import("./usage.daily.js"),
  "orgs.lifecycle": () => import("./orgs.lifecycle.js"),
  "orgs.purge": () => import("./orgs.purge.js"),
  "events.dispatch": () => import("./events.dispatch.js"),
  "rentals.overdueScan": () => import("./rentals.overdueScan.js"),
  "workOrders.slaScan": () => import("./workOrders.slaScan.js"),
  "maintenance.dueScan": () => import("./maintenance.dueScan.js"),
  "stock.lowScan": () => import("./stock.lowScan.js"),
};

/** Resolves a handler for every job name; peer jobs without a module run an explicit no-op. */
export async function loadJobHandlers(): Promise<Record<JobName, JobHandler>> {
  const own = await loadOwnHandlers();
  const entries = await Promise.all(
    JOB_NAMES.map(async (name): Promise<[JobName, JobHandler]> => {
      if (!(name in PEER_JOB_OWNERS)) {
        return [name, own[name as OwnJobName]];
      }
      const peer = name as PeerJobName;
      const load = PEER_JOB_MODULES[peer];
      if (load === undefined) {
        return [name, noopHandler(peer)];
      }
      const loaded = await load();
      const handler = loaded.handler ?? loaded.default;
      if (!isHandler(handler)) {
        throw new Error(`Worker job module for ${name} must export handler(ctx, job)`);
      }
      return [name, handler];
    }),
  );
  return Object.fromEntries(entries) as Record<JobName, JobHandler>;
}

/** Extra repeatable schedules that T05 adds on top of `JOB_REGISTRY`. */
export const EXTRA_SCHEDULES = [
  { schedulerId: "exports.build.poll", name: "exports.build", every: 60_000, data: { poll: true } },
  { schedulerId: "notifications.push.receipts", name: "notifications.push", every: 15 * 60_000, data: { receiptsOnly: true } },
] as const satisfies readonly { schedulerId: string; name: JobName; every: number; data: Doc }[];

// ───────── Bridge to packages/db and packages/core ─────────
//
// The modules are imported by package name (`@agrorende/db`, `@agrorende/core/seams`,
// `@agrorende/core/modules/*`, change request T05-001). They are loaded lazily so that importing
// the job registry does not open a database client, and they are typed with the local structural
// interfaces below so that job code stays independent of the driver types.

interface DbModule {
  documentSchemas: Record<string, { shape?: Record<string, unknown> }>;
  getDb(): Promise<unknown>;
  closeClient(): Promise<void>;
  withSyncTx<T>(ctx: { orgId: string }, fn: (tx: unknown) => Promise<T>, db?: unknown): Promise<T>;
}

interface SeamsModule {
  notificationSeams: { create(tx: unknown, input: NotifyInput): Promise<void> };
}

interface LocationsModule {
  pruneLocationPings(options: { db: unknown; now: Date }): Promise<{ deleted: number; chunks: number }>;
}

interface ExportDepsLike {
  readonly db: unknown;
  readonly now?: Date;
  readonly store?: ObjectStore;
  readonly logger?: { info(msg: string, fields?: Doc): void; warn(msg: string, fields?: Doc): void; error(msg: string, fields?: Doc, error?: unknown): void };
}

interface ExportsModule {
  buildExportJob(jobId: string, deps: ExportDepsLike): Promise<ExportBuildSummary>;
  runQueuedExportJobs(deps: ExportDepsLike, max?: number): Promise<ExportBuildSummary[]>;
  expireExportJobs(deps: ExportDepsLike): Promise<number>;
  fsExportStore(root: string): ObjectStore;
  defaultExportStore(): ObjectStore;
}

interface AppleModule {
  revokeAppleRefreshToken: (input: AppleRevokeInput) => Promise<void>;
}

type DriverDb = Parameters<typeof dbCollection>[0];

/**
 * Typed `@agrorende/db` collection accessor seen through the structural `WorkerCollection`
 * interface. This is the only way worker code reaches a collection (ARCHITECTURE §11).
 */
export function workerTable(db: unknown, name: string): WorkerCollection {
  return dbCollection(db as DriverDb, name as CollectionName) as unknown as WorkerCollection;
}

/*
 * The local interfaces use `unknown` for the database handle and the transaction, while the
 * package signatures use the concrete driver types. The casts below are the single place where
 * the two views meet.
 */
export async function loadDbModule(): Promise<DbModule> {
  return (await import("@agrorende/db")) as unknown as DbModule;
}

/** Test helper: `@agrorende/db/testing`. */
export async function loadDbTesting(): Promise<{
  setupTestDb(name: string): Promise<{ db: { databaseName: string }; drop(): Promise<void>; truncate(): Promise<void> }>;
}> {
  return import("@agrorende/db/testing");
}

async function loadSeams(): Promise<SeamsModule> {
  return (await import("@agrorende/core/seams")) as unknown as SeamsModule;
}

async function loadLocations(): Promise<LocationsModule> {
  return (await import("@agrorende/core/modules/locations")) as unknown as LocationsModule;
}

async function loadExports(): Promise<ExportsModule> {
  return (await import("@agrorende/core/modules/exports")) as unknown as ExportsModule;
}

/** The T02 Apple revoke handler, imported through the `@agrorende/core/auth/apple` entry point (change request T18-002). */
async function resolveAppleRevoke(): Promise<(input: AppleRevokeInput) => Promise<void>> {
  const apple = (await import("@agrorende/core/auth/apple")) as AppleModule;
  return apple.revokeAppleRefreshToken;
}

export interface PlatformOptions {
  readonly dbName: string;
  readonly mediaRoot: string;
  readonly redis: Redis;
  readonly expo: ExpoPushClient;
  /** Database handle to use instead of `getDb()` (tests). */
  readonly db?: unknown;
  readonly store?: ObjectStore;
  readonly appleRevoke?: (input: AppleRevokeInput) => Promise<void>;
  readonly logger?: WorkerLogger;
}

export async function loadWorkerPlatform(options: PlatformOptions): Promise<WorkerPlatform> {
  const [dbModule, seams, locations, exportsModule] = await Promise.all([
    loadDbModule(),
    loadSeams(),
    loadLocations(),
    loadExports(),
  ]);
  const db = options.db ?? (await dbModule.getDb());
  const store = options.store ?? exportsModule.defaultExportStore();
  const logger = options.logger;
  const exportDeps = (): ExportDepsLike => ({
    db,
    store,
    logger: logger === undefined ? undefined : { info: logger.info, warn: logger.warn, error: (msg, fields) => logger.error(msg, fields) },
  });
  return {
    dbName: options.dbName,
    keyPrefix: workerKeyPrefix(options.dbName),
    mediaRoot: options.mediaRoot,
    redis: options.redis,
    table: (name) => workerTable(db, name),
    store,
    notify: async (orgId, input) => {
      await dbModule.withSyncTx({ orgId }, (tx) => seams.notificationSeams.create(tx, input), db);
    },
    nextSyncVersion: async (orgId) => {
      const counter = await workerTable(db, "sync_counters").findOneAndUpdate({ _id: orgId }, { $inc: { value: 1 }, $setOnInsert: { horizonVersion: 0 } }, { upsert: true, returnDocument: "after" });
      return Number(counter?.value ?? 0);
    },
    syncedCollections: Object.entries(dbModule.documentSchemas)
      .filter(([, schema]) => schema.shape !== undefined && "deletedAt" in schema.shape && "syncVersion" in schema.shape)
      .map(([name]) => name),
    pruneLocationPings: (now) => locations.pruneLocationPings({ db, now }),
    exports: {
      build: (jobId) => exportsModule.buildExportJob(jobId, exportDeps()),
      runQueued: (max) => exportsModule.runQueuedExportJobs(exportDeps(), max),
      expire: () => exportsModule.expireExportJobs(exportDeps()),
    },
    expo: options.expo,
    appleRevoke: options.appleRevoke ?? (await resolveAppleRevoke()),
    close: async () => {
      if (options.db === undefined) {
        await dbModule.closeClient();
      }
    },
  };
}

// ───────── Shared helpers for platform jobs ─────────

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

export function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export function readString(doc: Doc, key: string): string | undefined {
  const value = doc[key];
  return typeof value === "string" ? value : undefined;
}

export function readNumber(doc: Doc, key: string): number | undefined {
  const value = doc[key];
  return typeof value === "number" ? value : undefined;
}

export function readStringArray(doc: Doc, key: string): string[] | undefined {
  const value = doc[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

/** Deletes matching rows by id in chunks so a large backlog never runs as one long delete. */
export async function deleteInChunks(target: WorkerCollection, filter: Doc, chunkSize = 1_000): Promise<number> {
  let deleted = 0;
  for (;;) {
    const ids = (await target.find(filter, { projection: { _id: 1 }, limit: chunkSize }).toArray()).map((row) => row._id);
    if (ids.length === 0) {
      return deleted;
    }
    deleted += (await target.deleteMany({ _id: { $in: ids } })).deletedCount;
    if (ids.length < chunkSize) {
      return deleted;
    }
  }
}

// ───────── BullMQ runtime ─────────

function jobOptions(name: JobName): JobsOptions {
  const definition: JobDefinition = JOB_REGISTRY[name];
  return { attempts: definition.attempts, backoff: definition.backoff, removeOnComplete: 1_000, removeOnFail: 5_000 };
}

export interface JobRuntimeOptions {
  readonly connection: Redis;
  readonly dbName: string;
  readonly handlers: Record<JobName, JobHandler>;
  readonly platform: WorkerPlatform;
  readonly logger: WorkerLogger;
  /** Set to false to register schedules without consuming jobs (tests). */
  readonly consume?: boolean;
}

export interface JobRuntime {
  readonly prefix: string;
  readonly queues: Record<QueueName, Queue>;
  /** Registers every repeatable job with `upsertJobScheduler`; running it twice changes nothing. */
  schedule(): Promise<string[]>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function runJob(handlers: Record<JobName, JobHandler>, ctx: Omit<JobContext, "now">, job: WorkerJob): Promise<unknown> {
  if (!(JOB_NAMES as readonly string[]).includes(job.name)) {
    throw new Error(`Unknown worker job ${job.name}`);
  }
  return handlers[job.name as JobName]({ ...ctx, now: new Date() }, job);
}

export function createJobRuntime(options: JobRuntimeOptions): JobRuntime {
  const prefix = workerQueuePrefix(options.dbName);
  const { connection, logger } = options;
  const queues = Object.fromEntries(QUEUE_NAMES.map((queueName) => [queueName, new Queue(queueName, { connection, prefix })])) as Record<QueueName, Queue>;
  const workers: Worker[] = [];

  async function schedule(): Promise<string[]> {
    const ids: string[] = [];
    for (const name of JOB_NAMES) {
      const definition: JobDefinition = JOB_REGISTRY[name];
      if (definition.repeat !== undefined) {
        await queues[definition.queueName].upsertJobScheduler(name, definition.repeat, { name, data: {}, opts: jobOptions(name) });
        ids.push(name);
      }
    }
    for (const extra of EXTRA_SCHEDULES) {
      await queues[JOB_REGISTRY[extra.name].queueName].upsertJobScheduler(
        extra.schedulerId,
        { every: extra.every },
        { name: extra.name, data: { ...extra.data }, opts: jobOptions(extra.name) },
      );
      ids.push(extra.schedulerId);
    }
    return ids;
  }

  return {
    prefix,
    queues,
    schedule,
    async start() {
      const scheduled = await schedule();
      await queues[JOB_REGISTRY["events.dispatch"].queueName].add("events.dispatch", { startup: true }, jobOptions("events.dispatch"));
      if (options.consume !== false) {
        for (const queueName of QUEUE_NAMES) {
          const worker = new Worker(
            queueName,
            (job) => runJob(options.handlers, { platform: options.platform, logger }, { id: job.id, name: job.name, data: (job.data ?? {}) as Doc, attemptsMade: job.attemptsMade }),
            { connection, prefix },
          );
          worker.on("failed", (job, error) => {
            logger.error("worker.job.failed", { job: job?.name, jobId: job?.id, attempt: job?.attemptsMade, errorName: error.name, error: error.message });
          });
          workers.push(worker);
        }
      }
      logger.info("worker.started", { prefix, queues: [...QUEUE_NAMES], scheduled });
    },
    async stop() {
      await Promise.all(workers.splice(0).map((worker) => worker.close()));
      await Promise.all(Object.values(queues).map((queue) => queue.close()));
      logger.info("worker.stopped", { prefix });
    },
  };
}

// ───────── Logger ─────────

/** Keys whose values are always replaced before a log line is written. */
export const REDACTED_KEYS = ["token", "pushToken", "refreshToken", "accessToken", "authorization", "password", "secret", "lat", "lng", "payload"];

export function redactFields(fields: Doc | undefined): Doc | undefined {
  if (fields === undefined) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, REDACTED_KEYS.some((redacted) => key.toLowerCase().includes(redacted.toLowerCase())) ? "[redacted]" : value]),
  );
}

/** Wraps a pino-like base logger and redacts sensitive field names before writing. */
export function createWorkerLogger(base: { info(obj: object, msg: string): void; warn(obj: object, msg: string): void; error(obj: object, msg: string): void }): WorkerLogger {
  return {
    info: (event, fields) => base.info(redactFields(fields) ?? {}, event),
    warn: (event, fields) => base.warn(redactFields(fields) ?? {}, event),
    error: (event, fields) => base.error(redactFields(fields) ?? {}, event),
  };
}
