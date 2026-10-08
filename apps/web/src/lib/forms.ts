"use client";

import { useTranslations } from "next-intl";

import { ApiError } from "./api";

const KNOWN = new Set(["too_small", "too_big", "invalid_type", "invalid_string", "invalid_enum_value", "invalid_format", "invalid_value", "taxId", "phone", "range", "duplicateKey", "required", "email", "number"]);

/** Turns `VALIDATION_FAILED.fieldErrors` into `{ path: message }` so each field shows its own error (REC-02). */
export function useFieldErrors(): (error: unknown) => Record<string, string> {
  const t = useTranslations("common");
  return (error) => {
    if (!(error instanceof ApiError) || error.fieldErrors.length === 0) return {};
    const out: Record<string, string> = {};
    for (const fe of error.fieldErrors) {
      const code = KNOWN.has(fe.code) ? fe.code : "invalid";
      out[fe.path] ??= t(`validation.${code}`);
    }
    return out;
  };
}

/** Empty strings become null so optional server fields clear instead of failing validation. */
export function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function numberOrNull(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export interface ListPage<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}
