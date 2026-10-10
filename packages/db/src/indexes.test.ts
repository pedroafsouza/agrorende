import { describe, expect, it } from "vitest";

import { COLLECTION_NAMES } from "./collections";
import { INDEXES, PERF_QUERY_INDEXES } from "./indexes";
import { documentSchemas } from "./schemas/index";

describe("db foundation metadata", () => {
  it("has one document schema per collection", () => {
    expect(Object.keys(documentSchemas).sort()).toEqual([...COLLECTION_NAMES].sort());
  });

  it("includes every architecture index definition", () => {
    expect(INDEXES).toHaveLength(59 + PERF_QUERY_INDEXES.length);
    expect(PERF_QUERY_INDEXES).toHaveLength(11);
    expect(INDEXES.filter((index) => index.options?.expireAfterSeconds !== undefined)).toHaveLength(3);
  });
});
