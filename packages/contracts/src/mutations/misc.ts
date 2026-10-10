import { z } from "zod";

import { DutyStatusEnum, EntityTypeEnum } from "../enums";
import { MediaMetaSchema, UuidSchema } from "../sync";

/**
 * Payload schemas for the remaining mutations of the catalog in
 * ARCHITECTURE section 7.3: assets, users, notifications, comments and fuel logs.
 */

/** Readings are monotonic unless the meter was replaced with photo evidence. */
export const AssetUpdateReadingsPayloadSchema = z.object({
  assetId: UuidSchema,
  hourMeter: z.number().nonnegative().optional(),
  odometerKm: z.number().nonnegative().optional(),
  meterReplaced: z.boolean().optional(),
  meterPhotoMediaId: UuidSchema.optional(),
});
export type AssetUpdateReadingsPayload = z.infer<typeof AssetUpdateReadingsPayloadSchema>;

/** Going on duty requires location consent; the server returns LOCATION_CONSENT_REQUIRED otherwise. */
export const UserSetDutyPayloadSchema = z.object({
  status: DutyStatusEnum,
  consent: z.literal(true).optional(),
});
export type UserSetDutyPayload = z.infer<typeof UserSetDutyPayloadSchema>;

export const NotificationMarkReadPayloadSchema = z.object({
  ids: z.array(UuidSchema).min(1),
});
export type NotificationMarkReadPayload = z.infer<typeof NotificationMarkReadPayloadSchema>;

/** P1. */
export const CommentCreatePayloadSchema = z.object({
  id: UuidSchema,
  entityType: EntityTypeEnum,
  entityId: UuidSchema,
  body: z.string().min(1),
});
export type CommentCreatePayload = z.infer<typeof CommentCreatePayloadSchema>;

/** P1. */
export const FuelLogCreatePayloadSchema = z.object({
  id: UuidSchema,
  assetId: UuidSchema,
  liters: z.number().positive(),
  pricePerLiterCents: z.number().int().nonnegative().optional(),
  hourMeter: z.number().nonnegative().optional(),
  odometerKm: z.number().nonnegative().optional(),
  siteId: UuidSchema.optional(),
  plotId: UuidSchema.optional(),
  media: z.array(MediaMetaSchema).default([]),
  notes: z.string().optional(),
});
export type FuelLogCreatePayload = z.infer<typeof FuelLogCreatePayloadSchema>;
