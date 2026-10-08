import { z } from "zod";

import {
  IssueCategoryEnum,
  PriorityEnum,
  SuggestedActionEnum,
} from "../enums.js";
import { MediaMetaSchema, UuidSchema } from "../sync.js";

/** Payload schemas for the `fieldReport.*` mutations (ARCHITECTURE section 7.3). */

export const FieldReportCreatePayloadSchema = z
  .object({
    id: UuidSchema,
    assetId: UuidSchema.optional(),
    /** Used when the asset is not registered, or when the QR code is unknown. */
    unregisteredAssetDesc: z.string().min(1).optional(),
    siteId: UuidSchema.optional(),
    plotId: UuidSchema.optional(),
    category: IssueCategoryEnum,
    priority: PriorityEnum,
    machineOperable: z.boolean(),
    suggestedAction: SuggestedActionEnum,
    title: z.string().min(1),
    description: z.string().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    accuracyM: z.number().nonnegative().optional(),
    /** P1: the reporter moved the pin away from the device fix. */
    locationAdjusted: z.boolean().optional(),
    media: z.array(MediaMetaSchema).default([]),
  })
  .refine(
    (value) => value.assetId !== undefined || value.unregisteredAssetDesc !== undefined,
    { message: "Either assetId or unregisteredAssetDesc is required." },
  );
export type FieldReportCreatePayload = z.infer<typeof FieldReportCreatePayloadSchema>;

export const FieldReportUpdatePayloadSchema = z.object({
  id: UuidSchema,
  patch: z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    category: IssueCategoryEnum.optional(),
    priority: PriorityEnum.optional(),
    machineOperable: z.boolean().optional(),
    suggestedAction: SuggestedActionEnum.optional(),
  }),
});
export type FieldReportUpdatePayload = z.infer<typeof FieldReportUpdatePayloadSchema>;

export const FieldReportWithdrawPayloadSchema = z.object({
  id: UuidSchema,
  reason: z.string().min(1),
});
export type FieldReportWithdrawPayload = z.infer<typeof FieldReportWithdrawPayloadSchema>;
