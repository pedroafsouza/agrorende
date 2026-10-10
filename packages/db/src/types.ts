import type { z } from "zod";

import type {
  ActivityEventSchema,
  AssetSchema,
  AuthLinkSchema,
  BillingDocumentSchema,
  ChecklistTemplateSchema,
  CommentSchema,
  CustomerSchema,
  DamageSchema,
  DeviceDiagnosticSchema,
  DeviceSchema,
  EventOutboxSchema,
  ExportJobSchema,
  FieldReportSchema,
  FuelLogSchema,
  InspectionSchema,
  LocationPingSchema,
  MaintenancePlanSchema,
  MediaSchema,
  NotificationSchema,
  NumberSequenceSchema,
  OrganizationSchema,
  OrgUsageSchema,
  PartSchema,
  PlatformAuditEventSchema,
  PlotSchema,
  ProcessedMutationSchema,
  RefreshTokenSchema,
  RentalChargeSchema,
  RentalSchema,
  SeasonSchema,
  SiteSchema,
  StockLevelSchema,
  StockLocationSchema,
  StockMovementSchema,
  SyncCounterSchema,
  UserIdentitySchema,
  UserSchema,
  WorkOrderPartSchema,
  WorkOrderSchema,
} from "./schemas/index";

export type Uuid = string;
export type Json = Record<string, unknown>;

export interface SyncDoc {
  _id: Uuid;
  organizationId: Uuid;
  syncVersion: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export type Organization = z.infer<typeof OrganizationSchema>;
export type SyncCounter = z.infer<typeof SyncCounterSchema>;
export type NumberSequence = z.infer<typeof NumberSequenceSchema>;
/**
 * `notificationPrefs` is optional on the stored type: the driver does not apply zod defaults on
 * read, and users created before migration 0002-T05-008 have none until it runs.
 */
export type User = Omit<z.infer<typeof UserSchema>, "notificationPrefs"> & { notificationPrefs?: z.infer<typeof UserSchema>["notificationPrefs"] };
export type RefreshToken = z.infer<typeof RefreshTokenSchema>;
export type UserIdentity = z.infer<typeof UserIdentitySchema>;
export type AuthLink = z.infer<typeof AuthLinkSchema>;
export type OrgUsage = z.infer<typeof OrgUsageSchema>;
export type PlatformAuditEvent = z.infer<typeof PlatformAuditEventSchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type DeviceDiagnostic = z.infer<typeof DeviceDiagnosticSchema>;
export type Site = z.infer<typeof SiteSchema>;
export type Plot = z.infer<typeof PlotSchema>;
export type Season = z.infer<typeof SeasonSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type FieldReport = z.infer<typeof FieldReportSchema>;
export type WorkOrder = z.infer<typeof WorkOrderSchema>;
export type WorkOrderPart = z.infer<typeof WorkOrderPartSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Rental = z.infer<typeof RentalSchema>;
export type RentalCharge = z.infer<typeof RentalChargeSchema>;
export type Inspection = z.infer<typeof InspectionSchema>;
export type Damage = z.infer<typeof DamageSchema>;
export type ChecklistTemplate = z.infer<typeof ChecklistTemplateSchema>;
export type Media = z.infer<typeof MediaSchema>;
export type LocationPing = z.infer<typeof LocationPingSchema>;
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type ExportJob = z.infer<typeof ExportJobSchema>;
export type EventOutbox = z.infer<typeof EventOutboxSchema>;
export type ProcessedMutation = z.infer<typeof ProcessedMutationSchema>;
export type MaintenancePlan = z.infer<typeof MaintenancePlanSchema>;
export type FuelLog = z.infer<typeof FuelLogSchema>;
export type Part = z.infer<typeof PartSchema>;
export type StockLocation = z.infer<typeof StockLocationSchema>;
export type StockLevel = z.infer<typeof StockLevelSchema>;
export type StockMovement = z.infer<typeof StockMovementSchema>;
export type BillingDocument = z.infer<typeof BillingDocumentSchema>;

export interface CollectionDocumentMap {
  organizations: Organization;
  sync_counters: SyncCounter;
  number_sequences: NumberSequence;
  users: User;
  refresh_tokens: RefreshToken;
  user_identities: UserIdentity;
  auth_links: AuthLink;
  org_usage: OrgUsage;
  platform_audit_events: PlatformAuditEvent;
  devices: Device;
  device_diagnostics: DeviceDiagnostic;
  sites: Site;
  plots: Plot;
  seasons: Season;
  customers: Customer;
  assets: Asset;
  field_reports: FieldReport;
  work_orders: WorkOrder;
  work_order_parts: WorkOrderPart;
  comments: Comment;
  rentals: Rental;
  rental_charges: RentalCharge;
  inspections: Inspection;
  damages: Damage;
  checklist_templates: ChecklistTemplate;
  media: Media;
  location_pings: LocationPing;
  activity_events: ActivityEvent;
  notifications: Notification;
  export_jobs: ExportJob;
  event_outbox: EventOutbox;
  processed_mutations: ProcessedMutation;
  maintenance_plans: MaintenancePlan;
  fuel_logs: FuelLog;
  parts: Part;
  stock_locations: StockLocation;
  stock_levels: StockLevel;
  stock_movements: StockMovement;
  billing_documents: BillingDocument;
}

export type CollectionName = keyof CollectionDocumentMap;
