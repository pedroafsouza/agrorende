import { describe, expect, it } from "vitest";

import en from "../../../messages/en/parts.json";
import ptBR from "../../../messages/pt-BR/parts.json";
import enMaintenance from "../../../messages/en/maintenance.json";
import ptMaintenance from "../../../messages/pt-BR/maintenance.json";
import { dueTone, EMPTY_PLAN_FORM, planBody } from "../maintenance/types";
import { EMPTY_MOVEMENT_FORM, levelTone, locationBody, movementBody, partBody } from "./types";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix.length === 0 ? key : `${prefix}.${key}`));
}

describe("parts form bodies", () => {
  it("sends the minimum stock as a number and defaults the unit", () => {
    expect(partBody({ sku: " FO-200 ", name: "Filtro", unit: " ", unitCostCents: 4_500, minStock: "2,5", compatibleCategories: ["TRACTOR"] })).toEqual({
      sku: "FO-200",
      name: "Filtro",
      unit: "un",
      unitCostCents: 4_500,
      minStock: 2.5,
      compatibleCategories: ["TRACTOR"],
    });
  });

  it("sends only the locations a movement type uses", () => {
    expect(movementBody({ ...EMPTY_MOVEMENT_FORM, type: "IN", partId: "p", quantity: "10", toLocationId: "w", fromLocationId: "ignored", unitCostCents: 900 })).toEqual({ type: "IN", partId: "p", quantity: 10, toLocationId: "w", unitCostCents: 900 });
    expect(movementBody({ ...EMPTY_MOVEMENT_FORM, type: "TRANSFER", partId: "p", quantity: "4", fromLocationId: "w", toLocationId: "v", note: " van " })).toEqual({ type: "TRANSFER", partId: "p", quantity: 4, fromLocationId: "w", toLocationId: "v", note: "van" });
    expect(movementBody({ ...EMPTY_MOVEMENT_FORM, type: "ADJUSTMENT", partId: "p", quantity: "-1", toLocationId: "w", unitCostCents: 900 })).toEqual({ type: "ADJUSTMENT", partId: "p", quantity: -1, toLocationId: "w" });
  });

  it("drops the technician from a warehouse", () => {
    expect(locationBody({ name: "Central", type: "WAREHOUSE", userId: "u" })).toEqual({ name: "Central", type: "WAREHOUSE", userId: null });
    expect(locationBody({ name: "Van", type: "VAN", userId: "u" })).toEqual({ name: "Van", type: "VAN", userId: "u" });
  });

  it("colours levels with words: negative, low, in stock", () => {
    expect(levelTone({ quantity: -1, isLow: true })).toBe("danger");
    expect(levelTone({ quantity: 1, isLow: true })).toBe("warning");
    expect(levelTone({ quantity: 5, isLow: false })).toBe("success");
  });
});

describe("maintenance form body", () => {
  it("clears the interval the trigger does not use and the baseline of category plans", () => {
    expect(planBody({ ...EMPTY_PLAN_FORM, name: "Óleo", target: "category", assetCategory: "TRACTOR", trigger: "HOURS", intervalHours: "250", intervalDays: "30", lastDoneHourMeter: "10" })).toEqual({
      name: "Óleo",
      assetId: null,
      assetCategory: "TRACTOR",
      trigger: "HOURS",
      intervalHours: 250,
      intervalDays: null,
      lastDoneHourMeter: null,
      lastDoneAt: null,
      leadHours: 25,
      leadDays: 7,
    });
    expect(planBody({ ...EMPTY_PLAN_FORM, name: "Revisão", assetId: "a", trigger: "CALENDAR", intervalDays: "180", lastDoneAt: "2026-03-01" })).toMatchObject({ assetId: "a", intervalHours: null, intervalDays: 180, lastDoneAt: "2026-03-01T00:00:00-03:00" });
  });

  it("shows an open job before overdue and due", () => {
    expect(dueTone({ hasOpen: true, isOverdue: true, isDue: true })).toBe("info");
    expect(dueTone({ hasOpen: false, isOverdue: true, isDue: true })).toBe("danger");
    expect(dueTone({ hasOpen: false, isOverdue: false, isDue: true })).toBe("warning");
    expect(dueTone({ hasOpen: false, isOverdue: false, isDue: false })).toBe("success");
  });
});

describe("parts and maintenance messages", () => {
  it("have the same keys in pt-BR and en", () => {
    expect(keys(ptBR).sort()).toEqual(keys(en).sort());
    expect(keys(ptMaintenance).sort()).toEqual(keys(enMaintenance).sort());
  });
});
