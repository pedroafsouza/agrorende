import { describe, expect, it } from "vitest";
import { isValidCnpj, isValidCpf, isValidTaxId, maskTaxId, normalizeTaxId, taxIdKind } from "./validators";

describe("CPF validation", () => {
  it("accepts a valid CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidTaxId("52998224725")).toBe(true);
    expect(taxIdKind("52998224725")).toBe("CPF");
  });

  it("rejects an invalid CPF check digit", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
  });

  it("rejects repeated CPF digits", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });

  it("rejects the wrong CPF length", () => {
    expect(isValidCpf("5299822472")).toBe(false);
    expect(taxIdKind("5299822472")).toBeNull();
  });
});

describe("CNPJ validation", () => {
  it("accepts a valid CNPJ", () => {
    expect(isValidCnpj("04.252.011/0001-10")).toBe(true);
    expect(isValidTaxId("04252011000110")).toBe(true);
    expect(taxIdKind("04252011000110")).toBe("CNPJ");
  });

  it("rejects an invalid CNPJ check digit", () => {
    expect(isValidCnpj("04.252.011/0001-11")).toBe(false);
  });

  it("rejects repeated CNPJ digits", () => {
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });

  it("rejects the wrong CNPJ length", () => {
    expect(isValidCnpj("0425201100011")).toBe(false);
  });
});

describe("taxId helpers", () => {
  it("normalizes punctuation", () => {
    expect(normalizeTaxId("529.982.247-25")).toBe("52998224725");
  });

  it("masks CPF values", () => {
    expect(maskTaxId("123.456.789-01")).toBe("•••.•••.789-01");
  });

  it("masks CNPJ values", () => {
    expect(maskTaxId("12.345.678/0001-23")).toBe("••.•••.•••/0001-23");
  });
});
