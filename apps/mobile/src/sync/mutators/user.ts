import type { MutationPayload } from "@agrorende/contracts/mutations";

import { notImplemented } from "../../lib/notImplemented";

export type LocalMutationResult = { readonly mutationId: string };

export async function setDuty(_payload: MutationPayload<"user.setDuty">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.user.setDuty");
}

