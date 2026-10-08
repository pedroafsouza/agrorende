import { describe, expect, it } from "vitest";

import { campoClaroPalette, semanticStatus } from "../src/index.js";

describe("Campo claro palette", () => {
  it("exports the normative palette values", () => {
    expect(campoClaroPalette["mata-600"]).toBe("#2B8A3E");
    expect(campoClaroPalette["mata-700"]).toBe("#237032");
    expect(campoClaroPalette["mata-800"]).toBe("#1B5E2A");
    expect(campoClaroPalette["mata-400"]).toBe("#51CF66");
    expect(campoClaroPalette["terra-600"]).toBe("#E8590C");
    expect(campoClaroPalette["terra-700"]).toBe("#C2410C");
    expect(campoClaroPalette["graphite-950"]).toBe("#111315");
    expect(campoClaroPalette["graphite-900"]).toBe("#1C1F23");
    expect(campoClaroPalette["graphite-700"]).toBe("#3D434B");
    expect(campoClaroPalette["graphite-500"]).toBe("#6B7280");
    expect(campoClaroPalette["graphite-200"]).toBe("#E3E6EA");
    expect(campoClaroPalette["graphite-100"]).toBe("#F1F3F5");
    expect(campoClaroPalette["graphite-50"]).toBe("#F8F9FA");
    expect(campoClaroPalette.success).toBe("#237032");
    expect(campoClaroPalette.warning).toEqual({ text: "#A15C07", fill: "#F2B705", onFill: "#1C1F23" });
    expect(campoClaroPalette.danger).toEqual({ light: "#B42318", dark: "#F97066" });
    expect(campoClaroPalette.info).toEqual({ light: "#1D4ED8", dark: "#60A5FA" });
    expect(campoClaroPalette.neutral).toBe("#3D434B");
  });
});

describe("semantic statuses", () => {
  it("carries colour, icon and word for every mapped status", () => {
    for (const namespace of Object.values(semanticStatus)) {
      for (const token of Object.values(namespace)) {
        expect(token.color).toMatch(/^#/);
        expect(token.icon.length).toBeGreaterThan(0);
        expect(token.word.length).toBeGreaterThan(0);
      }
    }
  });
});
