import type {
  AssetSeams,
  AssetSummary,
  ChecklistSeams,
  CustomerSeams,
  FieldReportSeams,
  LiveFix,
  LiveOperator,
  LocationSeams,
  MediaRow,
  MediaSeams,
  NotificationSeams,
  RentalSeams,
  SeasonSeams,
  SiteSeams,
  SiteSummary,
  SyncSeams,
  TechnicianSummary,
  Tx,
  UserSeams,
  WorkOrderSeams,
} from "@agrorende/contracts/seams";
import type { AssetCategory, AssetCondition, ChecklistKind, NotificationType, Role, WorkOrderStatus } from "@agrorende/contracts/enums";
import type { CriticalWindow } from "@agrorende/contracts/checklist";
import type { ChecklistSnapshot, CreateWorkOrderInput, EntityRef, WorkOrderBillingPart } from "@agrorende/contracts/dto";
import type { Ctx } from "@agrorende/contracts/seams";

import { notImplemented } from "./errors.js";
import * as assetsService from "./modules/assets/service.js";
import * as checklistsService from "./modules/checklists/service.js";
import * as customersService from "./modules/customers/service.js";
import { locationSeamsImpl } from "./modules/locations/service.js";
import * as mediaService from "./modules/media/service.js";
import * as seasonsService from "./modules/seasons/service.js";
import * as sitesService from "./modules/sites/service.js";
import * as usersService from "./modules/users/service.js";
import * as notify from "./notify/index.js";
import { touchDependents } from "./sync/touch.js";
import type { SyncTx } from "./sync/types.js";

export async function getAssetSummary(tx: Tx, assetId: string): Promise<AssetSummary> {
  return assetsService.getSummary(tx, assetId);
}

export async function listAssetSummaries(
  tx: Tx,
  orgId: string,
  filter: { ids?: string[]; category?: AssetCategory; includeRetired?: boolean },
): Promise<AssetSummary[]> {
  return assetsService.listSummaries(tx, orgId, filter);
}

export async function recomputeAssetCondition(tx: Tx, assetId: string): Promise<AssetCondition> {
  return assetsService.recomputeCondition(tx, assetId);
}

export async function applyAssetReadings(
  tx: Tx,
  ctx: Ctx,
  assetId: string,
  readings: { hourMeter?: number; odometerKm?: number; source: EntityRef },
): Promise<{ ignored: ("hourMeter" | "odometerKm")[] }> {
  return assetsService.applyReadings(tx, ctx, assetId, readings);
}

export async function setAssetCustody(
  tx: Tx,
  assetId: string,
  custody: { currentRentalId: string | null; currentSiteId?: string },
): Promise<void> {
  return assetsService.setCustody(tx, assetId, custody);
}

export const assetSeams = {
  getSummary: getAssetSummary,
  listSummaries: listAssetSummaries,
  recomputeCondition: recomputeAssetCondition,
  applyReadings: applyAssetReadings,
  setCustody: setAssetCustody,
} satisfies AssetSeams;

export async function currentSeasonId(tx: Tx, orgId: string): Promise<string | null> {
  return seasonsService.currentSeasonId(tx, orgId);
}

export async function criticalWindowFor(tx: Tx, orgId: string, category: AssetCategory, at: Date): Promise<CriticalWindow | null> {
  return seasonsService.criticalWindowFor(tx, orgId, category, at);
}

export const seasonSeams = { currentSeasonId, criticalWindowFor } satisfies SeasonSeams;

export async function snapshotPublishedChecklist(tx: Tx, templateId: string): Promise<ChecklistSnapshot> {
  return checklistsService.snapshotPublished(tx, templateId);
}

export async function defaultChecklistTemplateId(tx: Tx, orgId: string, kind: ChecklistKind, category: AssetCategory): Promise<string | null> {
  return checklistsService.defaultTemplateId(tx, orgId, kind, category);
}

export const checklistSeams = {
  snapshotPublished: snapshotPublishedChecklist,
  defaultTemplateId: defaultChecklistTemplateId,
} satisfies ChecklistSeams;

export async function getSiteSummary(tx: Tx, siteId: string): Promise<SiteSummary> {
  return sitesService.getSummary(tx, siteId);
}

export const siteSeams = { getSummary: getSiteSummary } satisfies SiteSeams;

export async function getCustomerForEligibility(tx: Tx, customerId: string): Promise<{ id: string; hasDocument: boolean; hasPhone: boolean }> {
  return customersService.getForEligibility(tx, customerId);
}

export const customerSeams = { getForEligibility: getCustomerForEligibility } satisfies CustomerSeams;

export async function listActiveTechnicians(tx: Tx, orgId: string): Promise<TechnicianSummary[]> {
  return usersService.listActiveTechnicians(tx as SyncTx, orgId);
}

export const userSeams = { listActiveTechnicians } satisfies UserSeams;

export async function listMediaForParent(tx: Tx, parent: EntityRef): Promise<MediaRow[]> {
  return mediaService.listForParent(tx as SyncTx, parent);
}

export async function markLateEvidence(tx: Tx, mediaIds: string[]): Promise<void> {
  return mediaService.markLateEvidence(tx as SyncTx, mediaIds);
}

export const mediaSeams = { listForParent: listMediaForParent, markLateEvidence } satisfies MediaSeams;

export async function createSeamNotification(
  tx: Tx,
  notification: { type: NotificationType; userIds: string[]; entity: EntityRef; params: Record<string, string | number> },
): Promise<void> {
  await notify.createNotification(tx as SyncTx, notification);
}

export async function notificationOfficeRecipients(tx: Tx, orgId: string, roles: Role[]): Promise<string[]> {
  return notify.officeRecipients(tx as SyncTx, orgId, roles);
}

export const notificationSeams = {
  create: createSeamNotification,
  officeRecipients: notificationOfficeRecipients,
} satisfies NotificationSeams;

export async function touchSyncDependents(tx: Tx, entity: EntityRef): Promise<void> {
  return touchDependents(tx as SyncTx, entity);
}

export const syncSeams = { touchDependents: touchSyncDependents } satisfies SyncSeams;

export async function lastLocationFixes(orgId: string, userIds: string[]): Promise<Map<string, LiveFix>> {
  return locationSeamsImpl.lastFixes(orgId, userIds);
}

export async function liveLocationSnapshot(orgId: string): Promise<LiveOperator[]> {
  return locationSeamsImpl.liveSnapshot(orgId);
}

export const locationSeams = { lastFixes: lastLocationFixes, liveSnapshot: liveLocationSnapshot } satisfies LocationSeams;

export async function createFieldReportFromDamage(
  _tx: Tx,
  _ctx: Ctx,
  _damage: { damageId: string; rentalId: string; assetId: string },
): Promise<{ id: string; number: string }> {
  return notImplemented("seams.fieldReports.createFromDamage");
}

export const fieldReportSeams = { createFromDamage: createFieldReportFromDamage } satisfies FieldReportSeams;

export async function createWorkOrderFromSource(_tx: Tx, _ctx: Ctx, _input: CreateWorkOrderInput): Promise<{ id: string; number: string }> {
  return notImplemented("seams.workOrders.createFromSource");
}

export async function openWorkOrderCountByAssignee(_tx: Tx, _orgId: string): Promise<Map<string, number>> {
  return notImplemented("seams.workOrders.openCountByAssignee");
}

export async function maintenanceStatus(
  _tx: Tx,
  _planId: string,
  _assetIds: string[],
): Promise<Map<string, { hasOpen: boolean; lastCompleted: { at: Date; hourMeter: number | null } | null }>> {
  return notImplemented("seams.workOrders.maintenanceStatus");
}

export async function workOrderBillingSnapshot(
  _tx: Tx,
  _workOrderId: string,
): Promise<{
  id: string;
  number: string;
  status: WorkOrderStatus;
  customerId: string | null;
  workMinutes: number | null;
  laborCostCents: number | null;
  parts: WorkOrderBillingPart[];
  externalCostCents: number | null;
  externalCostNote: string | null;
}> {
  return notImplemented("seams.workOrders.billingSnapshot");
}

export const workOrderSeams = {
  createFromSource: createWorkOrderFromSource,
  openCountByAssignee: openWorkOrderCountByAssignee,
  maintenanceStatus,
  billingSnapshot: workOrderBillingSnapshot,
} satisfies WorkOrderSeams;

export async function markRentalDamagesRepaired(_tx: Tx, _input: { workOrderId: string; damageIds: string[] }): Promise<void> {
  return notImplemented("seams.rentals.markDamagesRepaired");
}

export async function activeRentalForAsset(_tx: Tx, _assetId: string): Promise<{ id: string; number: string } | null> {
  return notImplemented("seams.rentals.activeRentalForAsset");
}

export const rentalSeams = {
  markDamagesRepaired: markRentalDamagesRepaired,
  activeRentalForAsset,
} satisfies RentalSeams;
