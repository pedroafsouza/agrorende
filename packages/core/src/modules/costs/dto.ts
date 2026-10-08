/**
 * Cost roll-up wire shapes (ARCHITECTURE §8 Costs). ARCHITECTURE names `CostRollupRowSchema` in
 * `contracts/dto/costs.ts`, which does not exist yet; change request T09-001 asks for it and these
 * types mirror it field for field until then.
 */

export const COST_GROUP_BYS = ["asset", "site", "plot", "season", "category", "crop"] as const;
export type CostGroupBy = (typeof COST_GROUP_BYS)[number];

/** Key used for records without the grouped reference, shown as "Sem safra / No season" and friends. */
export const COST_NONE_KEY = "none";

export interface CostRollupRow {
  readonly key: string;
  readonly label: string;
  readonly laborCents: number;
  readonly partsCents: number;
  /** P1 (W6): third-party services; 0 until then. */
  readonly externalCents: number;
  /** P1 (W6): fuel logs; 0 until then. */
  readonly fuelCents: number;
  readonly rentInCostCents: number;
  readonly totalCostCents: number;
  readonly rentalRevenueCents: number;
}

export interface CostRollupFilters {
  readonly groupBy?: string | null;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly seasonId?: string | null;
  readonly assetId?: string | null;
  readonly siteId?: string | null;
  readonly locale?: string | null;
}

export interface CostRollupDTO {
  readonly groupBy: CostGroupBy;
  readonly from: string | null;
  readonly to: string | null;
  /** False when the caller is a MANAGER and `showLaborCostToManager` is off; labour is then 0. */
  readonly laborVisible: boolean;
  readonly rows: readonly CostRollupRow[];
  readonly totals: Omit<CostRollupRow, "key" | "label">;
  readonly workOrderCount: number;
  readonly rentalCount: number;
}

/** @deprecated T01 skeleton placeholder kept for older imports. */
export interface CostsDTO {
  readonly id: string;
  readonly organizationId: string;
}
