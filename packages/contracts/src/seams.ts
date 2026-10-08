import type { AssetCategory, AssetCondition, AssetOwnerType, ChecklistKind, NotificationType, RateUnit, Role, WorkOrderStatus } from "./enums.js";
import type { CreateWorkOrderInput, WorkOrderBillingPart } from "./dto/workOrders.js";
import type { CriticalWindow } from "./checklist.js";
import type { ChecklistSnapshot, EntityRef, SiteDTO } from "./dto/index.js";
import type { MediaDTO } from "./dto/media.js";
import type { OperatorState } from "./realtime.js";

export type Tx = unknown;

export interface Ctx {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: Role;
  readonly deviceId?: string | null;
}

export interface AssetSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: AssetCategory;
  readonly condition: AssetCondition;
  readonly ownerType: AssetOwnerType;
  readonly homeSiteId: string | null;
  readonly currentSiteId: string | null;
  readonly currentRentalId: string | null;
  readonly lastLat: number | null;
  readonly lastLng: number | null;
  readonly hourMeter: number | null;
  readonly odometerKm: number | null;
  readonly tankCapacityL: number | null;
  readonly isRentable: boolean;
  readonly defaultRateCents: number | null;
  readonly defaultRateUnit: RateUnit | null;
}

export type SiteSummary = Pick<SiteDTO, "id" | "name" | "type" | "lat" | "lng" | "radiusM">;

export interface TechnicianSummary {
  readonly id: string;
  readonly name: string;
  readonly dutyStatus: "OFF_DUTY" | "ON_DUTY";
  readonly homeSiteId?: string | null;
}

export type MediaRow = MediaDTO;

export interface LiveFix {
  readonly userId: string;
  readonly lat: number;
  readonly lng: number;
  readonly accuracyM?: number;
  readonly heading?: number;
  readonly speedMps?: number;
  readonly recordedAt: Date;
}

export interface LiveOperator extends LiveFix {
  readonly name: string;
  readonly dutyStatus: "OFF_DUTY" | "ON_DUTY";
  readonly state: OperatorState;
  readonly lastSeenAt: Date | null;
}

export interface AssetSeams {
  getSummary(tx: Tx, assetId: string): Promise<AssetSummary>;
  listSummaries(tx: Tx, orgId: string, f: { ids?: string[]; category?: AssetCategory; includeRetired?: boolean }): Promise<AssetSummary[]>;
  recomputeCondition(tx: Tx, assetId: string): Promise<AssetCondition>;
  applyReadings(tx: Tx, ctx: Ctx, assetId: string, r: { hourMeter?: number; odometerKm?: number; source: EntityRef }): Promise<{ ignored: ("hourMeter" | "odometerKm")[] }>;
  setCustody(tx: Tx, assetId: string, c: { currentRentalId: string | null; currentSiteId?: string }): Promise<void>;
}

export interface SeasonSeams {
  currentSeasonId(tx: Tx, orgId: string): Promise<string | null>;
  criticalWindowFor(tx: Tx, orgId: string, category: AssetCategory, at: Date): Promise<CriticalWindow | null>;
}

export interface ChecklistSeams {
  snapshotPublished(tx: Tx, templateId: string): Promise<ChecklistSnapshot>;
  defaultTemplateId(tx: Tx, orgId: string, kind: ChecklistKind, category: AssetCategory): Promise<string | null>;
}

export interface SiteSeams {
  getSummary(tx: Tx, siteId: string): Promise<SiteSummary>;
}

export interface CustomerSeams {
  getForEligibility(tx: Tx, customerId: string): Promise<{ id: string; hasDocument: boolean; hasPhone: boolean }>;
}

export interface UserSeams {
  listActiveTechnicians(tx: Tx, orgId: string): Promise<TechnicianSummary[]>;
}

export interface MediaSeams {
  listForParent(tx: Tx, parent: EntityRef): Promise<MediaRow[]>;
  markLateEvidence(tx: Tx, mediaIds: string[]): Promise<void>;
}

export interface NotificationSeams {
  create(tx: Tx, n: { type: NotificationType; userIds: string[]; entity: EntityRef; params: Record<string, string | number> }): Promise<void>;
  officeRecipients(tx: Tx, orgId: string, roles: Role[]): Promise<string[]>;
}

export interface SyncSeams {
  touchDependents(tx: Tx, entity: EntityRef): Promise<void>;
}

export interface LocationSeams {
  lastFixes(orgId: string, userIds: string[]): Promise<Map<string, LiveFix>>;
  liveSnapshot(orgId: string): Promise<LiveOperator[]>;
}

export interface FieldReportSeams {
  createFromDamage(tx: Tx, ctx: Ctx, d: { damageId: string; rentalId: string; assetId: string }): Promise<{ id: string; number: string }>;
}

export interface WorkOrderSeams {
  createFromSource(tx: Tx, ctx: Ctx, input: CreateWorkOrderInput): Promise<{ id: string; number: string }>;
  openCountByAssignee(tx: Tx, orgId: string): Promise<Map<string, number>>;
  maintenanceStatus(tx: Tx, planId: string, assetIds: string[]): Promise<Map<string, { hasOpen: boolean; lastCompleted: { at: Date; hourMeter: number | null } | null }>>;
  billingSnapshot(tx: Tx, workOrderId: string): Promise<{ id: string; number: string; status: WorkOrderStatus; customerId: string | null; workMinutes: number | null; laborCostCents: number | null; parts: WorkOrderBillingPart[]; externalCostCents: number | null; externalCostNote: string | null }>;
}

export interface RentalSeams {
  markDamagesRepaired(tx: Tx, input: { workOrderId: string; damageIds: string[] }): Promise<void>;
  activeRentalForAsset(tx: Tx, assetId: string): Promise<{ id: string; number: string } | null>;
}
