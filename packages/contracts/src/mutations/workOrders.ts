import { z } from "zod";

import { ChecklistResponseSchema } from "../checklist.js";
import { HoldReasonEnum, SignatureStatusEnum } from "../enums.js";
import { DocumentLocaleSchema, UuidSchema } from "../sync.js";

/** Payload schemas for the `workOrder.*` mutations (ARCHITECTURE section 7.3). */

export const WorkOrderTransitionActionEnum = z.enum([
  "accept",
  "decline",
  "startRoute",
  "arrive",
  "abortRoute",
  "startWork",
  "hold",
  "resume",
]);
export type WorkOrderTransitionAction = z.infer<typeof WorkOrderTransitionActionEnum>;

export const WorkOrderTransitionPayloadSchema = z.object({
  id: UuidSchema,
  action: WorkOrderTransitionActionEnum,
  /** Required by the state machine for `decline` and `abortRoute`. */
  reason: z.string().min(1).optional(),
  holdReason: HoldReasonEnum.optional(),
  note: z.string().optional(),
});
export type WorkOrderTransitionPayload = z.infer<typeof WorkOrderTransitionPayloadSchema>;

export const WorkOrderCompletePayloadSchema = z.object({
  id: UuidSchema,
  resolution: z.string().min(1),
  rootCause: z.string().optional(),
  hourMeterReading: z.number().nonnegative().optional(),
  meterReplaced: z.boolean().optional(),
  meterPhotoMediaId: UuidSchema.optional(),
  customerSignerName: z.string().min(1).optional(),
  signatureStatus: SignatureStatusEnum.optional(),
  signatureReason: z.string().optional(),
  signatureWitnessName: z.string().min(1).optional(),
  signatureMediaId: UuidSchema.optional(),
  documentLocale: DocumentLocaleSchema,
});
export type WorkOrderCompletePayload = z.infer<typeof WorkOrderCompletePayloadSchema>;

/** Responses are merged by item key; the newer `answeredAt` wins. */
export const WorkOrderSaveChecklistPayloadSchema = z.object({
  id: UuidSchema,
  templateVersion: z.number().int().nonnegative(),
  responses: z.array(ChecklistResponseSchema),
});
export type WorkOrderSaveChecklistPayload = z.infer<typeof WorkOrderSaveChecklistPayloadSchema>;

export const WorkOrderAddPartPayloadSchema = z.object({
  /** Id of the new work order part row. */
  id: UuidSchema,
  workOrderId: UuidSchema,
  name: z.string().min(1),
  partNumber: z.string().optional(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitCostCents: z.number().int().nonnegative().optional(),
  partId: UuidSchema.optional(),
  stockLocationId: UuidSchema.optional(),
});
export type WorkOrderAddPartPayload = z.infer<typeof WorkOrderAddPartPayloadSchema>;

export const WorkOrderRemovePartPayloadSchema = z.object({
  id: UuidSchema,
});
export type WorkOrderRemovePartPayload = z.infer<typeof WorkOrderRemovePartPayloadSchema>;
