import { placeholders } from "../../db/sql";
import { defineMutator } from "../mutator";

export type { LocalMutationResult } from "../mutator";

export const markNotificationsRead = defineMutator({
  name: "notification.markRead",
  entityType: "NOTIFICATION",
  entityId: (payload) => payload.ids[0] ?? "",
  apply: async (tx, payload, ctx) => {
    await tx.run(`UPDATE notifications SET readAt = COALESCE(readAt, ?), _dirty = 1 WHERE id IN (${placeholders(payload.ids.length)})`, [ctx.now, ...payload.ids]);
  },
});
