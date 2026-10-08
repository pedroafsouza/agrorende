import type { MutationPayload } from "@agrorende/contracts/mutations";

import { notImplemented } from "../../lib/notImplemented";

export type LocalMutationResult = { readonly mutationId: string };

export async function transitionWorkOrder(_payload: MutationPayload<"workOrder.transition">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.jobs.transitionWorkOrder");
}

export async function completeWorkOrder(_payload: MutationPayload<"workOrder.complete">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.jobs.completeWorkOrder");
}

export async function saveChecklist(_payload: MutationPayload<"workOrder.saveChecklist">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.jobs.saveChecklist");
}

export async function addPart(_payload: MutationPayload<"workOrder.addPart">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.jobs.addPart");
}

export async function removePart(_payload: MutationPayload<"workOrder.removePart">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.jobs.removePart");
}

