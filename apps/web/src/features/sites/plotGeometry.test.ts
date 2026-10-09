import { describe, expect, it } from "vitest";

import { closeRing, formatRing, parseRing, ringAreaHa, ringBounds } from "./plotGeometry";

const SQUARE_KM: [number, number][] = [
  [-47.0, -22.0],
  [-46.99, -22.0],
  [-46.99, -21.99],
  [-47.0, -21.99],
  [-47.0, -22.0],
];

describe("plotGeometry", () => {
  it("computes the area of a roughly 1 km square in hectares", () => {
    const area = ringAreaHa(SQUARE_KM);
    expect(area).toBeGreaterThan(110);
    expect(area).toBeLessThan(115);
    expect(ringAreaHa(SQUARE_KM.slice(0, 3))).toBe(0);
  });

  it("parses corner lists in several separators and closes the ring", () => {
    const parsed = parseRing("-47, -22\n-46.99;-22\n\n-46.99 -21.99\n-47,-21.99");
    expect(parsed).toEqual({ ok: true, ring: SQUARE_KM });
    expect(parseRing("-47, -22\n-46.99, -22")).toEqual({ ok: false, problem: "tooFew" });
    expect(parseRing("-47\n-46.99, -22\n-46.99, -21.99")).toEqual({ ok: false, problem: "format" });
    expect(parseRing("abc, -22\n-46.99, -22\n-46.99, -21.99")).toEqual({
      ok: false,
      problem: "format",
    });
    expect(parseRing("-47, -95\n-46.99, -22\n-46.99, -21.99")).toEqual({
      ok: false,
      problem: "range",
    });
  });

  it("round-trips through the text form and reports bounds", () => {
    const text = formatRing(SQUARE_KM);
    expect(text.split("\n")).toHaveLength(4);
    expect(parseRing(text)).toEqual({ ok: true, ring: SQUARE_KM });
    expect(closeRing(SQUARE_KM)).toEqual(SQUARE_KM);
    expect(ringBounds(SQUARE_KM)).toEqual([-47, -22, -46.99, -21.99]);
    expect(ringBounds([])).toBeNull();
  });
});
