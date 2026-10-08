import { describe, expect, it } from "vitest";

import { formatMoney, parseLocaleNumber, resolveLocale } from "../src/index.js";

describe("resolveLocale", () => {
  it("uses exact match before language match", () => {
    expect(resolveLocale(["en"])).toBe("en");
    expect(resolveLocale(["pt-BR"])).toBe("pt-BR");
  });

  it("uses language match and falls back to pt-BR", () => {
    expect(resolveLocale(["en-US"])).toBe("en");
    expect(resolveLocale(["pt-PT"])).toBe("pt-BR");
    expect(resolveLocale(["fr-FR"])).toBe("pt-BR");
  });
});

describe("formatMoney", () => {
  it("formats cents for pt-BR", () => {
    expect(formatMoney(123456, "BRL", "pt-BR")).toBe("R$ 1.234,56");
  });

  it("formats cents for en", () => {
    expect(formatMoney(123456, "USD", "en")).toBe("$1,234.56");
  });
});

describe("parseLocaleNumber", () => {
  it("parses comma decimal with dot grouping", () => {
    expect(parseLocaleNumber("1.234,56", "pt-BR")).toBe(1234.56);
  });

  it("parses dot decimal with comma grouping", () => {
    expect(parseLocaleNumber("1,234.56", "en")).toBe(1234.56);
  });

  it("rejects ambiguous thousands groupings", () => {
    expect(Number.isNaN(parseLocaleNumber("1.234", "pt-BR"))).toBe(true);
    expect(Number.isNaN(parseLocaleNumber("1,234", "en"))).toBe(true);
  });
});
