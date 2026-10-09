import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppError } from "@agrorende/contracts/errors";
import type { BillingStatus } from "@agrorende/contracts/enums";

import { makeTestCtx } from "../../testing/ctx.js";
import { newId } from "../assets/kit.js";
import { ADMIN_ID, AGENT_ID, createHarness, customerRow, OTHER_ORG_ID, type Harness } from "../rentals/testing/harness.js";
import {
  BILLING_TRANSITIONS,
  cancelBillingDocument,
  createBillingDocument,
  getBillingDocument,
  issueBillingDocument,
  listBillingDocuments,
  payBillingDocument,
  previewBillingLines,
  renderBillingPdf,
  updateBillingDocument,
} from "./service.js";

let h: Harness;
const admin = makeTestCtx({ userId: ADMIN_ID, role: "ADMIN" });
const manager = makeTestCtx({ userId: newId(), role: "MANAGER" });
const field = makeTestCtx({ userId: AGENT_ID, role: "FIELD" });

beforeAll(async () => {
  h = await createHarness("billing", "agrorende_t15");
});

afterAll(async () => {
  await h.close();
});

let customerId: string;
let workOrderId: string;

beforeEach(async () => {
  for (const name of ["customers", "work_orders", "work_order_parts", "billing_documents", "activity_events", "event_outbox", "number_sequences", "organizations"]) {
    await h.raw(name).deleteMany({});
  }
  const customer = customerRow();
  customerId = customer._id;
  await h.raw("customers").insertOne(customer);
  const now = new Date();
  workOrderId = newId();
  await h.raw("work_orders").insertOne({
    _id: workOrderId,
    organizationId: admin.orgId,
    syncVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    number: "OS-000042",
    status: "COMPLETED",
    customerId,
    workMinutes: 150,
    laborCostCents: 29_750,
    externalCostCents: 40_000,
    externalCostNote: "Torno",
  });
  await h.raw("work_order_parts").insertOne({
    _id: newId(),
    organizationId: admin.orgId,
    syncVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    workOrderId,
    name: "Filtro de óleo",
    quantity: 2,
    unit: "UN",
    unitCostCents: 9_250,
  });
});

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return "OK";
}

async function docIn(status: BillingStatus): Promise<string> {
  const created = await h.run((tx) => createBillingDocument(tx, admin, { source: "MANUAL", customerId, lines: [{ description: "Frete", quantity: 1, unitAmountCents: 10_000 }] }));
  if (status === "DRAFT") return created.id;
  if (status === "CANCELLED") {
    await h.run((tx) => cancelBillingDocument(tx, admin, created.id, { reason: "Teste" }));
    return created.id;
  }
  await h.run((tx) => issueBillingDocument(tx, admin, created.id));
  if (status === "PAID") await h.run((tx) => payBillingDocument(tx, admin, created.id));
  return created.id;
}

describe("billing from a work order (ERP-08)", () => {
  it("prefills labour, parts and the external cost from the WO billing snapshot", async () => {
    const doc = await h.run((tx) => createBillingDocument(tx, admin, { source: "WORK_ORDER", workOrderId }));
    expect(doc).toMatchObject({ status: "DRAFT", source: "WORK_ORDER", workOrderId, customerId, subtotalCents: 29_750 + 18_500 + 40_000, totalCents: 88_250 });
    expect(doc.lines).toHaveLength(3);
    expect(doc.lines[0]?.description).toContain("OS-000042");
    expect(doc.lines[1]).toMatchObject({ quantity: 2, unitAmountCents: 9_250, amountCents: 18_500 });
    expect(doc.number).toMatch(/^BD-\d{6}$/u);
  });

  it("asks for a customer when the WO has none", async () => {
    await h.raw("work_orders").updateOne({ _id: workOrderId }, { $set: { customerId: null } });
    const error = await h.run((tx) => createBillingDocument(tx, admin, { source: "WORK_ORDER", workOrderId })).catch((e: unknown) => e);
    expect((error as AppError).code).toBe("VALIDATION_FAILED");
    const doc = await h.run((tx) => createBillingDocument(tx, admin, { source: "WORK_ORDER", workOrderId, customerId }));
    expect(doc.customerId).toBe(customerId);
  });

  it("keeps one active document per WO and allows a new one after a cancel", async () => {
    const first = await h.run((tx) => createBillingDocument(tx, admin, { source: "WORK_ORDER", workOrderId }));
    expect(await codeOf(h.run((tx) => createBillingDocument(tx, admin, { source: "WORK_ORDER", workOrderId })))).toBe("CONFLICT");
    const preview = await h.run((tx) => previewBillingLines(tx, admin, { workOrderId }));
    expect(preview.existingId).toBe(first.id);
    await h.run((tx) => cancelBillingDocument(tx, admin, first.id, { reason: "Valor errado" }));
    expect(await codeOf(h.run((tx) => createBillingDocument(tx, admin, { source: "WORK_ORDER", workOrderId })))).toBe("OK");
  });

  it("rejects a cancelled WO", async () => {
    await h.raw("work_orders").updateOne({ _id: workOrderId }, { $set: { status: "CANCELLED" } });
    expect(await codeOf(h.run((tx) => createBillingDocument(tx, admin, { source: "WORK_ORDER", workOrderId })))).toBe("WO_CANCELLED");
  });
});

describe("billing transitions (every allowed and forbidden move)", () => {
  const statuses: BillingStatus[] = ["DRAFT", "ISSUED", "PAID", "CANCELLED"];
  const actions = {
    issue: (id: string) => h.run((tx) => issueBillingDocument(tx, admin, id, { nfeNumber: "1234" })),
    pay: (id: string) => h.run((tx) => payBillingDocument(tx, admin, id)),
    cancel: (id: string) => h.run((tx) => cancelBillingDocument(tx, admin, id, { reason: "Erro" })),
    update: (id: string) => h.run((tx) => updateBillingDocument(tx, admin, id, { notes: "Nota" })),
  } as const;
  for (const status of statuses) {
    for (const [action, run] of Object.entries(actions) as [keyof typeof actions, (id: string) => Promise<unknown>][]) {
      const rule = BILLING_TRANSITIONS[action];
      const allowed = rule.from.includes(status);
      it(`${action} from ${status} → ${allowed ? (rule.to ?? status) : "INVALID_TRANSITION"}`, async () => {
        const id = await docIn(status);
        if (allowed) {
          await run(id);
          const doc = await getBillingDocument(admin, id);
          expect(doc.status).toBe(rule.to ?? status);
        } else {
          expect(await codeOf(run(id))).toBe("INVALID_TRANSITION");
          expect((await getBillingDocument(admin, id)).status).toBe(status);
        }
      });
    }
  }

  it("issue sets issuedAt and the NF-e reference; pay sets paidAt; cancel keeps the reason", async () => {
    const id = await docIn("DRAFT");
    const key = "1".repeat(44);
    const issued = await h.run((tx) => issueBillingDocument(tx, manager, id, { nfeNumber: "000123", nfeKey: key, dueAt: "2026-12-01T12:00:00.000Z" }));
    expect(issued).toMatchObject({ status: "ISSUED", nfeNumber: "000123", nfeKey: key, dueAt: "2026-12-01T12:00:00.000Z" });
    expect(issued.issuedAt).not.toBeNull();
    const paid = await h.run((tx) => payBillingDocument(tx, manager, id, { paidAt: "2026-12-02T12:00:00.000Z" }));
    expect(paid).toMatchObject({ status: "PAID", paidAt: "2026-12-02T12:00:00.000Z" });
    const other = await docIn("ISSUED");
    const cancelled = await h.run((tx) => cancelBillingDocument(tx, admin, other, { reason: "Cliente desistiu" }));
    expect(cancelled.notes).toContain("Cliente desistiu");
  });

  it("rejects a malformed NF-e key", async () => {
    const id = await docIn("DRAFT");
    expect(await codeOf(h.run((tx) => issueBillingDocument(tx, admin, id, { nfeKey: "123" })))).toBe("VALIDATION_FAILED");
  });

  it("updates a DRAFT with If-Match and recomputes the totals", async () => {
    const id = await docIn("DRAFT");
    const current = await getBillingDocument(admin, id);
    const updated = await h.run((tx) =>
      updateBillingDocument(tx, admin, id, { lines: [{ description: "Frete", quantity: 2, unitAmountCents: 10_000 }], discountCents: 5_000 }, current.syncVersion),
    );
    expect(updated).toMatchObject({ subtotalCents: 20_000, discountCents: 5_000, totalCents: 15_000 });
    expect(await codeOf(h.run((tx) => updateBillingDocument(tx, admin, id, { notes: "x" }, current.syncVersion)))).toBe("CONFLICT");
    expect(await codeOf(h.run((tx) => updateBillingDocument(tx, admin, id, { discountCents: 50_000 })))).toBe("VALIDATION_FAILED");
  });
});

describe("billing roles", () => {
  it("ADMIN and MANAGER issue; FIELD is blocked from every billing endpoint", async () => {
    const id = await docIn("DRAFT");
    expect((await h.run((tx) => issueBillingDocument(tx, manager, id))).status).toBe("ISSUED");
    const draft = await docIn("DRAFT");
    expect(await codeOf(h.run((tx) => createBillingDocument(tx, field, { source: "MANUAL", customerId, lines: [{ description: "x", quantity: 1, unitAmountCents: 1 }] }), field))).toBe("FORBIDDEN");
    expect(await codeOf(h.run((tx) => issueBillingDocument(tx, field, draft), field))).toBe("FORBIDDEN");
    expect(await codeOf(h.run((tx) => payBillingDocument(tx, field, id), field))).toBe("FORBIDDEN");
    expect(await codeOf(h.run((tx) => cancelBillingDocument(tx, field, draft, { reason: "x" }), field))).toBe("FORBIDDEN");
    expect(await codeOf(h.run((tx) => updateBillingDocument(tx, field, draft, { notes: "x" }), field))).toBe("FORBIDDEN");
    expect(await codeOf(listBillingDocuments(field))).toBe("FORBIDDEN");
    expect(await codeOf(getBillingDocument(field, draft))).toBe("FORBIDDEN");
    expect(await codeOf(renderBillingPdf(field, draft))).toBe("FORBIDDEN");
  });
});

describe("billing reads and PDF (PLT-11)", () => {
  it("lists with display fields and filters by status", async () => {
    await h.run((tx) => createBillingDocument(tx, admin, { source: "WORK_ORDER", workOrderId }));
    await docIn("ISSUED");
    const all = await listBillingDocuments(admin);
    expect(all.items).toHaveLength(2);
    const wo = all.items.find((item) => item.source === "WORK_ORDER");
    expect(wo).toMatchObject({ customerName: "Fazenda Boa Vista", sourceNumber: "OS-000042" });
    const issued = await listBillingDocuments(admin, { status: "ISSUED" });
    expect(issued.items).toHaveLength(1);
  });

  it("renders a PDF", async () => {
    const doc = await h.run((tx) => createBillingDocument(tx, admin, { source: "WORK_ORDER", workOrderId }));
    const pdf = await renderBillingPdf(admin, doc.id);
    expect(pdf.filename).toBe(`${doc.number}.pdf`);
    expect(Buffer.from(pdf.bytes.slice(0, 4)).toString()).toBe("%PDF");
  }, 30_000);
});

describe("billing tenant isolation (PLT-13)", () => {
  it("another organisation sees NOT_FOUND for every document route and an empty list", async () => {
    const id = await docIn("DRAFT");
    const other = makeTestCtx({ organizationId: OTHER_ORG_ID, userId: newId(), role: "ADMIN" });
    expect(await codeOf(getBillingDocument(other, id))).toBe("NOT_FOUND");
    expect(await codeOf(renderBillingPdf(other, id))).toBe("NOT_FOUND");
    expect(await codeOf(h.run((tx) => updateBillingDocument(tx, other, id, { notes: "hijack" }), other))).toBe("NOT_FOUND");
    expect(await codeOf(h.run((tx) => issueBillingDocument(tx, other, id), other))).toBe("NOT_FOUND");
    expect(await codeOf(h.run((tx) => payBillingDocument(tx, other, id), other))).toBe("NOT_FOUND");
    expect(await codeOf(h.run((tx) => cancelBillingDocument(tx, other, id, { reason: "x" }), other))).toBe("NOT_FOUND");
    expect(await codeOf(h.run((tx) => createBillingDocument(tx, other, { source: "WORK_ORDER", workOrderId }), other))).toBe("NOT_FOUND");
    expect(await codeOf(h.run((tx) => previewBillingLines(tx, other, { workOrderId }), other))).toBe("NOT_FOUND");
    expect((await listBillingDocuments(other)).items).toHaveLength(0);
    expect((await getBillingDocument(admin, id)).status).toBe("DRAFT");
  });
});
