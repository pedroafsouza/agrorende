import { z } from "zod";
import { FuelLogCreatePayloadSchema } from "@agrorende/contracts/mutations";

import type { FuelLogDTO } from "@agrorende/contracts/dto";

export type { FuelLogDTO };

/** List row: the fuel log plus the machine code and name for display. */
export type FuelLogListItem = FuelLogDTO & { readonly assetCode: string | null; readonly assetName: string | null };

/** Office `POST /fuel-logs`: the same body as the `fuelLog.create` mutation; `id` is optional. */
export const FuelLogCreateInputSchema = FuelLogCreatePayloadSchema.extend({
  id: FuelLogCreatePayloadSchema.shape.id.optional(),
  filledAt: z.string().datetime({ offset: true }).optional(),
});
export type FuelLogCreateInput = z.input<typeof FuelLogCreateInputSchema>;

export interface FuelLogListFilters {
  readonly assetId?: string | null;
  readonly seasonId?: string | null;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly cursor?: string | null;
  readonly limit?: number | null;
}

/** One interval between two fuel logs with increasing hour meters (ERP-07). */
export interface FuelConsumptionPoint {
  readonly fromLogId: string;
  readonly toLogId: string;
  readonly liters: number;
  readonly hours: number;
  readonly litersPerHour: number;
  readonly at: string;
}

/** `GET /fuel-logs/consumption`: litres per engine hour between consecutive readings. */
export interface FuelConsumptionDTO {
  readonly assetId: string;
  readonly averageLitersPerHour: number | null;
  readonly points: readonly FuelConsumptionPoint[];
}

/** @deprecated T01 skeleton placeholder kept for older imports. */
export interface FuelDTO {
  readonly id: string;
  readonly organizationId: string;
}
