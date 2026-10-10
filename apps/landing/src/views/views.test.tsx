import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { jsonLdString } from "../components/JsonLd";
import { FIELD_PRICE_CENTS, formatBrl, PricingView } from "./Pricing";

describe("pricing", () => {
  it("formats cents as BRL in both locales", () => {
    expect(formatBrl(FIELD_PRICE_CENTS, "pt-br").replace(/\s/gu, " ")).toBe("R$ 149");
    expect(formatBrl(14_950, "en")).toContain("149.50");
  });

  it("hides prices by default and shows the hypothesis only when enabled", () => {
    const hidden = renderToStaticMarkup(<PricingView locale="pt-br" showPrices={false} />);
    expect(hidden).toContain('data-prices="hidden"');
    expect(hidden).not.toContain("R$");
    const shown = renderToStaticMarkup(<PricingView locale="pt-br" showPrices />);
    expect(shown).toContain('data-prices="shown"');
    expect(shown).toContain('data-price="field"');
    expect(shown).toContain("data-price-hypothesis");
  });
});

describe("jsonLdString", () => {
  it("escapes < so the payload cannot close the script element", () => {
    const text = jsonLdString({ name: "</script><script>alert(1)</script>" });
    expect(text).not.toContain("</script>");
    expect(JSON.parse(text)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
