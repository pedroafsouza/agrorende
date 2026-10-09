import { getMirrorRow, upsertMirrorRow } from "../../db/mirror";
import { defineMutator } from "../mutator";

export type { LocalMutationResult } from "../mutator";

/**
 * `comment.create` (PLT-10): the comment shows in the thread at once, marked as waiting to send,
 * and the server notifies the other participants when the push lands (A§6.5).
 */
export const createComment = defineMutator({
  name: "comment.create",
  entityType: "COMMENT",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    const existing = await getMirrorRow(tx, "comments", payload.id);
    await upsertMirrorRow(
      tx,
      "comments",
      {
        id: payload.id,
        organizationId: existing?.organizationId ?? "",
        syncVersion: existing?.syncVersion ?? 0,
        createdAt: existing?.createdAt ?? ctx.now,
        updatedAt: ctx.now,
        deletedAt: null,
        entityType: payload.entityType,
        entityId: payload.entityId,
        authorId: ctx.runtime.userId,
        body: payload.body,
      },
      1,
    );
  },
});
