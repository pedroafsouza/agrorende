import { describe, expect, it } from "vitest";

import { compareAppVersions } from "./sync.js";

describe("compareAppVersions", () => {
  it("orders dotted numeric versions numerically", () => {
    expect(compareAppVersions("1.2.10", "1.2.9")).toBe(1);
    expect(compareAppVersions("1.0.0", "1.2.0")).toBe(-1);
    expect(compareAppVersions("2.0", "2.0.0")).toBe(0);
    expect(compareAppVersions("1.3.0-beta.1", "1.3.0")).toBe(0);
  });
});
