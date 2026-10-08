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
import * as mediaService from "./modules/media/service.js";
import * as usersService from "./modules/users/service.js";
import * as notify from "./notify/index.js";
import { touchDependents } from "./sync/touch.js";
import type { SyncTx } from "./sync/types.js";

export async function getAssetSummary(_tx: Tx, _assetId: string): Promise<AssetSummary> {
  return notImplemented("seams.assets.getSummary");
}

export async function listAssetSummaries(
  _tx: Tx,
  _orgId: string,
  _filter: { ids?: string[]; category?: AssetCategory; includeRetired?: boolean },
): Promise<AssetSummary[]> {
  return notImplemented("seams.assets.listSummaries");
}

export async function recomputeAssetCondition(_tx: Tx, _assetId: string): Promise<AssetCondition> {
  return notImplemented("seams.assets.recomputeCondition");
}

export async function applyAssetReadings(
  _tx: Tx,
  _ctx: Ctx,
  _assetId: string,
  _readings: { hourMeter?: number; odometerKm?: number; source: EntityRef },
): Promise<{ ignored: ("hourMeter" | "odometerKm")[] }> {
  return notImplemented("seams.assets.applyReadings");
}

export async function setAssetCustody(
  _tx: Tx,
  _assetId: string,
  _custody: { currentRentalId: string | null; currentSiteId?: string },
): Promise<void> {
  return notImplemented("seams.assets.setCustody");
}

export const assetSeams = {
  getSummary: getAssetSummary,
  listSummaries: listAssetSummaries,
  recomputeCondition: recomputeAssetCondition,
  applyReadings: applyAssetReadings,
  setCustody: setAssetCustody,
} satisfies AssetSeams;

export async function currentSeasonId(_tx: Tx, _orgId: string): Promise<string | null> {
  return notImplemented("seams.seasons.currentSeasonId");
}

export async function criticalWindowFor(_tx: Tx, _orgId: string, _category: AssetCategory, _at: Date): Promise<CriticalWindow | null> {
  return notImplemented("seams.seasons.criticalWindowFor");
}

export const seasonSeams = { currentSeasonId, criticalWindowFor } satisfies SeasonSeams;

export async function snapshotPublishedChecklist(_tx: Tx, _templateId: string): Promise<ChecklistSnapshot> {
  return notImplemented("seams.checklists.snapshotPublished");
}

export async function defaultChecklistTemplateId(
  _tx: Tx,
  _orgId: string,
  _kind: ChecklistKind,
  _category: AssetCategory,
): Promise<string | null> {
  return notImplemented("seams.checklists.defaultTemplateId");
}

export const checklistSeams = {
  snapshotPublished: snapshotPublishedChecklist,
  defaultTemplateId: defaultChecklistTemplateId,
} satisfies ChecklistSeams;

export async function getSiteSummary(_tx: Tx, _siteId: string): Promise<SiteSummary> {
  return notImplemented("seams.sites.getSummary");
}

export const siteSeams = { getSummary: getSiteSummary } satisfies SiteSeams;

export async function getCustomerForEligibility(_tx: Tx, _customerId: string): Promise<{ id: string; hasDocument: boolean; hasPhone: boolean }> {
  return notImplemented("seams.customers.getForEligibility");
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

export async function lastLocationFixes(_orgId: string, _userIds: string[]): Promise<Map<string, LiveFix>> {
  return notImplemented("seams.locations.lastFixes");
}

export async function liveLocationSnapshot(_orgId: string): Promise<LiveOperator[]> {
  return notImplemented("seams.locations.liveSnapshot");
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
