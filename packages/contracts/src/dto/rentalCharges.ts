import { z } from "zod";
import { ChargeTypeEnum } from "../enums";
import { OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema, UuidSchema } from "./shared";

export const RentalChargeDTOSchema = SyncDTOSchema.extend({
  rentalId: UuidSchema,
  type: ChargeTypeEnum,
  description: z.string(),
  quantity: z.number(),
  unitAmountCents: z.number().int(),
  amountCents: z.number().int(),
  isAuto: z.boolean(),
  damageId: OptionalUuidSchema,
  accessoryKey: OptionalStringSchema,
});
export type RentalChargeDTO = z.infer<typeof RentalChargeDTOSchema>;
