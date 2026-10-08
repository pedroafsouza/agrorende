import { FieldReportStatusEnum, PriorityEnum } from "@agrorende/contracts/enums";

export type { FieldReportDetail, FieldReportListItem, MarkForRepairResult, OpenWorkOrderSummary } from "@agrorende/core/modules/fieldReports/dto";

export const REPORT_STATUSES = FieldReportStatusEnum.options;
export const PRIORITIES = PriorityEnum.options;
/** Default inbox view: reports that still need an office decision. */
export const TRIAGE_STATUSES = "SUBMITTED,IN_REVIEW";
export const ALL = "ALL";

export interface ReportFlagsView {
  readonly clockSkewed?: boolean;
  readonly unknownAssetId?: string;
  readonly assetRetired?: boolean;
  readonly assetRentedOut?: boolean;
  readonly assetInRepair?: boolean;
  readonly openWorkOrderId?: string;
  readonly busyAsset?: boolean;
  readonly duplicateOf?: { readonly entityType: string; readonly entityId: string };
  readonly withdrawn?: boolean;
  readonly fromDamage?: boolean;
}

/** Flag keys shown as notes on the detail page, in display order. */
export function reportFlagKeys(flags: unknown, damageId: string | null | undefined): string[] {
  const f = (typeof flags === "object" && flags !== null ? flags : {}) as ReportFlagsView;
  const out: string[] = [];
  if (f.busyAsset === true) out.push("busyAsset");
  if (f.unknownAssetId !== undefined) out.push("unknownAsset");
  if (f.assetRetired === true) out.push("assetRetired");
  if (f.assetRentedOut === true) out.push("assetRentedOut");
  if (f.assetInRepair === true) out.push("assetInRepair");
  if (f.openWorkOrderId !== undefined) out.push("openWorkOrder");
  if (f.clockSkewed === true) out.push("clockSkewed");
  if (f.duplicateOf !== undefined) out.push("duplicateOf");
  if (f.withdrawn === true) out.push("withdrawn");
  if (damageId !== null && damageId !== undefined) out.push("fromDamage");
  return out;
}

/** Turns the inbox status filter into the API's comma list; `ALL` drops the filter. */
export function statusQuery(value: string): string | undefined {
  return value === ALL || value.length === 0 ? undefined : value;
}
