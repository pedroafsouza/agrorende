import { z } from "zod";

export const CpfSchema = z.string().refine(isValidCpf, "Invalid CPF");
export const CnpjSchema = z.string().refine(isValidCnpj, "Invalid CNPJ");
export const TaxIdSchema = z.string().refine(isValidTaxId, "Invalid CPF or CNPJ");

export type TaxIdKind = "CPF" | "CNPJ";

export function normalizeTaxId(value: string): string {
  return value.replace(/\D/g, "");
}

function allDigitsEqual(value: string): boolean {
  return value.length > 0 && value.split("").every((digit) => digit === value[0]);
}

function weightedCheckDigit(digits: string, weights: readonly number[]): number {
  const sum = weights.reduce((total, weight, index) => total + Number(digits.charAt(index)) * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(value: string): boolean {
  const digits = normalizeTaxId(value);
  if (digits.length !== 11 || allDigitsEqual(digits)) return false;

  const first = weightedCheckDigit(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = weightedCheckDigit(`${digits.slice(0, 9)}${first}`, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits === `${digits.slice(0, 9)}${first}${second}`;
}

export function isValidCnpj(value: string): boolean {
  const digits = normalizeTaxId(value);
  if (digits.length !== 14 || allDigitsEqual(digits)) return false;

  const first = weightedCheckDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = weightedCheckDigit(`${digits.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits === `${digits.slice(0, 12)}${first}${second}`;
}

export function taxIdKind(value: string): TaxIdKind | null {
  const digits = normalizeTaxId(value);
  if (digits.length === 11) return "CPF";
  if (digits.length === 14) return "CNPJ";
  return null;
}

export function isValidTaxId(value: string): boolean {
  const kind = taxIdKind(value);
  if (kind === "CPF") return isValidCpf(value);
  if (kind === "CNPJ") return isValidCnpj(value);
  return false;
}

export function maskTaxId(value: string): string {
  const digits = normalizeTaxId(value);
  if (digits.length === 11) {
    return `•••.•••.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }
  if (digits.length === 14) {
    return `••.•••.•••/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  return "";
}
