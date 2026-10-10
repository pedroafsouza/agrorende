import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { CommentCreatePayload } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions";
import type { MutationHandler } from "../../sync/types";
import { createComment } from "./service";

/** The push pipeline does not enforce `access`, so `createComment` checks the parent record. */
const create: MutationHandler<CommentCreatePayload> = {
  schema: MUTATION_PAYLOADS["comment.create"],
  allowedRoles: ANY_ROLE,
  access: "anyoneWithParentAccess",
  rejectionCodes: ["NOT_FOUND", "VALIDATION_FAILED"],
  async apply(tx, ctx, payload, meta) {
    await createComment(tx, ctx, payload, { occurredAt: meta.occurredAt, mutationId: meta.mutationId, deviceId: meta.deviceId });
    return {};
  },
};

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "comment.create"> = {
  "comment.create": create as MutationHandler<unknown>,
};
