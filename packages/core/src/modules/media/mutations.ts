import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { MediaDeletePayload, MediaRegisterPayload, MediaUpdatePayload } from "@agrorende/contracts/mutations";
import type { MutationName } from "@agrorende/contracts/sync";

import { ANY_ROLE } from "../../permissions";
import type { MutationHandler } from "../../sync/types";
import { deleteMedia, registerMedia, updateMedia } from "./service";

const register: MutationHandler<MediaRegisterPayload> = {
  schema: MUTATION_PAYLOADS["media.register"],
  allowedRoles: ANY_ROLE,
  access: "anyoneWithParentAccess",
  rejectionCodes: ["NOT_FOUND", "FORBIDDEN"],
  async apply(tx, ctx, payload) {
    await registerMedia(tx, ctx, payload);
    return {};
  },
};

const update: MutationHandler<MediaUpdatePayload> = {
  schema: MUTATION_PAYLOADS["media.update"],
  allowedRoles: ANY_ROLE,
  access: "capturer",
  rejectionCodes: ["NOT_FOUND"],
  async apply(tx, ctx, payload) {
    await updateMedia(tx, ctx, payload);
    return {};
  },
};

const remove: MutationHandler<MediaDeletePayload> = {
  schema: MUTATION_PAYLOADS["media.delete"],
  allowedRoles: ANY_ROLE,
  access: "capturer",
  rejectionCodes: ["MEDIA_LOCKED"],
  async apply(tx, ctx, payload) {
    await deleteMedia(tx, ctx, payload.id);
    return {};
  },
};

export const mutations: Pick<Record<MutationName, MutationHandler<unknown>>, "media.register" | "media.update" | "media.delete"> = {
  "media.register": register as MutationHandler<unknown>,
  "media.update": update as MutationHandler<unknown>,
  "media.delete": remove as MutationHandler<unknown>,
};
