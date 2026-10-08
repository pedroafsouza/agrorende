import { describe, expect, it } from "vitest";

import { patchBody } from "./PlatformOrgDetailPage";

const org = { status: "TRIAL", plan: "trial", trialEndsAt: "2026-11-30T23:59:59.000Z" } as const;

describe("patchBody", () => {
  it("returns null when nothing changed", () => {
    expect(patchBody(org, { status: "TRIAL", plan: "trial", trialEndsAt: "2026-11-30", reason: "no-op" })).toBeNull();
  });

  it("sends only the changed fields with the trimmed reason", () => {
    expect(patchBody(org, { status: "TRIAL", plan: "trial", trialEndsAt: "2026-12-15", reason: "  Pediu mais tempo  " })).toEqual({ trialEndsAt: "2026-12-15T23:59:59.000Z", reason: "Pediu mais tempo" });
    expect(patchBody(org, { status: "SUSPENDED", plan: "pro", trialEndsAt: "2026-11-30", reason: "Inadimplente" })).toEqual({ status: "SUSPENDED", plan: "pro", reason: "Inadimplente" });
  });
});
