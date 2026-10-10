import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@agrorende/contracts/errors";
import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { CheckInInspection, RentalCheckinPayload, RentalCheckoutPayload } from "@agrorende/contracts/mutations";
import type * as Seams from "../../seams";
import { makeTestCtx } from "../../testing/ctx";
import { costRollup } from "../costs/service";
import { setRentalBillingFaultForTests } from "../billing/service";
import { createAsset } from "../assets/service";
import { newId } from "../assets/kit";
import { checkin, checkout } from "./mutations";
import { closeRental, createRental, extendRental, reserveRental, updateDamage } from "./service";
import { ADMIN_ID, AGENT_ID, checkInInspection, checkOutInspection, createHarness, customerRow, mediaMeta, meta, rentalRow, userRow, type Harness } from "./testing/harness";

const seamMocks = vi.hoisted(() => ({ createFieldReportFromDamage: vi.fn() }));

vi.mock("../../seams", async (importOriginal) => {
  const original = await importOriginal<typeof Seams>();
  return { ...original, createFieldReportFromDamage: seamMocks.createFieldReportFromDamage };
});

let h: Harness;
const agent = makeTestCtx({ userId: AGENT_ID, role: "FIELD" });
const admin = makeTestCtx({ userId: ADMIN_ID, role: "ADMIN" });

const CHECKOUT_AT = new Date("2026-11-01T08:00:00.000Z");
const CHECKIN_AT = new Date("2026-11-11T09:30:00.000Z");

beforeAll(async () => {
  h = await createHarness("rentals_p1", "agrorende_t15");
});

afterAll(async () => {
  setRentalBillingFaultForTests(null);
  await h.close();
});

beforeEach(async () => {
  setRentalBillingFaultForTests(null);
  for (const name of ["assets", "customers", "rentals", "inspections", "damages", "rental_charges", "media", "field_reports", "activity_events", "event_outbox", "users", "number_sequences", "organizations", "billing_documents", "seasons", "sites"]) {
    await h.raw(name).deleteMany({});
  }
  await h.raw("users").insertMany([userRow(ADMIN_ID, "ADMIN", "Ana Admin"), userRow(AGENT_ID, "FIELD", "Abel Agente")]);
  seamMocks.createFieldReportFromDamage.mockReset();
  seamMocks.createFieldReportFromDamage.mockImplementation(async () => ({ id: newId(), number: "FR-000001" }));
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

interface Seeded {
  assetId: string;
  customerId: string;
  rentalId: string;
}

async function seed(): Promise<Seeded> {
  const asset = await h.run((tx) => createAsset(tx, admin, { name: "Trator 7225J", category: "TRACTOR", isRentable: true, hourMeter: 4_312, tankCapacityL: 300 }));
  const customer = customerRow();
  await h.raw("customers").insertOne(customer);
  const rental = rentalRow(asset.id, customer._id);
  await h.raw("rentals").insertOne(rental);
  return { assetId: asset.id, customerId: customer._id, rentalId: rental._id };
}

async function activeV1(): Promise<Seeded> {
  const s = await seed();
  const payload = MUTATION_PAYLOADS["rental.checkout"].parse({ rentalId: s.rentalId, inspection: checkOutInspection(s.assetId) }) as RentalCheckoutPayload;
  await h.run((tx) => checkout(tx, agent, payload, meta(CHECKOUT_AT)), agent);
  return s;
}

/** The V1 golden path up to RETURNED: total 1 069 900 (ARCHITECTURE V1 golden path). */
async function returnedV1(): Promise<Seeded> {
  const s = await activeV1();
  const base: CheckInInspection = checkInInspection(s.assetId);
  const damageId = newId();
  const photo = mediaMeta(base.id, "PHOTO", "DAMAGE", { damageId });
  const inspection: CheckInInspection = {
    ...base,
    media: [...base.media, photo],
    damages: [{ id: damageId, zone: "FRONT", severity: "SEVERE", description: "Farol quebrado", isPreExisting: false, matchStatus: "NEW", mediaIds: [photo.id], estimatedCostCents: 120_000 }],
  };
  const payload = MUTATION_PAYLOADS["rental.checkin"].parse({ rentalId: s.rentalId, inspection, damageCosts: [] }) as RentalCheckinPayload;
  await h.run((tx) => checkin(tx, agent, payload, meta(CHECKIN_AT)), agent);
  await h.run((tx) => updateDamage(tx, admin, damageId, { disputeStatus: "ACCEPTED" }));
  return s;
}

describe("rental close issues a billing document (RN-10, EC-RN-33)", () => {
  it("closing the V1 rental creates one ISSUED RENTAL document whose total equals the V1 total", async () => {
    const s = await returnedV1();
    const closed = await h.run((tx) => closeRental(tx, admin, s.rentalId, { paymentNote: "PIX" }));
    expect(closed.status).toBe("CLOSED");
    const docs = await h.raw("billing_documents").find({ rentalId: s.rentalId }).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ source: "RENTAL", status: "ISSUED", customerId: s.customerId, totalCents: 1_069_900, subtotalCents: 1_069_900, discountCents: 0 });
    expect(docs[0]?.issuedAt).toBeInstanceOf(Date);
    expect(String(docs[0]?.number)).toMatch(/^BD-\d{6}$/u);
  });

  it("a billing failure keeps the rental RETURNED with its charges, and the retry creates exactly one document", async () => {
    const s = await returnedV1();
    const chargesBefore = await h.raw("rental_charges").countDocuments({ rentalId: s.rentalId });
    setRentalBillingFaultForTests((stage) => {
      if (stage === "issue") throw new Error("pdf service down");
    });
    expect(await codeOf(h.run((tx) => closeRental(tx, admin, s.rentalId)))).toBe("RENTAL_BILLING_DOCUMENT_FAILED");
    const rental = await h.raw("rentals").findOne({ _id: s.rentalId });
    expect(rental).toMatchObject({ status: "RETURNED", chargesTotalCents: 1_069_900 });
    expect(await h.raw("rental_charges").countDocuments({ rentalId: s.rentalId })).toBe(chargesBefore);
    expect(await h.raw("billing_documents").countDocuments({})).toBe(0);

    setRentalBillingFaultForTests(null);
    await h.run((tx) => closeRental(tx, admin, s.rentalId));
    const docs = await h.raw("billing_documents").find({ rentalId: s.rentalId }).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ status: "ISSUED", totalCents: 1_069_900 });
  });
});

describe("rental extension (RN-06, EC-RN-32)", () => {
  it("extending into another reservation returns ASSET_DOUBLE_BOOKED and keeps the old planned end", async () => {
    const s = await activeV1();
    const other = rentalRow(s.assetId, s.customerId, { plannedStart: new Date("2026-11-13T08:00:00.000Z"), plannedEnd: new Date("2026-11-20T08:00:00.000Z") });
    await h.raw("rentals").insertOne(other);
    expect(await codeOf(h.run((tx) => extendRental(tx, admin, s.rentalId, { newPlannedEnd: "2026-11-15T08:00:00.000Z" })))).toBe("ASSET_DOUBLE_BOOKED");
    const rental = await h.raw("rentals").findOne({ _id: s.rentalId });
    expect(rental?.plannedEnd).toEqual(new Date("2026-11-11T08:00:00.000Z"));
  });

  it("extends when the asset is free up to the new end", async () => {
    const s = await activeV1();
    const extended = await h.run((tx) => extendRental(tx, admin, s.rentalId, { newPlannedEnd: "2026-11-12T08:00:00.000Z" }));
    expect(extended.plannedEnd).toBe("2026-11-12T08:00:00.000Z");
  });

  it("rejects an extension by a FIELD user", async () => {
    const s = await activeV1();
    expect(await codeOf(h.run((tx) => extendRental(tx, agent, s.rentalId, { newPlannedEnd: "2026-11-12T08:00:00.000Z" }), agent))).not.toBe("OK");
  });
});

describe("rent-in (RN-12, EC-RN-34)", () => {
  async function inbound(complete: boolean): Promise<{ rentalId: string; assetId: string }> {
    const asset = await h.run((tx) =>
      createAsset(tx, admin, { name: "Pulverizador parceiro", category: "SPRAYER", isRentable: false, ...(complete ? { ownerType: "PARTNER" } : {}) }),
    );
    const supplier = customerRow(undefined, { name: "Agro Parceira Ltda", isSupplier: complete });
    await h.raw("customers").insertOne(supplier);
    if (complete) {
      const now = new Date();
      await h.raw("seasons").insertOne({ _id: newId(), organizationId: admin.orgId, syncVersion: 1, createdAt: now, updatedAt: now, deletedAt: null, name: "Safra 26/27", isCurrent: true, startsAt: now, endsAt: now });
    }
    const rental = await h.run((tx) =>
      createRental(tx, admin, {
        direction: "INBOUND",
        assetId: asset.id,
        customerId: supplier._id,
        plannedStart: "2026-11-01T08:00:00.000Z",
        plannedEnd: "2026-11-05T08:00:00.000Z",
        rateCents: 50_000,
        ...(complete ? { siteId: newId() } : {}),
      }),
    );
    return { rentalId: rental.id, assetId: asset.id };
  }

  it("an incomplete INBOUND draft stays saved and reserve answers INBOUND_RENTAL_INCOMPLETE with the gaps", async () => {
    const { rentalId } = await inbound(false);
    const error = await h.run((tx) => reserveRental(tx, admin, rentalId)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("INBOUND_RENTAL_INCOMPLETE");
    expect((error as AppError).details).toMatchObject({ missing: ["supplier", "partnerAsset", "site", "season"] });
    expect((await h.raw("rentals").findOne({ _id: rentalId }))?.status).toBe("DRAFT");
  });

  it("a complete INBOUND rental reserves a non-rentable partner asset (no ASSET_NOT_RENTABLE)", async () => {
    const { rentalId } = await inbound(true);
    const reserved = await h.run((tx) => reserveRental(tx, admin, rentalId));
    expect(reserved.status).toBe("RESERVED");
  });

  it("an INBOUND rental is a cost in the roll-up, not revenue, and is never billed", async () => {
    const { rentalId, assetId } = await inbound(true);
    await h.raw("rentals").updateOne({ _id: rentalId }, { $set: { status: "RETURNED", chargesTotalCents: 200_000, actualStart: CHECKOUT_AT, actualEnd: new Date("2026-11-05T08:00:00.000Z") } });
    await h.run((tx) => closeRental(tx, admin, rentalId));
    expect(await h.raw("billing_documents").countDocuments({})).toBe(0);
    const rollup = await costRollup(admin, { groupBy: "asset" });
    const row = rollup.rows.find((entry) => entry.key === assetId);
    expect(row).toMatchObject({ rentInCostCents: 200_000, rentalRevenueCents: 0, totalCostCents: 200_000 });
  });
});
