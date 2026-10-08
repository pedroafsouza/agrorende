import { z } from "zod";
import { CriticalWindowSchema } from "@agrorende/contracts/checklist";
import type { SeasonDTO } from "@agrorende/contracts/dto";

export type { SeasonDTO } from "@agrorende/contracts/dto";
export type { CriticalWindow } from "@agrorende/contracts/checklist";

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

export const SeasonCreateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    crop: z.string().trim().max(80).nullish(),
    startsOn: DateOnly,
    endsOn: DateOnly,
    isCurrent: z.boolean().default(false),
    criticalWindows: z.array(CriticalWindowSchema).default([]),
  })
  .refine((value) => value.startsOn <= value.endsOn, { path: ["endsOn"], message: "range" });
export type SeasonCreateInput = z.input<typeof SeasonCreateInputSchema>;

export const SeasonUpdateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  crop: z.string().trim().max(80).nullish(),
  startsOn: DateOnly.optional(),
  endsOn: DateOnly.optional(),
  isCurrent: z.boolean().optional(),
  criticalWindows: z.array(CriticalWindowSchema).optional(),
});
export type SeasonUpdateInput = z.input<typeof SeasonUpdateInputSchema>;

export const SeasonCloseInputSchema = z.object({
  confirmOpenWork: z.boolean().default(false),
  note: z.string().trim().max(1000).nullish(),
});
export type SeasonCloseInput = z.input<typeof SeasonCloseInputSchema>;

export interface SeasonOpenWork {
  readonly openWorkOrders: number;
  readonly activeRentals: number;
}

export type SeasonCloseResult =
  | { readonly closed: true; readonly season: SeasonDTO }
  | { readonly closed: false; readonly warning: "SEASON_OPEN_WORK_WARNING"; readonly openWork: SeasonOpenWork };
