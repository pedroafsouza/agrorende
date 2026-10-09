import type { AssetCategory, MaintenanceTrigger } from "@agrorende/contracts/enums";
import type { MaintenancePlanDTO } from "@agrorende/contracts/dto";

export type { MaintenancePlanDTO };

/** Due point of one plan for one asset (`GET /maintenance-plans/:id/due`). */
export interface MaintenanceDueRow {
  readonly planId: string;
  readonly assetId: string;
  readonly assetCode: string;
  readonly assetName: string;
  readonly category: AssetCategory;
  readonly trigger: MaintenanceTrigger;
  readonly hourMeter: number | null;
  readonly lastDoneAt: string | null;
  readonly lastDoneHourMeter: number | null;
  readonly nextDueHourMeter: number | null;
  readonly nextDueAt: string | null;
  /** Hours left until `nextDueHourMeter` (negative when overdue). */
  readonly hoursRemaining: number | null;
  /** Whole days left until `nextDueAt` (negative when overdue). */
  readonly daysRemaining: number | null;
  /** Inside the lead window (`leadHours` or `leadDays`) or past the due point. */
  readonly isDue: boolean;
  readonly isOverdue: boolean;
  /** A preventive work order of this plan is open for the asset. */
  readonly hasOpen: boolean;
}

export interface MaintenancePlanRow extends MaintenancePlanDTO {
  readonly assetCode: string | null;
  readonly assetName: string | null;
  readonly assetCount: number;
  readonly dueCount: number;
}
