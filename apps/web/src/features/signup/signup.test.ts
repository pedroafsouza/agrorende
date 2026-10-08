import { describe, expect, it } from "vitest";

import { defaultTimezone, safeRedirect, signupBody, signupFieldErrorKey, toE164 } from "./helpers";
import { legalUrls } from "./legal";

describe("signup helpers", () => {
  it("keeps Brazilian browser zones and falls back to São Paulo", () => {
    expect(defaultTimezone("America/Manaus")).toBe("America/Manaus");
    expect(defaultTimezone("Europe/Lisbon")).toBe("America/Sao_Paulo");
    expect(defaultTimezone(undefined)).toBe("America/Sao_Paulo");
  });

  it("normalises office phones to E.164", () => {
    expect(toE164("(34) 3333-4444")).toBe("+553433334444");
    expect(toE164("+55 34 99999-0000")).toBe("+5534999990000");
    expect(toE164("5534999990000")).toBe("+5534999990000");
    expect(toE164("  ")).toBe("");
  });

  it("only follows same-origin paths or the app scheme after sign-up", () => {
    expect(safeRedirect("/assets")).toBe("/assets");
    expect(safeRedirect("agrorende://auth/done")).toBe("agrorende://auth/done");
    expect(safeRedirect("//evil.example")).toBe("/ops");
    expect(safeRedirect("https://evil.example")).toBe("/ops");
    expect(safeRedirect(null)).toBe("/ops");
  });

  it("builds the request body and drops empty optional fields", () => {
    const body = signupBody("tkt", { name: " Fazenda ", officePhone: "(34) 3333-4444", taxId: "", city: "Uberaba", state: "MG", timezone: "America/Sao_Paulo", locale: "pt-BR", expectedFieldUsers: "6-20", acceptTerms: true });
    expect(body).toEqual({ ticket: "tkt", name: "Fazenda", officePhone: "+553433334444", taxId: undefined, city: "Uberaba", state: "MG", timezone: "America/Sao_Paulo", locale: "pt-BR", expectedFieldUsers: "6-20", acceptTerms: true });
  });

  it("maps server field errors to message keys", () => {
    expect(signupFieldErrorKey("acceptTerms", "invalid_literal")).toBe("terms_required");
    expect(signupFieldErrorKey("officePhone", "invalid_string")).toBe("phone_invalid");
    expect(signupFieldErrorKey("taxId", "cnpj_invalid")).toBe("cnpj_invalid");
    expect(signupFieldErrorKey("name", "custom")).toBe("invalid");
  });

  it("links the legal pages of the public site in the request locale", () => {
    expect(legalUrls("https://agrorende.app/", "pt-BR").termsUrl).toBe("https://agrorende.app/pt-br/termos");
    expect(legalUrls("https://agrorende.app", "en").dpaUrl).toBe("https://agrorende.app/en/dpa");
  });
});
