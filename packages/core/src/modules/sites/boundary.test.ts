import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createHarness, type Harness } from "../assets/testing/harness.js";
import { getPlot } from "./queries.js";
import { createPlot, createSite, updatePlot } from "./service.js";

/*
 * T16.5: a boundary drawn on the site page is saved through `PATCH /plots/:id` and read back.
 * The reference area uses the spherical ring-area formula (the one GeoJSON tools such as
 * turf use), independent of the planar projection in `geometry.ts`.
 */
let h: Harness;

beforeAll(async () => {
  h = await createHarness("t16_boundary");
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  for (const name of ["sites", "plots", "activity_events"]) await h.raw(name).deleteMany({});
});

const WGS84_RADIUS_M = 6_378_137;

function sphericalAreaHa(ring: readonly (readonly [number, number])[]): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  let total = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lng1, lat1] = ring[i] ?? [0, 0];
    const [lng2, lat2] = ring[i + 1] ?? [0, 0];
    total += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * WGS84_RADIUS_M * WGS84_RADIUS_M) / 2) / 10_000;
}

/** An irregular soybean field in Sorriso (MT), about 2.4 km across, as terra-draw emits it (closed ring, 6-decimal precision). */
const FIELD: [number, number][] = [
  [-55.721534, -12.545812],
  [-55.700921, -12.546303],
  [-55.698774, -12.561127],
  [-55.709412, -12.566938],
  [-55.722866, -12.559455],
  [-55.721534, -12.545812],
];

describe("plot boundary round-trip (T16.5)", () => {
  it("recomputes area within 1 percent of the reference after save and reload", async () => {
    const site = await h.run((tx) => createSite(tx, h.ctx, { name: "Fazenda Santa Luzia", type: "FARM", lat: -12.55, lng: -55.71 }));
    const plot = await h.run((tx) => createPlot(tx, h.ctx, site.id, { name: "Talhão 7", areaHa: 50 }));
    expect(plot.areaHa).toBe(50);

    const saved = await h.run((tx) => updatePlot(tx, h.ctx, plot.id, { boundary: { type: "Polygon", coordinates: [FIELD] }, areaHa: null, centroidLat: null, centroidLng: null }, plot.syncVersion));
    const reloaded = await getPlot(h.ctx, plot.id);

    const reference = sphericalAreaHa(FIELD);
    expect(reference).toBeGreaterThan(200);
    expect(reloaded.boundary?.coordinates).toEqual([FIELD]);
    expect(reloaded.areaHa).toBe(saved.areaHa);
    expect(Math.abs((reloaded.areaHa ?? 0) - reference) / reference).toBeLessThan(0.01);
    expect(reloaded.centroidLat).toBeCloseTo(-12.556, 2);
    expect(reloaded.centroidLng).toBeCloseTo(-55.711, 2);
  });

  it("clears the derived area when the boundary is removed, and keeps a typed area when given", async () => {
    const site = await h.run((tx) => createSite(tx, h.ctx, { name: "Fazenda Rio Claro", type: "FARM" }));
    const plot = await h.run((tx) => createPlot(tx, h.ctx, site.id, { name: "Talhão 1", boundary: { type: "Polygon", coordinates: [FIELD] } }));
    expect(plot.areaHa).toBeGreaterThan(200);
    const cleared = await h.run((tx) => updatePlot(tx, h.ctx, plot.id, { boundary: null, areaHa: 12.5 }, plot.syncVersion));
    expect(cleared.boundary ?? null).toBeNull();
    expect(cleared.areaHa).toBe(12.5);
  });
});
