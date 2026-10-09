import { adjustLocation, buildCreatePayload, isLocationWeak, newReportDraft } from "../../src/features/reports/logic";

describe("FR-06 pin drag and job prefill", () => {
  test("dragging the pin replaces the fix, drops its accuracy and flags the payload", () => {
    const draft = { ...newReportDraft("r1", "a1"), lat: -15.6, lng: -56.1, accuracyM: 350 };
    expect(isLocationWeak(draft)).toBe(true);
    const moved = adjustLocation(draft, -15.61, -56.12);
    expect(moved).toMatchObject({ lat: -15.61, lng: -56.12, locationAdjusted: true });
    expect(moved.accuracyM).toBeUndefined();
    expect(isLocationWeak(moved)).toBe(false);
    const payload = buildCreatePayload(moved, "Outro");
    expect(payload).toMatchObject({ lat: -15.61, lng: -56.12, locationAdjusted: true });
    expect(payload.accuracyM).toBeUndefined();
  });

  test("a GPS fix alone is not marked adjusted", () => {
    const payload = buildCreatePayload({ ...newReportDraft("r2", "a1"), lat: 1, lng: 2, accuracyM: 10 }, "Outro");
    expect(payload.locationAdjusted).toBeUndefined();
  });

  test("While I'm here prefills the asset and the site", () => {
    const draft = newReportDraft("r3", "asset-1", "site-1");
    expect(draft).toMatchObject({ assetId: "asset-1", siteId: "site-1" });
    expect(buildCreatePayload(draft, "Outro").siteId).toBe("site-1");
    expect(newReportDraft("r4", "", "")).not.toHaveProperty("siteId");
  });
});
