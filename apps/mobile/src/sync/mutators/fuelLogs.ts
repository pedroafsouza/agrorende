import type { MutationPayload } from "@agrorende/contracts/mutations";

import { notImplemented } from "../../lib/notImplemented";

export type LocalMutationResult = { readonly mutationId: string };

export async function createFuelLog(_payload: MutationPayload<"fuelLog.create">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.fuelLogs.createFuelLog");
}

