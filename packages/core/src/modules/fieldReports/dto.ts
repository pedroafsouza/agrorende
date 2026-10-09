import { z } from "zod";

import type { ActivityEventDTO, FieldReportDTO, MediaDTO } from "@agrorende/contracts/dto";
import { FieldReportStatusEnum, PriorityEnum } from "@agrorende/contracts/enums";

export type { FieldReportDTO };

/** Flags stored on `FieldReport.flags` (ARCHITECTURE §5, EC-FR-04, EC-FR-13). */
export interface FieldReportFlags {
  readonly clockSkewed?: boolean;
  readonly unknownAssetId?: string;
  readonly locationAdjusted?: boolean;
  readonly assetRetired?: boolean;
  readonly assetRentedOut?: boolean;
  readonly assetInRepair?: boolean;
  readonly openWorkOrderId?: string;
  readonly busyAsset?: boolean;
  readonly attachedToExistingWorkOrder?: boolean;
  readonly createAnywayReason?: string;
  readonly duplicateOf?: { readonly entityType: "FIELD_REPORT" | "WORK_ORDER"; readonly entityId: string };
  readonly withdrawn?: boolean;
}

const csv = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.length === 0 ? [] : value.split(",").map((part) => part.trim()).filter((part) => part.length > 0)));

export const FieldReportListFilterSchema = z.object({
  status: csv.pipe(z.array(FieldReportStatusEnum)),
  priority: csv.pipe(z.array(PriorityEnum)),
  siteId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  reporterId: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
  from: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});
export type FieldReportListFilter = z.input<typeof FieldReportListFilterSchema>;

export const MarkForRepairInputSchema = z
  .object({
    priority: PriorityEnum.optional(),
    assigneeId: z.string().uuid().optional(),
    scheduledFor: z.string().date().optional(),
    dueAt: z.string().datetime({ offset: true }).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    checklistTemplateId: z.string().uuid().optional(),
    /** EC-FR-15: how to proceed when the asset already has an open work order. */
    existing: z.enum(["attach", "createAnyway"]).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.existing !== "createAnyway" || (value.reason !== undefined && value.reason.length > 0), {
    message: "REASON_REQUIRED",
    path: ["reason"],
  });
export type MarkForRepairInput = z.input<typeof MarkForRepairInputSchema>;

export const MonitorInputSchema = z.object({ note: z.string().trim().min(1, "NOTE_REQUIRED").max(2000) });
export type MonitorInput = z.input<typeof MonitorInputSchema>;

export const DismissInputSchema = z.object({
  reason: z.string().trim().min(1, "REASON_REQUIRED").max(2000),
  /** EC-FR-17 (P1): dismiss as a duplicate of another report or work order. */
  duplicateOf: z.object({ entityType: z.enum(["FIELD_REPORT", "WORK_ORDER"]), entityId: z.string().uuid() }).optional(),
});
export type DismissInput = z.input<typeof DismissInputSchema>;

/** `POST /field-reports/:id/link-asset` (P1, FR-22): links an unregistered machine to an asset. */
export const LinkAssetInputSchema = z.object({ assetId: z.string().uuid() });
export type LinkAssetInput = z.input<typeof LinkAssetInputSchema>;

export interface MarkForRepairResult {
  readonly workOrderId: string;
  readonly workOrderNumber: string;
  readonly attached: boolean;
}

/** The open work order returned in the `ASSET_REPAIR_ALREADY_OPEN` details (EC-FR-15). */
export interface OpenWorkOrderSummary {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly updatedAt: string;
}

export interface FieldReportListItem extends FieldReportDTO {
  readonly assetCode: string | null;
  readonly assetName: string | null;
  readonly siteName: string | null;
  readonly reporterName: string | null;
  readonly mediaCount: number;
  readonly coverMediaId: string | null;
}

export interface FieldReportDetail extends FieldReportListItem {
  readonly media: readonly MediaDTO[];
  readonly asset: { readonly id: string; readonly code: string; readonly name: string; readonly condition: string; readonly category: string } | null;
  readonly reporter: { readonly id: string; readonly name: string; readonly phone: string | null } | null;
  readonly site: { readonly id: string; readonly name: string } | null;
  readonly plot: { readonly id: string; readonly name: string } | null;
  readonly rental: { readonly id: string; readonly number: string; readonly status: string } | null;
  readonly workOrder: { readonly id: string; readonly number: string; readonly status: string; readonly assigneeId: string | null } | null;
  readonly openWorkOrder: OpenWorkOrderSummary | null;
  readonly activity: readonly ActivityEventDTO[];
}
