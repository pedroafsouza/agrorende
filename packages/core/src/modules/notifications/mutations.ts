import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { NotificationMarkReadPayload } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions.js";
import type { MutationHandler } from "../../sync/types.js";
import { markRead } from "./service.js";

const markReadHandler: MutationHandler<NotificationMarkReadPayload> = {
  schema: MUTATION_PAYLOADS["notification.markRead"],
  allowedRoles: ANY_ROLE,
  access: "self",
  rejectionCodes: [],
  async apply(tx, ctx, payload) {
    await markRead(tx, ctx, payload.ids);
    return {};
  },
};

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "notification.markRead"> = {
  "notification.markRead": markReadHandler as MutationHandler<unknown>,
};
