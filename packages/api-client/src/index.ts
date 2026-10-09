import type * as DTO from "@agrorende/contracts/dto";
import type { OrgSettings } from "@agrorende/contracts/settings";
import { HealthResponseSchema, type PullRequest, type PullResponse, type PushRequest, type PushResponse } from "@agrorende/contracts/sync";

import { decodeApiError, isApiError, networkError, type ApiError } from "./errors.js";
import type * as T from "./types.js";

export * from "./errors.js";
export type * from "./types.js";

export type TokenProvider = () => Promise<string | null> | string | null;
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
/** Loose query bag kept for callers that build filters dynamically. */
export type Query = Readonly<Record<string, T.QueryValue>>;
/** @deprecated Every endpoint now has a typed body; kept for source compatibility. */
export type JsonBody = unknown;

export interface ApiClientOptions {
  readonly baseUrl: string;
  /** Bearer mode (mobile): returns the current access token. */
  readonly tokenProvider?: TokenProvider;
  /** Cookie mode (web): pass `"include"` so the `ar_access` cookie is sent. */
  readonly credentials?: RequestCredentials;
  /**
   * Called once when an authenticated request fails with `TOKEN_EXPIRED`, typically to refresh
   * the session. Returning `true` retries the request once. Concurrent failures share one call.
   */
  readonly onUnauthorized?: () => Promise<boolean>;
  readonly fetch?: FetchLike;
}

type QueryInput = object;

interface SendOptions {
  readonly query?: QueryInput | undefined;
  readonly json?: unknown;
  readonly body?: BodyInit | undefined;
  readonly contentType?: string;
  readonly version?: string | undefined;
  readonly auth?: boolean;
  readonly redirect?: RequestRedirect;
}

const API_PREFIX = "/api/v1";

/** Escapes one path segment. */
const seg = (value: string | number): string => encodeURIComponent(String(value));

export class AgrorendeApiClient {
  private readonly baseUrl: URL;
  private readonly tokenProvider: TokenProvider;
  private readonly credentials: RequestCredentials | undefined;
  private readonly onUnauthorized: (() => Promise<boolean>) | undefined;
  private readonly fetchImpl: FetchLike;
  private unauthorizedInFlight: Promise<boolean> | null = null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = new URL(options.baseUrl);
    this.tokenProvider = options.tokenProvider ?? (() => null);
    this.credentials = options.credentials;
    this.onUnauthorized = options.onUnauthorized;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  // ───────── Health ─────────

  /** Public probe; validates the `{ ok: true, app: "agrorende" }` shape to detect captive portals. */
  async health(): Promise<T.HealthDetail> {
    const body = await this.request<unknown>("GET", "/health", { auth: false });
    HealthResponseSchema.parse(body);
    return body as T.HealthDetail;
  }

  // ───────── Auth ─────────

  /** Returns the redirect response; browsers should navigate to `oauthStartUrl` instead. */
  async oauthStart(provider: T.OAuthProvider, query?: T.OAuthStartQuery): Promise<Response> {
    return this.raw("GET", `/auth/oauth/${seg(provider)}/start`, { query, auth: false, redirect: "manual" });
  }
  oauthStartUrl(provider: T.OAuthProvider, query?: T.OAuthStartQuery): string {
    return this.buildUrl(`/auth/oauth/${seg(provider)}/start`, query).toString();
  }
  async oauthGoogleCallback(query: T.OAuthCallbackQuery): Promise<Response> {
    return this.raw("GET", "/auth/oauth/google/callback", { query, auth: false, redirect: "manual" });
  }
  async oauthAppleCallback(body: T.OAuthAppleCallbackRequest): Promise<Response> {
    return this.raw("POST", "/auth/oauth/apple/callback", { json: body, auth: false, redirect: "manual" });
  }
  async oauthExchange(body: T.OAuthExchangeRequest): Promise<T.LoginResponse> { return this.request("POST", "/auth/oauth/exchange", { json: body, auth: false }); }
  async appleLogin(body: T.AppleSignInRequest): Promise<T.LoginResponse> { return this.request("POST", "/auth/apple", { json: body, auth: false }); }
  async login(body: T.LoginRequest): Promise<T.LoginResponse> { return this.request("POST", "/auth/login", { json: body, auth: false }); }
  async refresh(body: T.RefreshRequest = {}): Promise<T.RefreshResponse> { return this.request("POST", "/auth/refresh", { json: body, auth: false }); }
  async logout(): Promise<void> { await this.request("POST", "/auth/logout"); }
  async me(): Promise<T.MeResponse> { return this.request("GET", "/auth/me"); }
  async updateMe(body: T.UpdateMeRequest, version?: string): Promise<DTO.SelfUserDTO> { return this.request("PATCH", "/me", { json: body, version }); }
  async getInvite(code: string): Promise<T.InviteLookupResponse> { return this.request("GET", `/auth/invites/${seg(code)}`, { auth: false }); }
  async redeemInvitePassword(code: string, body: T.InvitePasswordRequest): Promise<T.LoginResponse> { return this.request("POST", `/auth/invites/${seg(code)}/password`, { json: body, auth: false }); }
  async getReset(code: string): Promise<T.ResetLookupResponse> { return this.request("GET", `/auth/reset/${seg(code)}`, { auth: false }); }
  async redeemReset(code: string, body: T.ResetPasswordRequest): Promise<void> { await this.request("POST", `/auth/reset/${seg(code)}`, { json: body, auth: false }); }
  async deleteMe(body: T.DeleteMeRequest): Promise<void> { await this.request("DELETE", "/auth/me", { json: body }); }
  async changePassword(body: T.ChangePasswordRequest): Promise<void> { await this.request("POST", "/auth/change-password", { json: body }); }
  async socketToken(): Promise<T.SocketTokenResponse> { return this.request("POST", "/auth/socket-token"); }
  async signupOrganization(body: T.SignupOrganizationRequest): Promise<T.SignupOrganizationResponse> { return this.request("POST", "/signup/organization", { json: body, auth: false }); }

  // ───────── Sync, telemetry, devices ─────────

  async syncPush(body: PushRequest): Promise<PushResponse> { return this.request("POST", "/sync/push", { json: body }); }
  async syncPull(query: PullRequest): Promise<PullResponse> {
    return this.request("GET", "/sync/pull", { query: { cursor: query.cursor, deviceId: query.deviceId, scopeEpoch: query.scopeEpoch } });
  }
  async telemetry(body: T.TelemetryRequest): Promise<void> { await this.request("POST", "/telemetry", { json: body }); }
  async telemetryDiagnostics(body: T.DiagnosticsUploadRequest): Promise<void> { await this.request("POST", "/telemetry/diagnostics", { json: body }); }

  async registerDevice(body: T.DeviceRegisterRequest): Promise<T.DeviceRegisterResponse> { return this.request("POST", "/devices/register", { json: body }); }
  async deviceDiagnostics(id: string, query?: T.ListQuery): Promise<T.ListResponse<T.DeviceDiagnosticDTO>> { return this.request("GET", `/devices/${seg(id)}/diagnostics`, { query }); }
  async listDevices(query?: T.DeviceListQuery): Promise<T.ListResponse<T.DeviceDTO>> { return this.request("GET", "/devices", { query }); }

  // ───────── Media ─────────

  async createMedia(body: T.MediaCreateRequest): Promise<T.MediaCreateResponse> { return this.request("POST", "/media", { json: body }); }
  async issueMediaUploadUrl(id: string, body: T.UploadUrlRequest): Promise<T.UploadUrlResponse> { return this.request("POST", `/media/${seg(id)}/upload-url`, { json: body }); }
  async issueMediaMultipartParts(id: string, body: T.MultipartPartsRequest): Promise<T.MultipartPartsResponse> { return this.request("POST", `/media/${seg(id)}/multipart/parts`, { json: body }); }
  async completeMediaUpload(id: string, body: T.MediaCompleteRequest): Promise<T.MediaCompleteResponse> { return this.request("POST", `/media/${seg(id)}/complete`, { json: body }); }
  async uploadMediaBlob(id: string, query: T.MediaBlobQuery, body: BodyInit, contentType = "application/octet-stream"): Promise<void> {
    await this.raw("PUT", `/media/${seg(id)}/blob`, { query, body, contentType, auth: false });
  }
  async uploadMediaPart(id: string, part: number, query: T.MediaPartQuery, body: BodyInit): Promise<void> {
    await this.raw("PUT", `/media/${seg(id)}/blob/parts/${seg(part)}`, { query, body, contentType: "application/octet-stream", auth: false });
  }
  async downloadMediaBlob(id: string, query: T.MediaBlobQuery): Promise<Response> { return this.raw("GET", `/media/${seg(id)}/blob`, { query, auth: false }); }
  /** Follows the 302 and returns the blob response. Prefer `mediaUrl` to get the signed URL. */
  async getMediaUrl(id: string, query?: { readonly variant?: T.MediaVariantName }): Promise<Response> { return this.raw("GET", `/media/${seg(id)}/url`, { query }); }

  /**
   * PUTs bytes to a signed URL returned by `issueMediaUploadUrl` or `issueMediaMultipartParts`.
   * Relative URLs resolve against `baseUrl`; no bearer header is sent because the URL carries its token.
   */
  async uploadBlob(url: string, body: BodyInit, contentType: string): Promise<void> {
    const target = new URL(url, this.baseUrl);
    await this.execute(target, { method: "PUT", headers: new Headers({ "content-type": contentType }), body });
  }

  /** Resolves `GET /media/:id/url` to its signed blob URL without following the redirect. */
  async mediaUrl(id: string, variant: T.MediaVariantName = "original"): Promise<string> {
    const response = await this.raw("GET", `/media/${seg(id)}/url`, { query: { variant }, redirect: "manual" });
    const location = response.headers.get("location");
    if (location !== null) {
      return new URL(location, this.baseUrl).toString();
    }
    if (response.ok) {
      const body = await parseBody(response);
      if (typeof body === "object" && body !== null && "url" in body && typeof body.url === "string") {
        return new URL(body.url, this.baseUrl).toString();
      }
    }
    // Browsers hide the Location of manual redirects; the endpoint itself is then a usable image source.
    return this.buildUrl(`/media/${seg(id)}/url`, { variant }).toString();
  }

  // ───────── Locations, attention, ops ─────────

  async postLocationsBatch(body: T.LocationsBatchRequest): Promise<T.LocationsBatchResponse> { return this.request("POST", "/locations/batch", { json: body }); }
  async listAttention(query?: T.AttentionListQuery): Promise<T.ListResponse<T.AttentionItem>> { return this.request("GET", "/attention", { query }); }
  async resolveAttention(kind: T.AttentionKind, id: string, body: T.NoteRequest): Promise<void> { await this.request("POST", `/attention/${seg(kind)}/${seg(id)}/resolve`, { json: body }); }
  async opsLive(): Promise<T.OpsLiveResponse> { return this.request("GET", "/ops/live"); }
  async opsKpis(query?: T.OpsKpisQuery): Promise<T.OpsKpisResponse> { return this.request("GET", "/ops/kpis", { query }); }
  async opsActivity(query?: T.ListQuery): Promise<T.ListResponse<DTO.ActivityEventDTO>> { return this.request("GET", "/ops/activity", { query }); }
  async opsAlerts(): Promise<T.ListResponse<T.OpsAlert>> { return this.request("GET", "/ops/alerts"); }
  async operatorTrail(userId: string, query: T.TrailQuery): Promise<T.ListResponse<T.TrailPoint>> { return this.request("GET", `/ops/operators/${seg(userId)}/trail`, { query }); }
  async opsAnalytics(query: T.AnalyticsQuery): Promise<T.AnalyticsResponse> { return this.request("GET", "/ops/analytics", { query }); }
  async search(query: T.SearchQuery): Promise<T.SearchResponse> { return this.request("GET", "/search", { query }); }

  // ───────── Users ─────────

  async listUsers(query?: T.UserListQuery): Promise<T.ListResponse<DTO.UserDTO>> { return this.request("GET", "/users", { query }); }
  async createUser(body: T.UserCreateRequest): Promise<T.UserCreateResponse> { return this.request("POST", "/users", { json: body }); }
  async getUser(id: string): Promise<DTO.UserDTO> { return this.request("GET", `/users/${seg(id)}`); }
  async updateUser(id: string, body: T.UserUpdateRequest, version: string): Promise<DTO.UserDTO> { return this.request("PATCH", `/users/${seg(id)}`, { json: body, version }); }
  async inviteUser(id: string): Promise<T.InviteResponse> { return this.request("POST", `/users/${seg(id)}/invite`); }
  async resetUserLink(id: string): Promise<T.InviteResponse> { return this.request("POST", `/users/${seg(id)}/reset-link`); }
  async setTemporaryPassword(id: string, body: T.TemporaryPasswordRequest): Promise<void> { await this.request("POST", `/users/${seg(id)}/temporary-password`, { json: body }); }
  async setUserRole(id: string, body: T.UserRoleRequest): Promise<DTO.UserDTO> { return this.request("POST", `/users/${seg(id)}/role`, { json: body }); }
  async deactivateUser(id: string): Promise<DTO.UserDTO> { return this.request("POST", `/users/${seg(id)}/deactivate`); }
  async reactivateUser(id: string): Promise<DTO.UserDTO> { return this.request("POST", `/users/${seg(id)}/reactivate`); }
  async userDevices(id: string): Promise<T.ListResponse<T.DeviceDTO>> { return this.request("GET", `/users/${seg(id)}/devices`); }

  // ───────── Assets ─────────

  async listAssets(query?: T.AssetListQuery): Promise<T.ListResponse<DTO.AssetDTO>> { return this.request("GET", "/assets", { query }); }
  async createAsset(body: T.AssetCreateRequest): Promise<DTO.AssetDTO> { return this.request("POST", "/assets", { json: body }); }
  async getAsset(id: string): Promise<DTO.AssetDTO> { return this.request("GET", `/assets/${seg(id)}`); }
  async updateAsset(id: string, body: T.AssetUpdateRequest, version: string): Promise<DTO.AssetDTO> { return this.request("PATCH", `/assets/${seg(id)}`, { json: body, version }); }
  async retireAsset(id: string, body: T.RetireAssetRequest = {}): Promise<DTO.AssetDTO> { return this.request("POST", `/assets/${seg(id)}/retire`, { json: body }); }
  async assetHistory(id: string, query?: T.ListQuery): Promise<T.ListResponse<T.AssetHistoryEntry>> { return this.request("GET", `/assets/${seg(id)}/history`, { query }); }
  async assetQrPng(id: string): Promise<Response> { return this.raw("GET", `/assets/${seg(id)}/qr.png`); }
  async assetQrSheet(body: T.QrSheetRequest): Promise<Response> { return this.raw("POST", "/assets/qr-sheet", { json: body }); }

  // ───────── Sites, plots, seasons, customers ─────────

  async listSites(query?: T.ListQuery): Promise<T.ListResponse<DTO.SiteDTO>> { return this.request("GET", "/sites", { query }); }
  async createSite(body: T.SiteCreateRequest): Promise<DTO.SiteDTO> { return this.request("POST", "/sites", { json: body }); }
  async updateSite(id: string, body: T.SiteUpdateRequest, version: string): Promise<DTO.SiteDTO> { return this.request("PATCH", `/sites/${seg(id)}`, { json: body, version }); }
  async listSitePlots(siteId: string, query?: T.ListQuery): Promise<T.ListResponse<DTO.PlotDTO>> { return this.request("GET", `/sites/${seg(siteId)}/plots`, { query }); }
  async createSitePlot(siteId: string, body: T.PlotCreateRequest): Promise<DTO.PlotDTO> { return this.request("POST", `/sites/${seg(siteId)}/plots`, { json: body }); }
  async updatePlot(id: string, body: T.PlotUpdateRequest, version: string): Promise<DTO.PlotDTO> { return this.request("PATCH", `/plots/${seg(id)}`, { json: body, version }); }

  async listSeasons(query?: T.ListQuery): Promise<T.ListResponse<DTO.SeasonDTO>> { return this.request("GET", "/seasons", { query }); }
  async createSeason(body: T.SeasonCreateRequest): Promise<DTO.SeasonDTO> { return this.request("POST", "/seasons", { json: body }); }
  async updateSeason(id: string, body: T.SeasonUpdateRequest, version: string): Promise<DTO.SeasonDTO> { return this.request("PATCH", `/seasons/${seg(id)}`, { json: body, version }); }

  async listCustomers(query?: T.ListQuery): Promise<T.ListResponse<DTO.CustomerDTO>> { return this.request("GET", "/customers", { query }); }
  async createCustomer(body: T.CustomerCreateRequest): Promise<DTO.CustomerDTO> { return this.request("POST", "/customers", { json: body }); }
  async getCustomer(id: string): Promise<DTO.CustomerDTO> { return this.request("GET", `/customers/${seg(id)}`); }
  async updateCustomer(id: string, body: T.CustomerUpdateRequest, version: string): Promise<DTO.CustomerDTO> { return this.request("PATCH", `/customers/${seg(id)}`, { json: body, version }); }

  // ───────── Checklist templates ─────────

  async listChecklistTemplates(query?: T.ListQuery): Promise<T.ListResponse<DTO.ChecklistTemplateDTO>> { return this.request("GET", "/checklist-templates", { query }); }
  async createChecklistTemplate(body: T.ChecklistTemplateCreateRequest): Promise<DTO.ChecklistTemplateDTO> { return this.request("POST", "/checklist-templates", { json: body }); }
  async getChecklistTemplate(id: string): Promise<DTO.ChecklistTemplateDTO> { return this.request("GET", `/checklist-templates/${seg(id)}`); }
  async updateChecklistTemplate(id: string, body: T.ChecklistTemplateUpdateRequest, version: string): Promise<DTO.ChecklistTemplateDTO> { return this.request("PATCH", `/checklist-templates/${seg(id)}`, { json: body, version }); }
  async publishChecklistTemplate(id: string): Promise<DTO.ChecklistTemplateDTO> { return this.request("POST", `/checklist-templates/${seg(id)}/publish`); }

  // ───────── Field reports ─────────

  async listFieldReports(query?: T.FieldReportListQuery): Promise<T.ListResponse<DTO.FieldReportDTO>> { return this.request("GET", "/field-reports", { query }); }
  async getFieldReport(id: string): Promise<DTO.FieldReportDTO> { return this.request("GET", `/field-reports/${seg(id)}`); }
  async startFieldReportReview(id: string): Promise<DTO.FieldReportDTO> { return this.request("POST", `/field-reports/${seg(id)}/start-review`); }
  async markFieldReportForRepair(id: string, body: T.MarkForRepairRequest = {}): Promise<T.WorkOrderCreatedResponse> { return this.request("POST", `/field-reports/${seg(id)}/mark-for-repair`, { json: body }); }
  async monitorFieldReport(id: string, body: T.NoteRequest): Promise<DTO.FieldReportDTO> { return this.request("POST", `/field-reports/${seg(id)}/monitor`, { json: body }); }
  async dismissFieldReport(id: string, body: T.ReasonRequest): Promise<DTO.FieldReportDTO> { return this.request("POST", `/field-reports/${seg(id)}/dismiss`, { json: body }); }
  async linkFieldReportAsset(id: string, body: T.LinkAssetRequest): Promise<DTO.FieldReportDTO> { return this.request("POST", `/field-reports/${seg(id)}/link-asset`, { json: body }); }

  // ───────── Work orders ─────────

  async listWorkOrders(query?: T.WorkOrderListQuery): Promise<T.ListResponse<DTO.WorkOrderDTO>> { return this.request("GET", "/work-orders", { query }); }
  async createWorkOrder(body: DTO.CreateWorkOrderInput): Promise<DTO.WorkOrderDTO> { return this.request("POST", "/work-orders", { json: body }); }
  async getWorkOrder(id: string): Promise<DTO.WorkOrderDTO> { return this.request("GET", `/work-orders/${seg(id)}`); }
  async updateWorkOrder(id: string, body: T.WorkOrderUpdateRequest, version: string): Promise<DTO.WorkOrderDTO> { return this.request("PATCH", `/work-orders/${seg(id)}`, { json: body, version }); }
  async assignWorkOrder(id: string, body: T.AssignRequest): Promise<DTO.WorkOrderDTO> { return this.request("POST", `/work-orders/${seg(id)}/assign`, { json: body }); }
  async reassignWorkOrder(id: string, body: T.ReassignRequest): Promise<DTO.WorkOrderDTO> { return this.request("POST", `/work-orders/${seg(id)}/reassign`, { json: body }); }
  async verifyWorkOrder(id: string, body: T.VerifyRequest = {}): Promise<DTO.WorkOrderDTO> { return this.request("POST", `/work-orders/${seg(id)}/verify`, { json: body }); }
  async reopenWorkOrder(id: string, body: T.ReasonRequest): Promise<DTO.WorkOrderDTO> { return this.request("POST", `/work-orders/${seg(id)}/reopen`, { json: body }); }
  async cancelWorkOrder(id: string, body: T.ReasonRequest): Promise<DTO.WorkOrderDTO> { return this.request("POST", `/work-orders/${seg(id)}/cancel`, { json: body }); }
  async workOrderSuggestions(id: string): Promise<T.SuggestionsResponse> { return this.request("GET", `/work-orders/${seg(id)}/suggestions`); }
  async workOrderSuggestionsForFieldReport(query: T.SuggestionsQuery): Promise<T.SuggestionsResponse> { return this.request("GET", "/work-orders/suggestions", { query }); }
  async workOrderReportPdf(id: string): Promise<Response> { return this.raw("GET", `/work-orders/${seg(id)}/report.pdf`); }
  async setWorkOrderExternalCost(id: string, body: T.ExternalCostRequest, version: string): Promise<DTO.WorkOrderDTO> { return this.request("PATCH", `/work-orders/${seg(id)}/external-cost`, { json: body, version }); }

  // ───────── Rentals ─────────

  async listRentals(query?: T.RentalListQuery): Promise<T.ListResponse<DTO.RentalDTO>> { return this.request("GET", "/rentals", { query }); }
  async createRental(body: T.RentalCreateRequest): Promise<DTO.RentalDTO> { return this.request("POST", "/rentals", { json: body }); }
  async getRental(id: string): Promise<DTO.RentalDTO> { return this.request("GET", `/rentals/${seg(id)}`); }
  async updateRental(id: string, body: T.RentalUpdateRequest, version: string): Promise<DTO.RentalDTO> { return this.request("PATCH", `/rentals/${seg(id)}`, { json: body, version }); }
  async rentalEligibility(query: T.EligibilityQuery): Promise<T.EligibilityResponse> { return this.request("GET", "/rentals/eligibility", { query }); }
  async reserveRental(id: string): Promise<DTO.RentalDTO> { return this.request("POST", `/rentals/${seg(id)}/reserve`); }
  async cancelRental(id: string, body: T.ReasonRequest): Promise<DTO.RentalDTO> { return this.request("POST", `/rentals/${seg(id)}/cancel`, { json: body }); }
  async closeRental(id: string, body: T.CloseRentalRequest = {}): Promise<DTO.RentalDTO> { return this.request("POST", `/rentals/${seg(id)}/close`, { json: body }); }
  async extendRental(id: string, body: T.ExtendRentalRequest): Promise<DTO.RentalDTO> { return this.request("POST", `/rentals/${seg(id)}/extend`, { json: body }); }
  async rentalCharges(id: string): Promise<T.RentalChargesResponse> { return this.request("GET", `/rentals/${seg(id)}/charges`); }
  async addRentalCharge(id: string, body: T.RentalChargeCreateRequest): Promise<DTO.RentalChargeDTO> { return this.request("POST", `/rentals/${seg(id)}/charges`, { json: body }); }
  async deleteRentalCharge(id: string, lineId: string): Promise<void> { await this.request("DELETE", `/rentals/${seg(id)}/charges/${seg(lineId)}`); }
  async recomputeRentalCharges(id: string): Promise<T.RentalChargesResponse> { return this.request("POST", `/rentals/${seg(id)}/charges/recompute`); }
  async rentalCheckoutPdf(id: string): Promise<Response> { return this.raw("GET", `/rentals/${seg(id)}/checkout.pdf`); }
  async rentalCheckinPdf(id: string): Promise<Response> { return this.raw("GET", `/rentals/${seg(id)}/checkin.pdf`); }
  async rentalCalendar(query: T.RentalCalendarQuery): Promise<T.RentalCalendarResponse> { return this.request("GET", "/rentals/calendar", { query }); }

  // ───────── Inspections, damages, costs ─────────

  async getInspection(id: string): Promise<DTO.InspectionDTO> { return this.request("GET", `/inspections/${seg(id)}`); }
  async compareInspection(id: string): Promise<T.InspectionCompareResponse> { return this.request("GET", `/inspections/${seg(id)}/compare`); }
  async listDamages(query?: T.DamageListQuery): Promise<T.ListResponse<DTO.DamageDTO>> { return this.request("GET", "/damages", { query }); }
  async updateDamage(id: string, body: T.DamageUpdateRequest, version: string): Promise<DTO.DamageDTO> { return this.request("PATCH", `/damages/${seg(id)}`, { json: body, version }); }
  async createDamageWorkOrder(id: string): Promise<T.WorkOrderCreatedResponse> { return this.request("POST", `/damages/${seg(id)}/create-work-order`); }
  async costsRollup(query: T.CostRollupQuery): Promise<T.CostRollupResponse> { return this.request("GET", "/costs/rollup", { query }); }

  // ───────── Exports and imports ─────────

  async streamExport(entity: T.ExportEntity, query?: Query): Promise<Response> { return this.raw("GET", `/exports/${seg(entity)}.csv`, { query }); }
  async createExport(body: T.ExportCreateRequest): Promise<T.ExportJobDTO> { return this.request("POST", "/exports", { json: body }); }
  async getExport(id: string): Promise<T.ExportJobDTO> { return this.request("GET", `/exports/${seg(id)}`); }
  async importDryRun(entity: T.ImportEntity, body: BodyInit): Promise<T.ImportResult> { return this.request("POST", `/imports/${seg(entity)}`, { query: { dryRun: 1 }, body }); }
  async importEntity(entity: T.ImportEntity, body: BodyInit): Promise<T.ImportResult> { return this.request("POST", `/imports/${seg(entity)}`, { body }); }

  // ───────── Org, platform, settings, notifications ─────────

  async orgSubscription(): Promise<T.OrgSubscriptionResponse> { return this.request("GET", "/org/subscription"); }
  async cancelOrg(body: T.OrgCancelRequest): Promise<void> { await this.request("POST", "/org/cancel", { json: body }); }
  async acceptOrgTerms(body: T.AcceptTermsRequest): Promise<DTO.OrganizationDTO> { return this.request("POST", "/org/accept-terms", { json: body }); }
  async platformOrgs(query?: T.PlatformOrgListQuery): Promise<T.ListResponse<DTO.OrganizationDTO>> { return this.request("GET", "/platform/orgs", { query }); }
  async getPlatformOrg(id: string): Promise<DTO.OrganizationDTO> { return this.request("GET", `/platform/orgs/${seg(id)}`); }
  async updatePlatformOrg(id: string, body: T.PlatformOrgUpdateRequest, version?: string): Promise<DTO.OrganizationDTO> { return this.request("PATCH", `/platform/orgs/${seg(id)}`, { json: body, version }); }
  async platformAdminResetLink(id: string, body: T.PlatformAdminResetLinkRequest): Promise<T.InviteResponse> { return this.request("POST", `/platform/orgs/${seg(id)}/admin-reset-link`, { json: body }); }
  platformGoogleStartUrl(): string { return this.buildUrl("/platform/auth/google/start").toString(); }
  async platformGoogleStart(): Promise<Response> { return this.raw("GET", "/platform/auth/google/start", { auth: false, redirect: "manual" }); }

  async settings(): Promise<OrgSettings> { return this.request("GET", "/settings"); }
  /** `version` is `organization.syncVersion`. */
  async updateSettings(body: Partial<OrgSettings>, version: string): Promise<OrgSettings> { return this.request("PATCH", "/settings", { json: body, version }); }
  async notifications(query?: T.NotificationListQuery): Promise<T.ListResponse<DTO.NotificationDTO>> { return this.request("GET", "/notifications", { query }); }
  async markNotificationsRead(body: T.NotificationsReadRequest): Promise<void> { await this.request("POST", "/notifications/read", { json: body }); }

  // ───────── Parts, stock, maintenance, fuel (P1) ─────────

  async listParts(query?: T.ListQuery): Promise<T.ListResponse<DTO.PartDTO>> { return this.request("GET", "/parts", { query }); }
  async createPart(body: T.PartCreateRequest): Promise<DTO.PartDTO> { return this.request("POST", "/parts", { json: body }); }
  async updatePart(id: string, body: T.PartUpdateRequest, version: string): Promise<DTO.PartDTO> { return this.request("PATCH", `/parts/${seg(id)}`, { json: body, version }); }
  async listStockLocations(query?: T.ListQuery): Promise<T.ListResponse<DTO.StockLocationDTO>> { return this.request("GET", "/stock-locations", { query }); }
  async createStockLocation(body: T.StockLocationCreateRequest): Promise<DTO.StockLocationDTO> { return this.request("POST", "/stock-locations", { json: body }); }
  async stockLevels(query?: T.StockLevelQuery): Promise<T.ListResponse<DTO.StockLevelDTO>> { return this.request("GET", "/stock-levels", { query }); }
  async listStockMovements(query?: T.ListQuery): Promise<T.ListResponse<T.StockMovementDTO>> { return this.request("GET", "/stock-movements", { query }); }
  async createStockMovement(body: T.StockMovementCreateRequest): Promise<T.StockMovementDTO> { return this.request("POST", "/stock-movements", { json: body }); }
  async listMaintenancePlans(query?: T.ListQuery): Promise<T.ListResponse<DTO.MaintenancePlanDTO>> { return this.request("GET", "/maintenance-plans", { query }); }
  async createMaintenancePlan(body: T.MaintenancePlanCreateRequest): Promise<DTO.MaintenancePlanDTO> { return this.request("POST", "/maintenance-plans", { json: body }); }
  async updateMaintenancePlan(id: string, body: T.MaintenancePlanUpdateRequest, version: string): Promise<DTO.MaintenancePlanDTO> { return this.request("PATCH", `/maintenance-plans/${seg(id)}`, { json: body, version }); }
  async maintenancePlanDue(id: string): Promise<T.MaintenanceDueResponse> { return this.request("GET", `/maintenance-plans/${seg(id)}/due`); }
  async listFuelLogs(query?: T.FuelLogListQuery): Promise<T.ListResponse<DTO.FuelLogDTO>> { return this.request("GET", "/fuel-logs", { query }); }
  async createFuelLog(body: T.FuelLogCreateRequest): Promise<DTO.FuelLogDTO> { return this.request("POST", "/fuel-logs", { json: body }); }
  async fuelConsumption(query: T.FuelConsumptionQuery): Promise<T.FuelConsumptionResponse> { return this.request("GET", "/fuel-logs/consumption", { query }); }

  // ───────── Billing (P1) ─────────

  async listBillingDocuments(query?: T.BillingDocumentListQuery): Promise<T.ListResponse<T.BillingDocumentDTO>> { return this.request("GET", "/billing-documents", { query }); }
  async getBillingDocument(id: string): Promise<T.BillingDocumentDTO> { return this.request("GET", `/billing-documents/${seg(id)}`); }
  async createBillingDocument(body: T.BillingDocumentCreateRequest): Promise<T.BillingDocumentDTO> { return this.request("POST", "/billing-documents", { json: body }); }
  async updateBillingDocument(id: string, body: T.BillingDocumentUpdateRequest, version: string): Promise<T.BillingDocumentDTO> { return this.request("PATCH", `/billing-documents/${seg(id)}`, { json: body, version }); }
  async issueBillingDocument(id: string, body: T.BillingIssueRequest = {}): Promise<T.BillingDocumentDTO> { return this.request("POST", `/billing-documents/${seg(id)}/issue`, { json: body }); }
  async payBillingDocument(id: string, body: T.BillingPayRequest = {}): Promise<T.BillingDocumentDTO> { return this.request("POST", `/billing-documents/${seg(id)}/pay`, { json: body }); }
  async cancelBillingDocument(id: string, body: T.ReasonRequest): Promise<T.BillingDocumentDTO> { return this.request("POST", `/billing-documents/${seg(id)}/cancel`, { json: body }); }
  async billingDocumentPdf(id: string): Promise<Response> { return this.raw("GET", `/billing-documents/${seg(id)}/pdf`); }

  // ───────── Comments (P1) ─────────

  async listComments(query: T.CommentListQuery): Promise<T.ListResponse<DTO.CommentDTO>> { return this.request("GET", "/comments", { query }); }
  async createComment(body: T.CommentCreateRequest): Promise<DTO.CommentDTO> { return this.request("POST", "/comments", { json: body }); }

  // ───────── Transport ─────────

  private async request<R>(method: string, path: string, options: SendOptions = {}): Promise<R> {
    const response = await this.raw(method, path, options);
    return (await parseBody(response)) as R;
  }

  private async raw(method: string, path: string, options: SendOptions = {}): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    const authenticated = options.auth !== false;
    const build = async (): Promise<RequestInit> => {
      const headers = new Headers({ accept: "application/json" });
      if (options.version !== undefined) {
        headers.set("if-match", options.version);
      }
      let body: BodyInit | undefined = options.body;
      if (options.json !== undefined) {
        headers.set("content-type", "application/json");
        body = JSON.stringify(options.json);
      } else if (options.contentType !== undefined) {
        headers.set("content-type", options.contentType);
      }
      if (authenticated) {
        const token = await this.tokenProvider();
        if (token !== null) {
          headers.set("authorization", `Bearer ${token}`);
        }
      }
      const init: RequestInit = { method, headers };
      if (body !== undefined) init.body = body;
      if (this.credentials !== undefined) init.credentials = this.credentials;
      if (options.redirect !== undefined) init.redirect = options.redirect;
      return init;
    };

    try {
      return await this.execute(url, await build(), options.redirect === "manual");
    } catch (error) {
      if (!authenticated || !isTokenExpired(error) || this.onUnauthorized === undefined) {
        throw error;
      }
      if (!(await this.handleUnauthorized(this.onUnauthorized))) {
        throw error;
      }
      return this.execute(url, await build(), options.redirect === "manual");
    }
  }

  private async execute(url: URL, init: RequestInit, allowRedirect = false): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (cause) {
      throw networkError(cause);
    }
    const isRedirect = response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400);
    if (!response.ok && !(allowRedirect && isRedirect)) {
      throw await decodeApiError(response);
    }
    return response;
  }

  private async handleUnauthorized(hook: () => Promise<boolean>): Promise<boolean> {
    if (this.unauthorizedInFlight === null) {
      this.unauthorizedInFlight = hook()
        .catch(() => false)
        .finally(() => {
          this.unauthorizedInFlight = null;
        });
    }
    return this.unauthorizedInFlight;
  }

  private buildUrl(path: string, query?: QueryInput): URL {
    const cleanPath = path.startsWith(API_PREFIX) ? path : `${API_PREFIX}${path}`;
    const url = new URL(cleanPath, this.baseUrl);
    if (query === undefined) {
      return url;
    }
    for (const [key, value] of Object.entries(query) as [string, T.QueryValue][]) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value as readonly (string | number | boolean)[]) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }
}

function isTokenExpired(error: unknown): error is ApiError {
  return isApiError(error) && error.code === "TOKEN_EXPIRED" && error.status === 401;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  return JSON.parse(text) as unknown;
}
