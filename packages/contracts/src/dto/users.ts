import { z } from "zod";
import { DutyStatusEnum, IssueCategoryEnum, NotificationTypeEnum, RoleEnum, type NotificationType } from "../enums.js";
import { LocaleSchema } from "../settings.js";
import { OptionalDateTimeSchema, OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema } from "./shared.js";

export const UserDTOSchema = SyncDTOSchema.extend({
  name: z.string(),
  phone: OptionalStringSchema,
  role: RoleEnum,
  skills: z.array(IssueCategoryEnum),
  locale: z.string().optional(),
  avatarMediaId: OptionalUuidSchema,
  isActive: z.boolean(),
  joinedAt: OptionalDateTimeSchema,
  disabledAt: OptionalDateTimeSchema,
  archivedAt: OptionalDateTimeSchema,
  dutyStatus: DutyStatusEnum,
  dutyChangedAt: OptionalDateTimeSchema,
  locationConsentAt: OptionalDateTimeSchema,
  scopeEpoch: z.number().int().optional(),
  homeSiteId: OptionalUuidSchema,
  vanStockLocationId: OptionalUuidSchema,
  lastSeenAt: OptionalDateTimeSchema,
});
export type UserDTO = z.infer<typeof UserDTOSchema>;

/**
 * Per-user push mute settings (change request T05-008). `notifications.push` skips users with
 * `pushMuted` and notification types listed in `mutedTypes`; in-app notifications are still created.
 */
export const NotificationPrefsSchema = z.object({
  pushMuted: z.boolean(),
  mutedTypes: z.array(NotificationTypeEnum),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

export const DEFAULT_NOTIFICATION_PREFS: { readonly pushMuted: false; readonly mutedTypes: readonly NotificationType[] } = { pushMuted: false, mutedTypes: [] };

/** Reads stored prefs leniently: documents written before T05-008 have none, and unknown types are dropped. */
export function notificationPrefsOf(value: unknown): NotificationPrefs {
  if (typeof value !== "object" || value === null) return { pushMuted: false, mutedTypes: [] };
  const raw = value as { pushMuted?: unknown; mutedTypes?: unknown };
  const mutedTypes = Array.isArray(raw.mutedTypes) ? raw.mutedTypes.filter((t): t is NotificationType => NotificationTypeEnum.safeParse(t).success) : [];
  return { pushMuted: raw.pushMuted === true, mutedTypes: [...new Set(mutedTypes)] };
}

/** The caller's own user row, returned by `GET /auth/me` and `PATCH /me`. */
export const SelfUserDTOSchema = UserDTOSchema.extend({
  notificationPrefs: NotificationPrefsSchema,
});
export type SelfUserDTO = z.infer<typeof SelfUserDTOSchema>;

/** `PATCH /me`: every field is optional, and `notificationPrefs` is merged into the stored prefs. */
export const UpdateMeInputSchema = z
  .object({
    locale: LocaleSchema.optional(),
    notificationPrefs: z
      .object({
        pushMuted: z.boolean().optional(),
        mutedTypes: z.array(NotificationTypeEnum).max(NotificationTypeEnum.options.length).optional(),
      })
      .strict()
      .optional(),
  })
  .refine((input) => input.locale !== undefined || input.notificationPrefs !== undefined, { message: "empty", path: ["locale"] });
export type UpdateMeInput = z.infer<typeof UpdateMeInputSchema>;
