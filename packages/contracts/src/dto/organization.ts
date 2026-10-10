import { z } from "zod";
import { OrgStatusEnum } from "../enums";
import { OrgSettingsSchema } from "../settings";
import { IsoDateTimeSchema, OptionalDateTimeSchema, OptionalStringSchema, OptionalUuidSchema, SyncVersionSchema, UuidSchema } from "./shared";

export const OrganizationDTOSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  legalName: OptionalStringSchema,
  taxId: OptionalStringSchema,
  timezone: z.string(),
  locale: z.string(),
  supportedLocales: z.array(z.string()),
  currency: z.string(),
  status: OrgStatusEnum,
  plan: z.string(),
  trialEndsAt: OptionalDateTimeSchema,
  pastDueAt: OptionalDateTimeSchema,
  suspendedAt: OptionalDateTimeSchema,
  cancelledAt: OptionalDateTimeSchema,
  purgeAfter: OptionalDateTimeSchema,
  termsVersion: OptionalStringSchema,
  termsAcceptedAt: OptionalDateTimeSchema,
  termsAcceptedById: OptionalUuidSchema,
  signupSource: OptionalStringSchema,
  expectedFieldUsers: OptionalStringSchema,
  createdById: OptionalUuidSchema,
  settings: OrgSettingsSchema,
  syncVersion: SyncVersionSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type OrganizationDTO = z.infer<typeof OrganizationDTOSchema>;
