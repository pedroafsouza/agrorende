import type { MutationName } from "@agrorende/contracts/sync";

import type { MutationHandler } from "./types";
import { mutations as assetMutations } from "../modules/assets/mutations";
import { mutations as commentMutations } from "../modules/comments/mutations";
import { mutations as fieldReportMutations } from "../modules/fieldReports/mutations";
import { mutations as fuelMutations } from "../modules/fuel/mutations";
import { mutations as mediaMutations } from "../modules/media/mutations";
import { mutations as notificationMutations } from "../modules/notifications/mutations";
import { mutations as rentalMutations } from "../modules/rentals/mutations";
import { mutations as userMutations } from "../modules/users/mutations";
import { mutations as workOrderMutations } from "../modules/workOrders/mutations";

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
