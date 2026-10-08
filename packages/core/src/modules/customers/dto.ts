import { z } from "zod";
import { isValidTaxId, normalizeTaxId } from "@agrorende/contracts";

export type { CustomerDTO } from "@agrorende/contracts/dto";

const OptionalText = z.string().trim().max(500).nullish();
const Phone = z
  .string()
  .trim()
  .max(40)
  .regex(/^\+?[\d\s().-]{8,}$/u, "phone")
  .nullish()
  .or(z.literal("").transform(() => null));

export const TaxIdInputSchema = z
  .string()
  .trim()
  .max(24)
  .nullish()
  .transform((value) => (value === undefined || value === null || value.length === 0 ? null : normalizeTaxId(value)))
  .refine((value) => value === null || isValidTaxId(value), { message: "taxId" });

export const CustomerCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  tradeName: OptionalText,
  taxId: TaxIdInputSchema,
  phone: Phone,
  whatsapp: Phone,
  email: z.string().trim().email().max(200).nullish().or(z.literal("").transform(() => null)),
  address: OptionalText,
  city: OptionalText,
  state: z.string().trim().max(40).nullish(),
  isSupplier: z.boolean().default(false),
  notes: z.string().trim().max(4000).nullish(),
});
export type CustomerCreateInput = z.input<typeof CustomerCreateInputSchema>;

export const CustomerUpdateInputSchema = CustomerCreateInputSchema.partial().extend({ archived: z.boolean().optional() });
export type CustomerUpdateInput = z.input<typeof CustomerUpdateInputSchema>;

export const CustomerListFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  supplier: z.enum(["true", "false"]).optional(),
  incomplete: z.enum(["true", "false"]).optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});
export type CustomerListFilter = z.infer<typeof CustomerListFilterSchema>;

export interface CustomerEligibility {
  readonly id: string;
  readonly hasDocument: boolean;
  readonly hasPhone: boolean;
}
