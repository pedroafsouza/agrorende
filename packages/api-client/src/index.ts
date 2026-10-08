import { AppError, isErrorCode, type AppErrorEnvelope } from "@agrorende/contracts/errors";
import { HealthResponseSchema, type HealthResponse, type PullRequest, type PullResponse, type PushRequest, type PushResponse } from "@agrorende/contracts/sync";
import type * as DTO from "@agrorende/contracts/dto";
import type { OrgSettings } from "@agrorende/contracts/settings";

export type TokenProvider = () => Promise<string | null> | string | null;
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type QueryValue = string | number | boolean | null | undefined;
export type Query = Readonly<Record<string, QueryValue>>;
export type JsonBody = unknown;

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly tokenProvider?: TokenProvider;
  readonly fetch?: FetchLike;
}

export interface ListResponse<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface UploadUrlResponse {
  readonly url: string;
  readonly expiresAt: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface InviteResponse {
  readonly code: string;
  readonly url: string;
  readonly whatsappUrl: string;
  readonly expiresAt: string;
}

export interface AuthLoginResponse {
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly user: DTO.UserDTO;
  readonly org?: DTO.OrganizationDTO;
}

export interface EligibilityResponse {
  readonly eligible: boolean;
  readonly codes: readonly string[];
}

export interface WorkOrderCreatedResponse {
  readonly workOrderId: string;
}

export class AgrorendeApiClient {
  private readonly baseUrl: URL;
  private readonly tokenProvider: TokenProvider;
  private readonly fetchImpl: FetchLike;

  constructor(options: ApiClientOptions) {
    this.baseUrl = new URL(options.baseUrl);
    this.tokenProvider = options.tokenProvider ?? (() => null);
    this.fetchImpl = options.fetch ?? fetch;
  }

  async health(): Promise<HealthResponse> {
    const body = await this.request<unknown>("GET", "/api/v1/health", { auth: false });
    return HealthResponseSchema.parse(body);
  }

  async oauthStart(provider: "google" | "apple"): Promise<unknown> { return this.request("GET", `/auth/oauth/${provider}/start`, { auth: false }); }
  async oauthGoogleCallback(query?: Query): Promise<unknown> { return this.request("GET", "/auth/oauth/google/callback", { query, auth: false }); }
  async oauthAppleCallback(body: JsonBody): Promise<unknown> { return this.request("POST", "/auth/oauth/apple/callback", { body, auth: false }); }
  async oauthExchange(body: JsonBody): Promise<AuthLoginResponse> { return this.request("POST", "/auth/oauth/exchange", { body, auth: false }); }
  async appleLogin(body: JsonBody): Promise<AuthLoginResponse> { return this.request("POST", "/auth/apple", { body, auth: false }); }
  async login(body: JsonBody): Promise<AuthLoginResponse> { return this.request("POST", "/auth/login", { body, auth: false }); }
  async refresh(body?: JsonBody): Promise<AuthLoginResponse> { return this.request("POST", "/auth/refresh", { body, auth: false }); }
  async logout(): Promise<void> { await this.request("POST", "/auth/logout"); }
  async me(): Promise<{ readonly user: DTO.UserDTO; readonly role: string; readonly org?: DTO.OrganizationDTO; readonly settings?: OrgSettings }> { return this.request("GET", "/auth/me"); }
  async updateMe(body: JsonBody): Promise<DTO.UserDTO> { return this.request("PATCH", "/me", { body }); }
  async getInvite(code: string): Promise<unknown> { return this.request("GET", `/auth/invites/${code}`, { auth: false }); }
  async redeemInvitePassword(code: string, body: JsonBody): Promise<AuthLoginResponse> { return this.request("POST", `/auth/invites/${code}/password`, { body, auth: false }); }
  async getReset(code: string): Promise<unknown> { return this.request("GET", `/auth/reset/${code}`, { auth: false }); }
  async redeemReset(code: string, body: JsonBody): Promise<void> { await this.request("POST", `/auth/reset/${code}`, { body, auth: false }); }
  async deleteMe(body: JsonBody): Promise<void> { await this.request("DELETE", "/auth/me", { body }); }
  async changePassword(body: JsonBody): Promise<void> { await this.request("POST", "/auth/change-password", { body }); }
  async socketToken(): Promise<{ readonly token: string }> { return this.request("POST", "/auth/socket-token"); }
  async signupOrganization(body: JsonBody): Promise<{ readonly organization: DTO.OrganizationDTO; readonly user: DTO.UserDTO }> { return this.request("POST", "/signup/organization", { body, auth: false }); }

  async syncPush(body: PushRequest): Promise<PushResponse> { return this.request("POST", "/sync/push", { body }); }
  async syncPull(query: PullRequest): Promise<PullResponse> { return this.request("GET", "/sync/pull", { query }); }
  async telemetry(body: JsonBody): Promise<void> { await this.request("POST", "/telemetry", { body }); }
  async telemetryDiagnostics(body: JsonBody): Promise<void> { await this.request("POST", "/telemetry/diagnostics", { body }); }

  async registerDevice(body: JsonBody): Promise<unknown> { return this.request("POST", "/devices/register", { body }); }
  async deviceDiagnostics(id: string, query?: Query): Promise<ListResponse<unknown>> { return this.request("GET", `/devices/${id}/diagnostics`, { query }); }
  async listDevices(query?: Query): Promise<ListResponse<unknown>> { return this.request("GET", "/devices", { query }); }

  async issueMediaUploadUrl(id: string, body: JsonBody): Promise<UploadUrlResponse> { return this.request("POST", `/media/${id}/upload-url`, { body }); }
  async issueMediaMultipartParts(id: string, body: JsonBody): Promise<unknown> { return this.request("POST", `/media/${id}/multipart/parts`, { body }); }
  async completeMediaUpload(id: string, body: JsonBody): Promise<DTO.MediaDTO> { return this.request("POST", `/media/${id}/complete`, { body }); }
  async uploadMediaBlob(id: string, query: Query, body: BodyInit): Promise<void> { await this.raw("PUT", `/media/${id}/blob`, { query, body }); }
  async uploadMediaPart(id: string, part: number, query: Query, body: BodyInit): Promise<void> { await this.raw("PUT", `/media/${id}/blob/parts/${part}`, { query, body }); }
  async downloadMediaBlob(id: string, query: Query): Promise<Response> { return this.raw("GET", `/media/${id}/blob`, { query }); }
  async getMediaUrl(id: string, query?: Query): Promise<Response> { return this.raw("GET", `/media/${id}/url`, { query }); }
  async createMedia(body: JsonBody): Promise<DTO.MediaDTO> { return this.request("POST", "/media", { body }); }

  async postLocationsBatch(body: JsonBody): Promise<{ readonly accepted: number }> { return this.request("POST", "/locations/batch", { body }); }
  async listAttention(query?: Query): Promise<ListResponse<unknown>> { return this.request("GET", "/attention", { query }); }
  async resolveAttention(kind: string, id: string, body: JsonBody): Promise<void> { await this.request("POST", `/attention/${kind}/${id}/resolve`, { body }); }
  async opsLive(): Promise<unknown> { return this.request("GET", "/ops/live"); }
  async opsKpis(query?: Query): Promise<unknown> { return this.request("GET", "/ops/kpis", { query }); }
  async opsActivity(query?: Query): Promise<ListResponse<DTO.ActivityEventDTO>> { return this.request("GET", "/ops/activity", { query }); }
  async opsAlerts(): Promise<ListResponse<unknown>> { return this.request("GET", "/ops/alerts"); }
  async operatorTrail(userId: string, query: Query): Promise<ListResponse<unknown>> { return this.request("GET", `/ops/operators/${userId}/trail`, { query }); }

  async listUsers(query?: Query): Promise<ListResponse<DTO.UserDTO>> { return this.request("GET", "/users", { query }); }
  async createUser(body: JsonBody): Promise<{ readonly user: DTO.UserDTO; readonly invite: InviteResponse }> { return this.request("POST", "/users", { body }); }
  async getUser(id: string): Promise<DTO.UserDTO> { return this.request("GET", `/users/${id}`); }
  async updateUser(id: string, body: JsonBody, version?: string): Promise<DTO.UserDTO> { return this.request("PATCH", `/users/${id}`, { body, version }); }
  async inviteUser(id: string): Promise<InviteResponse> { return this.request("POST", `/users/${id}/invite`); }
  async resetUserLink(id: string): Promise<InviteResponse> { return this.request("POST", `/users/${id}/reset-link`); }
  async setTemporaryPassword(id: string, body: JsonBody): Promise<void> { await this.request("POST", `/users/${id}/temporary-password`, { body }); }
  async setUserRole(id: string, body: JsonBody): Promise<DTO.UserDTO> { return this.request("POST", `/users/${id}/role`, { body }); }
  async deactivateUser(id: string): Promise<DTO.UserDTO> { return this.request("POST", `/users/${id}/deactivate`); }
  async reactivateUser(id: string): Promise<DTO.UserDTO> { return this.request("POST", `/users/${id}/reactivate`); }
  async userDevices(id: string): Promise<ListResponse<unknown>> { return this.request("GET", `/users/${id}/devices`); }

  async listAssets(query?: Query): Promise<ListResponse<DTO.AssetDTO>> { return this.request("GET", "/assets", { query }); }
  async createAsset(body: JsonBody): Promise<DTO.AssetDTO> { return this.request("POST", "/assets", { body }); }
  async getAsset(id: string): Promise<DTO.AssetDTO> { return this.request("GET", `/assets/${id}`); }
  async updateAsset(id: string, body: JsonBody, version?: string): Promise<DTO.AssetDTO> { return this.request("PATCH", `/assets/${id}`, { body, version }); }
  async retireAsset(id: string, body: JsonBody): Promise<DTO.AssetDTO> { return this.request("POST", `/assets/${id}/retire`, { body }); }
  async assetHistory(id: string, query?: Query): Promise<unknown> { return this.request("GET", `/assets/${id}/history`, { query }); }
  async assetQrPng(id: string): Promise<Response> { return this.raw("GET", `/assets/${id}/qr.png`); }
  async assetQrSheet(body: JsonBody): Promise<Response> { return this.raw("POST", "/assets/qr-sheet", { jsonBody: body }); }

  async listSites(query?: Query): Promise<ListResponse<DTO.SiteDTO>> { return this.request("GET", "/sites", { query }); }
  async createSite(body: JsonBody): Promise<DTO.SiteDTO> { return this.request("POST", "/sites", { body }); }
  async updateSite(id: string, body: JsonBody, version?: string): Promise<DTO.SiteDTO> { return this.request("PATCH", `/sites/${id}`, { body, version }); }
  async listSitePlots(siteId: string): Promise<ListResponse<DTO.PlotDTO>> { return this.request("GET", `/sites/${siteId}/plots`); }
  async createSitePlot(siteId: string, body: JsonBody): Promise<DTO.PlotDTO> { return this.request("POST", `/sites/${siteId}/plots`, { body }); }
  async updatePlot(id: string, body: JsonBody, version?: string): Promise<DTO.PlotDTO> { return this.request("PATCH", `/plots/${id}`, { body, version }); }

  async listSeasons(query?: Query): Promise<ListResponse<DTO.SeasonDTO>> { return this.request("GET", "/seasons", { query }); }
  async createSeason(body: JsonBody): Promise<DTO.SeasonDTO> { return this.request("POST", "/seasons", { body }); }
  async updateSeason(id: string, body: JsonBody, version?: string): Promise<DTO.SeasonDTO> { return this.request("PATCH", `/seasons/${id}`, { body, version }); }
  async listCustomers(query?: Query): Promise<ListResponse<DTO.CustomerDTO>> { return this.request("GET", "/customers", { query }); }
  async createCustomer(body: JsonBody): Promise<DTO.CustomerDTO> { return this.request("POST", "/customers", { body }); }
  async getCustomer(id: string): Promise<DTO.CustomerDTO> { return this.request("GET", `/customers/${id}`); }
  async updateCustomer(id: string, body: JsonBody, version?: string): Promise<DTO.CustomerDTO> { return this.request("PATCH", `/customers/${id}`, { body, version }); }

  async listChecklistTemplates(query?: Query): Promise<ListResponse<DTO.ChecklistTemplateDTO>> { return this.request("GET", "/checklist-templates", { query }); }
  async createChecklistTemplate(body: JsonBody): Promise<DTO.ChecklistTemplateDTO> { return this.request("POST", "/checklist-templates", { body }); }
  async getChecklistTemplate(id: string): Promise<DTO.ChecklistTemplateDTO> { return this.request("GET", `/checklist-templates/${id}`); }
  async updateChecklistTemplate(id: string, body: JsonBody, version?: string): Promise<DTO.ChecklistTemplateDTO> { return this.request("PATCH", `/checklist-templates/${id}`, { body, version }); }
  async publishChecklistTemplate(id: string): Promise<DTO.ChecklistTemplateDTO> { return this.request("POST", `/checklist-templates/${id}/publish`); }

  async listFieldReports(query?: Query): Promise<ListResponse<DTO.FieldReportDTO>> { return this.request("GET", "/field-reports", { query }); }
  async getFieldReport(id: string): Promise<DTO.FieldReportDTO> { return this.request("GET", `/field-reports/${id}`); }
  async startFieldReportReview(id: string): Promise<DTO.FieldReportDTO> { return this.request("POST", `/field-reports/${id}/start-review`); }
  async markFieldReportForRepair(id: string, body: JsonBody): Promise<WorkOrderCreatedResponse> { return this.request("POST", `/field-reports/${id}/mark-for-repair`, { body }); }
  async monitorFieldReport(id: string, body: JsonBody): Promise<DTO.FieldReportDTO> { return this.request("POST", `/field-reports/${id}/monitor`, { body }); }
  async dismissFieldReport(id: string, body: JsonBody): Promise<DTO.FieldReportDTO> { return this.request("POST", `/field-reports/${id}/dismiss`, { body }); }
  async linkFieldReportAsset(id: string, body: JsonBody): Promise<DTO.FieldReportDTO> { return this.request("POST", `/field-reports/${id}/link-asset`, { body }); }

  async listWorkOrders(query?: Query): Promise<ListResponse<DTO.WorkOrderDTO>> { return this.request("GET", "/work-orders", { query }); }
  async createWorkOrder(body: JsonBody): Promise<DTO.WorkOrderDTO> { return this.request("POST", "/work-orders", { body }); }
  async getWorkOrder(id: string): Promise<DTO.WorkOrderDTO> { return this.request("GET", `/work-orders/${id}`); }
  async updateWorkOrder(id: string, body: JsonBody, version?: string): Promise<DTO.WorkOrderDTO> { return this.request("PATCH", `/work-orders/${id}`, { body, version }); }
  async assignWorkOrder(id: string, body: JsonBody): Promise<DTO.WorkOrderDTO> { return this.request("POST", `/work-orders/${id}/assign`, { body }); }
  async reassignWorkOrder(id: string, body: JsonBody): Promise<DTO.WorkOrderDTO> { return this.request("POST", `/work-orders/${id}/reassign`, { body }); }
  async verifyWorkOrder(id: string, body?: JsonBody): Promise<DTO.WorkOrderDTO> { return this.request("POST", `/work-orders/${id}/verify`, { body }); }
  async reopenWorkOrder(id: string, body: JsonBody): Promise<DTO.WorkOrderDTO> { return this.request("POST", `/work-orders/${id}/reopen`, { body }); }
  async cancelWorkOrder(id: string, body: JsonBody): Promise<DTO.WorkOrderDTO> { return this.request("POST", `/work-orders/${id}/cancel`, { body }); }
  async workOrderSuggestions(id: string): Promise<unknown> { return this.request("GET", `/work-orders/${id}/suggestions`); }
  async workOrderSuggestionsForFieldReport(query: Query): Promise<unknown> { return this.request("GET", "/work-orders/suggestions", { query }); }
  async workOrderReportPdf(id: string): Promise<Response> { return this.raw("GET", `/work-orders/${id}/report.pdf`); }
  async setWorkOrderExternalCost(id: string, body: JsonBody, version?: string): Promise<DTO.WorkOrderDTO> { return this.request("PATCH", `/work-orders/${id}/external-cost`, { body, version }); }

  async listRentals(query?: Query): Promise<ListResponse<DTO.RentalDTO>> { return this.request("GET", "/rentals", { query }); }
  async createRental(body: JsonBody): Promise<DTO.RentalDTO> { return this.request("POST", "/rentals", { body }); }
  async getRental(id: string): Promise<DTO.RentalDTO> { return this.request("GET", `/rentals/${id}`); }
  async updateRental(id: string, body: JsonBody, version?: string): Promise<DTO.RentalDTO> { return this.request("PATCH", `/rentals/${id}`, { body, version }); }
  async rentalEligibility(query: Query): Promise<EligibilityResponse> { return this.request("GET", "/rentals/eligibility", { query }); }
  async reserveRental(id: string): Promise<DTO.RentalDTO> { return this.request("POST", `/rentals/${id}/reserve`); }
  async cancelRental(id: string, body: JsonBody): Promise<DTO.RentalDTO> { return this.request("POST", `/rentals/${id}/cancel`, { body }); }
  async closeRental(id: string, body?: JsonBody): Promise<DTO.RentalDTO> { return this.request("POST", `/rentals/${id}/close`, { body }); }
  async extendRental(id: string, body: JsonBody): Promise<DTO.RentalDTO> { return this.request("POST", `/rentals/${id}/extend`, { body }); }
  async rentalCharges(id: string): Promise<readonly DTO.RentalChargeDTO[]> { return this.request("GET", `/rentals/${id}/charges`); }
  async addRentalCharge(id: string, body: JsonBody): Promise<DTO.RentalChargeDTO> { return this.request("POST", `/rentals/${id}/charges`, { body }); }
  async deleteRentalCharge(id: string, lineId: string): Promise<void> { await this.request("DELETE", `/rentals/${id}/charges/${lineId}`); }
  async recomputeRentalCharges(id: string): Promise<readonly DTO.RentalChargeDTO[]> { return this.request("POST", `/rentals/${id}/charges/recompute`); }
  async rentalCheckoutPdf(id: string): Promise<Response> { return this.raw("GET", `/rentals/${id}/checkout.pdf`); }
  async rentalCheckinPdf(id: string): Promise<Response> { return this.raw("GET", `/rentals/${id}/checkin.pdf`); }
  async rentalCalendar(query: Query): Promise<unknown> { return this.request("GET", "/rentals/calendar", { query }); }

  async getInspection(id: string): Promise<DTO.InspectionDTO> { return this.request("GET", `/inspections/${id}`); }
  async compareInspection(id: string): Promise<unknown> { return this.request("GET", `/inspections/${id}/compare`); }
  async listDamages(query?: Query): Promise<ListResponse<DTO.DamageDTO>> { return this.request("GET", "/damages", { query }); }
  async updateDamage(id: string, body: JsonBody, version?: string): Promise<DTO.DamageDTO> { return this.request("PATCH", `/damages/${id}`, { body, version }); }
  async createDamageWorkOrder(id: string): Promise<WorkOrderCreatedResponse> { return this.request("POST", `/damages/${id}/create-work-order`); }
  async costsRollup(query: Query): Promise<ListResponse<unknown>> { return this.request("GET", "/costs/rollup", { query }); }

  async streamExport(entity: string, query?: Query): Promise<Response> { return this.raw("GET", `/exports/${entity}.csv`, { query }); }
  async createExport(body: JsonBody): Promise<unknown> { return this.request("POST", "/exports", { body }); }
  async getExport(id: string): Promise<unknown> { return this.request("GET", `/exports/${id}`); }
  async importDryRun(entity: string, body: BodyInit): Promise<unknown> { return this.request("POST", `/imports/${entity}`, { query: { dryRun: 1 }, rawBody: body }); }
  async importEntity(entity: string, body: BodyInit): Promise<unknown> { return this.request("POST", `/imports/${entity}`, { rawBody: body }); }
  async orgSubscription(): Promise<unknown> { return this.request("GET", "/org/subscription"); }
  async cancelOrg(body: JsonBody): Promise<void> { await this.request("POST", "/org/cancel", { body }); }
  async acceptOrgTerms(body: JsonBody): Promise<DTO.OrganizationDTO> { return this.request("POST", "/org/accept-terms", { body }); }
  async platformOrgs(query?: Query): Promise<ListResponse<DTO.OrganizationDTO>> { return this.request("GET", "/platform/orgs", { query }); }
  async getPlatformOrg(id: string): Promise<DTO.OrganizationDTO> { return this.request("GET", `/platform/orgs/${id}`); }
  async updatePlatformOrg(id: string, body: JsonBody, version?: string): Promise<DTO.OrganizationDTO> { return this.request("PATCH", `/platform/orgs/${id}`, { body, version }); }
  async platformAdminResetLink(id: string, body: JsonBody): Promise<InviteResponse> { return this.request("POST", `/platform/orgs/${id}/admin-reset-link`, { body }); }
  async platformGoogleStart(): Promise<unknown> { return this.request("GET", "/platform/auth/google/start", { auth: false }); }
  async settings(): Promise<OrgSettings> { return this.request("GET", "/settings"); }
  async updateSettings(body: OrgSettings, version?: string): Promise<OrgSettings> { return this.request("PATCH", "/settings", { body, version }); }
  async notifications(query?: Query): Promise<ListResponse<DTO.NotificationDTO>> { return this.request("GET", "/notifications", { query }); }
  async markNotificationsRead(body: JsonBody): Promise<void> { await this.request("POST", "/notifications/read", { body }); }

  async listParts(query?: Query): Promise<ListResponse<DTO.PartDTO>> { return this.request("GET", "/parts", { query }); }
  async createPart(body: JsonBody): Promise<DTO.PartDTO> { return this.request("POST", "/parts", { body }); }
  async updatePart(id: string, body: JsonBody, version?: string): Promise<DTO.PartDTO> { return this.request("PATCH", `/parts/${id}`, { body, version }); }
  async listStockLocations(query?: Query): Promise<ListResponse<DTO.StockLocationDTO>> { return this.request("GET", "/stock-locations", { query }); }
  async createStockLocation(body: JsonBody): Promise<DTO.StockLocationDTO> { return this.request("POST", "/stock-locations", { body }); }
  async stockLevels(query?: Query): Promise<ListResponse<DTO.StockLevelDTO>> { return this.request("GET", "/stock-levels", { query }); }
  async listStockMovements(query?: Query): Promise<ListResponse<unknown>> { return this.request("GET", "/stock-movements", { query }); }
  async createStockMovement(body: JsonBody): Promise<unknown> { return this.request("POST", "/stock-movements", { body }); }
  async listMaintenancePlans(query?: Query): Promise<ListResponse<DTO.MaintenancePlanDTO>> { return this.request("GET", "/maintenance-plans", { query }); }
  async createMaintenancePlan(body: JsonBody): Promise<DTO.MaintenancePlanDTO> { return this.request("POST", "/maintenance-plans", { body }); }
  async updateMaintenancePlan(id: string, body: JsonBody, version?: string): Promise<DTO.MaintenancePlanDTO> { return this.request("PATCH", `/maintenance-plans/${id}`, { body, version }); }
  async maintenancePlanDue(id: string): Promise<unknown> { return this.request("GET", `/maintenance-plans/${id}/due`); }
  async listFuelLogs(query?: Query): Promise<ListResponse<DTO.FuelLogDTO>> { return this.request("GET", "/fuel-logs", { query }); }
  async createFuelLog(body: JsonBody): Promise<DTO.FuelLogDTO> { return this.request("POST", "/fuel-logs", { body }); }
  async fuelConsumption(query: Query): Promise<unknown> { return this.request("GET", "/fuel-logs/consumption", { query }); }
  async listBillingDocuments(query?: Query): Promise<ListResponse<unknown>> { return this.request("GET", "/billing-documents", { query }); }
  async getBillingDocument(id: string): Promise<unknown> { return this.request("GET", `/billing-documents/${id}`); }
  async createBillingDocument(body: JsonBody): Promise<unknown> { return this.request("POST", "/billing-documents", { body }); }
  async updateBillingDocument(id: string, body: JsonBody, version?: string): Promise<unknown> { return this.request("PATCH", `/billing-documents/${id}`, { body, version }); }
  async issueBillingDocument(id: string, body: JsonBody): Promise<unknown> { return this.request("POST", `/billing-documents/${id}/issue`, { body }); }
  async payBillingDocument(id: string, body: JsonBody): Promise<unknown> { return this.request("POST", `/billing-documents/${id}/pay`, { body }); }
  async cancelBillingDocument(id: string, body: JsonBody): Promise<unknown> { return this.request("POST", `/billing-documents/${id}/cancel`, { body }); }
  async billingDocumentPdf(id: string): Promise<Response> { return this.raw("GET", `/billing-documents/${id}/pdf`); }
  async listComments(query: Query): Promise<ListResponse<DTO.CommentDTO>> { return this.request("GET", "/comments", { query }); }
  async createComment(body: JsonBody): Promise<DTO.CommentDTO> { return this.request("POST", "/comments", { body }); }
  async opsAnalytics(query: Query): Promise<unknown> { return this.request("GET", "/ops/analytics", { query }); }
  async search(query: Query): Promise<unknown> { return this.request("GET", "/search", { query }); }

  private async request<T>(method: string, path: string, options: { readonly query?: Query; readonly body?: JsonBody; readonly rawBody?: BodyInit; readonly version?: string; readonly auth?: boolean } = {}): Promise<T> {
    const response = await this.raw(method, path, {
      query: options.query,
      jsonBody: options.body,
      rawBody: options.rawBody,
      version: options.version,
      auth: options.auth,
    });
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private async raw(method: string, path: string, options: { readonly query?: Query; readonly jsonBody?: JsonBody; readonly body?: BodyInit; readonly rawBody?: BodyInit; readonly version?: string; readonly auth?: boolean } = {}): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    const headers = new Headers();
    if (options.version !== undefined) {
      headers.set("if-match", options.version);
    }
    if (options.jsonBody !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (options.auth !== false) {
      const token = await this.tokenProvider();
      if (token !== null) {
        headers.set("authorization", `Bearer ${token}`);
      }
    }
    const body = options.jsonBody !== undefined ? JSON.stringify(options.jsonBody) : options.rawBody ?? options.body;
    const response = await this.fetchImpl(url, { method, headers, body });
    if (!response.ok) {
      throw await this.decodeError(response);
    }
    return response;
  }

  private buildUrl(path: string, query: Query = {}): URL {
    const cleanPath = path.startsWith("/api/v1") ? path : `/api/v1${path}`;
    const url = new URL(cleanPath, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  private async decodeError(response: Response): Promise<AppError> {
    const body = (await response.json().catch(() => undefined)) as unknown;
    if (isErrorEnvelope(body) && isErrorCode(body.error.code)) {
      return new AppError(body.error.code, {
        message: body.error.message,
        details: body.error.details,
        fieldErrors: body.error.fieldErrors,
        ref: body.error.ref,
      });
    }
    return new AppError("INTERNAL", { message: `HTTP ${response.status}` });
  }
}

function isErrorEnvelope(value: unknown): value is AppErrorEnvelope {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error = (value as { readonly error: unknown }).error;
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return "code" in error && "message" in error && "retryable" in error;
}
