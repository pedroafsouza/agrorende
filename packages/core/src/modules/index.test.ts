import { describe, expect, it } from "vitest";

import * as modules from "./index.js";

describe("module barrel", () => {
  it("exports every foundation module service namespace", () => {
    expect(Object.keys(modules).sort()).toEqual([
      "assets",
      "billing",
      "checklists",
      "comments",
      "costs",
      "customers",
      "devices",
      "exportsModule",
      "fieldReports",
      "fuel",
      "locations",
      "maintenance",
      "media",
      "notifications",
      "ops",
      "parts",
      "rentals",
      "seasons",
      "sites",
      "tenancy",
      "users",
      "workOrders",
    ]);
  });
});
