import { z } from "zod";
import { InspectionTypeEnum, SignatureStatusEnum, SignerRoleEnum } from "../enums.js";
import { AccessoryLineSchema, ChecklistItemSchema, ChecklistResponseSchema } from "../checklist.js";
import { OptionalNumberSchema, OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema, UuidSchema } from "./shared.js";

export const InspectionDTOSchema = SyncDTOSchema.extend({
  type: InspectionTypeEnum,
  rentalId: UuidSchema,
  assetId: UuidSchema,
  performedById: UuidSchema,
  performedAt: z.string().datetime(),
  templateId: OptionalUuidSchema,
  templateVersion: z.number().int().nullish(),
  templateSnapshot: z.array(ChecklistItemSchema),
  responses: z.array(ChecklistResponseSchema),
  hourMeter: OptionalNumberSchema,
  odometerKm: OptionalNumberSchema,
  fuelPercent: OptionalNumberSchema,
  accessories: z.array(AccessoryLineSchema),
  safetyBriefingGiven: z.boolean(),
  operatorName: OptionalStringSchema,
  operatorDocument: OptionalStringSchema,
  termsAccepted: z.boolean(),
  termsVersion: z.number().int().nullish(),
  documentLocale: z.string(),
  signerName: OptionalStringSchema,
  signerDocument: OptionalStringSchema,
  signerRole: SignerRoleEnum.nullish(),
  signatureStatus: SignatureStatusEnum,
  signatureReason: OptionalStringSchema,
  customerSignatureMediaId: OptionalUuidSchema,
  agentSignatureMediaId: OptionalUuidSchema,
  lat: OptionalNumberSchema,
  lng: OptionalNumberSchema,
  notes: OptionalStringSchema,
});
export type InspectionDTO = z.infer<typeof InspectionDTOSchema>;
