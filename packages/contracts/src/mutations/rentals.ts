import { z } from "zod";

import {
  AccessoryLineSchema,
  ChecklistItemSchema,
  ChecklistResponseSchema,
} from "../checklist.js";
import {
  DamageMatchStatusEnum,
  DamageSeverityEnum,
  DamageZoneEnum,
  SignatureStatusEnum,
  SignerRoleEnum,
} from "../enums.js";
import { DocumentLocaleSchema, MediaMetaSchema, UuidSchema } from "../sync.js";

/**
 * Payload schemas for `rental.checkout`, `rental.checkin` and `inspection.submit`
 * (ARCHITECTURE section 7.3).
 */

export const DamageInputSchema = z.object({
  id: UuidSchema,
  zone: DamageZoneEnum,
  severity: DamageSeverityEnum,
  description: z.string().optional(),
  /** Recorded at check-out as already present on the asset. */
  isPreExisting: z.boolean().default(false),
  matchStatus: DamageMatchStatusEnum.default("NEW"),
  /** Set when the field agent marks the damage as "same as before". */
  matchedDamageId: UuidSchema.optional(),
  customerStatement: z.string().optional(),
  estimatedCostCents: z.number().int().nonnegative().optional(),
  mediaIds: z.array(UuidSchema).default([]),
});
export type DamageInput = z.infer<typeof DamageInputSchema>;

/** Fields shared by the check-out and check-in inspection payloads. */
const InspectionBaseSchema = z.object({
  id: UuidSchema,
  assetId: UuidSchema,
  templateId: UuidSchema,
  templateVersion: z.number().int().nonnegative(),
  /** Frozen copy of the template items, so the document never changes later. */
  templateSnapshot: z.array(ChecklistItemSchema),
  responses: z.array(ChecklistResponseSchema),
  hourMeter: z.number().nonnegative().optional(),
  odometerKm: z.number().nonnegative().optional(),
  meterReplaced: z.boolean().optional(),
  meterPhotoMediaId: UuidSchema.optional(),
  fuelPercent: z.number().min(0).max(100).optional(),
  accessories: z.array(AccessoryLineSchema),
  documentLocale: DocumentLocaleSchema,
  signerName: z.string().min(1).optional(),
  signerDocument: z.string().min(1).optional(),
  signerRole: SignerRoleEnum.optional(),
  signatureStatus: SignatureStatusEnum,
  signatureReason: z.string().optional(),
  customerSignatureMediaId: UuidSchema.optional(),
  agentSignatureMediaId: UuidSchema,
  damages: z.array(DamageInputSchema).default([]),
  media: z.array(MediaMetaSchema).default([]),
  notes: z.string().optional(),
});

export const CheckOutInspectionSchema = InspectionBaseSchema.extend({
  safetyBriefingGiven: z.boolean(),
  operatorName: z.string().min(1).optional(),
  operatorDocument: z.string().min(1).optional(),
  termsAccepted: z.boolean(),
  termsVersion: z.number().int().optional(),
});
export type CheckOutInspection = z.infer<typeof CheckOutInspectionSchema>;

export const CheckInInspectionSchema = InspectionBaseSchema;
export type CheckInInspection = z.infer<typeof CheckInInspectionSchema>;

export const RentalCheckoutPayloadSchema = z.object({
  rentalId: UuidSchema,
  inspection: CheckOutInspectionSchema,
});
export type RentalCheckoutPayload = z.infer<typeof RentalCheckoutPayloadSchema>;

export const DamageCostSchema = z.object({
  damageId: UuidSchema,
  estimatedCostCents: z.number().int().nonnegative(),
});
export type DamageCost = z.infer<typeof DamageCostSchema>;

export const RentalCheckinPayloadSchema = z.object({
  rentalId: UuidSchema,
  inspection: CheckInInspectionSchema,
  damageCosts: z.array(DamageCostSchema).default([]),
});
export type RentalCheckinPayload = z.infer<typeof RentalCheckinPayloadSchema>;

/**
 * Standalone inspection. It creates an Inspection, Damages and Media without
 * changing rental state; rental check-out and check-in do not use it.
 */
export const InspectionSubmitPayloadSchema = InspectionBaseSchema.extend({
  rentalId: UuidSchema.optional(),
});
export type InspectionSubmitPayload = z.infer<typeof InspectionSubmitPayloadSchema>;
