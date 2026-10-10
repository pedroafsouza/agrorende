import type { Customer } from "@agrorende/db";

import type { Ctx } from "../../context";
import { reject } from "../../errors";
import { clampLimit, escapeRegex, pageOf, parseCursor, readDb, type Page, parseInput } from "../assets/kit";
import { CustomerListFilterSchema, type CustomerDTO, type CustomerListFilter } from "./dto";
import { toCustomerDto } from "./service";

function reveal(ctx: Pick<Ctx, "role">): boolean {
  return ctx.role === "ADMIN" || ctx.role === "MANAGER";
}

export async function listCustomers(ctx: Pick<Ctx, "orgId" | "role">, raw: Partial<CustomerListFilter> = {}): Promise<Page<CustomerDTO>> {
  const f = parseInput(CustomerListFilterSchema, raw);
  const db = await readDb(ctx);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (f.includeArchived !== "true") filter.archivedAt = null;
  if (f.supplier !== undefined) filter.isSupplier = f.supplier === "true";
  const and: Record<string, unknown>[] = [];
  if (f.incomplete === "true") {
    and.push({ $or: [{ taxId: null }, { taxId: { $exists: false } }, { $and: [{ phone: null }, { whatsapp: null }] }] });
  }
  if (f.q !== undefined && f.q.length > 0) {
    const pattern = new RegExp(escapeRegex(f.q), "iu");
    const digits = f.q.replace(/\D/gu, "");
    const or: Record<string, unknown>[] = [{ name: pattern }, { tradeName: pattern }, { city: pattern }];
    if (digits.length >= 3) or.push({ taxId: new RegExp(escapeRegex(digits), "u") });
    and.push({ $or: or });
  }
  if (and.length > 0) filter.$and = and;
  const offset = parseCursor(f.cursor);
  const limit = clampLimit(f.limit);
  const docs: Customer[] = await db.customers.find(filter).sort({ name: 1, _id: 1 }).skip(offset).limit(limit + 1).toArray();
  return pageOf(docs.map((doc) => toCustomerDto(doc, { revealTaxId: reveal(ctx) })), offset, limit);
}

export async function getCustomer(ctx: Pick<Ctx, "orgId" | "role">, customerId: string): Promise<CustomerDTO> {
  const db = await readDb(ctx);
  const doc = await db.customers.findOne({ _id: customerId, deletedAt: null });
  if (doc === null) return reject("NOT_FOUND", { entityType: "CUSTOMER", entityId: customerId });
  return toCustomerDto(doc, { revealTaxId: reveal(ctx) });
}
