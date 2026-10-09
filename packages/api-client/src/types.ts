import type { MediaParent } from "@agrorende/contracts/checklist";
import type {
  AssetDTO,
  ChecklistTemplateDTO,
  CustomerDTO,
  DamageDTO,
  InspectionDTO,
  LiveOperatorDTO,
  MaintenancePlanDTO,
  MediaDTO,
  OpsLiveDTO,
  OrganizationDTO,
  PartDTO,
  PlotDTO,
  RentalChargeDTO,
  RentalDTO,
  SeasonDTO,
  SelfUserDTO,
  SiteDTO,
  StockLocationDTO,
  UserDTO,
} from "@agrorende/contracts/dto";
import type {
  AuthMethod,
  BillingSource,
  BillingStatus,
  ChargeType,
  EntityType,
  ExportJobStatus,
  IssueCategory,
  MediaKind,
  MediaTag,
  NotificationType,
  OrgStatus,
  Platform,
  Priority,
  PushStatus,
  Role,
  StockMovementType,
} from "@agrorende/contracts/enums";
import type { CommentCreatePayload, FuelLogCreatePayload } from "@agrorende/contracts/mutations";
import type { LocationFix } from "@agrorende/contracts/realtime";
import type { Locale, OrgSettings } from "@agrorende/contracts/settings";
import type { TelemetryEvent } from "@agrorende/contracts/sync";

// ───────── Shared ─────────

export type QueryValue = string | number | boolean | null | undefined | readonly (string | number | boolean)[];

/** Cursor pagination shared by every list endpoint (ARCHITECTURE §8 "Lists"). */
export interface ListQuery {
  readonly cursor?: string;
  /** Default 50, maximum 200. */
  readonly limit?: number;
  readonly [filter: string]: QueryValue;
}

export interface ListResponse<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/** Fields owned by the server that a client never sends in a create or patch body. */
export type ServerManagedField = "organizationId" | "syncVersion" | "createdAt" | "updatedAt" | "deletedAt";

/** Create body for an office entity: every writable DTO field, with an optional client id. */
export type EntityCreateRequest<T extends { readonly id: string }> = Partial<Omit<T, ServerManagedField | "id">> & {
  readonly id?: string;
};

/** Patch body for an office entity; the DTO `syncVersion` goes in `If-Match`. */
export type EntityPatchRequest<T> = Partial<Omit<T, ServerManagedField | "id">>;

export interface ReasonRequest {
  readonly reason: string;
}

export interface NoteRequest {
  readonly note: string;
}

export interface OkResponse {
  readonly ok: true;
}

// ───────── Health ─────────

export interface HealthDetail {
  readonly ok: true;
  readonly app: "agrorende";
  readonly db: boolean;
  readonly redis: boolean;
  readonly version: string;
}

// ───────── Auth ─────────

export type OAuthProvider = "google" | "apple";
export type MobilePlatform = Extract<Platform, "IOS" | "ANDROID">;

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
  /** Present on mobile: the response then carries the token pair. */
  readonly deviceId?: string;
  readonly platform?: Platform;
}

/** Web logins receive only `user` (tokens go in cookies); mobile logins receive the token pair and org. */
export interface LoginResponse {
  readonly user: UserDTO;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly org?: OrganizationDTO;
}

/** @deprecated Use `LoginResponse`. */
export type AuthLoginResponse = LoginResponse;

export interface RefreshRequest {
  /** Omitted on web, where the refresh cookie is used. */
  readonly refreshToken?: string;
}

export type RefreshResponse = LoginResponse;

export interface OAuthStartQuery {
  readonly redirect?: string;
  readonly challenge?: string;
  readonly platform?: Platform;
  readonly inviteCode?: string;
  readonly intent?: OAuthIntent;
  readonly [param: string]: QueryValue;
}

export type OAuthIntent = "signin" | "signup" | "invite";

export interface OAuthCallbackQuery {
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
  readonly [param: string]: QueryValue;
}

export interface OAuthAppleCallbackRequest {
  readonly code?: string;
  readonly state: string;
  readonly id_token?: string;
  readonly user?: string;
  readonly error?: string;
}

export interface OAuthExchangeRequest {
  readonly code: string;
  readonly verifier: string;
  readonly deviceId: string;
  readonly platform: Platform;
}

export interface AppleSignInRequest {
  readonly identityToken: string;
  readonly authorizationCode: string;
  readonly rawNonce: string;
  readonly fullName?: { readonly givenName?: string | null; readonly familyName?: string | null } | null;
  readonly deviceId: string;
  readonly platform: Platform;
  readonly inviteCode?: string;
  readonly intent: OAuthIntent;
}

export interface MeResponse {
  /** The caller's own user, including the push notification preferences. */
  readonly user: SelfUserDTO;
  readonly role: Role;
  readonly signInMethods: readonly AuthMethod[];
  readonly org: OrganizationDTO;
  readonly settings: OrgSettings;
}

export interface NotificationPrefsRequest {
  readonly pushMuted: boolean;
  readonly mutedTypes: readonly NotificationType[];
}

/** `PATCH /me`: send at least one field; `notificationPrefs` is merged into the stored prefs. */
export interface UpdateMeRequest {
  readonly locale?: Locale;
  readonly notificationPrefs?: Partial<NotificationPrefsRequest>;
}

export interface InviteLookupResponse {
  readonly organizationName: string;
  readonly inviterName?: string | null;
  readonly name?: string | null;
  readonly email?: string | null;
  readonly role: Role;
  readonly expiresAt: string;
  readonly signInMethods: readonly AuthMethod[];
}

export interface InvitePasswordRequest {
  readonly password: string;
  readonly email?: string;
  readonly deviceId?: string;
  readonly platform?: Platform;
}

export interface ResetLookupResponse {
  readonly email?: string | null;
  readonly name?: string | null;
  readonly expiresAt: string;
}

export interface ResetPasswordRequest {
  readonly password: string;
}

export interface DeleteMeRequest {
  readonly confirm: string;
}

export interface ChangePasswordRequest {
  readonly current?: string;
  readonly next: string;
}

export interface SocketTokenResponse {
  readonly token: string;
  readonly expiresAt: string;
}

// ───────── Sign-up ─────────

export interface SignupOrganizationRequest {
  readonly ticket: string;
  readonly name: string;
  readonly officePhone: string;
  readonly taxId?: string;
  readonly city?: string;
  readonly state?: string;
  readonly timezone: string;
  readonly locale: Locale;
  readonly expectedFieldUsers: string;
  readonly acceptTerms: true;
}

export interface SignupOrganizationResponse {
  readonly organization: OrganizationDTO;
  readonly user: UserDTO;
}

// ───────── Telemetry and devices ─────────

export interface TelemetryRequest {
  readonly events: readonly TelemetryEvent[];
}

export interface DiagnosticsUploadRequest {
  /** Id of the local `diagnostics_queue` row, used for idempotency. */
  readonly id: string;
  readonly deviceId: string;
  readonly createdAt: string;
  readonly appVersion: string;
  /** Redacted payload (≤ 256 KB): device, sync summary and last log lines; never PII. */
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface DeviceRegisterRequest {
  readonly deviceId: string;
  readonly platform: Platform;
  readonly model: string;
  readonly osVersion: string;
  readonly appVersion: string;
  readonly runtimeVersion: string;
  readonly pushToken?: string;
}

export interface DeviceDTO {
  readonly id: string;
  readonly userId: string;
  readonly installationId: string;
  readonly platform: Platform;
  readonly model: string | null;
  readonly osVersion: string | null;
  readonly appVersion: string | null;
  readonly runtimeVersion: string | null;
  readonly pushStatus: PushStatus;
  readonly lastSeenAt: string | null;
  readonly lastSyncAt: string | null;
  /** Serialised as a string, like every sync version. */
  readonly lastPullVersion: string;
  readonly pendingMutations: number;
  readonly pendingUploads: number;
  readonly pendingBytes: number;
  readonly oldestPendingAt: string | null;
  readonly batteryLevel: number | null;
  readonly freeStorageBytes: number | null;
  readonly clockOffsetMs: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DeviceRegisterResponse {
  readonly device: DeviceDTO;
}

export interface DeviceDiagnosticDTO {
  readonly id: string;
  readonly deviceId: string;
  readonly userId: string;
  readonly appVersion: string | null;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

export interface DeviceListQuery extends ListQuery {
  readonly userId?: string;
  readonly stale?: boolean;
}

// ───────── Media ─────────

export type MediaVariantName = "original" | "thumb" | "poster";

/** Web upload body for `POST /media` (asset cover, office report attachment). */
export interface MediaCreateRequest {
  readonly id: string;
  readonly kind: MediaKind;
  readonly tag: MediaTag;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly capturedAt: string;
  readonly caption?: string;
  readonly parent: MediaParent;
}

export interface UploadUrlRequest {
  readonly variant: MediaVariantName;
  readonly sizeBytes: number;
  readonly mimeType: string;
}

export interface UploadUrlResponse {
  readonly mode: "single" | "multipart";
  /** Relative signed URL for single uploads. */
  readonly url?: string;
  /** Present for multipart uploads. */
  readonly uploadId?: string;
  readonly partSize?: number;
  readonly expiresAt: string;
}

export interface MediaCreateResponse {
  readonly media: MediaDTO;
  readonly upload: UploadUrlResponse;
}

export interface MultipartPartsRequest {
  readonly variant: MediaVariantName;
  readonly uploadId: string;
  readonly parts: readonly number[];
}

export interface MultipartPartsResponse {
  readonly urls: readonly { readonly n: number; readonly url: string }[];
  readonly expiresAt: string;
}

export interface MediaCompleteRequest {
  readonly variant: MediaVariantName;
  readonly uploadId?: string;
}

export interface MediaCompleteResponse {
  readonly media: MediaDTO;
}

export interface MediaBlobQuery {
  readonly variant: MediaVariantName;
  readonly t: string;
  readonly [param: string]: QueryValue;
}

export interface MediaPartQuery {
  readonly uploadId: string;
  readonly t: string;
  readonly [param: string]: QueryValue;
}

// ───────── Locations, attention, ops ─────────

export interface LocationsBatchRequest {
  /** At most 500 fixes. */
  readonly fixes: readonly LocationFix[];
}

export interface LocationsBatchResponse {
  readonly ok: true;
  readonly accepted: number;
}

export type AttentionKind = "MUTATION" | "MEDIA" | "DEVICE" | "DIAGNOSTIC" | "ACCOUNT";

export interface AttentionItem {
  readonly kind: AttentionKind;
  readonly id: string;
  readonly code?: string | null;
  readonly title: string;
  readonly userId?: string | null;
  readonly deviceId?: string | null;
  readonly entityType?: EntityType | null;
  readonly entityId?: string | null;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface AttentionListQuery extends ListQuery {
  readonly kind?: AttentionKind;
}

/** One operator on the live map, exactly as `GET /ops/live` returns it (change request T13-003). */
export type OpsLiveOperator = LiveOperatorDTO;

/** The `GET /ops/live` payload, typed from the shared contracts schema. */
export type OpsLiveResponse = OpsLiveDTO;

export type OpsRange = "today" | "7d" | "30d" | "90d" | "season";

export interface OpsKpisQuery {
  readonly range?: OpsRange;
  readonly [param: string]: QueryValue;
}

export interface OpsKpisResponse {
  readonly range: string;
  readonly openReports: number;
  readonly openWorkOrders: number;
  readonly activeRentals: number;
  readonly slaPercent: number | null;
  readonly mttrHours: number | null;
  readonly utilizationPercent: number | null;
}

export type OpsAlertKind = "RENTAL_OVERDUE" | "SLA_AT_RISK" | "SLA_BREACHED" | "DEVICE_STALE" | "CRITICAL_UNASSIGNED";

export interface OpsAlert {
  readonly kind: OpsAlertKind;
  readonly entityType: EntityType | "device";
  readonly entityId: string;
  readonly title: string;
  readonly since: string;
}

export interface TrailQuery {
  readonly from: string;
  readonly to: string;
  readonly [param: string]: QueryValue;
}

export interface TrailPoint {
  readonly lat: number;
  readonly lng: number;
  readonly accuracyM?: number | null;
  readonly recordedAt: string;
}

// ───────── Users ─────────

export interface InviteResponse {
  readonly code: string;
  readonly url: string;
  readonly whatsappUrl: string;
  readonly expiresAt: string;
}

export interface UserCreateRequest {
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly role: Role;
  readonly skills?: readonly IssueCategory[];
  readonly hourlyCostCents?: number;
  readonly homeSiteId?: string;
  readonly locale?: Locale;
}

export interface UserCreateResponse {
  readonly user: UserDTO;
  readonly invite: InviteResponse;
}

export interface UserUpdateRequest {
  readonly name?: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly skills?: readonly IssueCategory[];
  readonly hourlyCostCents?: number | null;
  readonly homeSiteId?: string | null;
  readonly vanStockLocationId?: string | null;
  readonly locale?: Locale;
}

export interface UserRoleRequest {
  readonly role: Role;
}

export interface TemporaryPasswordRequest {
  readonly password: string;
}

export interface UserListQuery extends ListQuery {
  readonly role?: Role;
  readonly active?: boolean;
  readonly q?: string;
}

// ───────── Office entities ─────────

export type AssetCreateRequest = EntityCreateRequest<AssetDTO>;
export type AssetUpdateRequest = EntityPatchRequest<AssetDTO>;
export type SiteCreateRequest = EntityCreateRequest<SiteDTO>;
export type SiteUpdateRequest = EntityPatchRequest<SiteDTO>;
export type PlotCreateRequest = EntityCreateRequest<PlotDTO>;
export type PlotUpdateRequest = EntityPatchRequest<PlotDTO>;
export type SeasonCreateRequest = EntityCreateRequest<SeasonDTO>;
export type SeasonUpdateRequest = EntityPatchRequest<SeasonDTO>;
export type CustomerCreateRequest = EntityCreateRequest<CustomerDTO>;
export type CustomerUpdateRequest = EntityPatchRequest<CustomerDTO>;
export type ChecklistTemplateCreateRequest = EntityCreateRequest<ChecklistTemplateDTO>;
export type ChecklistTemplateUpdateRequest = EntityPatchRequest<ChecklistTemplateDTO>;
export type RentalCreateRequest = EntityCreateRequest<RentalDTO>;
export type RentalUpdateRequest = EntityPatchRequest<RentalDTO>;
export type PartCreateRequest = EntityCreateRequest<PartDTO>;
export type PartUpdateRequest = EntityPatchRequest<PartDTO>;
export type StockLocationCreateRequest = EntityCreateRequest<StockLocationDTO>;
export type MaintenancePlanCreateRequest = EntityCreateRequest<MaintenancePlanDTO>;
export type MaintenancePlanUpdateRequest = EntityPatchRequest<MaintenancePlanDTO>;

export interface AssetListQuery extends ListQuery {
  readonly q?: string;
  readonly archived?: boolean;
  readonly siteId?: string;
  readonly category?: string;
  readonly condition?: string;
}

export interface RetireAssetRequest {
  readonly reason?: string;
}

export interface AssetHistoryEntry {
  readonly kind: "FIELD_REPORT" | "WORK_ORDER" | "RENTAL" | "INSPECTION" | "DAMAGE" | "COST";
  readonly id: string;
  readonly occurredAt: string;
  readonly title: string;
  readonly status?: string | null;
  readonly amountCents?: number | null;
}

export interface QrSheetRequest {
  readonly assetIds: readonly string[];
}

// ───────── Field reports ─────────

export interface FieldReportListQuery extends ListQuery {
  readonly status?: string;
  readonly priority?: Priority;
  readonly siteId?: string;
  readonly assetId?: string;
  readonly q?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface MarkForRepairRequest {
  readonly priority?: Priority;
  readonly assigneeId?: string;
  readonly scheduledFor?: string;
  readonly dueAt?: string;
  readonly title?: string;
  readonly description?: string;
  readonly checklistTemplateId?: string;
}

export interface WorkOrderCreatedResponse {
  readonly workOrderId: string;
}

export interface LinkAssetRequest {
  readonly assetId: string;
}

// ───────── Work orders ─────────

export interface WorkOrderListQuery extends ListQuery {
  readonly status?: string;
  readonly assigneeId?: string;
  readonly priority?: Priority;
  readonly siteId?: string;
  readonly assetId?: string;
  readonly due?: string;
}

export interface WorkOrderUpdateRequest {
  readonly title?: string;
  readonly description?: string | null;
  readonly priority?: Priority;
  readonly dueAt?: string | null;
  readonly scheduledFor?: string | null;
  readonly destination?: { readonly lat: number; readonly lng: number; readonly note?: string } | null;
  readonly checklistTemplateId?: string | null;
}

export interface AssignRequest {
  readonly assigneeId: string;
}

export interface ReassignRequest {
  readonly assigneeId: string;
  readonly reason: string;
}

export interface VerifyRequest {
  readonly note?: string;
}

export interface ExternalCostRequest {
  readonly externalCostCents: number;
  readonly externalCostNote?: string;
}

export interface FieldUserSuggestion {
  readonly userId: string;
  readonly name: string;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly distanceKm?: number | null;
  readonly openWorkOrders: number;
  readonly online: boolean;
}

export interface SuggestionsResponse {
  readonly items: readonly FieldUserSuggestion[];
}

export interface SuggestionsQuery {
  readonly fieldReportId: string;
  readonly [param: string]: QueryValue;
}

// ───────── Rentals ─────────

export interface RentalListQuery extends ListQuery {
  readonly status?: string;
  readonly customerId?: string;
  readonly assetId?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface EligibilityQuery {
  readonly assetId: string;
  readonly from: string;
  readonly to: string;
  readonly excludeRentalId?: string;
  readonly [param: string]: QueryValue;
}

export interface EligibilityResponse {
  readonly eligible: boolean;
  readonly codes: readonly string[];
}

export interface CloseRentalRequest {
  readonly paymentNote?: string;
}

export interface ExtendRentalRequest {
  readonly newPlannedEnd: string;
}

export interface RentalChargeCreateRequest {
  readonly type: ChargeType;
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountCents: number;
}

export type RentalChargesResponse = readonly RentalChargeDTO[];

export interface RentalCalendarQuery {
  readonly from: string;
  readonly to: string;
  readonly assetId?: string;
  readonly [param: string]: QueryValue;
}

export interface RentalCalendarEntry {
  readonly rentalId: string;
  readonly number: string;
  readonly assetId: string;
  readonly status: string;
  readonly start: string;
  readonly end: string;
}

export interface RentalCalendarResponse {
  readonly items: readonly RentalCalendarEntry[];
}

// ───────── Inspections, damages, costs ─────────

export interface InspectionCompareResponse {
  readonly checkOut: InspectionDTO | null;
  readonly checkIn: InspectionDTO | null;
  readonly damages: readonly DamageDTO[];
}

export interface DamageListQuery extends ListQuery {
  readonly assetId?: string;
  readonly open?: boolean;
}

export interface DamageUpdateRequest {
  readonly estimatedCostCents?: number;
  readonly description?: string;
}

export type CostGroupBy = "asset" | "site" | "plot" | "season" | "category";

export interface CostRollupQuery {
  readonly groupBy: CostGroupBy;
  readonly from?: string;
  readonly to?: string;
  readonly seasonId?: string;
  readonly assetId?: string;
  readonly siteId?: string;
  readonly [param: string]: QueryValue;
}

export interface CostRollupRow {
  readonly key: string;
  readonly label: string;
  readonly laborCents: number;
  readonly partsCents: number;
  readonly externalCents: number;
  readonly fuelCents: number;
  readonly rentInCostCents: number;
  readonly totalCostCents: number;
  readonly rentalRevenueCents: number;
}

/** `GET /costs/rollup` body (A§6.4): one row per group plus the totals of the window. */
export interface CostRollupResponse {
  readonly groupBy: CostGroupBy;
  readonly from: string | null;
  readonly to: string | null;
  /** False when the caller is a MANAGER and labour cost is hidden from managers; labour is then 0. */
  readonly laborVisible: boolean;
  readonly rows: readonly CostRollupRow[];
  readonly totals: Omit<CostRollupRow, "key" | "label">;
  readonly workOrderCount: number;
  readonly rentalCount: number;
  readonly fuelLogCount?: number;
}

// ───────── Exports, imports ─────────

export type ExportEntity = "field-reports" | "work-orders" | "rentals" | "assets" | "costs" | "location-pings";
export type ImportEntity = "assets" | "customers" | "parts";

export interface ExportCreateRequest {
  readonly entity: ExportEntity;
  readonly filters: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ExportJobDTO {
  readonly id: string;
  readonly entity: ExportEntity;
  readonly filters: Readonly<Record<string, unknown>>;
  readonly status: ExportJobStatus;
  readonly rowCount: number | null;
  readonly mediaId: string | null;
  readonly errorCode: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly expiresAt: string | null;
}

export interface ImportRowError {
  readonly row: number;
  readonly column: string;
  readonly code: string;
  readonly value: string | null;
}

export interface ImportResult {
  readonly dryRun: boolean;
  readonly totalRows: number;
  readonly validRows: number;
  readonly importedRows: number;
  readonly preview: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly errors: readonly ImportRowError[];
  /** Relative URL of the error CSV, when there are row errors. */
  readonly errorCsvUrl?: string | null;
}

// ───────── Org and platform ─────────

export interface OrgUsageMonth {
  readonly month: string;
  readonly activeUsers: number;
  readonly fieldReports: number;
  readonly workOrders: number;
  readonly rentals: number;
  readonly mediaBytes: number;
}

export interface OrgSubscriptionResponse {
  readonly status: OrgStatus;
  readonly plan: string;
  readonly trialEndsAt: string | null;
  readonly pastDueAt: string | null;
  readonly termsVersion: string | null;
  readonly termsAcceptedAt: string | null;
  readonly usage: readonly OrgUsageMonth[];
}

export interface OrgCancelRequest {
  readonly confirmName: string;
}

export interface AcceptTermsRequest {
  readonly version: string;
}

export interface PlatformOrgListQuery extends ListQuery {
  readonly status?: OrgStatus;
  readonly q?: string;
}

export interface PlatformOrgUpdateRequest {
  readonly status?: OrgStatus;
  readonly plan?: string;
  readonly trialEndsAt?: string;
  readonly reason: string;
}

export interface PlatformAdminResetLinkRequest {
  readonly userId: string;
  readonly reason: string;
}

// ───────── Notifications ─────────

export interface NotificationListQuery extends ListQuery {
  readonly unread?: boolean;
}

export interface NotificationsReadRequest {
  readonly ids?: readonly string[];
  readonly all?: boolean;
}

// ───────── Parts, stock, maintenance, fuel (P1) ─────────

export interface StockLevelQuery extends ListQuery {
  readonly locationId?: string;
  readonly partId?: string;
  readonly low?: boolean;
}

export interface StockMovementDTO {
  readonly id: string;
  readonly organizationId: string;
  readonly syncVersion: string;
  readonly partId: string;
  readonly type: StockMovementType;
  readonly quantity: number;
  readonly fromLocationId: string | null;
  readonly toLocationId: string | null;
  readonly unitCostCents: number | null;
  readonly workOrderId: string | null;
  readonly workOrderPartId: string | null;
  readonly createdById: string;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StockMovementCreateRequest {
  readonly type: Extract<StockMovementType, "IN" | "TRANSFER" | "ADJUSTMENT">;
  readonly partId: string;
  readonly quantity: number;
  readonly fromLocationId?: string;
  readonly toLocationId?: string;
  readonly unitCostCents?: number;
  readonly note?: string;
}

export interface MaintenanceDueRow {
  readonly assetId: string;
  readonly nextDueHourMeter: number | null;
  readonly nextDueAt: string | null;
  readonly overdue: boolean;
}

export interface MaintenanceDueResponse {
  readonly items: readonly MaintenanceDueRow[];
}

export interface FuelLogListQuery extends ListQuery {
  readonly assetId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly seasonId?: string;
}

export interface FuelConsumptionQuery {
  readonly assetId: string;
  readonly from?: string;
  readonly to?: string;
  readonly [param: string]: QueryValue;
}

export interface FuelConsumptionPoint {
  readonly fromLogId: string;
  readonly toLogId: string;
  readonly liters: number;
  readonly hours: number;
  readonly litersPerHour: number;
  readonly at: string;
}

export interface FuelConsumptionResponse {
  readonly assetId: string;
  readonly averageLitersPerHour: number | null;
  readonly points: readonly FuelConsumptionPoint[];
}

export type FuelLogCreateRequest = FuelLogCreatePayload;

// ───────── Billing (P1) ─────────

export interface BillingLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountCents: number;
  readonly amountCents: number;
}

export interface BillingDocumentDTO {
  readonly id: string;
  readonly organizationId: string;
  readonly syncVersion: string;
  readonly number: string;
  readonly source: BillingSource;
  readonly workOrderId: string | null;
  readonly rentalId: string | null;
  readonly customerId: string;
  readonly status: BillingStatus;
  readonly lines: readonly BillingLine[];
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly issuedAt: string | null;
  readonly dueAt: string | null;
  readonly paidAt: string | null;
  readonly nfeNumber: string | null;
  readonly nfeKey: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BillingDocumentListQuery extends ListQuery {
  readonly status?: BillingStatus;
  readonly customerId?: string;
  readonly source?: BillingSource;
}

export interface BillingDocumentCreateRequest {
  readonly source: BillingSource;
  readonly workOrderId?: string;
  readonly rentalId?: string;
  readonly customerId?: string;
  readonly lines?: readonly Omit<BillingLine, "amountCents">[];
}

export interface BillingDocumentUpdateRequest {
  readonly customerId?: string;
  readonly lines?: readonly Omit<BillingLine, "amountCents">[];
  readonly discountCents?: number;
  readonly notes?: string | null;
}

export interface BillingIssueRequest {
  readonly dueAt?: string;
  readonly nfeNumber?: string;
  readonly nfeKey?: string;
}

export interface BillingPayRequest {
  readonly paidAt?: string;
}

// ───────── Comments, analytics, search ─────────

export interface CommentListQuery extends ListQuery {
  readonly entityType: EntityType;
  readonly entityId: string;
}

export type CommentCreateRequest = CommentCreatePayload;

export type AnalyticsMetric =
  | "mttr"
  | "first_time_fix"
  | "reports_by_category"
  | "wos_by_field_user"
  | "downtime"
  | "top_failing"
  | "rental_utilization"
  | "rental_revenue"
  | "cost";

export interface AnalyticsQuery {
  readonly metric: AnalyticsMetric;
  readonly from?: string;
  readonly to?: string;
  readonly seasonId?: string;
  readonly groupBy?: string;
  readonly [param: string]: QueryValue;
}

export interface AnalyticsSeriesPoint {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** Second value of the point when the metric has one (for example the completed WO count for `mttr`). */
  readonly secondary?: number | null;
}

export interface AnalyticsResponse {
  readonly metric: AnalyticsMetric;
  readonly unit: "hours" | "percent" | "count" | "cents";
  readonly from: string;
  readonly to: string;
  readonly seasonId: string | null;
  readonly series: readonly AnalyticsSeriesPoint[];
  /** Whole-range figure: overall median, share, total or average depending on the metric. */
  readonly summary: number | null;
  /** Full cost roll-up for the `cost` metric. */
  readonly cost?: CostRollupResponse;
}

export interface SearchQuery {
  readonly q: string;
  readonly [param: string]: QueryValue;
}

export type SearchType = "assets" | "workOrders" | "fieldReports" | "rentals" | "customers" | "sites";

/** One light search result: enough for the command palette to show and link it. */
export interface SearchHit {
  readonly id: string;
  readonly type: SearchType;
  readonly title: string;
  readonly subtitle: string | null;
  readonly href: string;
}

export type SearchResponse = { readonly q: string; readonly tookMs: number } & { readonly [K in SearchType]: readonly SearchHit[] };

