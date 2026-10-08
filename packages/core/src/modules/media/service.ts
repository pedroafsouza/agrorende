import type { EntityRef } from "@agrorende/contracts/dto";
import { MediaParentSchema, type MediaParent } from "@agrorende/contracts/checklist";
import { MediaKindEnum, MediaTagEnum, type EntityType, type MediaKind, type MediaTag } from "@agrorende/contracts/enums";
import type { MediaMeta } from "@agrorende/contracts/sync";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { createNotification, officeRecipients } from "../../notify/index.js";
import { txDb } from "../../sync/touch.js";
import type { SyncTx } from "../../sync/types.js";
import { toMediaDto, type MediaDTO } from "./dto.js";

export const SINGLE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
export const MULTIPART_PART_BYTES = 8 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf",
  "image/svg+xml": "svg",
};

export function extensionFor(mimeType: string): string {
  return EXTENSIONS[mimeType.toLowerCase()] ?? "bin";
}

/** `org/<orgId>/media/<yyyy>/<mm>/<id>.<ext>` (ARCHITECTURE §7.7). */
export function mediaStorageKey(orgId: string, mediaId: string, mimeType: string, capturedAt: Date): string {
  const yyyy = String(capturedAt.getUTCFullYear());
  const mm = String(capturedAt.getUTCMonth() + 1).padStart(2, "0");
  return `org/${orgId}/media/${yyyy}/${mm}/${mediaId}.${extensionFor(mimeType)}`;
}

export function thumbnailKeyFor(storageKey: string): string {
  return storageKey.replace(/\.[^./]+$/, "_thumb.jpg");
}

export function posterKeyFor(storageKey: string): string {
  return storageKey.replace(/\.[^./]+$/, "_poster.jpg");
}

const PARENT_ENTITY: Record<MediaParent["type"], EntityType> = {
  FIELD_REPORT: "FIELD_REPORT",
  WORK_ORDER: "WORK_ORDER",
  INSPECTION: "INSPECTION",
  ASSET: "ASSET",
  COMMENT: "COMMENT",
  FUEL_LOG: "FUEL_LOG",
};

const CLOSED_WORK_ORDER = new Set(["CANCELLED", "COMPLETED", "VERIFIED"]);

interface ParentCheck {
  readonly lateEvidence: boolean;
  readonly workOrder?: { readonly id: string; readonly title: string };
}

interface TypedMeta {
  readonly kind: MediaKind;
  readonly tag: MediaTag;
  readonly parent: MediaParent;
}

/** `MediaMeta` keeps kind, tag and parent loose on the wire; narrow them or reject with VALIDATION_FAILED. */
export function typedMeta(meta: MediaMeta): TypedMeta {
  const kind = MediaKindEnum.safeParse(meta.kind);
  const tag = MediaTagEnum.safeParse(meta.tag);
  const parent = MediaParentSchema.safeParse(meta.parent);
  if (!kind.success || !tag.success || !parent.success) {
    reject("VALIDATION_FAILED", { id: meta.id, kind: meta.kind, tag: meta.tag, parentType: meta.parent.type });
  }
  return { kind: kind.data, tag: tag.data, parent: parent.data };
}

async function checkParent(tx: SyncTx, ctx: Ctx, parent: MediaParent): Promise<ParentCheck> {
  const db = txDb(tx);
  const office = ctx.role === "ADMIN" || ctx.role === "MANAGER";
  switch (parent.type) {
    case "WORK_ORDER": {
      const workOrder = await db.work_orders.findOne({ _id: parent.id, deletedAt: null });
      if (workOrder === null) reject("NOT_FOUND", { entityType: "WORK_ORDER", id: parent.id });
      const isAssignee = workOrder.assigneeId === ctx.userId;
      const wasAssignee = workOrder.previousAssigneeIds.includes(ctx.userId);
      if (!office && !isAssignee && !wasAssignee) reject("FORBIDDEN", { entityType: "WORK_ORDER", id: parent.id });
      const lateEvidence = !office && (CLOSED_WORK_ORDER.has(workOrder.status) || !isAssignee);
      return { lateEvidence, workOrder: { id: workOrder._id, title: workOrder.title } };
    }
    case "FIELD_REPORT": {
      const report = await db.field_reports.findOne({ _id: parent.id, deletedAt: null }, { projection: { reporterId: 1, workOrderId: 1 } });
      if (report === null) reject("NOT_FOUND", { entityType: "FIELD_REPORT", id: parent.id });
      return { lateEvidence: false };
    }
    case "INSPECTION": {
      const found = await db.inspections.findOne({ _id: parent.id, deletedAt: null }, { projection: { _id: 1 } });
      if (found === null) reject("NOT_FOUND", { entityType: "INSPECTION", id: parent.id });
      return { lateEvidence: false };
    }
    case "ASSET": {
      const found = await db.assets.findOne({ _id: parent.id, deletedAt: null }, { projection: { _id: 1 } });
      if (found === null) reject("NOT_FOUND", { entityType: "ASSET", id: parent.id });
      return { lateEvidence: false };
    }
    case "COMMENT": {
      const found = await db.comments.findOne({ _id: parent.id, deletedAt: null }, { projection: { _id: 1 } });
      if (found === null) reject("NOT_FOUND", { entityType: "COMMENT", id: parent.id });
      return { lateEvidence: false };
    }
    case "FUEL_LOG": {
      const found = await db.fuel_logs.findOne({ _id: parent.id, deletedAt: null }, { projection: { _id: 1 } });
      if (found === null) reject("NOT_FOUND", { entityType: "FUEL_LOG", id: parent.id });
      return { lateEvidence: false };
    }
  }
}

export interface RegisterMediaOptions {
  /** Skip the parent existence check when the caller created the parent in the same transaction. */
  readonly parentChecked?: boolean;
}

/**
 * Creates a PENDING Media row (`media.register`, and reused by evidence-carrying mutations).
 * Idempotent by id. Late evidence on a closed or reassigned work order is APPLIED, flagged and
 * notified to the office (BR-F2-4).
 */
export async function registerMedia(tx: SyncTx, ctx: Ctx, meta: MediaMeta, options: RegisterMediaOptions = {}): Promise<MediaDTO> {
  const db = txDb(tx);
  const existing = await db.media.findOne({ _id: meta.id });
  if (existing !== null) {
    return toMediaDto(existing);
  }
  const typed = typedMeta(meta);
  const check: ParentCheck = options.parentChecked === true ? { lateEvidence: false } : await checkParent(tx, ctx, typed.parent);
  const now = new Date();
  const capturedAt = new Date(meta.capturedAt);
  const storageKey = mediaStorageKey(tx.orgId, meta.id, meta.mimeType, capturedAt);
  const doc = {
    _id: meta.id,
    organizationId: tx.orgId,
    syncVersion: tx.syncVersion,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    kind: typed.kind,
    status: "PENDING" as const,
    tag: typed.tag,
    mimeType: meta.mimeType,
    sizeBytes: meta.sizeBytes ?? null,
    durationMs: meta.durationMs ?? null,
    width: meta.width ?? null,
    height: meta.height ?? null,
    storageKey,
    thumbnailKey: typed.kind === "PHOTO" ? thumbnailKeyFor(storageKey) : null,
    variants: { original: { status: "PENDING" as const } },
    caption: null,
    capturedAt,
    capturedById: ctx.userId,
    lat: meta.lat ?? null,
    lng: meta.lng ?? null,
    uploadedAt: null,
    parent: typed.parent,
    damageId: meta.damageId ?? null,
    checklistItemKey: meta.checklistItemKey ?? null,
    isLateEvidence: check.lateEvidence,
  };
  await db.media.insertOne(doc);
  if (check.lateEvidence && check.workOrder !== undefined) {
    await db.work_orders.updateOne({ _id: check.workOrder.id }, { $set: { hasLateEvidence: true, syncVersion: tx.syncVersion, updatedAt: now } });
    const managers = await officeRecipients(tx, tx.orgId, ["ADMIN", "MANAGER"]);
    await createNotification(tx, {
      type: "LATE_EVIDENCE",
      userIds: managers,
      entity: { entityType: "WORK_ORDER", entityId: check.workOrder.id },
      params: { title: check.workOrder.title },
    });
  }
  return toMediaDto(doc);
}

export async function updateMedia(tx: SyncTx, ctx: Ctx, input: { readonly id: string; readonly tag?: MediaTag; readonly caption?: string | null }): Promise<void> {
  const db = txDb(tx);
  const media = await db.media.findOne({ _id: input.id, deletedAt: null });
  if (media === null) reject("NOT_FOUND", { entityType: "MEDIA", id: input.id });
  if (media.capturedById !== ctx.userId && ctx.role === "FIELD") reject("FORBIDDEN", { entityType: "MEDIA", id: input.id });
  await db.media.updateOne(
    { _id: input.id },
    {
      $set: {
        ...(input.tag === undefined ? {} : { tag: input.tag }),
        ...(input.caption === undefined ? {} : { caption: input.caption }),
        syncVersion: tx.syncVersion,
        updatedAt: new Date(),
      },
    },
  );
}

export async function deleteMedia(tx: SyncTx, ctx: Ctx, id: string): Promise<void> {
  const db = txDb(tx);
  const media = await db.media.findOne({ _id: id });
  if (media === null) reject("NOT_FOUND", { entityType: "MEDIA", id });
  if (media.deletedAt !== null && media.deletedAt !== undefined) return;
  if (media.kind === "SIGNATURE" || media.tag.startsWith("SIGNATURE_")) reject("MEDIA_LOCKED", { id });
  if (media.capturedById !== ctx.userId && ctx.role === "FIELD") reject("FORBIDDEN", { entityType: "MEDIA", id });
  await db.media.softDeleteOne({ _id: id }, new Date(), tx.syncVersion);
}

/** Seam `MediaSeams.listForParent`: non-deleted media of a parent entity. */
export async function listForParent(tx: SyncTx, parent: EntityRef): Promise<MediaDTO[]> {
  const db = txDb(tx);
  const filter =
    parent.entityType === "DAMAGE"
      ? { damageId: parent.entityId, deletedAt: null }
      : { "parent.type": parent.entityType, "parent.id": parent.entityId, deletedAt: null };
  const docs = await db.media.find(filter, { sort: { capturedAt: 1, _id: 1 } }).toArray();
  return docs.map((doc) => toMediaDto(doc));
}

/** Seam `MediaSeams.markLateEvidence`. */
export async function markLateEvidence(tx: SyncTx, mediaIds: readonly string[]): Promise<void> {
  if (mediaIds.length === 0) return;
  await txDb(tx).media.updateMany(
    { _id: { $in: [...mediaIds] } },
    { $set: { isLateEvidence: true, syncVersion: tx.syncVersion, updatedAt: new Date() } },
  );
}

export function parentEntityType(parent: MediaParent): EntityType {
  return PARENT_ENTITY[parent.type];
}
