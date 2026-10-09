import { describe, expect, it } from "vitest";

import { billingActions, draftTotals, issueBody, linesBody, normaliseNfeKey, sourceHref, sourceQuery, tabStatus, type LineDraft } from "./types";

const line = (patch: Partial<LineDraft> = {}): LineDraft => ({ key: "k", description: "Labour", quantity: "2", unitAmountCents: 1500, ...patch });

describe("billing helpers", () => {
  it("maps tabs to statuses", () => {
    expect(tabStatus("ALL")).toBeUndefined();
    expect(tabStatus("ISSUED")).toBe("ISSUED");
    expect(tabStatus("bogus")).toBeUndefined();
  });

  it("mirrors the core transition matrix", () => {
    expect(billingActions("DRAFT")).toEqual({ edit: true, issue: true, pay: false, cancel: true });
    expect(billingActions("ISSUED")).toEqual({ edit: false, issue: false, pay: true, cancel: true });
    expect(billingActions("PAID")).toEqual({ edit: false, issue: false, pay: false, cancel: false });
    expect(billingActions("CANCELLED")).toEqual({ edit: false, issue: false, pay: false, cancel: false });
  });

  it("links back to the source", () => {
    expect(sourceHref({ source: "WORK_ORDER", workOrderId: "w1", rentalId: null })).toBe("/work-orders/w1");
    expect(sourceHref({ source: "RENTAL", workOrderId: null, rentalId: "r1" })).toBe("/rentals/r1");
    expect(sourceHref({ source: "MANUAL", workOrderId: null, rentalId: null })).toBeNull();
    expect(sourceQuery("WORK_ORDER", "w1")).toEqual({ workOrderId: "w1" });
    expect(sourceQuery("RENTAL", "r1")).toEqual({ rentalId: "r1" });
  });

  it("reports incomplete lines by index and totals the rest like the core", () => {
    const lines = [line(), line({ description: " " }), line({ quantity: "1,5", unitAmountCents: 333 }), line({ unitAmountCents: null })];
    expect(linesBody(lines)).toEqual({
      lines: [
        { description: "Labour", quantity: 2, unitAmountCents: 1500 },
        { description: "Labour", quantity: 1.5, unitAmountCents: 333 },
      ],
      invalid: [1, 3],
    });
    expect(draftTotals([line(), line({ quantity: "1,5", unitAmountCents: 333 })], 500)).toEqual({ subtotalCents: 3500, totalCents: 3000 });
  });

  it("validates the NF-e key and builds the issue body", () => {
    const key = "3526 0312 3456 7800 0199 5500 1000 0000 0110 0000 0010";
    expect(normaliseNfeKey("")).toEqual({ value: null, valid: true });
    expect(normaliseNfeKey("123").valid).toBe(false);
    expect(normaliseNfeKey(key)).toEqual({ value: key.replace(/\s/gu, ""), valid: true });
    expect(issueBody({ dueAt: "2026-04-10", nfeNumber: " 123 ", nfeKey: key })).toEqual({ dueAt: "2026-04-11T02:59:59.000Z", nfeNumber: "123", nfeKey: key.replace(/\s/gu, "") });
    expect(issueBody({ dueAt: "", nfeNumber: "", nfeKey: "" })).toEqual({});
  });
});
