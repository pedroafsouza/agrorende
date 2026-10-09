import { describe, expect, it } from "vitest";

import { displayPhone, mailtoHref, readSiteConfig, whatsappHref } from "./config";
import { localeFromAcceptLanguage } from "./locales";

describe("readSiteConfig", () => {
  it("uses production defaults and hides prices unless SITE_SHOW_PRICES=true", () => {
    const config = readSiteConfig({});
    expect(config.siteUrl).toBe("https://agrorende.com.br");
    expect(config.appUrl).toBe("https://app.agrorende.com.br");
    expect(config.showPrices).toBe(false);
    expect(config.appStoreUrl).toBeUndefined();
    expect(config.playStoreUrl).toBeUndefined();
    expect(readSiteConfig({ SITE_SHOW_PRICES: "TRUE" }).showPrices).toBe(true);
    expect(readSiteConfig({ SITE_SHOW_PRICES: "1" }).showPrices).toBe(false);
  });

  it("accepts only http(s) URLs and strips the trailing slash", () => {
    const config = readSiteConfig({
      APP_URL: "https://app.example.com/",
      SITE_APP_STORE_URL: "javascript:alert(1)",
      SITE_PLAY_STORE_URL: "https://play.google.com/store/apps/details?id=br.com.agrorende",
    });
    expect(config.appUrl).toBe("https://app.example.com");
    expect(config.appStoreUrl).toBeUndefined();
    expect(config.playStoreUrl).toBe("https://play.google.com/store/apps/details?id=br.com.agrorende");
  });

  it("falls back from SITE_WHATSAPP to PLATFORM_SUPPORT_WHATSAPP", () => {
    expect(readSiteConfig({ PLATFORM_SUPPORT_WHATSAPP: "+55 11 98888-7777" }).whatsappNumber).toBe("+55 11 98888-7777");
    expect(readSiteConfig({ SITE_WHATSAPP: "+5511900000000", PLATFORM_SUPPORT_WHATSAPP: "x" }).whatsappNumber).toBe("+5511900000000");
  });
});

describe("contact links", () => {
  it("builds wa.me links with digits only and encoded prefilled text", () => {
    expect(whatsappHref("+55 (11) 99999-9999", "Olá! Quero saber mais.")).toBe(
      "https://wa.me/5511999999999?text=Ol%C3%A1!%20Quero%20saber%20mais.",
    );
  });

  it("builds mailto links with subject and body", () => {
    expect(mailtoHref("contato@agrorende.com.br", "Oi & tchau", "Linha 1")).toBe(
      "mailto:contato@agrorende.com.br?subject=Oi%20%26%20tchau&body=Linha%201",
    );
  });

  it("formats Brazilian numbers for reading", () => {
    expect(displayPhone("+5511999999999")).toBe("+55 11 99999-9999");
    expect(displayPhone("+1 555 0100")).toBe("+1 555 0100");
  });
});

describe("localeFromAcceptLanguage", () => {
  it("sends en* to English and everything else to Portuguese", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt-br");
    expect(localeFromAcceptLanguage("es-AR")).toBe("pt-br");
    expect(localeFromAcceptLanguage(undefined)).toBe("pt-br");
  });
});
