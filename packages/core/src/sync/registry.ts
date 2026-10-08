import type { MutationName } from "@agrorende/contracts/sync";

import type { MutationHandler } from "./types.js";
import { mutations as assetMutations } from "../modules/assets/mutations.js";
import { mutations as commentMutations } from "../modules/comments/mutations.js";
import { mutations as fieldReportMutations } from "../modules/fieldReports/mutations.js";
import { mutations as fuelMutations } from "../modules/fuel/mutations.js";
import { mutations as mediaMutations } from "../modules/media/mutations.js";
import { mutations as notificationMutations } from "../modules/notifications/mutations.js";
import { mutations as rentalMutations } from "../modules/rentals/mutations.js";
import { mutations as userMutations } from "../modules/users/mutations.js";
import { mutations as workOrderMutations } from "../modules/workOrders/mutations.js";

export const mutationRegistry: Record<MutationName, MutationHandler<unknown>> = {
  ...fieldReportMutations,
  ...mediaMutations,
  ...workOrderMutations,
  ...commentMutations,
  ...rentalMutations,
  ...assetMutations,
  ...userMutations,
  ...notificationMutations,
  ...fuelMutations,
};

export function getMutationHandler(name: MutationName): MutationHandler<unknown> {
  return mutationRegistry[name];
}
