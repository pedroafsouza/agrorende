import { z } from "zod";
import { SyncDTOSchema, UuidSchema } from "./shared";

export const StockLevelDTOSchema = SyncDTOSchema.extend({
  partId: UuidSchema,
  stockLocationId: UuidSchema,
  quantity: z.number(),
});
export type StockLevelDTO = z.infer<typeof StockLevelDTOSchema>;
