import { z } from "zod";
import { BillingSourceEnum, BillingStatusEnum, type BillingSource, type BillingStatus } from "@agrorende/contracts/enums";

/** One billed line; `amountCents = round(quantity × unitAmountCents)`. Discounts may be negative lines. */
export interface BillingLineDTO {
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountCents: number;
  readonly amountCents: number;
}

/**
 * Billing document wire shape (ARCHITECTURE §5 `BillingDocument`, §8 Billing). There is no zod
 * DTO in contracts; this interface matches `BillingDocumentDTO` of `@agrorende/api-client`, plus
 * display fields (`customerName`, `sourceNumber`) resolved by the read queries.
 */
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
  readonly lines: readonly BillingLineDTO[];
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
  readonly customerName?: string | null;
  readonly sourceNumber?: string | null;
}

const LineInputSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.number().finite(),
  unitAmountCents: z.number().int(),
});

const Iso = z.string().datetime({ offset: true });
/** NF-e access key: 44 digits (reference only; AgroRende does not emit NF-e). */
const NfeKey = z.string().trim().regex(/^\d{44}$/u, "nfeKey.invalid");
const NfeNumber = z.string().trim().min(1).max(20);

export const BillingCreateInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    source: BillingSourceEnum,
    workOrderId: z.string().uuid().optional(),
    rentalId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    lines: z.array(LineInputSchema).optional(),
    discountCents: z.number().int().nonnegative().optional(),
    dueAt: Iso.optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .superRefine((value, issue) => {
    if (value.source === "WORK_ORDER" && value.workOrderId === undefined) issue.addIssue({ code: "custom", path: ["workOrderId"], message: "required" });
    if (value.source === "RENTAL" && value.rentalId === undefined) issue.addIssue({ code: "custom", path: ["rentalId"], message: "required" });
    if (value.source === "MANUAL") {
      if (value.customerId === undefined) issue.addIssue({ code: "custom", path: ["customerId"], message: "required" });
      if (value.lines === undefined || value.lines.length === 0) issue.addIssue({ code: "custom", path: ["lines"], message: "required" });
    }
  });
export type BillingCreateInput = z.input<typeof BillingCreateInputSchema>;

export const BillingUpdateInputSchema = z.object({
  customerId: z.string().uuid().optional(),
  lines: z.array(LineInputSchema).min(1).optional(),
  discountCents: z.number().int().nonnegative().optional(),
  dueAt: Iso.nullable().optional(),
  nfeNumber: NfeNumber.nullable().optional(),
  nfeKey: NfeKey.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type BillingUpdateInput = z.input<typeof BillingUpdateInputSchema>;

export const BillingIssueInputSchema = z.object({
  dueAt: Iso.optional(),
  nfeNumber: NfeNumber.optional(),
  nfeKey: NfeKey.optional(),
});
export type BillingIssueInput = z.input<typeof BillingIssueInputSchema>;

export const BillingPayInputSchema = z.object({ paidAt: Iso.optional() });
export type BillingPayInput = z.input<typeof BillingPayInputSchema>;

export const BillingCancelInputSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export type BillingCancelInput = z.input<typeof BillingCancelInputSchema>;

export interface BillingListFilters {
  readonly status?: string | null;
  readonly source?: string | null;
  readonly customerId?: string | null;
  readonly workOrderId?: string | null;
  readonly rentalId?: string | null;
  readonly cursor?: string | null;
  readonly limit?: number | null;
}

export type BillingAction = "issue" | "pay" | "cancel" | "update";

/**
 * Billing transition matrix (ERP-08). Anything not listed answers `INVALID_TRANSITION` (409).
 * `update` edits a DRAFT in place and does not change the status.
 */
export const BILLING_TRANSITIONS: Readonly<Record<BillingAction, { readonly from: readonly BillingStatus[]; readonly to: BillingStatus | null }>> = {
  update: { from: ["DRAFT"], to: null },
  issue: { from: ["DRAFT"], to: "ISSUED" },
  pay: { from: ["ISSUED"], to: "PAID" },
  cancel: { from: ["DRAFT", "ISSUED"], to: "CANCELLED" },
};

export const BILLING_STATUSES = BillingStatusEnum.options;

/** @deprecated T01 skeleton placeholder kept for older imports. */
export interface BillingDTO {
  readonly id: string;
  readonly organizationId: string;
}
