import { describe, expect, it } from "vitest";
import { checkRentalEligibility, summarizeRentalCharges, validateCheckIn, validateCheckOut, type ChargesInput } from "./charges";

const plannedStart = new Date("2026-11-01T08:00:00.000Z");
const plannedEnd = new Date("2026-11-11T08:00:00.000Z");

function baseInput(overrides: Partial<ChargesInput> = {}): ChargesInput {
  return {
    rateCents: 85_000,
    rateUnit: "DAY",
    plannedStart,
    plannedEnd,
    actualStart: plannedStart,
    actualEnd: new Date("2026-11-11T09:30:00.000Z"),
    graceHours: 2,
    includedHoursPerDay: 8,
    extraHourRateCents: 12_000,
    checkOutHourMeter: 4_312,
    checkInHourMeter: 4_398,
    fuelPolicy: "CHARGE_DIFFERENCE",
    checkOutFuelPct: 100,
    checkInFuelPct: 85,
    tankCapacityL: 300,
    fuelPriceCents: 620,
    newDamages: [{ damageId: "damage-1", estimatedCostCents: 120_000 }],
    missingAccessories: [],
    depositCents: 200_000,
    ...overrides,
  };
}

function amount(input: ChargesInput, type: string): number {
  return summarizeRentalCharges(input).lines.find((line) => line.type === type)?.amountCents ?? 0;
}

describe("computeRentalCharges", () => {
  it("matches V1 golden path", () => {
    const input = baseInput();
    const summary = summarizeRentalCharges(input);
    expect(amount(input, "BASE")).toBe(850_000);
    expect(amount(input, "EXTRA_TIME")).toBe(0);
    expect(amount(input, "EXTRA_HOURS")).toBe(72_000);
    expect(amount(input, "FUEL")).toBe(27_900);
    expect(amount(input, "DAMAGE")).toBe(120_000);
    expect(summary.totalCents).toBe(1_069_900);
    expect(summary.balanceDueCents).toBe(869_900);
  });

  it("matches V2 late with fee", () => {
    const input = baseInput({
      actualEnd: new Date("2026-11-12T11:00:00.000Z"),
      lateFeePerDayCents: 100_000,
      checkInHourMeter: 4_402,
      fuelPolicy: "INCLUDED",
      newDamages: [],
      depositCents: 0,
    });
    const summary = summarizeRentalCharges(input);
    expect(amount(input, "BASE")).toBe(850_000);
    expect(amount(input, "EXTRA_TIME")).toBe(200_000);
    expect(amount(input, "EXTRA_HOURS")).toBe(0);
    expect(summary.totalCents).toBe(1_050_000);
    expect(summary.balanceDueCents).toBe(1_050_000);
  });

  it("matches V3 late without fee", () => {
    const input = baseInput({
      actualEnd: new Date("2026-11-12T11:00:00.000Z"),
      lateFeePerDayCents: null,
      checkInHourMeter: 4_402,
      fuelPolicy: "INCLUDED",
      newDamages: [],
      depositCents: 0,
    });
    const summary = summarizeRentalCharges(input);
    expect(amount(input, "EXTRA_TIME")).toBe(170_000);
    expect(summary.totalCents).toBe(1_020_000);
  });

  it("matches V4 hourly", () => {
    const input = baseInput({
      rateCents: 15_000,
      rateUnit: "HOUR",
      plannedStart: new Date("2026-11-01T08:00:00.000Z"),
      plannedEnd: new Date("2026-11-01T13:30:00.000Z"),
      actualStart: new Date("2026-11-01T08:00:00.000Z"),
      actualEnd: new Date("2026-11-01T13:00:00.000Z"),
      graceHours: 0,
      includedHoursPerDay: null,
      extraHourRateCents: null,
      checkOutHourMeter: null,
      checkInHourMeter: null,
      fuelPolicy: "INCLUDED",
      newDamages: [],
      depositCents: 0,
    });
    const summary = summarizeRentalCharges(input);
    expect(amount(input, "BASE")).toBe(90_000);
    expect(summary.totalCents).toBe(90_000);
  });

  it("matches V5 discount", () => {
    const input = baseInput({
      rateCents: 15_000,
      rateUnit: "HOUR",
      plannedStart: new Date("2026-11-01T08:00:00.000Z"),
      plannedEnd: new Date("2026-11-01T13:30:00.000Z"),
      actualStart: new Date("2026-11-01T08:00:00.000Z"),
      actualEnd: new Date("2026-11-01T13:00:00.000Z"),
      graceHours: 0,
      includedHoursPerDay: null,
      extraHourRateCents: null,
      checkOutHourMeter: null,
      checkInHourMeter: null,
      fuelPolicy: "INCLUDED",
      newDamages: [],
      depositCents: 0,
      manualLines: [
        {
          type: "DISCOUNT",
          description: "Discount",
          quantity: 1,
          unitAmountCents: -10_000,
          amountCents: -10_000,
          isAuto: false,
        },
      ],
    });
    const summary = summarizeRentalCharges(input);
    expect(summary.totalCents).toBe(80_000);
  });

  it("matches V6 missing accessory", () => {
    const input = baseInput({
      plannedStart: new Date("2026-11-01T08:00:00.000Z"),
      plannedEnd: new Date("2026-11-02T08:00:00.000Z"),
      actualStart: new Date("2026-11-01T08:00:00.000Z"),
      actualEnd: new Date("2026-11-02T08:00:00.000Z"),
      includedHoursPerDay: null,
      extraHourRateCents: null,
      fuelPolicy: "INCLUDED",
      newDamages: [],
      missingAccessories: [{ accessoryKey: "hitch", label: "Hitch", missingQty: 1, replacementCostCents: 35_000 }],
      depositCents: 0,
    });
    const summary = summarizeRentalCharges(input);
    expect(amount(input, "BASE")).toBe(85_000);
    expect(amount(input, "ACCESSORY")).toBe(35_000);
    expect(summary.totalCents).toBe(120_000);
  });
});

describe("rental eligibility and inspections", () => {
  it.each([
    ["ASSET_NOT_RENTABLE", { assetRentable: false }],
    ["ASSET_NOT_OPERATIONAL", { assetCondition: "NEEDS_REPAIR" as const }],
    ["ASSET_HAS_CRITICAL_REPORT", { hasCriticalOpenReport: true }],
    ["ASSET_DOUBLE_BOOKED", { hasOverlappingReservedOrActiveRental: true }],
    ["CUSTOMER_INCOMPLETE", { customerHasPhone: false }],
  ])("returns %s", (code, overrides) => {
    const result = checkRentalEligibility({
      direction: "OUTBOUND",
      assetRentable: true,
      assetCondition: "OPERATIONAL",
      hasCriticalOpenReport: false,
      hasOverlappingReservedOrActiveRental: false,
      customerHasDocument: true,
      customerHasPhone: true,
      ...overrides,
    });
    expect(result.codes).toContain(code);
  });

  it("validates check-out and check-in evidence", () => {
    const media = [
      { id: "11111111-1111-4111-8111-111111111111", tag: "WALKAROUND_FRONT" as const },
      { id: "22222222-2222-4222-8222-222222222222", tag: "WALKAROUND_REAR" as const },
      { id: "33333333-3333-4333-8333-333333333333", tag: "WALKAROUND_LEFT" as const },
      { id: "44444444-4444-4444-8444-444444444444", tag: "WALKAROUND_RIGHT" as const },
      { id: "55555555-5555-4555-8555-555555555555", tag: "WALKAROUND_CAB" as const },
      { id: "66666666-6666-4666-8666-666666666666", tag: "HOUR_METER" as const },
      { id: "77777777-7777-4777-8777-777777777777", tag: "FUEL_GAUGE" as const },
    ];
    const asset = { category: "TRACTOR" as const, tankCapacityL: 300, openDamageIds: [] };
    const inspection = {
      type: "CHECK_OUT" as const,
      templateSnapshot: [],
      responses: [],
      hourMeter: 1,
      fuelPercent: 100,
      safetyBriefingGiven: true,
      operatorName: "Operator",
      termsAccepted: true,
      signatureStatus: "SIGNED" as const,
      customerSignatureMediaId: "11111111-1111-4111-8111-111111111111",
      agentSignatureMediaId: "22222222-2222-4222-8222-222222222222",
    };
    expect(validateCheckOut(inspection, media, { direction: "OUTBOUND", status: "RESERVED" }, asset)).toEqual({ ok: true });
    expect(validateCheckIn({ ...inspection, type: "CHECK_IN" }, media, { direction: "OUTBOUND", status: "ACTIVE" }, asset)).toEqual({ ok: true });
  });
});
