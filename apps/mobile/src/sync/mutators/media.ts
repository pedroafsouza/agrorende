import type { MutationPayload } from "@agrorende/contracts/mutations";

import { notImplemented } from "../../lib/notImplemented";

export type LocalMutationResult = { readonly mutationId: string };

export async function registerMedia(_payload: MutationPayload<"media.register">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.media.registerMedia");
}

export async function updateMedia(_payload: MutationPayload<"media.update">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.media.updateMedia");
}

export async function deleteMedia(_payload: MutationPayload<"media.delete">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.media.deleteMedia");
}

