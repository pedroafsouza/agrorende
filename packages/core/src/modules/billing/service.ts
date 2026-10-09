import type { BillingSource, BillingStatus } from "@agrorende/contracts/enums";
import { RealtimeServerEvents, opsRoom } from "@agrorende/contracts/realtime";
import type { Tx } from "@agrorende/contracts/seams";
import { collections, getDb, type BillingDocument, type ScopedDb } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { emit } from "../../events/index.js";
import { next as nextNumber } from "../../numbering/index.js";
import type { BillingPdfData } from "../../pdf/billingDocument.js";
import type { SyncTx } from "../../sync/types.js";
import { assertVersion, clampLimit, dbTx, newId, pageOf, parseCursor, parseInput, readDb, stampCreate, stampUpdate, toDto, writeActivity, type Page } from "../assets/kit.js";
import { billingSnapshot } from "../workOrders/service.js";
import {
  BILLING_TRANSITIONS,
  BillingCancelInputSchema,
  BillingCreateInputSchema,
  BillingIssueInputSchema,
  BillingPayInputSchema,
  BillingUpdateInputSchema,
  type BillingAction,
  type BillingCancelInput,
  type BillingCreateInput,
  type BillingDocumentDTO,
  type BillingIssueInput,
  type BillingLineDTO,
  type BillingListFilters,
  type BillingPayInput,
  type BillingUpdateInput,
} from "./dto.js";

export type { BillingDocumentDTO, BillingLineDTO, BillingListFilters } from "./dto.js";
export { BILLING_TRANSITIONS } from "./dto.js";

const OFFICE_ROLES = new Set(["ADMIN", "MANAGER"]);

/** Billing is office-only (ERP-08): FIELD is blocked from every billing endpoint. */
export function requireBillingRole(ctx: Pick<Ctx, "role">): void {
  if (!OFFICE_ROLES.has(ctx.role)) reject("FORBIDDEN", { roles: ["ADMIN", "MANAGER"] });
}

export function billingNumber(value: number): string {
  return `BD-${String(value).padStart(6, "0")}`;
}

export function toBillingDto(doc: BillingDocument, extra: { customerName?: string | null; sourceNumber?: string | null } = {}): BillingDocumentDTO {
  const dto = toDto<BillingDocumentDTO>(doc as unknown as BillingDocument & Record<string, unknown>);
  return {
    ...dto,
    workOrderId: doc.workOrderId ?? null,
    rentalId: doc.rentalId ?? null,
    issuedAt: doc.issuedAt?.toISOString() ?? null,
    dueAt: doc.dueAt?.toISOString() ?? null,
    paidAt: doc.paidAt?.toISOString() ?? null,
    nfeNumber: doc.nfeNumber ?? null,
    nfeKey: doc.nfeKey ?? null,
    notes: doc.notes ?? null,
    ...extra,
  };
}

export function billingLine(description: string, quantity: number, unitAmountCents: number): BillingLineDTO {
  return { description, quantity, unitAmountCents, amountCents: Math.round(quantity * unitAmountCents) };
}

/** `subtotal = Σ amountCents`; `total = subtotal − discount`; a discount above the subtotal is rejected. */
export function billingTotals(lines: readonly BillingLineDTO[], discountCents: number): { subtotalCents: number; discountCents: number; totalCents: number } {
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  if (discountCents > Math.max(subtotalCents, 0)) {
    reject("VALIDATION_FAILED", { fieldErrors: [{ path: "discountCents", code: "too_big", maximum: subtotalCents }] });
  }
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

/** Applies the transition matrix; any other move answers `INVALID_TRANSITION` (409). */
export function assertBillingTransition(status: BillingStatus, action: BillingAction): BillingStatus {
  const rule = BILLING_TRANSITIONS[action];
  if (!rule.from.includes(status)) reject("INVALID_TRANSITION", { entityType: "BILLING_DOCUMENT", from: status, action });
  return rule.to ?? status;
}

type Locale = "pt-BR" | "en";

const LINE_TEXT: Record<Locale, { labor: string; hours: string; external: string; part: string }> = {
  "pt-BR": { labor: "Mão de obra", hours: "h", external: "Serviço externo", part: "Peça" },
  en: { labor: "Labour", hours: "h", external: "External service", part: "Part" },
};

async function orgLocale(orgId: string): Promise<Locale> {
  const org = await collections.organizations(await getDb()).findOne({ _id: orgId }, { projection: { locale: 1 } });
  return org?.locale === "en" ? "en" : "pt-BR";
}

/** Lines prefilled from `workOrders.billingSnapshot` (labour, parts, external cost). */
export async function workOrderLines(tx: Tx, ctx: Pick<Ctx, "orgId">, workOrderId: string): Promise<{ lines: BillingLineDTO[]; customerId: string | null; number: string }> {
  const snapshot = await billingSnapshot(tx, workOrderId);
  if (snapshot.status === "CANCELLED") reject("WO_CANCELLED", { workOrderId });
  const text = LINE_TEXT[await orgLocale(ctx.orgId)];
  const lines: BillingLineDTO[] = [];
  if (snapshot.laborCostCents !== null && snapshot.laborCostCents > 0) {
    const hours = snapshot.workMinutes === null ? null : Math.round((snapshot.workMinutes / 60) * 100) / 100;
    lines.push(billingLine(`${text.labor} · ${snapshot.number}${hours === null ? "" : ` (${hours} ${text.hours})`}`, 1, snapshot.laborCostCents));
  }
  for (const part of snapshot.parts) {
    lines.push(billingLine(`${part.name} (${part.unit})`, part.quantity, part.unitCostCents ?? 0));
  }
  if (snapshot.externalCostCents !== null && snapshot.externalCostCents > 0) {
    lines.push(billingLine(snapshot.externalCostNote === null || snapshot.externalCostNote === "" ? text.external : `${text.external} · ${snapshot.externalCostNote}`, 1, snapshot.externalCostCents));
  }
  return { lines, customerId: snapshot.customerId, number: snapshot.number };
}

/** Lines copied from the rental charges, so the document total equals the rental charges total (RN-10). */
export async function rentalLines(tx: Tx, rentalId: string): Promise<{ lines: BillingLineDTO[]; customerId: string; number: string; status: string }> {
  const t = dbTx(tx);
  const rental = await t.db.rentals.findOne({ _id: rentalId, deletedAt: null });
  if (rental === null) return reject("RENTAL_NOT_FOUND", { rentalId });
  const charges = await t.db.rental_charges.find({ rentalId, deletedAt: null }).sort({ isAuto: -1, createdAt: 1, _id: 1 }).toArray();
  return {
    lines: charges.map((charge) => ({ description: charge.description, quantity: charge.quantity, unitAmountCents: charge.unitAmountCents, amountCents: charge.amountCents })),
    customerId: rental.customerId,
    number: rental.number,
    status: rental.status,
  };
}

async function activeForSource(tx: Tx, source: BillingSource, sourceId: string): Promise<BillingDocument | null> {
  const key = source === "RENTAL" ? { rentalId: sourceId } : { workOrderId: sourceId };
  return dbTx(tx).db.billing_documents.findOne({ ...key, source, status: { $ne: "CANCELLED" }, deletedAt: null } as never);
}

async function requireCustomer(tx: Tx, customerId: string): Promise<void> {
  const customer = await dbTx(tx).db.customers.findOne({ _id: customerId, deletedAt: null }, { projection: { _id: 1 } });
  if (customer === null) reject("NOT_FOUND", { entityType: "CUSTOMER", id: customerId });
}

async function emitBilling(tx: Tx, ctx: Pick<Ctx, "orgId">, doc: BillingDocument): Promise<void> {
  const t = dbTx(tx);
  await emit(t as unknown as SyncTx, {
    type: RealtimeServerEvents.entityChanged,
    rooms: [opsRoom(ctx.orgId)],
    data: { entityType: "BILLING_DOCUMENT", id: doc._id, version: String(t.syncVersion) },
  });
}

async function load(tx: Tx, id: string): Promise<BillingDocument> {
  const doc = await dbTx(tx).db.billing_documents.findOne({ _id: id, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "BILLING_DOCUMENT", id });
  return doc;
}

const iso = (value: string | undefined | null): Date | null => (value === undefined || value === null ? null : new Date(value));

/** `POST /billing-documents`: a DRAFT from a WO, a rental or manual lines. One active document per source. */
export async function createBillingDocument(tx: Tx, ctx: Ctx, raw: BillingCreateInput): Promise<BillingDocumentDTO> {
  requireBillingRole(ctx);
  const input = parseInput(BillingCreateInputSchema, raw);
  const t = dbTx(tx);
  if (input.id !== undefined) {
    const existing = await t.db.billing_documents.findOne({ _id: input.id });
    if (existing !== null) return toBillingDto(existing);
  }
  let lines: BillingLineDTO[];
  let customerId: string | null = input.customerId ?? null;
  if (input.source === "WORK_ORDER") {
    const workOrderId = input.workOrderId as string;
    const duplicate = await activeForSource(tx, "WORK_ORDER", workOrderId);
    if (duplicate !== null) reject("CONFLICT", { reason: "billing.exists", id: duplicate._id, number: duplicate.number });
    const prefilled = await workOrderLines(tx, ctx, workOrderId);
    lines = input.lines === undefined ? prefilled.lines : input.lines.map((line) => billingLine(line.description, line.quantity, line.unitAmountCents));
    customerId ??= prefilled.customerId;
  } else if (input.source === "RENTAL") {
    const rentalId = input.rentalId as string;
    const duplicate = await activeForSource(tx, "RENTAL", rentalId);
    if (duplicate !== null) reject("CONFLICT", { reason: "billing.exists", id: duplicate._id, number: duplicate.number });
    const prefilled = await rentalLines(tx, rentalId);
    if (prefilled.status !== "RETURNED" && prefilled.status !== "CLOSED") reject("INVALID_TRANSITION", { entityType: "RENTAL", from: prefilled.status, action: "bill" });
    lines = input.lines === undefined ? prefilled.lines : input.lines.map((line) => billingLine(line.description, line.quantity, line.unitAmountCents));
    customerId ??= prefilled.customerId;
  } else {
    lines = (input.lines ?? []).map((line) => billingLine(line.description, line.quantity, line.unitAmountCents));
  }
  if (customerId === null) return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "customerId", code: "required" }] });
  await requireCustomer(tx, customerId);
  const doc = await insertDocument(tx, ctx, {
    id: input.id ?? newId(),
    source: input.source,
    workOrderId: input.workOrderId ?? null,
    rentalId: input.rentalId ?? null,
    customerId,
    lines,
    discountCents: input.discountCents ?? 0,
    dueAt: iso(input.dueAt),
    notes: input.notes ?? null,
  });
  return toBillingDto(doc);
}

interface NewDocument {
  readonly id: string;
  readonly source: BillingSource;
  readonly workOrderId: string | null;
  readonly rentalId: string | null;
  readonly customerId: string;
  readonly lines: BillingLineDTO[];
  readonly discountCents: number;
  readonly dueAt: Date | null;
  readonly notes: string | null;
}

async function insertDocument(tx: Tx, ctx: Ctx, input: NewDocument): Promise<BillingDocument> {
  const t = dbTx(tx);
  const now = new Date();
  const doc: BillingDocument = {
    _id: input.id,
    organizationId: ctx.orgId,
    ...stampCreate(t, now),
    deletedAt: null,
    number: billingNumber(await nextNumber(ctx, { key: "BD" })),
    source: input.source,
    workOrderId: input.workOrderId,
    rentalId: input.rentalId,
    customerId: input.customerId,
    status: "DRAFT",
    lines: input.lines,
    ...billingTotals(input.lines, input.discountCents),
    issuedAt: null,
    dueAt: input.dueAt,
    paidAt: null,
    nfeNumber: null,
    nfeKey: null,
    notes: input.notes,
  };
  await t.db.billing_documents.insertOne(doc);
  await writeActivity(t, {
    entityType: "BILLING_DOCUMENT",
    entityId: doc._id,
    action: "billing.created",
    actorId: ctx.userId,
    toStatus: "DRAFT",
    meta: { source: doc.source, workOrderId: doc.workOrderId ?? null, rentalId: doc.rentalId ?? null, totalCents: doc.totalCents },
    occurredAt: now,
  });
  await emitBilling(tx, ctx, doc);
  return doc;
}

/** `PATCH /billing-documents/:id` (DRAFT only, `If-Match`). */
export async function updateBillingDocument(tx: Tx, ctx: Ctx, id: string, raw: BillingUpdateInput, expectedVersion?: string | null): Promise<BillingDocumentDTO> {
  requireBillingRole(ctx);
  const input = parseInput(BillingUpdateInputSchema, raw);
  const t = dbTx(tx);
  const doc = await load(tx, id);
  assertBillingTransition(doc.status, "update");
  assertVersion(doc, expectedVersion);
  if (input.customerId !== undefined) await requireCustomer(tx, input.customerId);
  const lines = input.lines === undefined ? doc.lines : input.lines.map((line) => billingLine(line.description, line.quantity, line.unitAmountCents));
  const now = new Date();
  const set: Record<string, unknown> = { lines, ...billingTotals(lines, input.discountCents ?? doc.discountCents), ...stampUpdate(t, now) };
  if (input.customerId !== undefined) set.customerId = input.customerId;
  if (input.dueAt !== undefined) set.dueAt = iso(input.dueAt);
  if (input.nfeNumber !== undefined) set.nfeNumber = input.nfeNumber;
  if (input.nfeKey !== undefined) set.nfeKey = input.nfeKey;
  if (input.notes !== undefined) set.notes = input.notes;
  await t.db.billing_documents.updateOne({ _id: id }, { $set: set });
  await writeActivity(t, { entityType: "BILLING_DOCUMENT", entityId: id, action: "billing.updated", actorId: ctx.userId, meta: { totalCents: set.totalCents }, occurredAt: now });
  const updated = await load(tx, id);
  await emitBilling(tx, ctx, updated);
  return toBillingDto(updated);
}

async function transition(tx: Tx, ctx: Ctx, id: string, action: Exclude<BillingAction, "update">, set: Record<string, unknown>, meta: Record<string, unknown> = {}): Promise<BillingDocumentDTO> {
  requireBillingRole(ctx);
  const t = dbTx(tx);
  const doc = await load(tx, id);
  const to = assertBillingTransition(doc.status, action);
  const now = new Date();
  await t.db.billing_documents.updateOne({ _id: id }, { $set: { ...set, status: to, ...stampUpdate(t, now) } });
  await writeActivity(t, {
    entityType: "BILLING_DOCUMENT",
    entityId: id,
    action: `billing.${action === "issue" ? "issued" : action === "pay" ? "paid" : "cancelled"}`,
    actorId: ctx.userId,
    fromStatus: doc.status,
    toStatus: to,
    meta: { totalCents: doc.totalCents, ...meta },
    occurredAt: now,
  });
  const updated = await load(tx, id);
  await emitBilling(tx, ctx, updated);
  return toBillingDto(updated);
}

/** DRAFT → ISSUED; sets `issuedAt`, optional due date and NF-e reference. */
export async function issueBillingDocument(tx: Tx, ctx: Ctx, id: string, raw: BillingIssueInput = {}): Promise<BillingDocumentDTO> {
  requireBillingRole(ctx);
  const input = parseInput(BillingIssueInputSchema, raw);
  const set: Record<string, unknown> = { issuedAt: new Date() };
  if (input.dueAt !== undefined) set.dueAt = new Date(input.dueAt);
  if (input.nfeNumber !== undefined) set.nfeNumber = input.nfeNumber;
  if (input.nfeKey !== undefined) set.nfeKey = input.nfeKey;
  return transition(tx, ctx, id, "issue", set);
}

/** ISSUED → PAID. */
export async function payBillingDocument(tx: Tx, ctx: Ctx, id: string, raw: BillingPayInput = {}): Promise<BillingDocumentDTO> {
  requireBillingRole(ctx);
  const input = parseInput(BillingPayInputSchema, raw);
  return transition(tx, ctx, id, "pay", { paidAt: input.paidAt === undefined ? new Date() : new Date(input.paidAt) });
}

/** DRAFT or ISSUED → CANCELLED; the reason is kept in the activity and appended to the notes. */
export async function cancelBillingDocument(tx: Tx, ctx: Ctx, id: string, raw: BillingCancelInput): Promise<BillingDocumentDTO> {
  requireBillingRole(ctx);
  const input = parseInput(BillingCancelInputSchema, raw);
  const doc = await load(tx, id);
  const notes = doc.notes === null || doc.notes === undefined || doc.notes === "" ? input.reason : `${doc.notes}\n${input.reason}`;
  return transition(tx, ctx, id, "cancel", { notes }, { reason: input.reason });
}

/** Lets `withTransaction` retry transient MongoDB errors instead of turning them into a 502. */
function isTransient(error: unknown): boolean {
  const labelled = error as { hasErrorLabel?: (label: string) => boolean } | null;
  return typeof labelled?.hasErrorLabel === "function" && labelled.hasErrorLabel("TransientTransactionError");
}

type BillingFault = (stage: "create" | "issue", rentalId: string) => void | Promise<void>;
let billingFault: BillingFault | null = null;

/** Test hook: makes the rental billing step fail at a given stage (EC-RN-33). */
export function setRentalBillingFaultForTests(fault: BillingFault | null): void {
  billingFault = fault;
}

/**
 * Called by rental close (RN-10, P1): creates and issues one RENTAL document whose total equals
 * the rental charges total. Idempotent: an active document for the rental is reused (issued if
 * still a DRAFT), so a retry never duplicates. Any failure surfaces as
 * `RENTAL_BILLING_DOCUMENT_FAILED` (502); the caller's transaction rolls back and the rental and
 * its charges stay as they were.
 */
export async function createAndIssueForRental(tx: Tx, ctx: Ctx, rentalId: string): Promise<BillingDocumentDTO> {
  try {
    let doc = await activeForSource(tx, "RENTAL", rentalId);
    if (doc === null) {
      await billingFault?.("create", rentalId);
      const prefilled = await rentalLines(tx, rentalId);
      doc = await insertDocument(tx, ctx, {
        id: newId(),
        source: "RENTAL",
        workOrderId: null,
        rentalId,
        customerId: prefilled.customerId,
        lines: prefilled.lines,
        discountCents: 0,
        dueAt: null,
        notes: null,
      });
    }
    if (doc.status === "DRAFT") {
      await billingFault?.("issue", rentalId);
      return await transition(tx, ctx, doc._id, "issue", { issuedAt: new Date() });
    }
    return toBillingDto(doc);
  } catch (error) {
    if (isTransient(error)) throw error;
    return reject("RENTAL_BILLING_DOCUMENT_FAILED", { rentalId, cause: error instanceof Error ? error.message : String(error) });
  }
}

// ───────── Reads ─────────

async function displayFields(db: ScopedDb, docs: readonly BillingDocument[]): Promise<Map<string, { customerName: string | null; sourceNumber: string | null }>> {
  const customerIds = [...new Set(docs.map((doc) => doc.customerId))];
  const woIds = docs.map((doc) => doc.workOrderId).filter((value): value is string => typeof value === "string");
  const rentalIds = docs.map((doc) => doc.rentalId).filter((value): value is string => typeof value === "string");
  const [customers, workOrders, rentals] = await Promise.all([
    customerIds.length === 0 ? [] : db.customers.find({ _id: { $in: customerIds } }, { projection: { name: 1 } }).toArray(),
    woIds.length === 0 ? [] : db.work_orders.find({ _id: { $in: woIds } }, { projection: { number: 1 } }).toArray(),
    rentalIds.length === 0 ? [] : db.rentals.find({ _id: { $in: rentalIds } }, { projection: { number: 1 } }).toArray(),
  ]);
  const customerName = new Map(customers.map((row) => [row._id, row.name]));
  const numbers = new Map([...workOrders, ...rentals].map((row) => [row._id, row.number]));
  return new Map(
    docs.map((doc) => [
      doc._id,
      { customerName: customerName.get(doc.customerId) ?? null, sourceNumber: numbers.get(doc.workOrderId ?? doc.rentalId ?? "") ?? null },
    ]),
  );
}

const filled = (value: string | null | undefined): value is string => value !== undefined && value !== null && value !== "";

/** `GET /billing-documents` (office), newest first. */
export async function listBillingDocuments(ctx: Pick<Ctx, "orgId" | "role">, filters: BillingListFilters = {}): Promise<Page<BillingDocumentDTO>> {
  requireBillingRole(ctx);
  const db = await readDb(ctx);
  const query: Record<string, unknown> = { deletedAt: null };
  if (filled(filters.status)) query.status = filters.status;
  if (filled(filters.source)) query.source = filters.source;
  if (filled(filters.customerId)) query.customerId = filters.customerId;
  if (filled(filters.workOrderId)) query.workOrderId = filters.workOrderId;
  if (filled(filters.rentalId)) query.rentalId = filters.rentalId;
  const offset = parseCursor(filters.cursor);
  const limit = clampLimit(filters.limit);
  const rows = await db.billing_documents
    .find(query as never)
    .sort({ createdAt: -1, _id: -1 })
    .skip(offset)
    .limit(limit + 1)
    .toArray();
  const extras = await displayFields(db, rows);
  return pageOf(
    rows.map((row) => toBillingDto(row, extras.get(row._id))),
    offset,
    limit,
  );
}

/** `GET /billing-documents/:id` (office). */
export async function getBillingDocument(ctx: Pick<Ctx, "orgId" | "role">, id: string): Promise<BillingDocumentDTO> {
  requireBillingRole(ctx);
  const db = await readDb(ctx);
  const doc = await db.billing_documents.findOne({ _id: id, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "BILLING_DOCUMENT", id });
  const extras = await displayFields(db, [doc]);
  return toBillingDto(doc, extras.get(doc._id));
}

/** Prefill for the create dialog: the lines and customer a WO or rental would bill. */
export async function previewBillingLines(
  tx: Tx,
  ctx: Ctx,
  source: { workOrderId?: string; rentalId?: string },
): Promise<{ lines: BillingLineDTO[]; customerId: string | null; existingId: string | null }> {
  requireBillingRole(ctx);
  if (source.workOrderId !== undefined) {
    const result = await workOrderLines(tx, ctx, source.workOrderId);
    const existing = await activeForSource(tx, "WORK_ORDER", source.workOrderId);
    return { lines: result.lines, customerId: result.customerId, existingId: existing?._id ?? null };
  }
  if (source.rentalId !== undefined) {
    const result = await rentalLines(tx, source.rentalId);
    const existing = await activeForSource(tx, "RENTAL", source.rentalId);
    return { lines: result.lines, customerId: result.customerId, existingId: existing?._id ?? null };
  }
  return reject("VALIDATION_FAILED", { fieldErrors: [{ path: "workOrderId", code: "required" }] });
}

type RenderBilling = (data: BillingPdfData) => Promise<Uint8Array>;

/** `GET /billing-documents/:id/pdf` (PLT-11): rendered in the source document locale, else the org locale. */
export async function renderBillingPdf(ctx: Pick<Ctx, "orgId" | "role">, id: string): Promise<{ bytes: Uint8Array; filename: string }> {
  requireBillingRole(ctx);
  const db = await readDb(ctx);
  const doc = await db.billing_documents.findOne({ _id: id, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "BILLING_DOCUMENT", id });
  const [org, customer, workOrder, rental] = await Promise.all([
    collections.organizations(await getDb()).findOne({ _id: ctx.orgId }, { projection: { name: 1, legalName: 1, taxId: 1, timezone: 1, locale: 1, currency: 1 } }),
    db.customers.findOne({ _id: doc.customerId }, { projection: { name: 1, taxId: 1, address: 1 } }),
    doc.workOrderId == null ? null : db.work_orders.findOne({ _id: doc.workOrderId }, { projection: { number: 1, documentLocale: 1 } }),
    doc.rentalId == null ? null : db.rentals.findOne({ _id: doc.rentalId }, { projection: { number: 1, documentLocale: 1 } }),
  ]);
  const sourceLocale = workOrder?.documentLocale ?? rental?.documentLocale ?? org?.locale ?? "pt-BR";
  const locale: Locale = sourceLocale === "en" ? "en" : "pt-BR";
  const module = (await import("../../pdf/billingDocument.js")) as { renderBillingDocument: RenderBilling };
  const bytes = await module.renderBillingDocument({
    locale,
    timeZone: org?.timezone ?? "America/Sao_Paulo",
    currency: org?.currency ?? "BRL",
    org: { name: org?.legalName ?? org?.name ?? "AgroRende", taxId: org?.taxId ?? null },
    customer: { name: customer?.name ?? "—", taxId: customer?.taxId ?? null, address: customer?.address ?? null },
    document: {
      number: doc.number,
      status: doc.status,
      source: doc.source,
      sourceNumber: workOrder?.number ?? rental?.number ?? null,
      issuedAt: doc.issuedAt ?? null,
      dueAt: doc.dueAt ?? null,
      paidAt: doc.paidAt ?? null,
      nfeNumber: doc.nfeNumber ?? null,
      nfeKey: doc.nfeKey ?? null,
      notes: doc.notes ?? null,
      lines: doc.lines,
      subtotalCents: doc.subtotalCents,
      discountCents: doc.discountCents,
      totalCents: doc.totalCents,
    },
    generatedAt: new Date(),
  });
  return { bytes, filename: `${doc.number}.pdf` };
}
