import type { BillingSource, BillingStatus } from "@agrorende/contracts/enums";
import { fromZonedTime } from "date-fns-tz";

import { DEFAULT_TIME_ZONE } from "@/lib/format";

export type { BillingDocumentDTO, BillingLineDTO } from "@agrorende/core/modules/billing/dto";
export type { BillingSource, BillingStatus };

export const BILLING_TABS = ["ALL", "DRAFT", "ISSUED", "PAID", "CANCELLED"] as const;
export type BillingTab = (typeof BILLING_TABS)[number];
export const BILLING_SOURCES: readonly BillingSource[] = ["WORK_ORDER", "RENTAL", "MANUAL"];

export function tabStatus(tab: string): BillingStatus | undefined {
  return (BILLING_TABS as readonly string[]).includes(tab) && tab !== "ALL" ? (tab as BillingStatus) : undefined;
}

/**
 * Actions offered per status. Mirrors the core matrix (`BILLING_TRANSITIONS`): edit and issue from
 * DRAFT, pay from ISSUED, cancel from DRAFT or ISSUED; PAID and CANCELLED are final.
 */
export function billingActions(status: BillingStatus): { edit: boolean; issue: boolean; pay: boolean; cancel: boolean } {
  return {
    edit: status === "DRAFT",
    issue: status === "DRAFT",
    pay: status === "ISSUED",
    cancel: status === "DRAFT" || status === "ISSUED",
  };
}

/** Where the document came from: the WO or rental detail page, or nothing for a manual document. */
export function sourceHref(doc: { readonly source: BillingSource; readonly workOrderId: string | null; readonly rentalId: string | null }): string | null {
  if (doc.source === "WORK_ORDER" && doc.workOrderId !== null) return `/work-orders/${doc.workOrderId}`;
  if (doc.source === "RENTAL" && doc.rentalId !== null) return `/rentals/${doc.rentalId}`;
  return null;
}

export interface LineDraft {
  readonly key: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitAmountCents: number | null;
}

function parseQuantity(text: string): number | null {
  const normalised = text.trim().replace(",", ".");
  if (normalised.length === 0) return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

/** Wire lines for create and update; rows missing a description, quantity or amount are reported by index. */
export function linesBody(lines: readonly LineDraft[]): { lines: { description: string; quantity: number; unitAmountCents: number }[]; invalid: number[] } {
  const out: { description: string; quantity: number; unitAmountCents: number }[] = [];
  const invalid: number[] = [];
  lines.forEach((line, index) => {
    const quantity = parseQuantity(line.quantity);
    const description = line.description.trim();
    if (description.length === 0 || quantity === null || line.unitAmountCents === null) invalid.push(index);
    else out.push({ description, quantity, unitAmountCents: line.unitAmountCents });
  });
  return { lines: out, invalid };
}

/** Same rounding as the core: each line rounds to whole cents, the discount is subtracted from the sum. */
export function draftTotals(lines: readonly LineDraft[], discountCents: number): { subtotalCents: number; totalCents: number } {
  const subtotalCents = lines.reduce((sum, line) => {
    const quantity = parseQuantity(line.quantity);
    return quantity === null || line.unitAmountCents === null ? sum : sum + Math.round(quantity * line.unitAmountCents);
  }, 0);
  return { subtotalCents, totalCents: subtotalCents - discountCents };
}

/** NF-e access key: 44 digits once spaces are removed (reference only; AgroRende does not emit NF-e). */
export function normaliseNfeKey(text: string): { value: string | null; valid: boolean } {
  const digits = text.replace(/\s/gu, "");
  if (digits.length === 0) return { value: null, valid: true };
  return { value: digits, valid: /^\d{44}$/u.test(digits) };
}

/** Body for `POST /billing-documents/:id/issue`: optional due date (org timezone) and NF-e reference. */
export function issueBody(values: { dueAt: string; nfeNumber: string; nfeKey: string }, timeZone = DEFAULT_TIME_ZONE): Record<string, string> {
  const out: Record<string, string> = {};
  if (values.dueAt.length > 0) {
    const due = fromZonedTime(`${values.dueAt}T23:59:59`, timeZone);
    if (!Number.isNaN(due.getTime())) out.dueAt = due.toISOString();
  }
  const number = values.nfeNumber.trim();
  if (number.length > 0) out.nfeNumber = number;
  const key = normaliseNfeKey(values.nfeKey);
  if (key.value !== null) out.nfeKey = key.value;
  return out;
}

/** Billing source for a mount point entity. */
export function sourceQuery(entityType: "WORK_ORDER" | "RENTAL", entityId: string): { workOrderId: string } | { rentalId: string } {
  return entityType === "WORK_ORDER" ? { workOrderId: entityId } : { rentalId: entityId };
}
