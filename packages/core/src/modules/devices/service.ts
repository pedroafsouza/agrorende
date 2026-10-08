import { randomUUID } from "node:crypto";

import { PlatformEnum } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";
import { TelemetryEventSchema, type TelemetryEvent } from "@agrorende/contracts/sync";
import { collections, getDb } from "@agrorende/db";
import type { Device } from "@agrorende/db";
import { z } from "zod";

import type { Ctx } from "../../context.js";
import { pageResult, validationError, type PageParams } from "../../auth/http.js";
import { noopLogger, type Logger } from "../../logging.js";
import { toDeviceDto, toDiagnosticDto, type DeviceDiagnosticDTO, type DeviceDTO } from "./dto.js";

export const DIAGNOSTICS_MAX_BYTES = 256 * 1024;
export const DEVICE_STALE_MS = 24 * 60 * 60 * 1000;

const Text = z.string().trim().min(1).max(200);

export const DeviceRegisterSchema = z.object({
  deviceId: z.string().uuid(),
  platform: PlatformEnum,
  model: Text.optional(),
  osVersion: Text.optional(),
  appVersion: Text.optional(),
  runtimeVersion: Text.optional(),
  pushToken: z.string().trim().min(1).max(500).nullable().optional(),
});
export type DeviceRegisterInput = z.infer<typeof DeviceRegisterSchema>;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

/**
 * `POST /devices/register`: upserts the row for `(installationId, userId)`, where the
 * installation id is the client `deviceId`. Registering clears `pushToken` on other users'
 * rows with the same installation, so only the active user of a shared tablet gets pushes (PLT-12).
 */
export async function registerDevice(ctx: Ctx, input: unknown, now: Date = new Date()): Promise<{ device: DeviceDTO }> {
  const body = parse(DeviceRegisterSchema, input);
  const devices = collections.devices(await getDb());
  const filter = { installationId: body.deviceId, userId: ctx.userId, organizationId: ctx.organizationId };
  const set: Partial<Device> = {
    platform: body.platform,
    model: body.model ?? null,
    osVersion: body.osVersion ?? null,
    appVersion: body.appVersion ?? null,
    runtimeVersion: body.runtimeVersion ?? null,
    lastSeenAt: now,
    updatedAt: now,
    ...(body.pushToken === undefined ? {} : { pushToken: body.pushToken, pushStatus: body.pushToken === null ? "DENIED" : "OK" }),
  };
  const insert: Partial<Device> = {
    _id: randomUUID(),
    scopeEpoch: 0,
    lastPullVersion: 0,
    pendingMutations: 0,
    pendingUploads: 0,
    pendingBytes: 0,
    createdAt: now,
    ...(body.pushToken === undefined ? { pushStatus: "OK" as const } : {}),
  };
  try {
    await devices.updateOne(filter, { $set: set, $setOnInsert: insert }, { upsert: true });
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
    await devices.updateOne(filter, { $set: set });
  }
  await devices.updateMany(
    { installationId: body.deviceId, userId: { $ne: ctx.userId }, pushToken: { $ne: null } },
    { $set: { pushToken: null, updatedAt: now } },
  );
  const device = await devices.findOne(filter);
  if (device === null) throw new AppError("INTERNAL");
  return { device: toDeviceDto(device) };
}

export interface DeviceListFilter {
  readonly userId?: string;
  readonly stale?: boolean;
}

export async function listDevices(ctx: Ctx, filter: DeviceListFilter = {}, page: PageParams = { offset: 0, limit: 50 }, now: Date = new Date()) {
  const query: Record<string, unknown> = { organizationId: ctx.organizationId };
  if (filter.userId !== undefined) query.userId = filter.userId;
  if (filter.stale === true) query.$or = [{ lastSeenAt: null }, { lastSeenAt: { $lt: new Date(now.getTime() - DEVICE_STALE_MS) } }];
  const rows = await collections
    .devices(await getDb())
    .find(query)
    .sort({ lastSeenAt: -1, _id: 1 })
    .skip(page.offset)
    .limit(page.limit + 1)
    .toArray();
  return pageResult(rows.map(toDeviceDto), page);
}

export const DiagnosticsUploadSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  appVersion: Text,
  payload: z.record(z.string(), z.unknown()),
});

const PII_KEY = /(e-?mail|phone|telefone|whats|^name$|nome|cpf|cnpj|tax|password|senha|token|secret|address|endereco|^lat$|^lng$|latitude|longitude|plate|placa)/i;

/** Drops keys that may carry personal data from a diagnostics payload (ARCHITECTURE §11: no PII). */
export function redactDiagnostics(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => redactDiagnostics(item, depth + 1));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!PII_KEY.test(key)) out[key] = redactDiagnostics(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.slice(0, 2000).replace(/[\w.+-]{1,64}@[\w-]{1,63}\.[\w.]{1,63}/g, "[email]");
  return value;
}

/** `POST /telemetry/diagnostics`: idempotent by the queue row id, capped at 256 KB, redacted. */
export async function uploadDiagnostics(ctx: Ctx, input: unknown): Promise<{ id: string; duplicate: boolean }> {
  const body = parse(DiagnosticsUploadSchema, input);
  const rawBytes = Buffer.byteLength(JSON.stringify(body.payload));
  if (rawBytes > DIAGNOSTICS_MAX_BYTES) throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "payload", code: "too_large" }], details: { maxBytes: DIAGNOSTICS_MAX_BYTES, sizeBytes: rawBytes } });
  const payload = redactDiagnostics(body.payload) as Record<string, unknown>;
  const sizeBytes = Buffer.byteLength(JSON.stringify(payload));
  const db = await getDb();
  const existing = await collections.deviceDiagnostics(db).findOne({ _id: body.id });
  if (existing !== null) {
    if (existing.organizationId !== ctx.organizationId || existing.userId !== ctx.userId) throw new AppError("CONFLICT");
    return { id: body.id, duplicate: true };
  }
  await collections.deviceDiagnostics(db).insertOne({
    _id: body.id,
    organizationId: ctx.organizationId,
    deviceId: body.deviceId,
    userId: ctx.userId,
    createdAt: new Date(body.createdAt),
    appVersion: body.appVersion,
    payload,
    sizeBytes,
  } as Parameters<ReturnType<typeof collections.deviceDiagnostics>["insertOne"]>[0]);
  return { id: body.id, duplicate: false };
}

export async function listDiagnostics(ctx: Ctx, deviceId: string, page: PageParams = { offset: 0, limit: 50 }): Promise<{ items: DeviceDiagnosticDTO[]; nextCursor: string | null }> {
  const rows = await collections
    .deviceDiagnostics(await getDb())
    .find({ organizationId: ctx.organizationId, deviceId })
    .sort({ createdAt: -1 })
    .skip(page.offset)
    .limit(page.limit + 1)
    .toArray();
  return pageResult(rows.map(toDiagnosticDto), page);
}

export const TelemetryRequestSchema = z.object({ events: z.array(TelemetryEventSchema).min(1).max(50) });

let telemetryLogger: Logger = noopLogger;

export function setTelemetryLogger(logger: Logger): void {
  telemetryLogger = logger;
}

/** Records `error_shown` / `error_recovered` events as structured logs; attributes carry no PII. */
export function recordTelemetry(ctx: Pick<Ctx, "organizationId" | "role">, events: readonly TelemetryEvent[], source: "web" | "mobile"): number {
  for (const event of events) {
    telemetryLogger.info("telemetry", { source, orgId: ctx.organizationId, role: ctx.role, name: event.name, occurredAt: event.occurredAt, attributes: event.attributes });
  }
  return events.length;
}

export async function ingestTelemetry(ctx: Ctx, input: unknown): Promise<{ accepted: number }> {
  const body = parse(TelemetryRequestSchema, input);
  return { accepted: recordTelemetry(ctx, body.events, "web") };
}
