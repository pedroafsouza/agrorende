import { z } from "zod";
import { OptionalStringSchema, OptionalUuidSchema, SyncDTOSchema, UuidSchema } from "./shared";

export const WorkOrderPartDTOSchema = SyncDTOSchema.extend({
  workOrderId: UuidSchema,
  name: z.string(),
  partNumber: OptionalStringSchema,
  quantity: z.number(),
  unit: z.string(),
  unitCostCents: z.number().int().nullish(),
  partId: OptionalUuidSchema,
  stockLocationId: OptionalUuidSchema,
  addedById: UuidSchema,
});
export type WorkOrderPartDTO = z.infer<typeof WorkOrderPartDTOSchema>;
