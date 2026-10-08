import { z } from "zod";

/**
 * Shared enumerations (ARCHITECTURE section 5.2).
 *
 * Documents store the string value. The server, the device mirror and the API all use
 * exactly these strings.
 */

// ───────── Identity and tenancy ─────────

export const RoleEnum = z.enum(["ADMIN", "MANAGER", "FIELD"]);
export type Role = z.infer<typeof RoleEnum>;

export const OrgStatusEnum = z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]);
export type OrgStatus = z.infer<typeof OrgStatusEnum>;

export const AuthProviderEnum = z.enum(["GOOGLE", "APPLE"]);
export type AuthProvider = z.infer<typeof AuthProviderEnum>;

export const AuthMethodEnum = z.enum(["GOOGLE", "APPLE", "PASSWORD"]);
export type AuthMethod = z.infer<typeof AuthMethodEnum>;

export const AuthLinkKindEnum = z.enum(["INVITE", "PASSWORD_RESET"]);
export type AuthLinkKind = z.infer<typeof AuthLinkKindEnum>;

export const DutyStatusEnum = z.enum(["OFF_DUTY", "ON_DUTY"]);
export type DutyStatus = z.infer<typeof DutyStatusEnum>;

export const PlatformEnum = z.enum(["IOS", "ANDROID", "WEB"]);
export type Platform = z.infer<typeof PlatformEnum>;

// ───────── Master data ─────────

export const SiteTypeEnum = z.enum([
  "FARM",
  "YARD",
  "WORKSHOP",
  "DEALER",
  "CONSTRUCTION",
  "OTHER",
]);
export type SiteType = z.infer<typeof SiteTypeEnum>;

export const AssetCategoryEnum = z.enum([
  "TRACTOR",
  "HARVESTER",
  "SPRAYER",
  "PLANTER",
  "TRUCK",
  "PICKUP",
  "LOADER",
  "EXCAVATOR",
  "GENERATOR",
  "IRRIGATION",
  "IMPLEMENT",
  "OTHER",
]);
export type AssetCategory = z.infer<typeof AssetCategoryEnum>;

export const AssetOwnerTypeEnum = z.enum(["ORGANIZATION", "CUSTOMER", "PARTNER"]);
export type AssetOwnerType = z.infer<typeof AssetOwnerTypeEnum>;

export const AssetConditionEnum = z.enum([
  "OPERATIONAL",
  "NEEDS_REPAIR",
  "IN_REPAIR",
  "OUT_OF_SERVICE",
  "RETIRED",
]);
export type AssetCondition = z.infer<typeof AssetConditionEnum>;

// ───────── Field reports ─────────

export const IssueCategoryEnum = z.enum([
  "ENGINE",
  "HYDRAULIC",
  "ELECTRICAL",
  "TRANSMISSION",
  "TIRES_TRACKS",
  "BRAKES",
  "STRUCTURE",
  "CAB",
  "IMPLEMENT",
  "LEAK",
  "SAFETY",
  "OTHER",
]);
export type IssueCategory = z.infer<typeof IssueCategoryEnum>;

export const PriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type Priority = z.infer<typeof PriorityEnum>;

export const SuggestedActionEnum = z.enum(["REPAIR_NOW", "REPAIR_SOON", "MONITOR", "INFO_ONLY"]);
export type SuggestedAction = z.infer<typeof SuggestedActionEnum>;

export const FieldReportStatusEnum = z.enum([
  "SUBMITTED",
  "IN_REVIEW",
  "MARKED_FOR_REPAIR",
  "MONITORING",
  "DISMISSED",
]);
export type FieldReportStatus = z.infer<typeof FieldReportStatusEnum>;

// ───────── Work orders ─────────

export const WorkOrderTypeEnum = z.enum(["CORRECTIVE", "PREVENTIVE", "INSPECTION"]);
export type WorkOrderType = z.infer<typeof WorkOrderTypeEnum>;

export const WorkOrderStatusEnum = z.enum([
  "OPEN",
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE",
  "ON_SITE",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "VERIFIED",
  "CANCELLED",
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusEnum>;

export const HoldReasonEnum = z.enum([
  "WAITING_PARTS",
  "WAITING_CUSTOMER",
  "WEATHER",
  "SAFETY",
  "NEEDS_SPECIALIST",
  "OTHER",
]);
export type HoldReason = z.infer<typeof HoldReasonEnum>;

// ───────── Rentals ─────────

export const RentalDirectionEnum = z.enum(["OUTBOUND", "INBOUND"]);
export type RentalDirection = z.infer<typeof RentalDirectionEnum>;

export const RentalStatusEnum = z.enum([
  "DRAFT",
  "RESERVED",
  "ACTIVE",
  "RETURNED",
  "CLOSED",
  "CANCELLED",
]);
export type RentalStatus = z.infer<typeof RentalStatusEnum>;

export const RateUnitEnum = z.enum(["HOUR", "DAY", "WEEK", "MONTH"]);
export type RateUnit = z.infer<typeof RateUnitEnum>;

export const FuelPolicyEnum = z.enum(["FULL_TO_FULL", "CHARGE_DIFFERENCE", "INCLUDED"]);
export type FuelPolicy = z.infer<typeof FuelPolicyEnum>;

export const DeliveryModeEnum = z.enum(["PICKUP", "DELIVERY"]);
export type DeliveryMode = z.infer<typeof DeliveryModeEnum>;

export const ChargeTypeEnum = z.enum([
  "BASE",
  "EXTRA_TIME",
  "EXTRA_HOURS",
  "FUEL",
  "DAMAGE",
  "CLEANING",
  "DELIVERY",
  "DISCOUNT",
  "ACCESSORY",
  "OTHER",
]);
export type ChargeType = z.infer<typeof ChargeTypeEnum>;

export const InspectionTypeEnum = z.enum(["CHECK_OUT", "CHECK_IN"]);
export type InspectionType = z.infer<typeof InspectionTypeEnum>;

export const ChecklistKindEnum = z.enum(["RENTAL", "WORK_ORDER"]);
export type ChecklistKind = z.infer<typeof ChecklistKindEnum>;

export const DamageZoneEnum = z.enum([
  "FRONT",
  "REAR",
  "LEFT",
  "RIGHT",
  "TOP",
  "CAB",
  "ENGINE",
  "UNDERCARRIAGE",
  "TIRES_TRACKS",
  "IMPLEMENT",
  "OTHER",
]);
export type DamageZone = z.infer<typeof DamageZoneEnum>;

export const DamageSeverityEnum = z.enum(["MINOR", "MODERATE", "SEVERE"]);
export type DamageSeverity = z.infer<typeof DamageSeverityEnum>;

export const DamageDisputeStatusEnum = z.enum(["NONE", "DISPUTED", "ACCEPTED", "WAIVED"]);
export type DamageDisputeStatus = z.infer<typeof DamageDisputeStatusEnum>;

export const DamageMatchStatusEnum = z.enum(["MATCHED", "NEW", "UNCLEAR"]);
export type DamageMatchStatus = z.infer<typeof DamageMatchStatusEnum>;

export const SignerRoleEnum = z.enum(["CUSTOMER", "REPRESENTATIVE"]);
export type SignerRole = z.infer<typeof SignerRoleEnum>;

export const SignatureStatusEnum = z.enum(["SIGNED", "REFUSED", "ABSENT"]);
export type SignatureStatus = z.infer<typeof SignatureStatusEnum>;

// ───────── Devices, exports and media ─────────

export const PushStatusEnum = z.enum(["OK", "DENIED", "TOKEN_INVALID"]);
export type PushStatus = z.infer<typeof PushStatusEnum>;

export const ExportJobStatusEnum = z.enum(["QUEUED", "RUNNING", "READY", "FAILED", "EXPIRED"]);
export type ExportJobStatus = z.infer<typeof ExportJobStatusEnum>;

export const MediaKindEnum = z.enum(["PHOTO", "VIDEO", "AUDIO", "SIGNATURE", "DOCUMENT"]);
export type MediaKind = z.infer<typeof MediaKindEnum>;

export const MediaStatusEnum = z.enum(["PENDING", "UPLOADED", "FAILED"]);
export type MediaStatus = z.infer<typeof MediaStatusEnum>;

export const MediaVariantStatusEnum = z.enum(["PENDING", "UPLOADED", "FAILED"]);
export type MediaVariantStatus = z.infer<typeof MediaVariantStatusEnum>;

export const MediaTagEnum = z.enum([
  "GENERAL",
  "BEFORE",
  "AFTER",
  "WALKAROUND_FRONT",
  "WALKAROUND_REAR",
  "WALKAROUND_LEFT",
  "WALKAROUND_RIGHT",
  "WALKAROUND_CAB",
  "HOUR_METER",
  "FUEL_GAUGE",
  "DAMAGE",
  "PLATE",
  "CHECKLIST_ITEM",
  "SIGNATURE_CUSTOMER",
  "SIGNATURE_AGENT",
  "SIGNATURE_TECHNICIAN",
  "FUEL_PUMP",
]);
export type MediaTag = z.infer<typeof MediaTagEnum>;

// ───────── Cross-cutting ─────────

export const EntityTypeEnum = z.enum([
  "ORGANIZATION",
  "USER",
  "ASSET",
  "SITE",
  "PLOT",
  "SEASON",
  "CUSTOMER",
  "FIELD_REPORT",
  "WORK_ORDER",
  "RENTAL",
  "INSPECTION",
  "DAMAGE",
  "MEDIA",
  "COMMENT",
  "CHECKLIST_TEMPLATE",
  "FUEL_LOG",
  "PART",
  "STOCK_MOVEMENT",
  "MAINTENANCE_PLAN",
  "BILLING_DOCUMENT",
  "DEVICE",
  "EXPORT_JOB",
]);
export type EntityType = z.infer<typeof EntityTypeEnum>;

export const NotificationTypeEnum = z.enum([
  "WO_ASSIGNED",
  "WO_UPDATED",
  "WO_CANCELLED",
  "WO_REASSIGNED_AWAY",
  "REPORT_CRITICAL",
  "REPORT_MARKED_FOR_REPAIR",
  "RENTAL_DUE_SOON",
  "RENTAL_OVERDUE",
  "SLA_AT_RISK",
  "DEVICE_STALE_SYNC",
  "LATE_EVIDENCE",
  "JOINED_WITH_OTHER_EMAIL",
  "COMMENT_ADDED",
  "EXPORT_READY",
  "MAINTENANCE_DUE",
  "LOW_STOCK",
]);
export type NotificationType = z.infer<typeof NotificationTypeEnum>;

export const MutationResultStatusEnum = z.enum(["APPLIED", "REJECTED"]);
export type MutationResultStatus = z.infer<typeof MutationResultStatusEnum>;

// ───────── P1 ─────────

export const StockLocationTypeEnum = z.enum(["WAREHOUSE", "VAN"]);
export type StockLocationType = z.infer<typeof StockLocationTypeEnum>;

export const StockMovementTypeEnum = z.enum([
  "IN",
  "OUT_TO_WORK_ORDER",
  "TRANSFER",
  "ADJUSTMENT",
]);
export type StockMovementType = z.infer<typeof StockMovementTypeEnum>;

export const MaintenanceTriggerEnum = z.enum(["HOURS", "CALENDAR", "HOURS_OR_CALENDAR"]);
export type MaintenanceTrigger = z.infer<typeof MaintenanceTriggerEnum>;

export const BillingSourceEnum = z.enum(["WORK_ORDER", "RENTAL", "MANUAL"]);
export type BillingSource = z.infer<typeof BillingSourceEnum>;

export const BillingStatusEnum = z.enum(["DRAFT", "ISSUED", "PAID", "CANCELLED"]);
export type BillingStatus = z.infer<typeof BillingStatusEnum>;
