import { createHash, randomUUID } from "node:crypto";
import { collections, withSyncTx } from "@agrorende/db";
import type { EntityType } from "@agrorende/contracts/enums";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import type { Db } from "../locations/types.js";
import { ATTENTION_KINDS, type AttentionItemDTO, type AttentionKind, type AttentionListDTO, type AttentionResolutionDTO } from "./dto.js";
import { loadOpsSettings, opsDb, staleDeviceFilter, type OpsDeps } from "./queries.js";

/**
 * Needs attention queue (ARCHITECTURE §21.2, REC-09). Rejected mutations keep their resolution in
 * the `resolvedAt`, `resolvedById` and `resolutionNote` fields of their `processed_mutations` row
 * (T09-001 item 3, applied in T10), claimed atomically, plus an `attention.resolved` ActivityEvent for
 * the audit trail. Media, devices and diagnostics have no resolution fields, so their resolution is
 * an `attention.resolved` ActivityEvent whose `_id` is derived from the item. The unique `_id` makes
 * the second resolver lose the race with `ALREADY_RESOLVED` (EC-OPS-23).
 */

export type AttentionCtx = Pick<Ctx, "orgId" | "userId">;

const HOUR_MS = 3_600_000;
const MEDIA_PENDING_HOURS = 24;
const DIAGNOSTIC_WINDOW_DAYS = 30;
const LIST_LIMIT = 200;
export const RESOLUTION_NOTE_MAX = 1_000;
export const ATTENTION_RESOLVED_ACTION = "attention.resolved";

export function parseAttentionKind(value: string): AttentionKind {
  const upper = value.toUpperCase().replace(/-/gu, "_");
  if ((ATTENTION_KINDS as readonly string[]).includes(upper)) return upper as AttentionKind;
  return reject("NOT_FOUND", { entity: "ATTENTION_KIND", kind: value });
}

/** Deterministic UUID-shaped id for the resolution of one attention item version. */
export function resolutionId(orgId: string, kind: AttentionKind, id: string, version: string): string {
  const hex = createHash("sha256").update(`attention:${orgId}:${kind}:${id}:${version}`).digest("hex");
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function deviceVersion(device: { readonly lastSyncAt?: Date | null; readonly oldestPendingAt?: Date | null }): string {
  return `${device.lastSyncAt?.toISOString() ?? "never"}|${device.oldestPendingAt?.toISOString() ?? "none"}`;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
}

async function userNames(db: Db, orgId: string, ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === "string"))];
  if (unique.length === 0) return new Map();
  const rows = await collections.users(db).find({ organizationId: orgId, _id: { $in: unique } }, { projection: { name: 1 } }).toArray();
  return new Map(rows.map((u) => [u._id, u.name]));
}

/** `GET /attention`: unresolved rejected mutations, media pending > 24 h, stale devices and new diagnostics. */
export async function listAttention(ctx: Pick<Ctx, "orgId">, deps: OpsDeps = {}): Promise<AttentionListDTO> {
  const db = await opsDb(deps);
  const now = deps.now ?? new Date();
  const orgId = ctx.orgId;
  const settings = await loadOpsSettings(db, orgId);
  const staleCutoff = new Date(now.getTime() - settings.staleSyncAlertHours * HOUR_MS);

  const [mutations, media, devices, diagnostics] = await Promise.all([
    collections
      .processedMutations(db)
      .find({ organizationId: orgId, "result.status": "REJECTED", resolvedAt: null })
      .sort({ processedAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
    collections
      .media(db)
      .find({ organizationId: orgId, deletedAt: null, status: "PENDING", createdAt: { $lt: new Date(now.getTime() - MEDIA_PENDING_HOURS * HOUR_MS) } })
      .sort({ createdAt: 1 })
      .limit(LIST_LIMIT)
      .toArray(),
    collections.devices(db).find(staleDeviceFilter(orgId, staleCutoff)).sort({ lastSyncAt: 1 }).limit(LIST_LIMIT).toArray(),
    collections
      .deviceDiagnostics(db)
      .find({ organizationId: orgId, createdAt: { $gte: new Date(now.getTime() - DIAGNOSTIC_WINDOW_DAYS * 24 * HOUR_MS) } })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .toArray(),
  ]);

  const candidates = [
    ...media.map((m) => resolutionId(orgId, "MEDIA_PENDING", m._id, "1")),
    ...devices.map((d) => resolutionId(orgId, "STALE_DEVICE", d._id, deviceVersion(d))),
    ...diagnostics.map((d) => resolutionId(orgId, "DIAGNOSTIC", d._id, "1")),
  ];
  const resolved =
    candidates.length === 0
      ? new Set<string>()
      : new Set(
          (await collections.activityEvents(db).find({ organizationId: orgId, _id: { $in: candidates } }, { projection: { _id: 1 } }).toArray()).map((e) => e._id),
        );
  const names = await userNames(db, orgId, [...mutations.map((m) => m.userId), ...media.map((m) => m.capturedById), ...devices.map((d) => d.userId), ...diagnostics.map((d) => d.userId)]);

  const items: AttentionItemDTO[] = [];
  for (const m of mutations) {
    const result = m.result;
    items.push({
      kind: "REJECTED_MUTATION",
      id: m.mutationId,
      at: m.processedAt.toISOString(),
      userId: m.userId,
      userName: names.get(m.userId) ?? null,
      deviceId: m.deviceId ?? null,
      params: { name: m.name, code: result.status === "REJECTED" ? result.code : null, ref: result.status === "REJECTED" ? (result.ref ?? null) : null },
    });
  }
  for (const m of media) {
    if (resolved.has(resolutionId(orgId, "MEDIA_PENDING", m._id, "1"))) continue;
    items.push({
      kind: "MEDIA_PENDING",
      id: m._id,
      at: m.createdAt.toISOString(),
      userId: m.capturedById,
      userName: names.get(m.capturedById) ?? null,
      deviceId: null,
      params: { mediaKind: m.kind, parentType: m.parent.type, parentId: m.parent.id, capturedAt: m.capturedAt.toISOString() },
    });
  }
  for (const d of devices) {
    if (resolved.has(resolutionId(orgId, "STALE_DEVICE", d._id, deviceVersion(d)))) continue;
    items.push({
      kind: "STALE_DEVICE",
      id: d._id,
      at: (d.oldestPendingAt ?? d.lastSyncAt ?? d.createdAt).toISOString(),
      userId: d.userId,
      userName: names.get(d.userId) ?? null,
      deviceId: d._id,
      params: {
        pendingMutations: d.pendingMutations,
        pendingUploads: d.pendingUploads,
        lastSyncAt: d.lastSyncAt?.toISOString() ?? null,
        model: d.model ?? null,
        appVersion: d.appVersion ?? null,
        batteryLevel: d.batteryLevel ?? null,
      },
    });
  }
  for (const d of diagnostics) {
    if (resolved.has(resolutionId(orgId, "DIAGNOSTIC", d._id, "1"))) continue;
    items.push({
      kind: "DIAGNOSTIC",
      id: d._id,
      at: d.createdAt.toISOString(),
      userId: d.userId,
      userName: names.get(d.userId) ?? null,
      deviceId: d.deviceId,
      params: { appVersion: d.appVersion ?? null },
    });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));
  return { items };
}

function normaliseNote(note: unknown): string {
  const value = typeof note === "string" ? note.trim() : "";
  if (value.length === 0) return reject("GUARD_RESOLUTION_REQUIRED", { fieldErrors: [{ path: "note", code: "required" }] });
  if (value.length > RESOLUTION_NOTE_MAX) return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "note", code: "too_big", params: { maximum: RESOLUTION_NOTE_MAX } }] });
  return value;
}

interface Subject {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly version: string;
  readonly meta: Readonly<Record<string, string | number | null>>;
}

async function subjectOf(db: Db, orgId: string, kind: Exclude<AttentionKind, "REJECTED_MUTATION">, id: string): Promise<Subject> {
  if (kind === "MEDIA_PENDING") {
    const media = await collections.media(db).findOne({ organizationId: orgId, _id: id }, { projection: { _id: 1 } });
    if (media === null) return reject("NOT_FOUND", { entity: "MEDIA" });
    return { entityType: "MEDIA", entityId: id, version: "1", meta: {} };
  }
  if (kind === "STALE_DEVICE") {
    const device = await collections.devices(db).findOne({ organizationId: orgId, _id: id }, { projection: { lastSyncAt: 1, oldestPendingAt: 1 } });
    if (device === null) return reject("NOT_FOUND", { entity: "DEVICE" });
    return { entityType: "DEVICE", entityId: id, version: deviceVersion(device), meta: {} };
  }
  const diagnostic = await collections.deviceDiagnostics(db).findOne({ organizationId: orgId, _id: id }, { projection: { deviceId: 1 } });
  if (diagnostic === null) return reject("NOT_FOUND", { entity: "DEVICE_DIAGNOSTIC" });
  return { entityType: "DEVICE", entityId: diagnostic.deviceId, version: "1", meta: { diagnosticId: id } };
}

function alreadyResolved(details: { resolverName: string | null; resolvedAt: Date | null; note: string | null }): never {
  return reject("ALREADY_RESOLVED", { resolverName: details.resolverName, resolvedAt: details.resolvedAt?.toISOString() ?? null, note: details.note });
}

/**
 * `POST /attention/:kind/:id/resolve {note}`: marks one item resolved. A missing note is
 * `GUARD_RESOLUTION_REQUIRED`; losing the race to a colleague is `ALREADY_RESOLVED` with their
 * name and note (EC-OPS-23).
 */
export async function resolveAttention(
  ctx: AttentionCtx,
  kindParam: string,
  id: string,
  input: { readonly note?: unknown },
  deps: OpsDeps = {},
): Promise<AttentionResolutionDTO> {
  const kind = parseAttentionKind(kindParam);
  const note = normaliseNote(input.note);
  const db = await opsDb(deps);
  const now = deps.now ?? new Date();
  const orgId = ctx.orgId;
  const resolver = await collections.users(db).findOne({ organizationId: orgId, _id: ctx.userId }, { projection: { name: 1 } });
  const resolverName = resolver?.name ?? null;

  if (kind === "REJECTED_MUTATION") {
    const pm = collections.processedMutations(db);
    const row = await pm.findOne({ organizationId: orgId, mutationId: id, "result.status": "REJECTED" });
    if (row === null) return reject("NOT_FOUND", { entity: "PROCESSED_MUTATION" });
    return withSyncTx(
      { orgId },
      async (tx) => {
        // Atomic claim: `resolvedAt: null` matches rows written with an explicit null (push.ts) and
        // legacy rows without the field. The new syncVersion lets the device pull the resolution (A9).
        const claimed = await pm.findOneAndUpdate(
          { _id: row._id, organizationId: orgId, resolvedAt: null },
          { $set: { resolvedAt: now, resolvedById: ctx.userId, resolutionNote: note, syncVersion: tx.syncVersion } },
          { session: tx.session, returnDocument: "after" },
        );
        if (claimed === null) {
          const current = await pm.findOne({ _id: row._id, organizationId: orgId }, { session: tx.session });
          const names = await userNames(db, orgId, [current?.resolvedById]);
          return alreadyResolved({
            resolverName: typeof current?.resolvedById === "string" ? (names.get(current.resolvedById) ?? null) : null,
            resolvedAt: current?.resolvedAt ?? null,
            note: current?.resolutionNote ?? null,
          });
        }
        await collections.activityEvents(db).insertOne(
          {
            _id: randomUUID(),
            organizationId: orgId,
            syncVersion: tx.syncVersion,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            actorId: ctx.userId,
            deviceId: null,
            entityType: typeof row.deviceId === "string" ? "DEVICE" : "USER",
            entityId: row.deviceId ?? row.userId,
            action: ATTENTION_RESOLVED_ACTION,
            fromStatus: null,
            toStatus: null,
            meta: { kind, itemId: id, note, resolverName, mutationName: row.name },
            lat: null,
            lng: null,
            occurredAt: now,
            receivedAt: now,
            clockOffsetMs: null,
            mutationId: null,
          },
          { session: tx.session },
        );
        return { kind, id, resolvedAt: now.toISOString(), resolvedById: ctx.userId, resolverName, note };
      },
      db,
    );
  }

  const subject = await subjectOf(db, orgId, kind, id);
  const eventId = resolutionId(orgId, kind, id, subject.version);
  try {
    await withSyncTx(
      { orgId },
      async (tx) => {
        await collections.activityEvents(db).insertOne(
          {
            _id: eventId,
            organizationId: orgId,
            syncVersion: tx.syncVersion,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            actorId: ctx.userId,
            deviceId: null,
            entityType: subject.entityType,
            entityId: subject.entityId,
            action: ATTENTION_RESOLVED_ACTION,
            fromStatus: null,
            toStatus: null,
            meta: { ...subject.meta, kind, itemId: id, note, resolverName },
            lat: null,
            lng: null,
            occurredAt: now,
            receivedAt: now,
            clockOffsetMs: null,
            mutationId: null,
          },
          { session: tx.session },
        );
      },
      db,
    );
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const existing = await collections.activityEvents(db).findOne({ organizationId: orgId, _id: eventId });
    const meta = (existing?.meta ?? {}) as Record<string, unknown>;
    return alreadyResolved({
      resolverName: typeof meta.resolverName === "string" ? meta.resolverName : null,
      resolvedAt: existing?.occurredAt ?? null,
      note: typeof meta.note === "string" ? meta.note : null,
    });
  }
  return { kind, id, resolvedAt: now.toISOString(), resolvedById: ctx.userId, resolverName, note };
}
