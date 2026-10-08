import { z } from "zod";
import { CriticalWindowSchema } from "../checklist.js";
import { IsoDateSchema, OptionalStringSchema, SyncDTOSchema } from "./shared.js";

export const SeasonDTOSchema = SyncDTOSchema.extend({
  name: z.string(),
  crop: OptionalStringSchema,
  startsOn: IsoDateSchema,
  endsOn: IsoDateSchema,
  isCurrent: z.boolean(),
  criticalWindows: z.array(CriticalWindowSchema),
});
export type SeasonDTO = z.infer<typeof SeasonDTOSchema>;
