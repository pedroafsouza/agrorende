import { z } from "zod";
import { StockLocationTypeEnum } from "../enums";
import { OptionalUuidSchema, SyncDTOSchema } from "./shared";

export const StockLocationDTOSchema = SyncDTOSchema.extend({
  name: z.string(),
  type: StockLocationTypeEnum,
  userId: OptionalUuidSchema,
  siteId: OptionalUuidSchema,
});
export type StockLocationDTO = z.infer<typeof StockLocationDTOSchema>;
