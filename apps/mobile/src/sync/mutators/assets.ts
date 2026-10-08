import type { MutationPayload } from "@agrorende/contracts/mutations";

import { notImplemented } from "../../lib/notImplemented";

export type LocalMutationResult = { readonly mutationId: string };

export async function updateAssetReadings(_payload: MutationPayload<"asset.updateReadings">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.assets.updateAssetReadings");
}

