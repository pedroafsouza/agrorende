import { z } from "zod";
import { StockLocationTypeEnum } from "../enums.js";
import { OptionalUuidSchema, SyncDTOSchema } from "./shared.js";

export const StockLocationDTOSchema = SyncDTOSchema.extend({
  name: z.string(),
  type: StockLocationTypeEnum,
  userId: OptionalUuidSchema,
  siteId: OptionalUuidSchema,
});
export type StockLocationDTO = z.infer<typeof StockLocationDTOSchema>;
