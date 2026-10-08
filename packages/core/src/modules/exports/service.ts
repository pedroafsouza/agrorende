import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Role } from "@agrorende/contracts/enums";
import { collections, getDb, withSyncTx } from "@agrorende/db";

import { reject } from "../../errors.js";
import { noopLogger, type Logger } from "../../logging.js";
import { notificationSeams } from "../../seams.js";
import type { Db } from "../locations/types.js";
import { csvLine, CSV_BOM, type CsvCell } from "./csv.js";
import {
  CreateExportInputSchema,
  DOWNLOAD_TTL_DAYS,
  EXPORT_LOCALES,
  ExportEntityEnum,
  ExportFiltersSchema,
  STALE_RUNNING_MS,
  STREAM_ROW_LIMIT,
  exportFileName,
  exportStorageKey,
  toExportJobDTO,
  type ExportEntity,
  type ExportFilters,
  type ExportJobDTO,
  type ExportJobDoc,
  type ExportLocale,
} from "./dto.js";
import { EXPORT_DEFINITIONS, type ExportColumn, type ExportEntityDef, type ExportRow } from "./entities.js";
import { BOOLEAN_LABELS, EXPORT_HEADERS } from "./headers.js";
import { defaultExportStore, type ExportStore } from "./storage.js";

export interface ExportCtx {
  readonly orgId: string;
  readonly userId: string;
  readonly role: Role;
  readonly locale?: string;
}

export type ExportNotifier = (job: { orgId: string; userId: string; jobId: string; entity: string; rowCount: number }) => Promise<void>;

export interface ExportDeps {
  readonly db: Db;
  readonly now?: Date;
  readonly store?: ExportStore;
  readonly notify?: ExportNotifier;
  readonly logger?: Logger;
  /** Optional hook to wake the worker; the worker also polls QUEUED jobs. */
  readonly enqueue?: (jobId: string) => Promise<void>;
  readonly streamLimit?: number;
}

interface RowCursor extends AsyncIterable<ExportRow> {
  close(): Promise<void>;
}

interface RowSource {
  find(filter: Record<string, unknown>, options: { sort: Record<string, 1 | -1>; batchSize?: number }): RowCursor;
  countDocuments(filter: Record<string, unknown>, options?: { limit?: number }): Promise<number>;
}

interface JobCollection {
  findOne(filter: Record<string, unknown>, options?: { sort?: Record<string, 1 | -1> }): Promise<ExportJobDoc | null>;
  insertOne(doc: ExportJobDoc): Promise<unknown>;
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options: { returnDocument: "after"; sort?: Record<string, 1 | -1> },
  ): Promise<ExportJobDoc | null>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ modifiedCount: number }>;
  find(filter: Record<string, unknown>, options?: { limit?: number }): { toArray(): Promise<ExportJobDoc[]> };
}

const StoredFiltersSchema = ExportFiltersSchema.extend({ locale: z.enum(EXPORT_LOCALES).optional() }).strict();

function jobs(db: Db): JobCollection {
  return collections.exportJobs(db) as unknown as JobCollection;
}

function rowsOf(db: Db, def: ExportEntityDef): RowSource {
  return collections[def.collection](db) as unknown as RowSource;
}

export function resolveLocale(locale: string | undefined): ExportLocale {
  if (locale === undefined) return "pt-BR";
  return (EXPORT_LOCALES as readonly string[]).includes(locale) ? (locale as ExportLocale) : locale.startsWith("en") ? "en" : "pt-BR";
}

export function exportDefinition(entity: string): ExportEntityDef {
  const parsed = ExportEntityEnum.safeParse(entity);
  if (!parsed.success) return reject("NOT_FOUND", { entity });
  return EXPORT_DEFINITIONS[parsed.data];
}

export function assertCanExport(role: Role, def: ExportEntityDef): void {
  if (!def.roles.includes(role)) reject("FORBIDDEN", { entity: def.entity });
}

export function parseExportFilters(input: unknown): ExportFilters {
  const parsed = ExportFiltersSchema.safeParse(input ?? {});
  if (!parsed.success) return reject("VALIDATION_FAILED", { issues: parsed.error.issues.map((issue) => ({ path: issue.path, code: issue.code })) });
  return parsed.data;
}

export function buildExportQuery(def: ExportEntityDef, orgId: string, filters: ExportFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { ...def.filter(filters), organizationId: orgId };
  if (def.softDelete) query.deletedAt = null;
  if (filters.from !== undefined || filters.to !== undefined) {
    const existing = query[def.dateField];
    const range: Record<string, unknown> = typeof existing === "object" && existing !== null ? { ...(existing as Record<string, unknown>) } : {};
    if (filters.from !== undefined) range.$gte = new Date(filters.from);
    if (filters.to !== undefined) range.$lte = new Date(filters.to);
    query[def.dateField] = range;
  }
  return query;
}

async function orgTimezone(db: Db, orgId: string): Promise<string> {
  const org = await collections.organizations(db).findOne({ _id: orgId }, { projection: { timezone: 1 } });
  return org?.timezone ?? "America/Sao_Paulo";
}

function cellFormatter(locale: ExportLocale, timeZone: string): (column: ExportColumn, row: ExportRow) => CsvCell {
  const decimal = locale === "pt-BR" ? "," : ".";
  const dates = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return (column, row) => {
    const value = column.value ? column.value(row) : row[column.key];
    if (value === null || value === undefined) return { raw: "" };
    switch (column.kind) {
      case "date":
        return value instanceof Date ? { raw: dates.format(value) } : { text: String(value) };
      case "cents":
        return typeof value === "number" ? { raw: (value / 100).toFixed(2).replace(".", decimal) } : { text: String(value) };
      case "number":
        return typeof value === "number" ? { raw: String(value).replace(".", decimal) } : { text: String(value) };
      case "bool":
        return { raw: value === true ? BOOLEAN_LABELS[locale].yes : BOOLEAN_LABELS[locale].no };
      case "text":
        return { text: typeof value === "string" ? value : String(value as string | number) };
    }
  };
}

export function exportHeaderLine(def: ExportEntityDef, locale: ExportLocale): string {
  return csvLine(def.columns.map((column) => ({ text: EXPORT_HEADERS[column.key][locale] })));
}

/** Streams the CSV (BOM, header, rows) in chunks of up to 500 lines, always scoped to the organisation. */
export async function* exportCsvChunks(
  db: Db,
  orgId: string,
  def: ExportEntityDef,
  filters: ExportFilters,
  locale: ExportLocale,
  timeZone?: string,
  stats?: { rows: number },
): AsyncGenerator<string> {
  const format = cellFormatter(locale, timeZone ?? (await orgTimezone(db, orgId)));
  yield CSV_BOM + exportHeaderLine(def, locale);
  const cursor = rowsOf(db, def).find(buildExportQuery(def, orgId, filters), { sort: { [def.dateField]: 1, _id: 1 }, batchSize: 1000 });
  let buffer = "";
  let lines = 0;
  try {
    for await (const row of cursor) {
      buffer += csvLine(def.columns.map((column) => format(column, row)));
      lines += 1;
      if (stats) stats.rows += 1;
      if (lines >= 500) {
        yield buffer;
        buffer = "";
        lines = 0;
      }
    }
  } finally {
    await cursor.close();
  }
  if (buffer.length > 0) yield buffer;
}

export function countExportRows(db: Db, orgId: string, def: ExportEntityDef, filters: ExportFilters, limit: number): Promise<number> {
  return rowsOf(db, def).countDocuments(buildExportQuery(def, orgId, filters), { limit });
}

export type ExportRequestResult =
  | { readonly kind: "stream"; readonly fileName: string; readonly chunks: AsyncIterable<string> }
  | { readonly kind: "job"; readonly job: ExportJobDTO; readonly created: boolean };

/** `GET /exports/:entity.csv`: streams up to 50 000 rows, otherwise starts (or reuses) an `ExportJob`. */
export async function requestExport(ctx: ExportCtx, entity: string, rawFilters: unknown, deps: ExportDeps): Promise<ExportRequestResult> {
  const def = exportDefinition(entity);
  assertCanExport(ctx.role, def);
  const filters = parseExportFilters(rawFilters);
  const limit = deps.streamLimit ?? STREAM_ROW_LIMIT;
  const count = await countExportRows(deps.db, ctx.orgId, def, filters, limit + 1);
  if (count <= limit) {
    return {
      kind: "stream",
      fileName: exportFileName(def.entity, deps.now ?? new Date()),
      chunks: exportCsvChunks(deps.db, ctx.orgId, def, filters, resolveLocale(ctx.locale)),
    };
  }
  const started = await startExportJob(ctx, def, filters, deps);
  return { kind: "job", ...started };
}

/** `POST /exports {entity, filters}`: always builds in the worker. */
export async function createExportJob(ctx: ExportCtx, input: unknown, deps: ExportDeps): Promise<{ job: ExportJobDTO; created: boolean }> {
  const parsed = CreateExportInputSchema.safeParse(input);
  if (!parsed.success) return reject("VALIDATION_FAILED", { issues: parsed.error.issues.map((issue) => ({ path: issue.path, code: issue.code })) });
  const def = EXPORT_DEFINITIONS[parsed.data.entity];
  assertCanExport(ctx.role, def);
  return startExportJob(ctx, def, parsed.data.filters, deps);
}

function canonicalFilters(filters: ExportFilters, locale: ExportLocale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(filters).sort()) {
    const value = filters[key as keyof ExportFilters];
    if (value !== undefined) out[key] = value;
  }
  out.locale = locale;
  return out;
}

async function startExportJob(
  ctx: ExportCtx,
  def: ExportEntityDef,
  filters: ExportFilters,
  deps: ExportDeps,
): Promise<{ job: ExportJobDTO; created: boolean }> {
  const now = deps.now ?? new Date();
  const stored = canonicalFilters(filters, resolveLocale(ctx.locale));
  const existing = await jobs(deps.db).findOne(
    { organizationId: ctx.orgId, requestedById: ctx.userId, entity: def.entity, filters: stored, status: { $in: ["QUEUED", "RUNNING"] } },
    { sort: { createdAt: -1 } },
  );
  if (existing) return { job: toExportJobDTO(existing, now), created: false };
  const doc: ExportJobDoc = {
    _id: randomUUID(),
    organizationId: ctx.orgId,
    requestedById: ctx.userId,
    entity: def.entity,
    filters: stored,
    status: "QUEUED",
    rowCount: null,
    mediaId: null,
    errorCode: null,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    expiresAt: null,
  };
  await jobs(deps.db).insertOne(doc);
  if (deps.enqueue) {
    try {
      await deps.enqueue(doc._id);
    } catch (error) {
      (deps.logger ?? noopLogger).warn("exports.enqueue_failed", { jobId: doc._id, reason: error instanceof Error ? error.message : "unknown" });
    }
  }
  return { job: toExportJobDTO(doc, now), created: true };
}

/**
 * `EXPORT_READY` notifier through the T02 notifications seam. The notification row and its
 * outbox event are written in one sync transaction, so devices pull it and push is dispatched.
 */
export function createExportReadyNotifier(db?: Db): ExportNotifier {
  return async (job) => {
    await withSyncTx(
      { orgId: job.orgId },
      (tx) =>
        notificationSeams.create(tx, {
          type: "EXPORT_READY",
          userIds: [job.userId],
          entity: { entityType: "EXPORT_JOB", entityId: job.jobId },
          params: { entity: job.entity, rowCount: job.rowCount },
        }),
      db,
    );
  };
}

export const notifyExportReady: ExportNotifier = createExportReadyNotifier();

export interface BuildResult {
  readonly built: boolean;
  readonly status?: "READY" | "FAILED";
  readonly rowCount?: number;
  readonly notified?: boolean;
}

function claimFilter(now: Date): Record<string, unknown> {
  return {
    $or: [{ status: "QUEUED" }, { status: "RUNNING", startedAt: { $lt: new Date(now.getTime() - STALE_RUNNING_MS) } }],
  };
}

async function buildClaimed(job: ExportJobDoc, deps: ExportDeps): Promise<BuildResult> {
  const now = deps.now ?? new Date();
  const logger = deps.logger ?? noopLogger;
  const store = deps.store ?? defaultExportStore();
  const notify = deps.notify ?? createExportReadyNotifier(deps.db);
  const running = { _id: job._id, status: "RUNNING", startedAt: job.startedAt };
  try {
    const def = exportDefinition(job.entity);
    const stored = StoredFiltersSchema.parse(job.filters ?? {});
    const { locale, ...filters } = stored;
    const chunks: string[] = [];
    const stats = { rows: 0 };
    for await (const chunk of exportCsvChunks(deps.db, job.organizationId, def, filters, resolveLocale(locale), undefined, stats)) {
      chunks.push(chunk);
    }
    const rowCount = stats.rows;
    await store.put(exportStorageKey(job.organizationId, job._id), new TextEncoder().encode(chunks.join("")));
    const finishedAt = deps.now ?? new Date();
    const result = await jobs(deps.db).updateOne(running, {
      $set: { status: "READY", rowCount, finishedAt, expiresAt: new Date(finishedAt.getTime() + DOWNLOAD_TTL_DAYS * 86_400_000) },
    });
    if (result.modifiedCount !== 1) return { built: false };
    let notified = false;
    try {
      await notify({ orgId: job.organizationId, userId: job.requestedById, jobId: job._id, entity: job.entity, rowCount });
      notified = true;
    } catch (error) {
      logger.warn("exports.notify_failed", { jobId: job._id, reason: error instanceof Error ? error.message : "unknown" });
    }
    logger.info("exports.ready", { jobId: job._id, entity: job.entity, rowCount });
    return { built: true, status: "READY", rowCount, notified };
  } catch (error) {
    logger.error("exports.build_failed", { jobId: job._id, entity: job.entity }, error);
    await jobs(deps.db).updateOne(running, { $set: { status: "FAILED", errorCode: "INTERNAL", finishedAt: now } });
    return { built: true, status: "FAILED" };
  }
}

/** Builds one job; a second call (or a concurrent worker) finds nothing to claim and does nothing. */
export async function buildExportJob(jobId: string, deps: ExportDeps): Promise<BuildResult> {
  const now = deps.now ?? new Date();
  const claimed = await jobs(deps.db).findOneAndUpdate(
    { _id: jobId, ...claimFilter(now) },
    { $set: { status: "RUNNING", startedAt: now } },
    { returnDocument: "after" },
  );
  if (!claimed) return { built: false };
  return buildClaimed(claimed, deps);
}

/** Worker poller: claims QUEUED (or abandoned RUNNING) jobs oldest first. */
export async function runQueuedExportJobs(deps: ExportDeps, max = 5): Promise<BuildResult[]> {
  const results: BuildResult[] = [];
  for (let index = 0; index < max; index += 1) {
    const now = deps.now ?? new Date();
    const claimed = await jobs(deps.db).findOneAndUpdate(claimFilter(now), { $set: { status: "RUNNING", startedAt: now } }, {
      returnDocument: "after",
      sort: { createdAt: 1 },
    });
    if (!claimed) break;
    results.push(await buildClaimed(claimed, deps));
  }
  return results;
}

/** Marks READY jobs past `expiresAt` as EXPIRED and deletes their files. */
export async function expireExportJobs(deps: ExportDeps, max = 500): Promise<number> {
  const now = deps.now ?? new Date();
  const store = deps.store ?? defaultExportStore();
  const due = await jobs(deps.db).find({ status: "READY", expiresAt: { $lte: now } }, { limit: max }).toArray();
  let expired = 0;
  for (const job of due) {
    await store.delete(exportStorageKey(job.organizationId, job._id)).catch(() => undefined);
    const result = await jobs(deps.db).updateOne({ _id: job._id, status: "READY" }, { $set: { status: "EXPIRED" } });
    expired += result.modifiedCount;
  }
  return expired;
}

async function visibleJob(ctx: ExportCtx, jobId: string, deps: ExportDeps): Promise<ExportJobDoc> {
  if (ctx.role !== "ADMIN" && ctx.role !== "MANAGER") return reject("FORBIDDEN");
  const job = await jobs(deps.db).findOne({ _id: jobId, organizationId: ctx.orgId });
  if (!job || (ctx.role !== "ADMIN" && job.requestedById !== ctx.userId)) return reject("NOT_FOUND", { entity: "EXPORT_JOB" });
  return job;
}

export async function getExportJob(ctx: ExportCtx, jobId: string, deps: ExportDeps): Promise<ExportJobDTO> {
  return toExportJobDTO(await visibleJob(ctx, jobId, deps), deps.now ?? new Date());
}

export async function downloadExportJob(ctx: ExportCtx, jobId: string, deps: ExportDeps): Promise<{ fileName: string; body: Uint8Array }> {
  const now = deps.now ?? new Date();
  const job = await visibleJob(ctx, jobId, deps);
  const dto = toExportJobDTO(job, now);
  if (dto.status !== "READY") return reject("NOT_FOUND", { entity: "EXPORT_JOB", status: dto.status });
  const store = deps.store ?? defaultExportStore();
  const body = await store.get(exportStorageKey(job.organizationId, job._id));
  return { fileName: exportFileName(dto.entity, job.createdAt), body };
}

/** Deps for API routes: the shared database handle and the default export store. */
export async function resolveExportDeps(overrides: Partial<ExportDeps> = {}): Promise<ExportDeps> {
  return { ...overrides, db: overrides.db ?? ((await getDb()) as unknown as Db) };
}

export type { ExportEntity };
