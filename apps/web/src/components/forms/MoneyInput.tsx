"use client";

import { useLocale } from "next-intl";
import { useEffect, useState, type InputHTMLAttributes } from "react";

import { Input } from "@/components/ui/Field";
import { formatMoney, parseMoneyToCents } from "@/lib/format";

export interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  readonly cents: number | null;
  readonly onChange: (cents: number | null) => void;
}

/** Money is always integer cents in the API (A§19); the field shows the locale's currency format on blur. */
export function MoneyInput({ cents, onChange, ...rest }: MoneyInputProps) {
  const locale = useLocale();
  const [text, setText] = useState(cents === null ? "" : formatMoney(cents, locale));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(cents === null ? "" : formatMoney(cents, locale));
  }, [cents, locale, focused]);
  return (
    <Input
      {...rest}
      inputMode="decimal"
      onBlur={() => {
        setFocused(false);
        const parsed = parseMoneyToCents(text, locale);
        onChange(parsed);
        setText(parsed === null ? "" : formatMoney(parsed, locale));
      }}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => setFocused(true)}
      value={text}
    />
  );
}
