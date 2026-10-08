import { maskTaxId, taxIdKind } from "@agrorende/contracts";
import { AppError } from "@agrorende/contracts/errors";
import type { Tx } from "@agrorende/contracts/seams";
import type { Customer } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { assertVersion, dbTx, newId, stampCreate, stampUpdate, toDto, writeActivity, parseInput } from "../assets/kit.js";
import {
  CustomerCreateInputSchema,
  CustomerUpdateInputSchema,
  type CustomerCreateInput,
  type CustomerDTO,
  type CustomerEligibility,
  type CustomerUpdateInput,
} from "./dto.js";

/** Only office roles see the full CPF/CNPJ; everyone else gets the masked form. */
export function toCustomerDto(doc: Customer, opts: { revealTaxId: boolean } = { revealTaxId: true }): CustomerDTO {
  const dto = toDto<CustomerDTO>(doc);
  const taxIdMasked = doc.taxId === null || doc.taxId === undefined ? null : maskTaxId(doc.taxId);
  return { ...dto, taxId: opts.revealTaxId ? (doc.taxId ?? null) : null, taxIdMasked };
}

export function eligibilityOf(doc: Pick<Customer, "_id" | "taxId" | "phone" | "whatsapp">): CustomerEligibility {
  const filled = (value: string | null | undefined) => value !== null && value !== undefined && value.trim().length > 0;
  return { id: doc._id, hasDocument: filled(doc.taxId), hasPhone: filled(doc.phone) || filled(doc.whatsapp) };
}

/** Seam `customers.getForEligibility` (DELIVERY-PLAN §4); T08 maps missing fields to CUSTOMER_INCOMPLETE. */
export async function getForEligibility(tx: Tx, customerId: string): Promise<CustomerEligibility> {
  const doc = await dbTx(tx).db.customers.findOne({ _id: customerId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "CUSTOMER", entityId: customerId });
  return eligibilityOf(doc);
}

async function assertUniqueTaxId(tx: Tx, taxId: string | null | undefined, exceptId?: string): Promise<void> {
  if (taxId === null || taxId === undefined) return;
  const filter: Record<string, unknown> = { taxId, deletedAt: null };
  if (exceptId !== undefined) filter._id = { $ne: exceptId };
  const clash = await dbTx(tx).db.customers.findOne(filter, { projection: { _id: 1 } });
  if (clash !== null) throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "taxId", code: "duplicate" }], details: { customerId: clash._id } });
}

export async function createCustomer(tx: Tx, ctx: Ctx, raw: CustomerCreateInput): Promise<CustomerDTO> {
  const input = parseInput(CustomerCreateInputSchema, raw);
  const scopedTx = dbTx(tx);
  await assertUniqueTaxId(tx, input.taxId);
  const now = new Date();
  const doc: Customer = {
    _id: newId(now.getTime()),
    organizationId: scopedTx.orgId,
    ...stampCreate(scopedTx, now),
    deletedAt: null,
    name: input.name,
    tradeName: input.tradeName ?? null,
    taxIdType: input.taxId === null ? null : taxIdKind(input.taxId),
    taxId: input.taxId,
    phone: input.phone ?? null,
    whatsapp: input.whatsapp ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    isSupplier: input.isSupplier,
    notes: input.notes ?? null,
    archivedAt: null,
  };
  await scopedTx.db.customers.insertOne(doc);
  await writeActivity(scopedTx, { entityType: "CUSTOMER", entityId: doc._id, action: "customer.created", actorId: ctx.userId });
  return toCustomerDto(doc);
}

async function loadCustomer(tx: Tx, customerId: string): Promise<Customer> {
  const doc = await dbTx(tx).db.customers.findOne({ _id: customerId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "CUSTOMER", entityId: customerId });
  return doc;
}

export async function updateCustomer(tx: Tx, ctx: Ctx, customerId: string, raw: CustomerUpdateInput, ifMatch?: string | null): Promise<CustomerDTO> {
  const { archived, ...fields } = parseInput(CustomerUpdateInputSchema, raw);
  const scopedTx = dbTx(tx);
  const customer = await loadCustomer(tx, customerId);
  assertVersion(customer, ifMatch);
  const set: Record<string, unknown> = { ...stampUpdate(scopedTx) };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) set[key] = value;
  }
  if ("taxId" in raw) {
    await assertUniqueTaxId(tx, fields.taxId, customerId);
    set.taxId = fields.taxId ?? null;
    set.taxIdType = fields.taxId === null || fields.taxId === undefined ? null : taxIdKind(fields.taxId);
  }
  if (archived !== undefined) set.archivedAt = archived ? new Date() : null;
  await scopedTx.db.customers.updateOne({ _id: customerId }, { $set: set });
  if (archived !== undefined) {
    await writeActivity(scopedTx, { entityType: "CUSTOMER", entityId: customerId, action: archived ? "customer.archived" : "customer.restored", actorId: ctx.userId });
  }
  return toCustomerDto(await loadCustomer(tx, customerId));
}

/** EC-OPS-12: customers with rentals, sites, assets or work are archived instead of deleted. */
export async function deleteCustomer(tx: Tx, ctx: Ctx, customerId: string): Promise<void> {
  const scopedTx = dbTx(tx);
  await loadCustomer(tx, customerId);
  const db = scopedTx.db;
  const refs = await Promise.all([
    db.rentals.findOne({ customerId }, { projection: { _id: 1 } }),
    db.sites.findOne({ customerId }, { projection: { _id: 1 } }),
    db.assets.findOne({ ownerCustomerId: customerId }, { projection: { _id: 1 } }),
    db.work_orders.findOne({ customerId }, { projection: { _id: 1 } }),
  ]);
  if (refs.some((ref) => ref !== null)) reject("RECORD_IN_USE", { entityType: "CUSTOMER", entityId: customerId });
  await db.customers.softDeleteOne({ _id: customerId }, new Date(), scopedTx.syncVersion);
  await writeActivity(scopedTx, { entityType: "CUSTOMER", entityId: customerId, action: "customer.deleted", actorId: ctx.userId });
}
