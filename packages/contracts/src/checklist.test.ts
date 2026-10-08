import { describe, expect, it } from "vitest";
import { isChecklistComplete, validateChecklistResponse, type ChecklistItem, type ChecklistResponse } from "./checklist";

const item: ChecklistItem = {
  key: "brakes",
  label: { "pt-BR": "Freios", en: "Brakes" },
  type: "PASS_FAIL_NA",
  required: true,
  isSafetyCritical: true,
  photo: "ON_FAIL",
};

const response: ChecklistResponse = {
  key: "brakes",
  value: "FAIL",
  mediaIds: ["11111111-1111-4111-8111-111111111111"],
  answeredAt: "2026-11-01T08:00:00.000Z",
};

describe("checklist", () => {
  it("validates item values", () => {
    expect(validateChecklistResponse(item, "PASS")).toBe(true);
    expect(validateChecklistResponse({ ...item, type: "NUMBER", min: 1, max: 3 }, 2)).toBe(true);
    expect(validateChecklistResponse({ ...item, type: "NUMBER", min: 1, max: 3 }, 4)).toBe(false);
    expect(validateChecklistResponse({ ...item, type: "TEXT" }, "  note  ")).toBe(true);
    expect(validateChecklistResponse({ ...item, type: "TEXT" }, "   ")).toBe(false);
    expect(validateChecklistResponse({ ...item, type: "SELECT", options: [{ value: "A", label: { "pt-BR": "A", en: "A" } }] }, "A")).toBe(true);
  });

  it("requires valid media for failed ON_FAIL items", () => {
    expect(isChecklistComplete([item], [response], response.mediaIds)).toBe(true);
    expect(isChecklistComplete([item], [{ ...response, mediaIds: [] }], response.mediaIds)).toBe(false);
    expect(isChecklistComplete([item], [response], [])).toBe(false);
  });
});
