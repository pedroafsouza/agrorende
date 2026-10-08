import type { z } from "zod";

import type { MutationName } from "../sync.js";

import {
  FieldReportCreatePayloadSchema,
  FieldReportUpdatePayloadSchema,
  FieldReportWithdrawPayloadSchema,
} from "./fieldReports.js";
import {
  MediaDeletePayloadSchema,
  MediaRegisterPayloadSchema,
  MediaUpdatePayloadSchema,
} from "./media.js";
import {
  AssetUpdateReadingsPayloadSchema,
  CommentCreatePayloadSchema,
  FuelLogCreatePayloadSchema,
  NotificationMarkReadPayloadSchema,
  UserSetDutyPayloadSchema,
} from "./misc.js";
import {
  InspectionSubmitPayloadSchema,
  RentalCheckinPayloadSchema,
  RentalCheckoutPayloadSchema,
} from "./rentals.js";
import {
  WorkOrderAddPartPayloadSchema,
  WorkOrderCompletePayloadSchema,
  WorkOrderRemovePartPayloadSchema,
  WorkOrderSaveChecklistPayloadSchema,
  WorkOrderTransitionPayloadSchema,
} from "./workOrders.js";

export * from "./fieldReports.js";
export * from "./media.js";
export * from "./misc.js";
export * from "./rentals.js";
export * from "./workOrders.js";

/**
 * Payload schema for every mutation name. The server validates an envelope with
 * `MUTATION_PAYLOADS[envelope.name]` before dispatching to the handler, and the
 * mobile mutators validate with the same schema before writing to the outbox.
 *
 * The `Record<MutationName, ...>` annotation makes a missing entry a type error.
 */
export const MUTATION_PAYLOADS = {
  "fieldReport.create": FieldReportCreatePayloadSchema,
  "fieldReport.update": FieldReportUpdatePayloadSchema,
  "fieldReport.withdraw": FieldReportWithdrawPayloadSchema,
  "media.register": MediaRegisterPayloadSchema,
  "media.update": MediaUpdatePayloadSchema,
  "media.delete": MediaDeletePayloadSchema,
  "workOrder.transition": WorkOrderTransitionPayloadSchema,
  "workOrder.complete": WorkOrderCompletePayloadSchema,
  "workOrder.saveChecklist": WorkOrderSaveChecklistPayloadSchema,
  "workOrder.addPart": WorkOrderAddPartPayloadSchema,
  "workOrder.removePart": WorkOrderRemovePartPayloadSchema,
  "comment.create": CommentCreatePayloadSchema,
  "inspection.submit": InspectionSubmitPayloadSchema,
  "rental.checkout": RentalCheckoutPayloadSchema,
  "rental.checkin": RentalCheckinPayloadSchema,
  "asset.updateReadings": AssetUpdateReadingsPayloadSchema,
  "user.setDuty": UserSetDutyPayloadSchema,
  "notification.markRead": NotificationMarkReadPayloadSchema,
  "fuelLog.create": FuelLogCreatePayloadSchema,
} as const satisfies Record<MutationName, z.ZodTypeAny>;

export type MutationPayloads = {
  [K in MutationName]: z.infer<(typeof MUTATION_PAYLOADS)[K]>;
};

export type MutationPayload<K extends MutationName> = MutationPayloads[K];

/** Returns the payload schema for a mutation name. */
export function mutationPayloadSchema<K extends MutationName>(
  name: K,
): (typeof MUTATION_PAYLOADS)[K] {
  return MUTATION_PAYLOADS[name];
}
