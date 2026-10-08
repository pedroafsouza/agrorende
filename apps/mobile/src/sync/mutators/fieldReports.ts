import type { MutationPayload } from "@agrorende/contracts/mutations";

import { notImplemented } from "../../lib/notImplemented";

export type LocalMutationResult = { readonly mutationId: string };

export async function createFieldReport(_payload: MutationPayload<"fieldReport.create">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.fieldReports.createFieldReport");
}

export async function updateFieldReport(_payload: MutationPayload<"fieldReport.update">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.fieldReports.updateFieldReport");
}

export async function withdrawFieldReport(_payload: MutationPayload<"fieldReport.withdraw">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.fieldReports.withdrawFieldReport");
}

