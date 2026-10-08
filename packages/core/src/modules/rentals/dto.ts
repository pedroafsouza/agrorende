import { z } from "zod";
import {
  ChargeTypeEnum,
  DamageDisputeStatusEnum,
  DamageMatchStatusEnum,
  DeliveryModeEnum,
  FuelPolicyEnum,
  PriorityEnum,
  RateUnitEnum,
  RentalDirectionEnum,
  RentalStatusEnum,
} from "@agrorende/contracts/enums";
import type { RentalErrorCode } from "@agrorende/contracts/charges";
import type { ActivityEventDTO, DamageDTO, InspectionDTO, MediaDTO, RentalChargeDTO, RentalDTO } from "@agrorende/contracts/dto";
import type { AssetSummary } from "@agrorende/contracts/seams";

export type { DamageDTO, InspectionDTO, RentalChargeDTO, RentalDTO } from "@agrorende/contracts/dto";

const OptionalText = z.string().trim().max(500).nullish();
const OptionalUuid = z.string().uuid().nullish();
const Cents = z.number().int().nonnegative();

/** `POST /rentals` body (ARCHITECTURE §8). Rate fields default from the asset. */
export const RentalCreateInputSchema = z.object({
  id: z.string().uuid().optional(),
  direction: RentalDirectionEnum.default("OUTBOUND"),
  assetId: z.string().uuid(),
  customerId: z.string().uuid(),
  siteId: OptionalUuid,
  agentId: OptionalUuid,
  plannedStart: z.string().datetime({ offset: true }),
  plannedEnd: z.string().datetime({ offset: true }),
  rateCents: Cents.nullish(),
  rateUnit: RateUnitEnum.nullish(),
  depositCents: Cents.default(0),
  includedHoursPerDay: z.number().nonnegative().nullish(),
  extraHourRateCents: Cents.nullish(),
  lateFeePerDayCents: Cents.nullish(),
  fuelPolicy: FuelPolicyEnum.default("CHARGE_DIFFERENCE"),
  fuelPriceCents: Cents.nullish(),
  deliveryMode: DeliveryModeEnum.default("PICKUP"),
  deliveryAddress: OptionalText,
  deliverySiteId: OptionalUuid,
  deliveryLat: z.number().min(-90).max(90).nullish(),
  deliveryLng: z.number().min(-180).max(180).nullish(),
  documentLocale: z.enum(["pt-BR", "en"]).default("pt-BR"),
  notes: z.string().trim().max(4000).nullish(),
});
export type RentalCreateInput = z.input<typeof RentalCreateInputSchema>;

/** `PATCH /rentals/:id` body: DRAFT or RESERVED only. */
export const RentalUpdateInputSchema = RentalCreateInputSchema.omit({ id: true, direction: true })
  .partial()
  .extend({
    depositCents: Cents.optional(),
    fuelPolicy: FuelPolicyEnum.optional(),
    deliveryMode: DeliveryModeEnum.optional(),
    documentLocale: z.enum(["pt-BR", "en"]).optional(),
  });
export type RentalUpdateInput = z.input<typeof RentalUpdateInputSchema>;

export const RentalCancelInputSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export type RentalCancelInput = z.input<typeof RentalCancelInputSchema>;

export const RentalCloseInputSchema = z.object({ paymentNote: z.string().trim().max(500).nullish(), chargesVersion: z.number().int().optional() });

export const RentalExtendInputSchema = z.object({ newPlannedEnd: z.string().datetime({ offset: true }) });
export type RentalExtendInput = z.input<typeof RentalExtendInputSchema>;
export type RentalCloseInput = z.input<typeof RentalCloseInputSchema>;

export const RentalListFilterSchema = z.object({
  status: z.union([RentalStatusEnum, z.literal("OVERDUE")]).optional(),
  customerId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().max(120).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});
export type RentalListFilter = z.input<typeof RentalListFilterSchema>;

export const EligibilityQuerySchema = z.object({
  assetId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  excludeRentalId: z.string().uuid().optional(),
});
export type EligibilityQuery = z.input<typeof EligibilityQuerySchema>;

export type RentalWarningCode = "RENTAL_SITE_MISMATCH";

export interface EligibilityResult {
  readonly eligible: boolean;
  readonly codes: readonly RentalErrorCode[];
  readonly warnings: readonly RentalWarningCode[];
}

/** Manual charge line (`POST /rentals/:id/charges`). DISCOUNT lines are stored negative. */
export const ManualChargeInputSchema = z.object({
  type: ChargeTypeEnum.exclude(["BASE", "EXTRA_TIME", "EXTRA_HOURS"]),
  description: z.string().trim().min(1).max(200),
  quantity: z.number().positive().default(1),
  unitAmountCents: z.number().int(),
  damageId: z.string().uuid().optional(),
  accessoryKey: z.string().trim().min(1).max(80).optional(),
});
export type ManualChargeInput = z.input<typeof ManualChargeInputSchema>;

/** `PATCH /damages/:id`. Dispute and match fields let the office resolve holds before close. */
export const DamagePatchInputSchema = z.object({
  estimatedCostCents: Cents.nullish(),
  description: z.string().trim().max(1000).nullish(),
  disputeStatus: DamageDisputeStatusEnum.optional(),
  matchStatus: DamageMatchStatusEnum.optional(),
});
export type DamagePatchInput = z.input<typeof DamagePatchInputSchema>;

export const DamageListFilterSchema = z.object({
  assetId: z.string().uuid().optional(),
  rentalId: z.string().uuid().optional(),
  open: z.enum(["true", "false"]).optional(),
});
export type DamageListFilter = z.input<typeof DamageListFilterSchema>;

export const DamageWorkOrderInputSchema = z.object({
  priority: PriorityEnum.default("HIGH"),
  title: z.string().trim().min(1).max(200).optional(),
  assigneeId: z.string().uuid().optional(),
  damageIds: z.array(z.string().uuid()).optional(),
});
export type DamageWorkOrderInput = z.input<typeof DamageWorkOrderInputSchema>;

export interface ChargesView {
  readonly rentalId: string;
  readonly status: RentalDTO["status"];
  readonly chargesVersion: number;
  readonly totalCents: number;
  readonly depositCents: number;
  readonly balanceDueCents: number;
  readonly lines: readonly RentalChargeDTO[];
  /** Damages whose charge is held (DISPUTED or UNCLEAR) and therefore block close. */
  readonly heldDamageIds: readonly string[];
}

export interface InspectionWithMedia extends InspectionDTO {
  readonly media: readonly MediaDTO[];
}

export interface InspectionCompare {
  readonly rentalId: string;
  readonly checkOut: InspectionWithMedia | null;
  readonly checkIn: InspectionWithMedia | null;
  readonly damages: readonly DamageDTO[];
}

/** `GET /rentals/:id`: the RentalDTO (api-client contract) plus the detail page context. */
export interface RentalDetail extends RentalDTO {
  readonly asset: AssetSummary;
  readonly isOverdue: boolean;
  readonly charges: ChargesView;
  readonly damages: readonly DamageDTO[];
  readonly checkOut: InspectionDTO | null;
  readonly checkIn: InspectionDTO | null;
  readonly activity: readonly ActivityEventDTO[];
}

export interface RentalListItem extends RentalDTO {
  readonly assetCode: string | null;
  readonly assetName: string | null;
  readonly customerName: string | null;
  readonly isOverdue: boolean;
}
