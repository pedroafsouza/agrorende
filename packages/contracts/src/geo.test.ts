import { describe, expect, it } from "vitest";
import { resolveDestination } from "./geo.js";

describe("resolveDestination", () => {
  it("prefers the asset point", () => {
    expect(
      resolveDestination({
        asset: { lat: -23.1, lng: -46.2 },
        site: { lat: -24.1, lng: -47.2, address: "Estrada 1" },
        fieldReport: { lat: -25.1, lng: -48.2 },
      }),
    ).toEqual({ kind: "point", source: "asset", lat: -23.1, lng: -46.2 });
  });

  it("uses the site point when the asset point is missing", () => {
    expect(
      resolveDestination({
        asset: { lat: null, lng: -46.2 },
        site: { lat: -24.1, lng: -47.2, name: "Fazenda Norte", address: "Estrada 1" },
        fieldReport: { lat: -25.1, lng: -48.2 },
      }),
    ).toEqual({ kind: "point", source: "site", lat: -24.1, lng: -47.2, note: "Fazenda Norte" });
  });

  it("uses the site address as a query-only destination before field-report coordinates", () => {
    expect(
      resolveDestination({
        site: { address: "Estrada Municipal 100", city: "Ribeirão Preto", state: "SP", name: "Fazenda Sul" },
        fieldReport: { lat: -25.1, lng: -48.2 },
      }),
    ).toEqual({ kind: "query", source: "siteAddress", query: "Estrada Municipal 100, Ribeirão Preto, SP", note: "Fazenda Sul" });
  });

  it("uses the field-report location after asset, site point and site address are absent", () => {
    expect(resolveDestination({ fieldReport: { lat: -25.1, lng: -48.2 } })).toEqual({
      kind: "point",
      source: "fieldReport",
      lat: -25.1,
      lng: -48.2,
    });
  });
});
