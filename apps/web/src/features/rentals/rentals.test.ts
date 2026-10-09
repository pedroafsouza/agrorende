import { describe, expect, it } from "vitest";

import en from "../../../messages/en/rentals.json";
import ptBR from "../../../messages/pt-BR/rentals.json";
import { ApiError } from "@/lib/api";

import {
  EMPTY_NEW_RENTAL,
  chargesUpdatedOf,
  closeBody,
  eligibilityByField,
  eligibilityQuery,
  heldDamagesOf,
  localToIso,
  meterDelta,
  newRentalBody,
  barPosition,
  calendarWindow,
  canExtend,
  directionLabels,
  extendBody,
  groupByAsset,
  inboundMissingOf,
  isBillingFailure,
  rentalActions,
  reserveCodesOf,
  shiftDay,
  tabStatus,
} from "./types";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix.length === 0 ? k : `${prefix}.${k}`));
}

const ASSET = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";

describe("rentals messages", () => {
  it("has the same keys in pt-BR and en", () => {
    expect(keys(en).sort()).toEqual(keys(ptBR).sort());
  });

  it("has a label for every enum the pages show", async () => {
    const { ChargeTypeEnum, DamageZoneEnum, DamageSeverityEnum, DamageDisputeStatusEnum, DamageMatchStatusEnum, SignatureStatusEnum, DeliveryModeEnum } = await import("@agrorende/contracts/enums");
    for (const v of ChargeTypeEnum.options) expect(ptBR.chargeType).toHaveProperty(v);
    for (const v of DamageZoneEnum.options) expect(ptBR.damageZone).toHaveProperty(v);
    for (const v of DamageSeverityEnum.options) expect(ptBR.damageSeverity).toHaveProperty(v);
    for (const v of DamageDisputeStatusEnum.options) expect(ptBR.damageDispute).toHaveProperty(v);
    for (const v of DamageMatchStatusEnum.options) expect(ptBR.damageMatch).toHaveProperty(v);
    for (const v of SignatureStatusEnum.options) expect(ptBR.signatureStatus).toHaveProperty(v);
    for (const v of DeliveryModeEnum.options) expect(ptBR.deliveryMode).toHaveProperty(v);
  });
});

describe("rental helpers", () => {
  it("maps tabs to the status filter, OVERDUE included", () => {
    expect(tabStatus("ALL")).toBeUndefined();
    expect(tabStatus("OVERDUE")).toBe("OVERDUE");
    expect(tabStatus("bogus")).toBeUndefined();
  });

  it("reads datetime-local values in the organisation timezone", () => {
    expect(localToIso("2026-11-01T08:00")).toBe("2026-11-01T11:00:00.000Z");
    expect(localToIso("")).toBeNull();
  });

  it("only checks eligibility once the asset and both dates are filled", () => {
    expect(eligibilityQuery(EMPTY_NEW_RENTAL)).toBeNull();
    const values = { ...EMPTY_NEW_RENTAL, assetId: ASSET, customerId: CUSTOMER, plannedStart: "2026-11-01T08:00", plannedEnd: "2026-11-03T08:00" };
    expect(eligibilityQuery(values, "r1")).toEqual({ assetId: ASSET, customerId: CUSTOMER, from: "2026-11-01T11:00:00.000Z", to: "2026-11-03T11:00:00.000Z", excludeRentalId: "r1" });
  });

  it("builds the create body with asset defaults for empty rate fields", () => {
    const body = newRentalBody({ ...EMPTY_NEW_RENTAL, assetId: ASSET, customerId: CUSTOMER, plannedStart: "2026-11-01T08:00", plannedEnd: "2026-11-03T08:00", deliveryAddress: "Ignored" });
    expect(body).toMatchObject({ assetId: ASSET, customerId: CUSTOMER, rateCents: undefined, rateUnit: undefined, depositCents: 0, deliveryMode: "PICKUP", deliveryAddress: null, documentLocale: "pt-BR", notes: null });
  });

  it("places eligibility codes next to their field", () => {
    expect(eligibilityByField(["ASSET_DOUBLE_BOOKED", "CUSTOMER_INCOMPLETE", "ASSET_NOT_RENTABLE", "RENTAL_DATES_INVALID", "ASSET_DOUBLE_BOOKED", "INVALID_TRANSITION"])).toEqual({
      dates: ["ASSET_DOUBLE_BOOKED", "RENTAL_DATES_INVALID"],
      customerId: ["CUSTOMER_INCOMPLETE"],
      assetId: ["ASSET_NOT_RENTABLE"],
    });
  });

  it("reads reserve rejection codes", () => {
    expect(reserveCodesOf(new ApiError({ code: "CUSTOMER_INCOMPLETE", status: 422, details: { codes: ["CUSTOMER_INCOMPLETE", "ASSET_DOUBLE_BOOKED"] } }))).toEqual(["CUSTOMER_INCOMPLETE", "ASSET_DOUBLE_BOOKED"]);
    expect(reserveCodesOf(new ApiError({ code: "ASSET_DOUBLE_BOOKED", status: 409 }))).toEqual(["ASSET_DOUBLE_BOOKED"]);
    expect(reserveCodesOf(new ApiError({ code: "CONFLICT", status: 409 }))).toEqual([]);
  });

  it("sends the reviewed charges version on close and reads updated totals", () => {
    expect(closeBody("  PIX  ", 3)).toEqual({ paymentNote: "PIX", chargesVersion: 3 });
    expect(closeBody("", 3)).toEqual({ paymentNote: null, chargesVersion: 3 });
    expect(chargesUpdatedOf(new ApiError({ code: "RENTAL_CHARGES_UPDATED", status: 409, details: { chargesVersion: 4, totalCents: 1000, balanceDueCents: 500 } }))).toEqual({ chargesVersion: 4, totalCents: 1000, balanceDueCents: 500 });
    expect(chargesUpdatedOf(new Error("x"))).toBeNull();
  });

  it("reads held damages from a blocked close", () => {
    expect(heldDamagesOf(new ApiError({ code: "VALIDATION_FAILED", status: 422, details: { reason: "damageHeld", damageIds: ["d1"] } }))).toEqual(["d1"]);
    expect(heldDamagesOf(new ApiError({ code: "VALIDATION_FAILED", status: 422 }))).toBeNull();
  });

  it("offers office actions by status", () => {
    expect(rentalActions("DRAFT")).toEqual({ reserve: true, cancel: true, close: false, editCharges: false, extend: false });
    expect(rentalActions("RETURNED")).toEqual({ reserve: false, cancel: false, close: true, editCharges: true, extend: false });
    expect(rentalActions("ACTIVE")).toEqual({ reserve: false, cancel: false, close: false, editCharges: false, extend: true });
  });

  it("computes the hour-meter delta", () => {
    expect(meterDelta(100, 112.34)).toBe(12.3);
    expect(meterDelta(null, 5)).toBeNull();
  });
});

describe("rentals P1 helpers", () => {
  it("labels rent-in rentals as receive and return from a supplier", () => {
    expect(directionLabels("OUTBOUND")).toEqual({ checkout: "checkout", checkin: "checkin", party: "customer" });
    expect(directionLabels("INBOUND")).toEqual({ checkout: "receive", checkin: "return", party: "supplier" });
  });

  it("sends the direction on create and on the eligibility check of a rent-in", () => {
    const values = { ...EMPTY_NEW_RENTAL, direction: "INBOUND" as const, assetId: ASSET, customerId: CUSTOMER, plannedStart: "2026-11-01T08:00", plannedEnd: "2026-11-03T08:00" };
    expect(newRentalBody(values)).toMatchObject({ direction: "INBOUND", assetId: ASSET });
    expect(eligibilityQuery(values)).toMatchObject({ direction: "INBOUND" });
    expect(eligibilityQuery({ ...values, direction: "OUTBOUND" })).not.toHaveProperty("direction");
  });

  it("reads the missing rent-in parts and the billing failure", () => {
    expect(inboundMissingOf(new ApiError({ status: 422, code: "INBOUND_RENTAL_INCOMPLETE", details: { missing: ["supplier", "site", 3] } }))).toEqual(["supplier", "site"]);
    expect(inboundMissingOf(new ApiError({ status: 409, code: "CONFLICT" }))).toBeNull();
    expect(isBillingFailure(new ApiError({ status: 502, code: "RENTAL_BILLING_DOCUMENT_FAILED" }))).toBe(true);
    expect(isBillingFailure(null)).toBe(false);
  });

  it("extends only reserved or active rentals, and only to a later end", () => {
    expect(canExtend("RESERVED")).toBe(true);
    expect(canExtend("ACTIVE")).toBe(true);
    expect(canExtend("RETURNED")).toBe(false);
    expect(extendBody("2026-11-05T08:00", "2026-11-03T11:00:00.000Z")).toEqual({ newPlannedEnd: "2026-11-05T11:00:00.000Z" });
    expect(extendBody("2026-11-03T08:00", "2026-11-03T11:00:00.000Z")).toBeNull();
    expect(extendBody("", "2026-11-03T11:00:00.000Z")).toBeNull();
  });

  it("builds the calendar window and clamps booking bars to it", () => {
    expect(shiftDay("2026-02-27", 2)).toBe("2026-03-01");
    const range = calendarWindow("2026-11-01", 4);
    expect(range).toEqual({ from: "2026-11-01T03:00:00.000Z", to: "2026-11-05T03:00:00.000Z", days: ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"] });
    expect(barPosition({ start: "2026-11-02T03:00:00.000Z", end: "2026-11-03T03:00:00.000Z" }, range)).toEqual({ left: 25, width: 25 });
    expect(barPosition({ start: "2026-10-20T00:00:00.000Z", end: "2026-11-02T03:00:00.000Z" }, range)).toEqual({ left: 0, width: 25 });
    expect(barPosition({ start: "2026-12-01T00:00:00.000Z", end: "2026-12-02T00:00:00.000Z" }, range)).toBeNull();
  });

  it("groups bookings by machine code and start", () => {
    const rows = groupByAsset([
      { assetId: "b", assetCode: "AGR-2", start: "2026-11-02" },
      { assetId: "a", assetCode: "AGR-1", start: "2026-11-03" },
      { assetId: "a", assetCode: "AGR-1", start: "2026-11-01" },
    ]);
    expect(rows.map((r) => [r.assetCode, r.items.map((i) => i.start)])).toEqual([
      ["AGR-1", ["2026-11-01", "2026-11-03"]],
      ["AGR-2", ["2026-11-02"]],
    ]);
  });
});
