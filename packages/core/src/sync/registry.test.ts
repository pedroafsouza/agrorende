import { describe, expect, it } from "vitest";
import { MutationNameEnum } from "@agrorende/contracts/sync";

import { mutationRegistry } from "./registry.js";

describe("mutationRegistry", () => {
  it("covers every contract mutation name", () => {
    expect(Object.keys(mutationRegistry).sort()).toEqual([...MutationNameEnum.options].sort());
  });
});
