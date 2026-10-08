import { z } from "zod";
import { OptionalDateTimeSchema, OptionalStringSchema, SyncDTOSchema } from "./shared.js";

export const TaxIdTypeSchema = z.enum(["CPF", "CNPJ"]);
export type TaxIdType = z.infer<typeof TaxIdTypeSchema>;

export const CustomerDTOSchema = SyncDTOSchema.extend({
  name: z.string(),
  tradeName: OptionalStringSchema,
  taxIdType: TaxIdTypeSchema.nullish(),
  taxId: OptionalStringSchema,
  taxIdMasked: OptionalStringSchema,
  phone: OptionalStringSchema,
  whatsapp: OptionalStringSchema,
  email: OptionalStringSchema,
  address: OptionalStringSchema,
  city: OptionalStringSchema,
  state: OptionalStringSchema,
  isSupplier: z.boolean(),
  notes: OptionalStringSchema,
  archivedAt: OptionalDateTimeSchema,
});
export type CustomerDTO = z.infer<typeof CustomerDTOSchema>;
