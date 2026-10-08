import type { MutationPayload } from "@agrorende/contracts/mutations";

import { notImplemented } from "../../lib/notImplemented";

export type LocalMutationResult = { readonly mutationId: string };

export async function submitInspection(_payload: MutationPayload<"inspection.submit">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.rentals.submitInspection");
}

export async function checkoutRental(_payload: MutationPayload<"rental.checkout">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.rentals.checkoutRental");
}

export async function checkinRental(_payload: MutationPayload<"rental.checkin">): Promise<LocalMutationResult> {
  return notImplemented("sync.mutators.rentals.checkinRental");
}

