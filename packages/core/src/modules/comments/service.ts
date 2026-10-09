import type { CommentCreatePayload } from "@agrorende/contracts/mutations";
import { opsRoom, RealtimeServerEvents, userRoom } from "@agrorende/contracts/realtime";
import type { Comment, ScopedDb } from "@agrorende/db";

import { recordActivity } from "../../activity/index.js";
import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { emit } from "../../events/index.js";
import { createNotification } from "../../notify/index.js";
import { txDb } from "../../sync/touch.js";
import type { SyncTx } from "../../sync/types.js";
import { newId, parseInput, readDb } from "../assets/kit.js";
import {
  CommentCreateInputSchema,
  CommentListQuerySchema,
  CommentParentTypeEnum,
  toCommentDto,
  type CommentDTO,
  type CommentParentType,
  type CommentThreadItem,
} from "./dto.js";

export { toCommentDto };

/** Longest comment body accepted from any client. */
export const COMMENT_MAX_LENGTH = 4000;

/** Who started the record, who works on it now, and the label used in notifications. */
export interface CommentParent {
  readonly entityType: CommentParentType;
  readonly entityId: string;
  readonly label: string;
  readonly creatorId: string | null;
  readonly assigneeId: string | null;
}

function isOffice(ctx: Pick<Ctx, "role">): boolean {
  return ctx.role === "ADMIN" || ctx.role === "MANAGER";
}

function labelOf(number: string | null | undefined, title: string): string {
  return number === null || number === undefined || number.length === 0 ? title : `${number} · ${title}`;
}

/**
 * Loads the parent record of a thread and checks that the caller can see it (the same rules as
 * the pull scopes of ARCHITECTURE §7.5). Other organisations' rows are invisible to the scoped
 * collections, so they answer NOT_FOUND, and so do records outside a field user's scope.
 */
export async function loadParent(db: ScopedDb, ctx: Pick<Ctx, "userId" | "role">, entityType: CommentParentType, entityId: string): Promise<CommentParent> {
  const office = isOffice(ctx);
  switch (entityType) {
    case "WORK_ORDER": {
      const wo = await db.work_orders.findOne({ _id: entityId, deletedAt: null });
      if (wo === null) return reject("NOT_FOUND", { entityType, id: entityId });
      const involved = wo.assigneeId === ctx.userId || wo.previousAssigneeIds.includes(ctx.userId);
      if (!office && !involved) return reject("NOT_FOUND", { entityType, id: entityId });
      return { entityType, entityId, label: labelOf(wo.number, wo.title), creatorId: wo.createdById ?? null, assigneeId: wo.assigneeId ?? null };
    }
    case "FIELD_REPORT": {
      const report = await db.field_reports.findOne({ _id: entityId, deletedAt: null });
      if (report === null) return reject("NOT_FOUND", { entityType, id: entityId });
      let assigneeId: string | null = null;
      let involved = report.reporterId === ctx.userId;
      if (report.workOrderId !== null && report.workOrderId !== undefined) {
        const wo = await db.work_orders.findOne({ _id: report.workOrderId, deletedAt: null });
        assigneeId = wo?.assigneeId ?? null;
        if (wo !== null && (wo.assigneeId === ctx.userId || wo.previousAssigneeIds.includes(ctx.userId))) involved = true;
      }
      if (!office && !involved) return reject("NOT_FOUND", { entityType, id: entityId });
      return { entityType, entityId, label: labelOf(report.number, report.title), creatorId: report.reporterId, assigneeId };
    }
    case "RENTAL": {
      const rental = await db.rentals.findOne({ _id: entityId, deletedAt: null });
      if (rental === null) return reject("NOT_FOUND", { entityType, id: entityId });
      if (!office && rental.status === "DRAFT") return reject("NOT_FOUND", { entityType, id: entityId });
      return { entityType, entityId, label: rental.number, creatorId: rental.createdById, assigneeId: rental.agentId ?? null };
    }
    case "ASSET": {
      const asset = await db.assets.findOne({ _id: entityId, deletedAt: null });
      if (asset === null) return reject("NOT_FOUND", { entityType, id: entityId });
      return { entityType, entityId, label: asset.name, creatorId: null, assigneeId: null };
    }
  }
}

/**
 * COMMENT_ADDED recipients (ARCHITECTURE §6.5): the record's creator, its current assignee and
 * every earlier commenter, never the author.
 */
export function commentParticipants(parent: Pick<CommentParent, "creatorId" | "assigneeId">, earlierAuthorIds: readonly string[], authorId: string): string[] {
  const ids = new Set<string>();
  for (const id of [parent.creatorId, parent.assigneeId, ...earlierAuthorIds]) {
    if (id !== null && id !== authorId) ids.add(id);
  }
  return [...ids];
}

export interface CreateCommentMeta {
  readonly occurredAt?: Date;
  readonly mutationId?: string;
  readonly deviceId?: string | null;
}

/**
 * `comment.create` and `POST /comments`. Idempotent by id: a second call with the same id returns
 * the stored row and notifies nobody, so an offline comment that is replayed syncs once.
 */
export async function createComment(tx: SyncTx, ctx: Ctx, payload: CommentCreatePayload, meta: CreateCommentMeta = {}): Promise<CommentDTO> {
  const db = txDb(tx);
  const existing = await db.comments.findOne({ _id: payload.id });
  if (existing !== null) {
    if (existing.authorId !== ctx.userId) return reject("VALIDATION_FAILED", { context: "commentIdReuse", id: payload.id });
    return toCommentDto(existing);
  }
  const type = CommentParentTypeEnum.safeParse(payload.entityType);
  if (!type.success) return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "entityType", code: "invalid_enum_value" }] });
  const body = payload.body.trim();
  if (body.length === 0 || body.length > COMMENT_MAX_LENGTH) {
    return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "body", code: body.length === 0 ? "too_small" : "too_big" }] });
  }

  const parent = await loadParent(db, ctx, type.data, payload.entityId);
  const earlier = await db.comments.find({ entityType: parent.entityType, entityId: parent.entityId, deletedAt: null }).toArray();

  const now = new Date();
  const doc: Comment = {
    _id: payload.id,
    organizationId: tx.orgId,
    syncVersion: tx.syncVersion,
    createdAt: meta.occurredAt ?? now,
    updatedAt: now,
    deletedAt: null,
    entityType: parent.entityType,
    entityId: parent.entityId,
    authorId: ctx.userId,
    body,
  };
  await db.comments.insertOne(doc);
  await recordActivity(tx, {
    entityType: parent.entityType,
    entityId: parent.entityId,
    action: "comment.created",
    actorId: ctx.userId,
    meta: { commentId: doc._id },
    occurredAt: doc.createdAt,
    receivedAt: now,
    ...(meta.mutationId === undefined ? {} : { mutationId: meta.mutationId }),
    ...(meta.deviceId === undefined || meta.deviceId === null ? {} : { deviceId: meta.deviceId }),
  });

  const recipients = commentParticipants(parent, earlier.map((row) => row.authorId), ctx.userId);
  if (recipients.length > 0) {
    const author = await db.users.findOne({ _id: ctx.userId });
    await createNotification(tx, {
      type: "COMMENT_ADDED",
      userIds: recipients,
      entity: { entityType: parent.entityType, entityId: parent.entityId },
      params: { name: author?.name ?? "", title: parent.label },
    });
    await emit(tx, { type: RealtimeServerEvents.syncPoke, rooms: recipients.map((id) => userRoom(id)), data: { reason: "comment.created" } });
  }
  await emit(tx, {
    type: RealtimeServerEvents.entityChanged,
    rooms: [opsRoom(tx.orgId)],
    data: { entityType: "COMMENT", id: doc._id, parent: { entityType: parent.entityType, entityId: parent.entityId }, version: String(tx.syncVersion) },
  });
  return toCommentDto(doc);
}

/** `POST /comments` from the web: validates the body and generates the id when the client did not send one. */
export async function createCommentFromInput(tx: SyncTx, ctx: Ctx, input: unknown): Promise<CommentDTO> {
  const parsed = parseInput(CommentCreateInputSchema, input);
  return createComment(tx, ctx, { id: parsed.id ?? newId(), entityType: parsed.entityType, entityId: parsed.entityId, body: parsed.body });
}

/** `GET /comments?entityType&entityId`: the thread, oldest first, with author names. */
export async function listComments(ctx: Ctx, query: unknown): Promise<{ items: CommentThreadItem[] }> {
  const parsed = parseInput(CommentListQuerySchema, query);
  const db = await readDb(ctx);
  await loadParent(db, ctx, parsed.entityType, parsed.entityId);
  const rows = await db.comments.find({ entityType: parsed.entityType, entityId: parsed.entityId, deletedAt: null }).sort({ createdAt: 1, _id: 1 }).limit(500).toArray();
  const authorIds = [...new Set(rows.map((row) => row.authorId))];
  const users = authorIds.length === 0 ? [] : await db.users.find({ _id: { $in: authorIds } }).toArray();
  const names = new Map(users.map((user) => [user._id, user.name]));
  return { items: rows.map((row) => ({ ...toCommentDto(row), authorName: names.get(row.authorId) ?? null })) };
}
