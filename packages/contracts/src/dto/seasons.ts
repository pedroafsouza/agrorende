import { z } from "zod";
import { CriticalWindowSchema } from "../checklist";
import { IsoDateSchema, OptionalStringSchema, SyncDTOSchema } from "./shared";

export const SeasonDTOSchema = SyncDTOSchema.extend({
  name: z.string(),
  crop: OptionalStringSchema,
  startsOn: IsoDateSchema,
  endsOn: IsoDateSchema,
  isCurrent: z.boolean(),
  criticalWindows: z.array(CriticalWindowSchema),
});
export type SeasonDTO = z.infer<typeof SeasonDTOSchema>;
