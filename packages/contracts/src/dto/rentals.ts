import { z } from "zod";
import { DeliveryModeEnum, FuelPolicyEnum, RateUnitEnum, RentalDirectionEnum, RentalStatusEnum } from "../enums.js";
import { TaxIdTypeSchema } from "./customers.js";
import { IsoDateTimeSchema, OptionalDateTimeSchema, OptionalIntegerCentsSchema, OptionalNumberSchema, OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema, UuidSchema } from "./shared.js";

export const RentalCustomerSnapshotSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  taxIdType: TaxIdTypeSchema.nullish(),
  taxId: OptionalStringSchema,
  taxIdMasked: OptionalStringSchema,
});
export type RentalCustomerSnapshot = z.infer<typeof RentalCustomerSnapshotSchema>;

export const RentalDTOSchema = SyncDTOSchema.extend({
  number: z.string(),
  direction: RentalDirectionEnum,
  status: RentalStatusEnum,
  assetId: UuidSchema,
  customerId: UuidSchema,
  customerSnapshot: RentalCustomerSnapshotSchema.optional(),
  siteId: OptionalUuidSchema,
  seasonId: OptionalUuidSchema,
  agentId: OptionalUuidSchema,
  createdById: UuidSchema,
  plannedStart: IsoDateTimeSchema,
  plannedEnd: IsoDateTimeSchema,
  actualStart: OptionalDateTimeSchema,
  actualEnd: OptionalDateTimeSchema,
  rateCents: z.number().int(),
  rateUnit: RateUnitEnum,
  depositCents: z.number().int(),
  includedHoursPerDay: OptionalNumberSchema,
  extraHourRateCents: OptionalIntegerCentsSchema,
  lateFeePerDayCents: OptionalIntegerCentsSchema,
  fuelPolicy: FuelPolicyEnum,
  fuelPriceCents: OptionalIntegerCentsSchema,
  deliveryMode: DeliveryModeEnum,
  deliveryAddress: OptionalStringSchema,
  deliverySiteId: OptionalUuidSchema,
  deliveryLat: OptionalNumberSchema,
  deliveryLng: OptionalNumberSchema,
  documentLocale: z.string(),
  termsVersion: z.number().int().nullish(),
  notes: OptionalStringSchema,
  checkOutInspectionId: OptionalUuidSchema,
  checkInInspectionId: OptionalUuidSchema,
  chargesTotalCents: OptionalIntegerCentsSchema,
  chargesVersion: z.number().int(),
  balanceDueCents: OptionalIntegerCentsSchema,
  dueSoonNotifiedAt: OptionalDateTimeSchema,
  overdueNotifiedAt: OptionalDateTimeSchema,
  settlementRef: OptionalStringSchema,
  closedAt: OptionalDateTimeSchema,
  closedById: OptionalUuidSchema,
  cancelledAt: OptionalDateTimeSchema,
  cancelReason: OptionalStringSchema,
});
export type RentalDTO = z.infer<typeof RentalDTOSchema>;
