import { afterEach, describe, expect, it, vi } from "vitest";

import { satelliteTilesUrl } from "./filters";

describe("satelliteTilesUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is null when NEXT_PUBLIC_SATELLITE_TILES_URL is unset or blank", () => {
    vi.stubEnv("NEXT_PUBLIC_SATELLITE_TILES_URL", "");
    expect(satelliteTilesUrl()).toBeNull();
    expect(satelliteTilesUrl("   ")).toBeNull();
    expect(satelliteTilesUrl(undefined)).toBeNull();
  });

  it("returns the configured XYZ template", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SATELLITE_TILES_URL",
      " https://tiles.example.com/{z}/{x}/{y}.jpg ",
    );
    expect(satelliteTilesUrl()).toBe(
      "https://tiles.example.com/{z}/{x}/{y}.jpg",
    );
  });
});
