import { describe, expect, it } from "vitest";

import type { OpsView } from "./filters";
import { dataBounds, fallbackCenter } from "./mapBounds";

const empty: OpsView = { operators: [], reports: [], workOrders: [], assets: [], rentals: [] };

describe("dataBounds", () => {
  it("returns null when nothing has a position", () => {
    expect(dataBounds(empty)).toBeNull();
  });

  it("covers every positioned item and plot, ignoring 0,0 and missing positions", () => {
    const view = {
      ...empty,
      reports: [{ lng: -47.1, lat: -22.9 }, { lng: 0, lat: 0 }],
      assets: [{ lng: -47.5, lat: -22.5 }, { lng: null, lat: null }],
    } as unknown as OpsView;
    const boundaries = { features: [{ geometry: { type: "Polygon", coordinates: [[[-47.9, -23.1], [-47.8, -23.0]]] } }] } as never;
    expect(dataBounds(view, boundaries)).toEqual([
      [-47.9, -23.1],
      [-47.1, -22.5],
    ]);
  });
});

describe("fallbackCenter", () => {
  it("uses the organisation time zone, else Brazil", () => {
    expect(fallbackCenter("America/Cuiaba").zoom).toBeGreaterThan(5);
    expect(fallbackCenter(undefined)).toEqual({ longitude: -51.9, latitude: -14.2, zoom: 4 });
    expect(fallbackCenter("Europe/Lisbon").zoom).toBe(4);
  });
});
