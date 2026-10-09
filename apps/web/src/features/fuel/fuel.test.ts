import { describe, expect, it } from "vitest";

import { EMPTY_FUEL_FORM, fuelBody, parseDecimal, previewTotalCents, validateFuelForm } from "./types";

const ASSET = "00000000-0000-4000-8000-0000000000a1";
const ID = "00000000-0000-4000-8000-0000000000f1";

describe("fuel form helpers", () => {
  it("parses decimals typed with either separator", () => {
    expect(parseDecimal("120,5")).toBe(120.5);
    expect(parseDecimal("1.234,5")).toBe(1234.5);
    expect(parseDecimal("80.25")).toBe(80.25);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("-3")).toBeNull();
  });

  it("requires a machine and positive litres and rejects unreadable readings", () => {
    expect(validateFuelForm(EMPTY_FUEL_FORM)).toEqual({ assetId: "required", liters: "required" });
    expect(validateFuelForm({ ...EMPTY_FUEL_FORM, assetId: ASSET, liters: "0", hourMeter: "x", odometerKm: "12" })).toEqual({ liters: "invalid", hourMeter: "invalid" });
    expect(validateFuelForm({ ...EMPTY_FUEL_FORM, assetId: ASSET, liters: "50" })).toEqual({});
  });

  it("builds the body with the client id and only the fields that were filled", () => {
    expect(fuelBody({ ...EMPTY_FUEL_FORM, assetId: ASSET, liters: "50,5" }, ID)).toEqual({ id: ID, assetId: ASSET, liters: 50.5, media: [] });
    const body = fuelBody({ ...EMPTY_FUEL_FORM, assetId: ASSET, liters: "40", pricePerLiterCents: 589, hourMeter: "1200,5", filledAt: "2026-03-01T08:00", notes: "  tank  " }, ID);
    expect(body).toEqual({ id: ID, assetId: ASSET, liters: 40, pricePerLiterCents: 589, hourMeter: 1200.5, filledAt: "2026-03-01T11:00:00.000Z", media: [], notes: "tank" });
  });

  it("previews the total in whole cents", () => {
    expect(previewTotalCents({ liters: "10,5", pricePerLiterCents: 599 })).toBe(6290);
    expect(previewTotalCents({ liters: "10", pricePerLiterCents: null })).toBeNull();
    expect(previewTotalCents({ liters: "", pricePerLiterCents: 599 })).toBeNull();
  });
});
