"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

import { isValidTaxId } from "@agrorende/contracts";

import { Input } from "@/components/ui/Field";
import { maskTaxId } from "@/lib/format";

export interface CpfCnpjInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  readonly value: string;
  readonly onChange: (masked: string) => void;
}

/** CPF/CNPJ field that masks as you type; the server stores digits only (ERP-02). */
export const CpfCnpjInput = forwardRef<HTMLInputElement, CpfCnpjInputProps>(function CpfCnpjInput({ value, onChange, ...rest }, ref) {
  return <Input {...rest} inputMode="numeric" maxLength={18} onChange={(e) => onChange(maskTaxId(e.target.value))} ref={ref} value={maskTaxId(value)} />;
});

export function taxIdError(value: string): "invalid" | null {
  const digits = value.replace(/\D/gu, "");
  if (digits.length === 0) return null;
  return isValidTaxId(digits) ? null : "invalid";
}
