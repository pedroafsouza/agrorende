import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@agrorende/contracts/errors";
import { MUTATION_PAYLOADS } from "@agrorende/contracts/mutations";
import type { CheckInInspection, CheckOutInspection, RentalCheckinPayload, RentalCheckoutPayload } from "@agrorende/contracts/mutations";
import type * as Seams from "../../seams";
import { makeTestCtx } from "../../testing/ctx";
import { createAsset } from "../assets/service";
import { newId } from "../assets/kit";
import { checkin, checkout } from "./mutations";
import { checkEligibility, getChargesView, getRentalDetail, renderRentalPdf } from "./queries";
import { activeRentalForAsset, addManualCharge, closeRental, markDamagesRepaired, updateDamage } from "./service";
import {
  ADMIN_ID,
  AGENT_ID,
  OTHER_AGENT_ID,
  checkInInspection,
  checkOutInspection,
  createHarness,
  customerRow,
  mediaMeta,
  meta,
  rentalRow,
  userRow,
  type Harness,
} from "./testing/harness";

const seamMocks = vi.hoisted(() => ({ createFieldReportFromDamage: vi.fn() }));

vi.mock("../../seams", async (importOriginal) => {
  const original = await importOriginal<typeof Seams>();
  return { ...original, createFieldReportFromDamage: seamMocks.createFieldReportFromDamage };
});

let h: Harness;
const agent = makeTestCtx({ userId: AGENT_ID, role: "FIELD" });
const otherAgent = makeTestCtx({ userId: OTHER_AGENT_ID, role: "FIELD" });
const admin = makeTestCtx({ userId: ADMIN_ID, role: "ADMIN" });

const CHECKOUT_AT = new Date("2026-11-01T08:00:00.000Z");
const CHECKIN_AT = new Date("2026-11-11T09:30:00.000Z");

beforeAll(async () => {
  h = await createHarness("mutations");
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  for (const name of ["assets", "customers", "rentals", "inspections", "damages", "rental_charges", "media", "field_reports", "activity_events", "event_outbox", "users", "number_sequences", "organizations"]) {
    await h.raw(name).deleteMany({});
  }
  await h.raw("users").insertMany([userRow(ADMIN_ID, "ADMIN", "Ana Admin"), userRow(AGENT_ID, "FIELD", "Abel Agente"), userRow(OTHER_AGENT_ID, "FIELD", "Olga Agente")]);
  seamMocks.createFieldReportFromDamage.mockReset();
  let counter = 0;
  seamMocks.createFieldReportFromDamage.mockImplementation(async () => {
    counter += 1;
    return { id: newId(), number: `FR-${String(counter).padStart(6, "0")}` };
  });
});

interface Seeded {
  assetId: string;
  customerId: string;
  rentalId: string;
}

async function seed(rentalExtra: Record<string, unknown> = {}, assetExtra: Record<string, unknown> = {}): Promise<Seeded> {
  const asset = await h.run((tx) => createAsset(tx, admin, { name: "Trator 7225J", category: "TRACTOR", isRentable: true, hourMeter: 4_312, tankCapacityL: 300, ...assetExtra }));
  const customer = customerRow();
  await h.raw("customers").insertOne(customer);
  const rental = rentalRow(asset.id, customer._id, rentalExtra);
  await h.raw("rentals").insertOne(rental);
  return { assetId: asset.id, customerId: customer._id, rentalId: rental._id };
}

function outPayload(s: Seeded, inspection: CheckOutInspection = checkOutInspection(s.assetId)): RentalCheckoutPayload {
  return MUTATION_PAYLOADS["rental.checkout"].parse({ rentalId: s.rentalId, inspection }) as RentalCheckoutPayload;
}

function inPayload(s: Seeded, inspection: CheckInInspection = checkInInspection(s.assetId), damageCosts: RentalCheckinPayload["damageCosts"] = []): RentalCheckinPayload {
  return MUTATION_PAYLOADS["rental.checkin"].parse({ rentalId: s.rentalId, inspection, damageCosts }) as RentalCheckinPayload;
}

async function doCheckout(s: Seeded, inspection?: CheckOutInspection): Promise<void> {
  await h.run((tx) => checkout(tx, agent, outPayload(s, inspection), meta(CHECKOUT_AT)), agent);
}

function newDamage(inspection: CheckInInspection, cost?: number): { inspection: CheckInInspection; damageId: string } {
  const damageId = newId();
  const photo = mediaMeta(inspection.id, "PHOTO", "DAMAGE", { damageId });
  return {
    damageId,
    inspection: {
      ...inspection,
      media: [...inspection.media, photo],
      damages: [
        {
          id: damageId,
          zone: "FRONT",
          severity: "SEVERE",
          description: "Farol dianteiro quebrado",
          isPreExisting: false,
          matchStatus: "NEW",
          mediaIds: [photo.id],
          ...(cost === undefined ? {} : { estimatedCostCents: cost }),
        },
      ],
    },
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return "OK";
}

describe("eligibility", () => {
  it("is eligible for a rentable operational asset with a complete customer", async () => {
    const s = await seed();
    await h.raw("rentals").deleteMany({});
    const result = await checkEligibility(h.ctx, { assetId: s.assetId, customerId: s.customerId, from: "2026-11-01T08:00:00Z", to: "2026-11-05T08:00:00Z" });
    expect(result).toEqual({ eligible: true, codes: [], warnings: [] });
  });

  it("reports the overlap, the missing document and the non-rentable asset", async () => {
    const s = await seed();
    await h.raw("customers").updateOne({ _id: s.customerId }, { $set: { taxId: "" } });
    await h.raw("assets").updateOne({ _id: s.assetId }, { $set: { isRentable: false } });
    const result = await checkEligibility(h.ctx, { assetId: s.assetId, customerId: s.customerId, from: "2026-11-05T08:00:00Z", to: "2026-11-15T08:00:00Z" });
    expect(result.eligible).toBe(false);
    expect(result.codes).toEqual(expect.arrayContaining(["ASSET_NOT_RENTABLE", "ASSET_DOUBLE_BOOKED", "CUSTOMER_INCOMPLETE"]));
  });

  it("ignores the rental being edited", async () => {
    const s = await seed();
    const result = await checkEligibility(h.ctx, { assetId: s.assetId, from: "2026-11-05T08:00:00Z", to: "2026-11-15T08:00:00Z", excludeRentalId: s.rentalId });
    expect(result.codes).not.toContain("ASSET_DOUBLE_BOOKED");
  });
});

describe("rental.checkout", () => {
  it("moves RESERVED to ACTIVE, takes custody and stores the inspection and media", async () => {
    const s = await seed();
    const inspection = checkOutInspection(s.assetId);
    await doCheckout(s, inspection);
    const rental = await h.raw("rentals").findOne({ _id: s.rentalId });
    expect(rental).toMatchObject({ status: "ACTIVE", checkOutInspectionId: inspection.id, agentId: AGENT_ID, actualStart: CHECKOUT_AT });
    const asset = await h.raw("assets").findOne({ _id: s.assetId });
    expect(asset?.currentRentalId).toBe(s.rentalId);
    expect(await h.raw("inspections").countDocuments({ _id: inspection.id, type: "CHECK_OUT" })).toBe(1);
    expect(await h.raw("media").countDocuments({ "parent.id": inspection.id })).toBe(inspection.media.length);
  });

  it("is idempotent on the inspection id", async () => {
    const s = await seed();
    const inspection = checkOutInspection(s.assetId);
    await doCheckout(s, inspection);
    await doCheckout(s, inspection);
    expect(await h.raw("inspections").countDocuments({})).toBe(1);
  });

  const cases: [string, (i: CheckOutInspection) => CheckOutInspection][] = [
    ["walkaround", (i) => ({ ...i, media: i.media.filter((m) => m.tag !== "WALKAROUND_CAB") })],
    ["fuel", (i) => { const { fuelPercent: _fuel, ...rest } = i; return rest; }],
    ["briefing", (i) => ({ ...i, safetyBriefingGiven: false })],
    ["terms", (i) => ({ ...i, termsAccepted: false })],
    ["checklist", (i) => ({ ...i, responses: [] })],
  ];
  for (const [item, mutate] of cases) {
    it(`blocks with GUARD_CHECKOUT_INCOMPLETE when ${item} is missing`, async () => {
      const s = await seed();
      const error = await h.run((tx) => checkout(tx, agent, outPayload(s, mutate(checkOutInspection(s.assetId))), meta(CHECKOUT_AT)), agent).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("GUARD_CHECKOUT_INCOMPLETE");
      expect(JSON.stringify((error as AppError).details)).toContain(item);
      expect((await h.raw("rentals").findOne({ _id: s.rentalId }))?.status).toBe("RESERVED");
    });
  }

  it("rejects a lower hour meter", async () => {
    const s = await seed();
    expect(await codeOf(h.run((tx) => checkout(tx, agent, outPayload(s, checkOutInspection(s.assetId, { hourMeter: 4_000 })), meta(CHECKOUT_AT)), agent))).toBe("METER_READING_LOWER");
  });

  it("rejects an asset that is not operational", async () => {
    const s = await seed();
    await h.raw("assets").updateOne({ _id: s.assetId }, { $set: { condition: "OUT_OF_SERVICE" } });
    expect(await codeOf(h.run((tx) => checkout(tx, agent, outPayload(s), meta(CHECKOUT_AT)), agent))).toBe("ASSET_NOT_OPERATIONAL");
  });

  it("rejects a rental that is not RESERVED", async () => {
    const s = await seed({ status: "DRAFT" });
    expect(await codeOf(h.run((tx) => checkout(tx, agent, outPayload(s), meta(CHECKOUT_AT)), agent))).toBe("RENTAL_NOT_RESERVED");
  });
});

describe("rental.checkin", () => {
  it("computes the V1 charges end to end and flags the new damage", async () => {
    const s = await seed();
    await doCheckout(s);
    const { inspection, damageId } = newDamage(checkInInspection(s.assetId));
    await h.run((tx) => checkin(tx, agent, inPayload(s, inspection, [{ damageId, estimatedCostCents: 120_000 }]), meta(CHECKIN_AT)), agent);

    const rental = await h.raw("rentals").findOne({ _id: s.rentalId });
    expect(rental).toMatchObject({ status: "RETURNED", chargesTotalCents: 1_069_900, balanceDueCents: 869_900, actualEnd: CHECKIN_AT });
    const asset = await h.raw("assets").findOne({ _id: s.assetId });
    expect(asset?.currentRentalId).toBeNull();
    expect(asset?.condition).toBe("NEEDS_REPAIR");
    expect(asset?.hourMeter).toBe(4_398);
    expect(seamMocks.createFieldReportFromDamage).toHaveBeenCalledTimes(1);
    const damage = await h.raw("damages").findOne({ _id: damageId });
    expect(damage).toMatchObject({ isPreExisting: false, detectedRentalId: s.rentalId, estimatedCostCents: 120_000 });
    expect(damage?.fieldReportId).toEqual(expect.any(String));

    const view = await getChargesView(h.ctx, s.rentalId);
    expect(view.totalCents).toBe(1_069_900);
    expect(view.lines.map((line) => line.type)).toEqual(expect.arrayContaining(["BASE", "EXTRA_HOURS", "FUEL", "DAMAGE"]));
  });

  it("rolls back with RENTAL_DAMAGE_REPORT_FAILED when the field report seam fails", async () => {
    const s = await seed();
    await doCheckout(s);
    seamMocks.createFieldReportFromDamage.mockRejectedValue(new Error("boom"));
    const { inspection } = newDamage(checkInInspection(s.assetId));
    expect(await codeOf(h.run((tx) => checkin(tx, agent, inPayload(s, inspection), meta(CHECKIN_AT)), agent))).toBe("RENTAL_DAMAGE_REPORT_FAILED");
    expect((await h.raw("rentals").findOne({ _id: s.rentalId }))?.status).toBe("ACTIVE");
    expect(await h.raw("damages").countDocuments({})).toBe(0);
    expect(await h.raw("inspections").countDocuments({ type: "CHECK_IN" })).toBe(0);
  });

  it("charges missing accessories and records a refused signature with an attention activity", async () => {
    const s = await seed();
    await doCheckout(s);
    const base = checkInInspection(s.assetId, {
      signatureStatus: "REFUSED",
      signatureReason: "Cliente recusou",
      accessories: [{ accessoryKey: "toolbox", expected: 1, present: 0, replacementCostCents: 35_000 }],
    });
    const { customerSignatureMediaId: _sig, ...withoutCustomer } = base;
    const { inspection } = newDamage({ ...withoutCustomer, media: base.media.filter((m) => m.tag !== "SIGNATURE_CUSTOMER") }, 10_000);
    await h.run((tx) => checkin(tx, otherAgent, inPayload(s, inspection), meta(CHECKIN_AT)), otherAgent);
    const view = await getChargesView(h.ctx, s.rentalId);
    expect(view.lines.find((line) => line.type === "ACCESSORY")?.amountCents).toBe(35_000);
    const actions = (await h.raw("activity_events").find({ entityId: s.rentalId }).toArray()).map((event) => event.action);
    expect(actions).toEqual(expect.arrayContaining(["rental.damagesNotAcknowledged", "rental.checkedIn"]));
    const checkedIn = await h.raw("activity_events").findOne({ entityId: s.rentalId, action: "rental.checkedIn" });
    expect(checkedIn?.meta).toMatchObject({ differentAgent: true });
  });

  it("rejects an hour meter jump larger than the elapsed time", async () => {
    const s = await seed();
    await doCheckout(s);
    expect(await codeOf(h.run((tx) => checkin(tx, agent, inPayload(s, checkInInspection(s.assetId, { hourMeter: 9_000 })), meta(CHECKIN_AT)), agent))).toBe("METER_READING_JUMP");
  });

  it("accepts a confirmed hour meter jump and flags it for attention (T08-001)", async () => {
    const s = await seed();
    await doCheckout(s);
    await h.run((tx) => checkin(tx, agent, inPayload(s, checkInInspection(s.assetId, { hourMeter: 9_000, meterJumpConfirmed: true })), meta(CHECKIN_AT)), agent);
    const checkedIn = await h.raw("activity_events").findOne({ entityId: s.rentalId, action: "rental.checkedIn" });
    expect(checkedIn?.meta).toMatchObject({ meterJumpConfirmed: true, attention: true });
  });

  it("rejects a rental that is not ACTIVE", async () => {
    const s = await seed();
    expect(await codeOf(h.run((tx) => checkin(tx, agent, inPayload(s), meta(CHECKIN_AT)), agent))).toBe("RENTAL_NOT_ACTIVE");
  });
});

describe("close and charges", () => {
  async function returned(): Promise<{ s: Seeded; damageId: string }> {
    const s = await seed();
    await doCheckout(s);
    const { inspection, damageId } = newDamage(checkInInspection(s.assetId), 120_000);
    await h.run((tx) => checkin(tx, agent, inPayload(s, inspection), meta(CHECKIN_AT)), agent);
    return { s, damageId };
  }

  it("blocks close while a damage is disputed and closes once accepted", async () => {
    const { s, damageId } = await returned();
    await h.run((tx) => updateDamage(tx, admin, damageId, { disputeStatus: "DISPUTED" }));
    expect((await getChargesView(h.ctx, s.rentalId)).heldDamageIds).toEqual([damageId]);
    expect(await codeOf(h.run((tx) => closeRental(tx, admin, s.rentalId)))).toBe("VALIDATION_FAILED");
    await h.run((tx) => updateDamage(tx, admin, damageId, { disputeStatus: "ACCEPTED" }));
    const closed = await h.run((tx) => closeRental(tx, admin, s.rentalId, { paymentNote: "PIX" }));
    expect(closed.status).toBe("CLOSED");
  });

  it("rejects close with a stale chargesVersion after a manual charge", async () => {
    const { s } = await returned();
    const before = (await getChargesView(h.ctx, s.rentalId)).chargesVersion;
    await h.run((tx) => addManualCharge(tx, admin, s.rentalId, { type: "OTHER", description: "Frete", unitAmountCents: 15_000 }));
    const after = await getChargesView(h.ctx, s.rentalId);
    expect(after.chargesVersion).toBeGreaterThan(before);
    expect(after.totalCents).toBe(1_069_900 + 15_000);
    expect(await codeOf(h.run((tx) => closeRental(tx, admin, s.rentalId, { chargesVersion: before })))).toBe("RENTAL_CHARGES_UPDATED");
  });

  it("renders the check-out and check-in PDFs", async () => {
    const { s } = await returned();
    for (const kind of ["checkout", "checkin"] as const) {
      const pdf = await renderRentalPdf(h.ctx, s.rentalId, kind);
      expect(Buffer.from(pdf.bytes).subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.filename).toMatch(new RegExp(`-${kind}\\.pdf$`));
    }
    const detail = await getRentalDetail(h.ctx, s.rentalId);
    expect(detail.checkOut?.type).toBe("CHECK_OUT");
    expect(detail.checkIn?.type).toBe("CHECK_IN");
  }, 30_000);
});

describe("seams", () => {
  it("activeRentalForAsset returns the ACTIVE rental only", async () => {
    const s = await seed();
    expect(await h.run((tx) => activeRentalForAsset(tx, s.assetId))).toBeNull();
    await doCheckout(s);
    const active = await h.run((tx) => activeRentalForAsset(tx, s.assetId));
    expect(active?.id).toBe(s.rentalId);
  });

  it("markDamagesRepaired stamps the damages and recomputes the asset condition", async () => {
    const s = await seed();
    await doCheckout(s);
    const { inspection, damageId } = newDamage(checkInInspection(s.assetId));
    await h.run((tx) => checkin(tx, agent, inPayload(s, inspection), meta(CHECKIN_AT)), agent);
    expect((await h.raw("assets").findOne({ _id: s.assetId }))?.condition).toBe("NEEDS_REPAIR");
    const workOrderId = newId();
    await h.run((tx) => markDamagesRepaired(tx, { workOrderId, damageIds: [damageId] }));
    expect(await h.raw("damages").findOne({ _id: damageId })).toMatchObject({ repairedWorkOrderId: workOrderId, repairedAt: expect.any(Date) });
    expect((await h.raw("assets").findOne({ _id: s.assetId }))?.condition).toBe("OPERATIONAL");
    await h.run((tx) => markDamagesRepaired(tx, { workOrderId: newId(), damageIds: [damageId] }));
    expect((await h.raw("damages").findOne({ _id: damageId }))?.repairedWorkOrderId).toBe(workOrderId);
  });
});
