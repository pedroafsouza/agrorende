import { patchMirrorRow } from "../../db/mirror";
import { defineMutator } from "../mutator";

export type { LocalMutationResult } from "../mutator";

/** On/off duty (OPS). Going ON_DUTY needs `consent: true`; location tracking follows the local row. */
export const setDuty = defineMutator({
  name: "user.setDuty",
  entityType: "USER",
  entityId: (_payload, runtime) => runtime.userId,
  apply: async (tx, payload, ctx) => {
    await patchMirrorRow(tx, "users", ctx.runtime.userId, {
      dutyStatus: payload.status,
      dutyChangedAt: ctx.now,
      ...(payload.consent === true ? { locationConsentAt: ctx.now } : {}),
      updatedAt: ctx.now,
    });
  },
});
