import { patchMirrorRow } from "../../db/mirror";
import { defineMutator, writeOptimisticMedia } from "../mutator";

export type { LocalMutationResult } from "../mutator";

/** Registers evidence captured outside a parent mutation (for example an asset photo). */
export const registerMedia = defineMutator({
  name: "media.register",
  entityType: "MEDIA",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    await writeOptimisticMedia(tx, [payload], ctx);
  },
});

export const updateMedia = defineMutator({
  name: "media.update",
  entityType: "MEDIA",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    await patchMirrorRow(tx, "media", payload.id, {
      ...(payload.tag === undefined ? {} : { tag: payload.tag }),
      ...(payload.caption === undefined ? {} : { caption: payload.caption }),
      updatedAt: ctx.now,
    });
  },
});

/** Soft delete; the local file is kept until the server confirms (signatures return MEDIA_LOCKED). */
export const deleteMedia = defineMutator({
  name: "media.delete",
  entityType: "MEDIA",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    await patchMirrorRow(tx, "media", payload.id, { deletedAt: ctx.now, updatedAt: ctx.now });
  },
});
