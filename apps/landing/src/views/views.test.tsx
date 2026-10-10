import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { jsonLdString } from "../components/JsonLd";
import { FeaturesView } from "./Features";
import { HelpView } from "./Help";
import { HomeView } from "./Home";
import { LegalView } from "./Legal";
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
    expect(hidden).toContain("Pedir uma proposta");
    expect(hidden).not.toContain("data-price=\"example\"");
    const shown = renderToStaticMarkup(<PricingView locale="pt-br" showPrices />);
    expect(shown).toContain('data-prices="shown"');
    expect(shown).toContain('data-price="field"');
    expect(shown).toContain("data-price-hypothesis");
    expect(shown.replace(/\s/gu, " ")).toContain("Equipe com 5 técnicos: R$ 745 por mês");
    expect(shown).not.toContain("data-proposal");
  });
});

describe("home", () => {
  it("has one primary CTA label, WhatsApp as the only secondary and no e-mail button", () => {
    const html = renderToStaticMarkup(<HomeView locale="pt-br" showVideoLink />);
    expect(html).toContain("Saiba quanto cada máquina custa e rende");
    expect(html).toContain("Testar grátis por 30 dias");
    expect(html).toContain('data-contact="whatsapp"');
    expect(html).not.toContain('data-contact="email"');
    expect(html).toContain("/pt-br/recursos/#video");
    expect(renderToStaticMarkup(<HomeView locale="pt-br" showVideoLink={false} />)).not.toContain('data-cta="video"');
    for (const id of ["welcome", "report-offline", "flow-loop", "machine-cost", "saved-on-phone"]) {
      expect(html).toContain(`data-animation="${id}"`);
    }
    expect(html).not.toContain("data-placeholder");
    expect(html).not.toMatch(/ERP/u);
  });
});

describe("features", () => {
  it("shows the coming-soon animation until the video file exists", () => {
    const soon = renderToStaticMarkup(<FeaturesView locale="pt-br" assets={{ video: false, captions: false, poster: false }} />);
    expect(soon).toContain('id="video"');
    expect(soon).toContain('data-video="soon"');
    expect(soon).toContain("Vídeo de demonstração em breve");
    expect(soon).not.toContain("<video");
  });

  it("renders a captioned player that loads nothing until asked", () => {
    const html = renderToStaticMarkup(<FeaturesView locale="pt-br" assets={{ video: true, captions: true, poster: true }} />);
    expect(html).toContain('preload="none"');
    expect(html).toContain('src="/video/agrorende-demo-pt-BR.mp4"');
    expect(html).toMatch(/<track[^>]*kind="captions"[^>]*srcLang="pt-BR"[^>]*src="\/video\/agrorende-demo-pt-BR.vtt"/u);
    expect(html).toContain('poster="/video/agrorende-demo-pt-BR.jpg"');
  });
});

describe("help and legal", () => {
  it("puts contact and questions first and the error codes in a collapsed section", () => {
    const html = renderToStaticMarkup(<HelpView locale="pt-br" />);
    expect(html.indexOf('data-contact="whatsapp"')).toBeLessThan(html.indexOf('id="codigos"'));
    expect(html).toMatch(/<details id="codigos"(?![^>]*\bopen\b)[^>]*>/u);
    expect(html).toContain("Tem um código de erro do aplicativo?");
  });

  it("moves the legal review note to a footnote after the document", () => {
    const html = renderToStaticMarkup(<LegalView locale="pt-br" document="privacy" />);
    expect(html.indexOf("data-legal-review")).toBeGreaterThan(html.lastIndexOf("</section>"));
  });
});

describe("jsonLdString", () => {
  it("escapes < so the payload cannot close the script element", () => {
    const text = jsonLdString({ name: "</script><script>alert(1)</script>" });
    expect(text).not.toContain("</script>");
    expect(JSON.parse(text)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
