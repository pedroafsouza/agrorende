import { ALL_ERROR_CODES } from "@agrorende/contracts/errors";
import { describe, expect, it } from "vitest";

import { SITE_LOCALES } from "../lib/locales";
import { errorCopy, getTranslator, SITE_MESSAGES, splitList } from "./messages";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix.length === 0 ? key : `${prefix}.${key}`));
}

function leaf(messages: unknown, key: string): string {
  return String(key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages));
}

function listCount(value: string): number {
  return value.includes("|") ? splitList(value).length : 1;
}

describe("site messages", () => {
  it("have the same keys in pt-BR and en", () => {
    expect(keys(SITE_MESSAGES.en).sort()).toEqual(keys(SITE_MESSAGES["pt-br"]).sort());
  });

  it("have no empty strings and the same list lengths and ICU arguments in both locales", () => {
    for (const key of keys(SITE_MESSAGES["pt-br"])) {
      const pt = leaf(SITE_MESSAGES["pt-br"], key);
      const en = leaf(SITE_MESSAGES.en, key);
      expect(pt.trim().length, key).toBeGreaterThan(0);
      expect(en.trim().length, key).toBeGreaterThan(0);
      expect(listCount(en), key).toBe(listCount(pt));
      const args = (text: string) => [...text.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort();
      expect(args(en), key).toEqual(args(pt));
    }
  });

  it("format with next-intl", () => {
    expect(getTranslator("pt-br")("footer.copyright", { year: 2026 })).toContain("2026");
    expect(getTranslator("en")("footer.copyright", { year: 2026 })).toContain("2026");
  });
});

describe("errorCopy", () => {
  it("has copy for every error code in both locales without unresolved arguments", () => {
    for (const locale of SITE_LOCALES) {
      for (const code of ALL_ERROR_CODES) {
        const copy = errorCopy(locale, code);
        expect(copy, `${locale} ${code}`).toBeDefined();
        const text = `${copy?.title} ${copy?.body} ${copy?.action} ${copy?.help ?? ""}`;
        expect(text, `${locale} ${code}`).not.toMatch(/\{\w+\}/u);
      }
    }
  });

  it("returns undefined for unknown codes", () => {
    expect(errorCopy("en", "NOT_A_CODE")).toBeUndefined();
  });

  it("splits lists on the pipe", () => {
    expect(splitList(" a | b ||c ")).toEqual(["a", "b", "c"]);
  });
});
