import { describe, expect, it } from "vitest";

import en from "../../../messages/en/reports.json";
import ptBR from "../../../messages/pt-BR/reports.json";

import { linkAssetErrors } from "./LinkAssetDialog";
import { markForRepairBody } from "./MarkForRepairDialog";
import { reportFlagKeys, statusQuery } from "./types";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix.length === 0 ? k : `${prefix}.${k}`));
}

describe("reports messages", () => {
  it("has the same keys in pt-BR and en", () => {
    expect(keys(en).sort()).toEqual(keys(ptBR).sort());
  });

  it("has a label for every issue category", async () => {
    const { IssueCategoryEnum, SuggestedActionEnum } = await import("@agrorende/contracts/enums");
    for (const c of IssueCategoryEnum.options) expect(ptBR.category).toHaveProperty(c);
    for (const a of SuggestedActionEnum.options) expect(ptBR.suggestedAction).toHaveProperty(a);
  });
});

describe("report helpers", () => {
  it("drops the status filter for ALL", () => {
    expect(statusQuery("ALL")).toBeUndefined();
    expect(statusQuery("SUBMITTED,IN_REVIEW")).toBe("SUBMITTED,IN_REVIEW");
  });

  it("lists flags with the busy-asset warning first", () => {
    expect(reportFlagKeys({ assetRentedOut: true, busyAsset: true, clockSkewed: true }, "d1")).toEqual(["busyAsset", "assetRentedOut", "clockSkewed", "fromDamage"]);
    expect(reportFlagKeys(null, null)).toEqual([]);
  });

  it("builds the mark-for-repair body for attach and create-anyway", () => {
    const values = { title: "  Leak  ", priority: "HIGH" as const, assigneeId: null, scheduledFor: "" };
    expect(markForRepairBody(values)).toEqual({ title: "Leak", priority: "HIGH", assigneeId: undefined, scheduledFor: undefined, existing: undefined, reason: undefined });
    expect(markForRepairBody(values, { mode: "createAnyway", reason: "Second machine" })).toMatchObject({ existing: "createAnyway", reason: "Second machine" });
  });
});

describe("link-asset form (FR-22)", () => {
  it("requires a picked asset or a name for a new one", () => {
    expect(linkAssetErrors({ mode: "existing", assetId: null, name: "", category: "OTHER" })).toEqual({ assetId: "pickRequired" });
    expect(linkAssetErrors({ mode: "existing", assetId: "a1", name: "", category: "OTHER" })).toEqual({});
    expect(linkAssetErrors({ mode: "create", assetId: null, name: "  ", category: "OTHER" })).toEqual({ name: "nameRequired" });
    expect(linkAssetErrors({ mode: "create", assetId: null, name: "Carreta", category: "IMPLEMENT" })).toEqual({});
  });
});
