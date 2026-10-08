import type { MutationPayload } from "@agrorende/contracts/mutations";

import { notImplemented } from "../../lib/notImplemented";

export type LocalMutationResult = { readonly mutationId: string };

export async function markNotificationsRead(_payload: MutationPayload<"notification.markRead">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.notifications.markNotificationsRead");
}

