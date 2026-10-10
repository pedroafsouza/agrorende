import { describe, expect, it } from "vitest";
import { RoleEnum } from "@agrorende/contracts/enums";
import { TABLE_ORDER } from "@agrorende/contracts/sync";

import { buildScopeFilter } from "./scopes";

describe("scope builders", () => {
  it("always include organizationId", () => {
    for (const table of TABLE_ORDER) {
      for (const role of RoleEnum.options) {
        const filter = buildScopeFilter(table, {
          organizationId: "org_1",
          userId: "user_1",
          role,
          now: new Date("2026-10-08T00:00:00.000Z"),
        });
        expect(filter).toHaveProperty("organizationId", "org_1");
      }
    }
  });
});
