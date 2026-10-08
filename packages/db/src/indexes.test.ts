import { describe, expect, it } from "vitest";

import { COLLECTION_NAMES } from "./collections.js";
import { INDEXES } from "./indexes.js";
import { documentSchemas } from "./schemas/index.js";

describe("db foundation metadata", () => {
  it("has one document schema per collection", () => {
    expect(Object.keys(documentSchemas).sort()).toEqual([...COLLECTION_NAMES].sort());
  });

  it("includes every architecture index definition", () => {
    expect(INDEXES).toHaveLength(61);
    expect(INDEXES.filter((index) => index.options?.expireAfterSeconds !== undefined)).toHaveLength(3);
  });
});
