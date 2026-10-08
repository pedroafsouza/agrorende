import { z } from "zod";
import { DutyStatusEnum, IssueCategoryEnum, RoleEnum } from "../enums.js";
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
